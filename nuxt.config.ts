// https://nuxt.com/docs/api/configuration/nuxt-config
// Cloudflare may serve translation JSON from cache even when the query string
// changes. Put the build id in the path so each deployment gets fresh assets.
const i18nBuildId = Date.now()

export default defineNuxtConfig({
  compatibilityDate: '2026-09-28',
  devtools: { enabled: false },
  css: ['~/assets/css/main.css'],
  routeRules: {
    '/_locales/**': {
      headers: { 'Cache-Control': 'no-store' }
    },
    '/password-reset': {
      headers: {
        'Cache-Control': 'no-store',
        'Referrer-Policy': 'no-referrer',
      }
    }
  },

  nitro: {
    preset: "cloudflare_module",

    cloudflare: {
      deployConfig: true,
      nodeCompat: true
    }
  },

  modules: ["@una-ui/nuxt", "nitro-cloudflare-dev", "nuxt-i18n-micro", "nuxt-auth-utils"],

  runtimeConfig: {
    session: {
      name: process.env.NUXT_SESSION_NAME || (process.env.NODE_ENV === 'development' ? 'courrier-dev-session' : 'courrier-session'),
      maxAge: 60 * 60 * 24 * 7,
      cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV !== 'development',
        sameSite: 'lax',
      },
    },
  },

  i18n: {
    locales: [
      { code: "fr", iso: "fr-FR", dir: "ltr" },
      { code: "en", iso: "en-US", dir: "ltr" }
    ],
    defaultLocale: "fr",
    translationDir: "locales",
    apiBaseUrl: `_locales/${i18nBuildId}`,
    dateBuild: i18nBuildId,
    routesLocaleLinks: {
      "mail-contacts-address-edit": "mail-senders-address",
      "mail-contacts-address-note": "mail-senders-address",
    },
    strategy: "no_prefix",
    localeCookie: "courrier-locale",
    autoDetectLanguage: false,
    meta: true
  }
})
