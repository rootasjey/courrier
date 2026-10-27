<template>
  <div ref="container" class="animated-height" :class="{ 'is-transitioning': isTransitioning }" @transitionend="onTransitionEnd">
    <div ref="content" class="animated-height-content">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue'

const container = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const isTransitioning = ref(false)

let resizeObserver: ResizeObserver | undefined
let animationFrame = 0
let transitionFallback: ReturnType<typeof setTimeout> | undefined
let hasMeasuredInitialHeight = false
let lastContentHeight = 0

function onTransitionEnd(event: TransitionEvent) {
  if (event.target === container.value && event.propertyName === 'height') finishTransition()
}

function finishTransition() {
  if (!container.value) return

  container.value.style.height = 'auto'
  isTransitioning.value = false
  if (transitionFallback) clearTimeout(transitionFallback)
  transitionFallback = undefined
}

function animateToHeight(nextHeight: number, previousHeight: number) {
  const element = container.value
  if (!element) return

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    finishTransition()
    return
  }

  const currentHeight = isTransitioning.value
    ? element.getBoundingClientRect().height
    : previousHeight
  if (Math.abs(currentHeight - nextHeight) < 1) return

  if (animationFrame) cancelAnimationFrame(animationFrame)
  if (transitionFallback) clearTimeout(transitionFallback)

  element.style.height = `${currentHeight}px`
  void element.offsetHeight
  isTransitioning.value = true
  animationFrame = requestAnimationFrame(() => {
    if (!container.value) return
    container.value.style.height = `${nextHeight}px`
  })
  transitionFallback = setTimeout(finishTransition, 320)
}

onMounted(() => {
  if (!content.value || typeof ResizeObserver === 'undefined') return

  resizeObserver = new ResizeObserver(([entry]) => {
    if (!entry || !container.value) return

    const nextHeight = Math.ceil(entry.contentRect.height)
    if (!hasMeasuredInitialHeight) {
      hasMeasuredInitialHeight = true
      lastContentHeight = nextHeight
      container.value.style.height = 'auto'
      return
    }

    const previousHeight = lastContentHeight
    lastContentHeight = nextHeight
    animateToHeight(nextHeight, previousHeight)
  })
  resizeObserver.observe(content.value)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  if (animationFrame) cancelAnimationFrame(animationFrame)
  if (transitionFallback) clearTimeout(transitionFallback)
})
</script>
