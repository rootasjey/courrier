import assert from 'node:assert/strict'
import { test } from 'node:test'
import { zipSync } from 'fflate'
import { extractAttachmentText } from '../server/utils/attachment-text.ts'

const encoder = new TextEncoder()

test('extracts plain text and normalizes whitespace', async () => {
  const result = await extractAttachmentText({
    filename: 'ordre-du-jour.txt',
    mimeType: 'text/plain',
    bytes: encoder.encode('Réunion\n\nboîte à outils'),
  })

  assert.deepEqual(result, { text: 'Réunion boîte à outils', status: 'indexed' })
})

test('extracts text from DOCX document XML', async () => {
  const bytes = zipSync({
    'word/document.xml': encoder.encode('<w:document><w:p><w:r><w:t>Contrat de location</w:t></w:r></w:p></w:document>'),
    'word/styles.xml': encoder.encode('<w:styles><w:name>not searchable</w:name></w:styles>'),
  })

  const result = await extractAttachmentText({
    filename: 'contrat.docx',
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    bytes,
  })

  assert.deepEqual(result, { text: 'Contrat de location', status: 'indexed' })
})

test('extracts shared strings and worksheet values from XLSX', async () => {
  const bytes = zipSync({
    'xl/sharedStrings.xml': encoder.encode('<sst><si><t>Budget prévisionnel</t></si></sst>'),
    'xl/worksheets/sheet1.xml': encoder.encode('<worksheet><row><c t="s"><v>0</v></c><c><v>2026</v></c></row></worksheet>'),
  })

  const result = await extractAttachmentText({
    filename: 'budget.xlsx',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    bytes,
  })

  assert.deepEqual(result, { text: 'Budget prévisionnel 0 2026', status: 'indexed' })
})

test('extracts text from a text-based PDF', async () => {
  const pdf = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>
endobj
4 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
5 0 obj
<< /Length 60 >>
stream
BT /F1 14 Tf 72 720 Td (Courrier local search fixture) Tj ET
endstream
endobj
xref
0 6
0000000000 65535 f
0000000009 00000 n
0000000058 00000 n
0000000115 00000 n
0000000241 00000 n
0000000311 00000 n
trailer
<< /Size 6 /Root 1 0 R >>
startxref
421
%%EOF`.replaceAll(' f\n', ' f \n')
  const result = await extractAttachmentText({
    filename: 'invoice.pdf',
    mimeType: 'application/pdf',
    bytes: encoder.encode(pdf),
  })

  assert.deepEqual(result, { text: 'Courrier local search fixture', status: 'indexed' })
})

test('reports unsupported formats and oversized files without throwing', async () => {
  const unsupported = await extractAttachmentText({
    filename: 'photo.png',
    mimeType: 'image/png',
    bytes: encoder.encode('not parsed'),
  })
  const oversized = await extractAttachmentText({
    filename: 'too-large.txt',
    mimeType: 'text/plain',
    bytes: new Uint8Array(8 * 1024 * 1024 + 1),
  })

  assert.deepEqual(unsupported, { text: '', status: 'unsupported' })
  assert.deepEqual(oversized, { text: '', status: 'skipped' })
})
