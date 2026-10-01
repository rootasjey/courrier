type ZipEntry = {
  name: string
  body: Uint8Array | ReadableStream<Uint8Array>
}

type ZipCentralRecord = {
  name: Uint8Array
  crc: number
  size: number
  offset: number
  dosTime: number
  dosDate: number
}

const encoder = new TextEncoder()
const maxZip32Value = 0xffff_ffff

const crcTable = (() => {
  const table = new Uint32Array(256)
  for (let index = 0; index < table.length; index += 1) {
    let value = index
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb8_8320 ^ (value >>> 1) : value >>> 1
    }
    table[index] = value >>> 0
  }
  return table
})()

function dosDateTime(date: Date) {
  const year = Math.max(1980, Math.min(2107, date.getUTCFullYear()))
  return {
    dosTime: (date.getUTCHours() << 11) | (date.getUTCMinutes() << 5) | (date.getUTCSeconds() >> 1),
    dosDate: ((year - 1980) << 9) | ((date.getUTCMonth() + 1) << 5) | date.getUTCDate(),
  }
}

function localHeader(name: Uint8Array, dosTime: number, dosDate: number) {
  const header = new Uint8Array(30 + name.length)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x04034b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 0x0808, true) // UTF-8 filename and trailing data descriptor.
  view.setUint16(8, 0, true) // Store; MIME bodies are already transfer-encoded.
  view.setUint16(10, dosTime, true)
  view.setUint16(12, dosDate, true)
  view.setUint32(14, 0, true)
  view.setUint32(18, 0, true)
  view.setUint32(22, 0, true)
  view.setUint16(26, name.length, true)
  view.setUint16(28, 0, true)
  header.set(name, 30)
  return header
}

function dataDescriptor(crc: number, size: number) {
  const descriptor = new Uint8Array(16)
  const view = new DataView(descriptor.buffer)
  view.setUint32(0, 0x08074b50, true)
  view.setUint32(4, crc, true)
  view.setUint32(8, size, true)
  view.setUint32(12, size, true)
  return descriptor
}

function centralHeader(record: ZipCentralRecord) {
  const header = new Uint8Array(46 + record.name.length)
  const view = new DataView(header.buffer)
  view.setUint32(0, 0x02014b50, true)
  view.setUint16(4, 20, true)
  view.setUint16(6, 20, true)
  view.setUint16(8, 0x0808, true)
  view.setUint16(10, 0, true)
  view.setUint16(12, record.dosTime, true)
  view.setUint16(14, record.dosDate, true)
  view.setUint32(16, record.crc, true)
  view.setUint32(20, record.size, true)
  view.setUint32(24, record.size, true)
  view.setUint16(28, record.name.length, true)
  view.setUint16(30, 0, true)
  view.setUint16(32, 0, true)
  view.setUint16(34, 0, true)
  view.setUint16(36, 0, true)
  view.setUint32(38, 0, true)
  view.setUint32(42, record.offset, true)
  header.set(record.name, 46)
  return header
}

function endOfCentralDirectory(count: number, size: number, offset: number) {
  const record = new Uint8Array(22)
  const view = new DataView(record.buffer)
  view.setUint32(0, 0x06054b50, true)
  view.setUint16(4, 0, true)
  view.setUint16(6, 0, true)
  view.setUint16(8, count, true)
  view.setUint16(10, count, true)
  view.setUint32(12, size, true)
  view.setUint32(16, offset, true)
  view.setUint16(20, 0, true)
  return record
}

async function* generateZipChunks(entries: AsyncIterable<ZipEntry>, createdAt: Date) {
  const directory: ZipCentralRecord[] = []
  let outputOffset = 0
  const emit = (chunk: Uint8Array) => {
    outputOffset += chunk.byteLength
    if (outputOffset > maxZip32Value) throw new Error('Cette archive dépasse la limite ZIP 32 bits.')
    return chunk
  }

  for await (const entry of entries) {
    if (directory.length >= 0xffff) throw new Error('Cette archive contient trop de fichiers ZIP.')

    const name = encoder.encode(entry.name)
    if (name.byteLength > 0xffff) throw new Error('Un nom de fichier est trop long pour cette archive.')
    const { dosTime, dosDate } = dosDateTime(createdAt)
    const localOffset = outputOffset
    yield emit(localHeader(name, dosTime, dosDate))

    let crc = 0xffff_ffff
    let size = 0
    const emitBodyChunk = (chunk: Uint8Array) => {
      size += chunk.byteLength
      if (size > maxZip32Value) throw new Error('Un fichier dépasse la limite ZIP 32 bits.')
      for (const byte of chunk) crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
      return emit(chunk)
    }

    if (entry.body instanceof Uint8Array) {
      if (entry.body.byteLength > 0) yield emitBodyChunk(entry.body)
    } else {
      const reader = entry.body.getReader()
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          if (value.byteLength > 0) yield emitBodyChunk(value)
        }
      } finally {
        reader.releaseLock()
      }
    }

    const checksum = (crc ^ 0xffff_ffff) >>> 0
    yield emit(dataDescriptor(checksum, size))
    directory.push({ name, crc: checksum, size, offset: localOffset, dosTime, dosDate })
  }

  const directoryOffset = outputOffset
  for (const record of directory) yield emit(centralHeader(record))
  const directorySize = outputOffset - directoryOffset
  yield emit(endOfCentralDirectory(directory.length, directorySize, directoryOffset))
}

export function createZipStream(entries: AsyncIterable<ZipEntry>, createdAt = new Date()) {
  const iterator = generateZipChunks(entries, createdAt)
  return new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await iterator.next()
        if (done) {
          controller.close()
          return
        }
        controller.enqueue(value)
      } catch (error) {
        controller.error(error)
      }
    },
    async cancel() {
      await iterator.return(undefined)
    },
  })
}
