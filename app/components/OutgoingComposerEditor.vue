<template>
  <div class="compose-editor-content">
    <BubbleMenu :editor="editor" :options="{ placement: 'top', offset: 8 }" class="compose-bubble-menu">
      <NTooltip :content="$t('composer.bold')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
        <button type="button" :class="{ active: editor.isActive('bold') }" :aria-label="$t('composer.bold')" @mousedown.prevent @click="editor.chain().focus().toggleBold().run()"><strong>G</strong></button>
      </NTooltip>
      <NTooltip :content="$t('composer.italic')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
        <button type="button" :class="{ active: editor.isActive('italic') }" :aria-label="$t('composer.italic')" @mousedown.prevent @click="editor.chain().focus().toggleItalic().run()"><em>I</em></button>
      </NTooltip>
      <NTooltip :content="$t('composer.strikethrough')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
        <button type="button" :class="{ active: editor.isActive('strike') }" :aria-label="$t('composer.strikethrough')" @mousedown.prevent @click="editor.chain().focus().toggleStrike().run()"><s>S</s></button>
      </NTooltip>
      <span class="compose-toolbar-separator" aria-hidden="true" />
      <NTooltip :content="$t('composer.addLink')" :una="{ tooltipContent: 'compose-tooltip-content z-[100]' }">
        <button type="button" :class="{ active: editor.isActive('link') }" :aria-label="$t('composer.addLink')" @mousedown.prevent @click="addLink">{{ $t('composer.link') }}</button>
      </NTooltip>
    </BubbleMenu>
    <div v-if="slashState.open" ref="slashMenu" class="compose-slash-menu" :style="slashMenuStyle" role="listbox" :aria-label="$t('composer.insertCommands')">
      <p class="compose-slash-heading">{{ $t('composer.insertBlock') }}</p>
      <button v-for="(item, index) in filteredSlashCommands" :key="item.label" type="button" role="option" :aria-selected="slashIndex === index" :class="{ active: slashIndex === index }" @mousedown.prevent @click="applySlashCommand(item)">
        <span class="compose-slash-icon" aria-hidden="true">{{ item.icon }}</span>
        <span><strong>{{ item.label }}</strong><small>{{ item.description }}</small></span>
      </button>
      <p v-if="!filteredSlashCommands.length" class="compose-slash-empty">{{ $t('composer.noCommands') }}</p>
    </div>
    <EditorContent class="compose-editor" :editor="editor" @keydown.capture="onEditorKeydown" />
  </div>
</template>

<script setup lang="ts">
import type { Editor } from '@tiptap/core'
import { EditorContent } from '@tiptap/vue-3'
import { BubbleMenu } from '@tiptap/vue-3/menus'

type SlashCommand = { label: string, description: string, icon: string, apply: () => void }

const props = defineProps<{ editor: Editor }>()
const emit = defineEmits<{ 'slash-open-change': [open: boolean], 'choose-inline-image': [] }>()
const { $t } = useI18n()
const { locale } = useI18nLocale()
const slashMenu = ref<HTMLElement | null>(null)
const slashState = ref({ open: false, query: '', from: 0, to: 0 })
const slashIndex = ref(0)

