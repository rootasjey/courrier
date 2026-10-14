// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2026-09-28',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },

  modules: ["@una-ui/nuxt", "nitro-cloudflare-dev", "nuxt-i18n-micro"],

  i18n: {
    locales: [
      { code: "fr", iso: "fr-FR", dir: "ltr" },
      { code: "en", iso: "en-US", dir: "ltr" }
    ],
    defaultLocale: "fr",
    translationDir: "locales",
    strategy: "no_prefix",
    localeCookie: "courrier-locale",
    autoDetectLanguage: false,
    meta: true
  }
})
