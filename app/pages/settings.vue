<script setup lang="ts">
const theme = useState<'system' | 'light' | 'dark'>('courrier-theme', () => 'system')

useSeoMeta({
  title: 'Réglages — Courrier',
})
</script>

<template>
  <main class="settings-page">
    <div class="settings-content">
      <h1>Réglages</h1>

      <section class="settings-section" aria-labelledby="appearance-heading">
        <div class="settings-section-copy">
          <h2 id="appearance-heading">Apparence</h2>
          <p>Choisis le thème utilisé par Courrier.</p>
        </div>
        <label class="settings-select-row">
          <span>Thème</span>
          <select v-model="theme" aria-label="Choisir le thème">
            <option value="system">Système</option>
            <option value="light">Clair</option>
            <option value="dark">Sombre</option>
          </select>
        </label>
      </section>
    </div>
  </main>
</template>