const slashCommands = computed<SlashCommand[]>(() => [
  { label: $t('composer.slash.text'), description: $t('composer.slash.textDescription'), icon: '¶', apply: () => props.editor.chain().focus().setParagraph().run() },
  { label: $t('composer.slash.heading1'), description: $t('composer.slash.heading1Description'), icon: 'H1', apply: () => props.editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { label: $t('composer.slash.heading2'), description: $t('composer.slash.heading2Description'), icon: 'H2', apply: () => props.editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { label: $t('composer.slash.bullets'), description: $t('composer.slash.bulletsDescription'), icon: '•', apply: () => props.editor.chain().focus().toggleBulletList().run() },
  { label: $t('composer.slash.numbered'), description: $t('composer.slash.numberedDescription'), icon: '1.', apply: () => props.editor.chain().focus().toggleOrderedList().run() },
  { label: $t('composer.slash.quote'), description: $t('composer.slash.quoteDescription'), icon: '“', apply: () => props.editor.chain().focus().toggleBlockquote().run() },
  { label: $t('composer.slash.code'), description: $t('composer.slash.codeDescription'), icon: '</>', apply: () => props.editor.chain().focus().toggleCodeBlock().run() },
  { label: $t('composer.slash.divider'), description: $t('composer.slash.dividerDescription'), icon: '—', apply: () => props.editor.chain().focus().setHorizontalRule().run() },
  { label: $t('composer.slash.image'), description: $t('composer.slash.imageDescription'), icon: '▧', apply: () => emit('choose-inline-image') },
])
const filteredSlashCommands = computed(() => {
  const query = slashState.value.query.trim().toLocaleLowerCase(locale.value)
  return slashCommands.value.filter(item => !query || `${item.label} ${item.description}`.toLocaleLowerCase(locale.value).includes(query))
})
const slashMenuStyle = computed(() => {
  if (!slashState.value.open) return {}
  const shell = props.editor.view.dom.closest<HTMLElement>('.compose-editor-shell')
  if (!shell) return {}
  try {
    const caret = props.editor.view.coordsAtPos(slashState.value.from)
    const bounds = shell.getBoundingClientRect()
    return {
      left: `${Math.max(0, Math.min(bounds.width - 300, caret.left - bounds.left))}px`,
      top: `${Math.max(0, caret.bottom - bounds.top + 8)}px`,
    }
  } catch {
    return { left: '0px', top: '28px' }
  }
})

watch([slashIndex, filteredSlashCommands], async () => {
  await nextTick()
  const activeItem = slashMenu.value?.querySelector<HTMLElement>('[role="option"][aria-selected="true"]')
  if (!activeItem) return
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  activeItem.scrollIntoView({ block: 'nearest', behavior: reduceMotion ? 'auto' : 'smooth' })
})
watch(slashState, state => emit('slash-open-change', state.open), { deep: true })
watch(() => props.editor, (current, previous) => {
  previous?.off('transaction', updateSlashState)
  current.on('transaction', updateSlashState)
  updateSlashState()
}, { immediate: true })

function updateSlashState() {
  const selection = props.editor.state.selection
  if (!selection.empty || props.editor.isActive('codeBlock')) {
    slashState.value = { open: false, query: '', from: 0, to: 0 }
    slashIndex.value = 0
    return
  }
  const beforeCursor = selection.$from.parent.textContent.slice(0, selection.$from.parentOffset)
  const match = /(^|\s)\/([^\s/]*)$/u.exec(beforeCursor)
  if (!match) {
    slashState.value = { open: false, query: '', from: 0, to: 0 }
    slashIndex.value = 0
    return
  }
  const from = selection.from - match[0].length + match[1].length
  const query = match[2]
  if (!slashState.value.open || slashState.value.query !== query) slashIndex.value = 0
  slashState.value = { open: true, query, from, to: selection.from }
}

function onEditorKeydown(event: KeyboardEvent) {
  if (!slashState.value.open) return
  const items = filteredSlashCommands.value
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    if (items.length) slashIndex.value = (slashIndex.value + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length
  } else if (event.key === 'Escape') {
    event.preventDefault()
    slashState.value.open = false
  } else if (event.key === 'Enter') {
    event.preventDefault()
    const item = items[slashIndex.value]
    if (item) applySlashCommand(item)
  }
}

function applySlashCommand(item: SlashCommand) {
  const { from, to } = slashState.value
  slashState.value.open = false
  props.editor.chain().focus().deleteRange({ from, to }).run()
  item.apply()
}

function addLink() {
  const current = props.editor.getAttributes('link').href as string | undefined
  const href = window.prompt('Adresse du lien', current || 'https://')
  if (href === null) return
  if (!href.trim()) props.editor.chain().focus().unsetLink().run()
  else props.editor.chain().focus().setLink({ href: href.trim() }).run()
}
</script>

<style>
.compose-editor-content { display: contents; }
.compose-toolbar-separator { width: 1px; height: 20px; margin: 0 3px; background: var(--line); }
.compose-editor { min-height: 210px; padding: 30px 0 36px; color: var(--ink); font-size: 15px; line-height: 1.75; }
.compose-editor .tiptap { min-height: 210px; outline: 0; }
.compose-editor .tiptap p { margin: 0 0 12px; }
.compose-editor .tiptap p.is-editor-empty:first-child::before { float: left; height: 0; color: var(--quiet); content: attr(data-placeholder); pointer-events: none; }
.compose-editor .tiptap ul, .compose-editor .tiptap ol { margin: 0 0 12px; padding-left: 28px; }
.compose-editor .tiptap ul { list-style: disc outside; }
.compose-editor .tiptap ol { list-style: decimal; }
.compose-editor .tiptap li::marker { color: var(--ink); }
.compose-editor .tiptap blockquote { margin: 10px 0; padding-left: 14px; border-left: 1px solid var(--line); color: var(--muted); }
.compose-editor .tiptap h1, .compose-editor .tiptap h2, .compose-editor .tiptap h3 { margin: 18px 0 10px; line-height: 1.3; }
.compose-editor .tiptap h1 { font-size: 1.75em; }
.compose-editor .tiptap h2 { font-size: 1.4em; }
.compose-editor .tiptap h3 { font-size: 1.15em; }
.compose-editor .tiptap img { display: block; max-width: 100%; max-height: 360px; margin: 10px 0; border-radius: 5px; object-fit: contain; }
.compose-editor .tiptap a { color: var(--accent); text-decoration: underline; text-underline-offset: 2px; }
.compose-bubble-menu { display: flex; align-items: center; gap: 3px; padding: 5px; border: 1px solid var(--line); border-radius: 10px; background: var(--paper); box-shadow: 0 8px 26px rgb(24 20 35 / 18%); }
.compose-bubble-menu button { min-width: 32px; height: 30px; padding: 0 8px; border: 0; border-radius: 6px; background: transparent; color: var(--muted); font: inherit; font-size: 12px; cursor: pointer; }
.compose-bubble-menu button:hover, .compose-bubble-menu button.active { background: var(--accent-wash); color: var(--accent); }
.compose-slash-menu { position: absolute; z-index: 5; width: min(300px, calc(100vw - 32px)); max-height: min(360px, 55vh); overflow: auto; scroll-behavior: smooth; padding: 7px; border: 1px solid var(--line); border-radius: 12px; background: var(--paper); box-shadow: 0 14px 38px rgb(24 20 35 / 18%); }
.compose-slash-heading { margin: 2px 7px 6px; color: var(--quiet); font-size: 10px; font-weight: 650; letter-spacing: .04em; text-transform: uppercase; }
.compose-slash-menu button { display: flex; width: 100%; align-items: center; gap: 10px; padding: 8px; border: 0; border-radius: 8px; background: transparent; color: var(--ink); text-align: left; cursor: pointer; }
.compose-slash-menu button:hover, .compose-slash-menu button.active { background: var(--accent-wash); }
.compose-slash-icon { display: grid; width: 30px; height: 30px; flex: 0 0 30px; place-items: center; border: 1px solid var(--line); border-radius: 7px; color: var(--muted); font-size: 11px; font-weight: 650; }
.compose-slash-menu button > span:last-child { display: grid; gap: 2px; }
.compose-slash-menu strong { font-size: 12px; font-weight: 600; }
.compose-slash-menu small, .compose-slash-empty { color: var(--quiet); font-size: 10px; }
.compose-slash-empty { margin: 8px; }
.compose-editor .tiptap em, .compose-editor .tiptap i { font-style: italic; }
.compose-editor .tiptap strong em, .compose-editor .tiptap em strong { font-weight: 700; font-style: italic; }
@media (max-width: 640px) { .compose-editor { padding: 22px 0 28px; } }
@media (prefers-reduced-motion: reduce) { .compose-slash-menu { scroll-behavior: auto; } }
</style>
