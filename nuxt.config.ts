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

  modules: ["@una-ui/nuxt", "nitro-cloudflare-dev"]
})
