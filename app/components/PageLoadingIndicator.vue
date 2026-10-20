<template>
  <Transition name="courrier-page-loading">
    <div v-if="visible" class="courrier-page-loading" role="status" aria-live="polite" aria-atomic="true">
      <span class="courrier-page-loading__stamp" aria-hidden="true">
        <img class="courrier-page-loading__stamp-base" src="/courrier-loader/stamp-base.png" alt="">
        <img class="courrier-page-loading__gull" src="/courrier-loader/stamp-gull.png" alt="">
        <img class="courrier-page-loading__waves" src="/courrier-loader/stamp-waves.png" alt="">
      </span>
      <span class="courrier-page-loading__label">{{ $t('mail.loading') }}</span>
    </div>
  </Transition>
</template>

<script setup lang="ts">
const nuxtApp = useNuxtApp()
const visible = ref(false)

const revealDelay = 180
const minimumVisibleDuration = 260
let revealTimer: ReturnType<typeof setTimeout> | undefined
let hideTimer: ReturnType<typeof setTimeout> | undefined
let navigationPending = false
let visibleSince = 0

function clearTimers() {
  clearTimeout(revealTimer)
  clearTimeout(hideTimer)
}

function startLoading() {
  if (!import.meta.client) return

  clearTimers()
  navigationPending = true
  revealTimer = setTimeout(() => {
    if (!navigationPending) return
    visibleSince = performance.now()
    visible.value = true
  }, revealDelay)
}

function finishLoading() {
  if (!import.meta.client) return

  navigationPending = false
  clearTimeout(revealTimer)
  if (!visible.value) return

  const remaining = Math.max(0, minimumVisibleDuration - (performance.now() - visibleSince))
  hideTimer = setTimeout(() => {
    visible.value = false
  }, remaining)
}

nuxtApp.hook('page:loading:start', startLoading)
nuxtApp.hook('page:loading:end', finishLoading)
nuxtApp.hook('vue:error', finishLoading)
</script>

<style scoped>
.courrier-page-loading {
  position: fixed;
  z-index: 200;
  inset: 0;
  display: grid;
  align-content: center;
  justify-items: center;
  gap: 12px;
  background: color-mix(in srgb, var(--canvas) 88%, transparent);
  backdrop-filter: blur(3px);
  color: var(--muted);
  font-size: 13px;
  font-weight: 560;
  pointer-events: none;
}

.courrier-page-loading__stamp {
  position: relative;
  display: block;
  width: 112px;
  aspect-ratio: 1;
  animation: courrier-stamp-float 1.5s ease-in-out infinite;
}

.courrier-page-loading__stamp img {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
}

.courrier-page-loading__gull {
  animation: courrier-gull-glide 1.2s ease-in-out infinite alternate;
  transform-origin: 51% 50%;
}

.courrier-page-loading__waves {
  animation: courrier-waves-roll 1s ease-in-out infinite alternate;
  transform-origin: 50% 77%;
}

.courrier-page-loading__label {
  line-height: 1.4;
}

.courrier-page-loading-enter-active,
.courrier-page-loading-leave-active {
  transition: opacity 140ms ease;
}

.courrier-page-loading-enter-from,
.courrier-page-loading-leave-to {
  opacity: 0;
}

@keyframes courrier-stamp-float {
  0%, 100% { transform: translateY(1px) rotate(-0.4deg); }
  50% { transform: translateY(-2px) rotate(0.4deg); }
}

@keyframes courrier-gull-glide {
  from { transform: translate3d(-1.5px, 1px, 0) rotate(-0.7deg); }
  to { transform: translate3d(1.5px, -1.5px, 0) rotate(0.7deg); }
}

@keyframes courrier-waves-roll {
  from { transform: translate3d(0, 0.75px, 0) scaleX(0.995); }
  to { transform: translate3d(0, -0.75px, 0) scaleX(1.005); }
}

@media (prefers-reduced-motion: reduce) {
  .courrier-page-loading__stamp,
  .courrier-page-loading__gull,
  .courrier-page-loading__waves {
    animation: none;
  }

  .courrier-page-loading-enter-active,
  .courrier-page-loading-leave-active {
    transition-duration: 1ms;
  }
}
</style>
