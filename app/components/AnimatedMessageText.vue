<template>
  <div v-if="paragraphs && animate" class="animated-message-text is-paragraphs" role="text" :aria-label="text">
    <div aria-hidden="true">
      <p v-for="(paragraph, paragraphIndex) in paragraphSegments" :key="paragraphIndex">
        <span
          v-for="character in paragraph"
          :key="character.index"
          class="animated-message-character"
          :style="{ animationDelay: `${character.delay}ms` }"
        >{{ character.value }}</span>
      </p>
    </div>
  </div>
  <div v-else-if="paragraphs" class="animated-message-text is-paragraphs">
    <p v-for="(paragraph, paragraphIndex) in plainParagraphs" :key="paragraphIndex">{{ paragraph }}</p>
  </div>
  <span v-else-if="!animate">{{ text }}</span>
  <span v-else class="animated-message-text" role="text" :aria-label="text">
    <span aria-hidden="true"><span
      v-for="character in paragraphSegments[0]"
      :key="character.index"
      class="animated-message-character"
      :style="{ animationDelay: `${character.delay}ms` }"
    >{{ character.value }}</span></span>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(defineProps<{
  text: string
  animate?: boolean
  paragraphs?: boolean
  maxDuration?: number
}>(), {
  animate: false,
  paragraphs: false,
  maxDuration: 560,
})

const characterRevealDuration = 24

const plainParagraphs = computed(() => props.text.split('\n\n'))

const paragraphSegments = computed(() => {
  const characters = (props.paragraphs ? plainParagraphs.value : [props.text]).map(paragraph => Array.from(paragraph))
  const separatorCount = Math.max(0, characters.length - 1) * 2
  const total = characters.reduce((length, paragraph) => length + paragraph.length, separatorCount)
  let offset = 0

  return characters.map((paragraph) => {
    const segments = paragraph.map((value, index) => {
      const position = offset + index
      return {
        value,
        index: position,
        delay: total > 1 ? Math.round(position / (total - 1) * Math.max(0, props.maxDuration - characterRevealDuration)) : 0,
      }
    })
    offset += paragraph.length + 2
    return segments
  })
})
</script>
