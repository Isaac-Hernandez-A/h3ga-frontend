export default defineNuxtConfig({
  compatibilityDate: '2026-11-01',
  ssr: false,
  modules: ['@nuxt/ui', '@pinia/nuxt', '@nuxt/eslint', '@nuxt/test-utils/module'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    public: {
      // Se sobrescribe con NUXT_PUBLIC_API_BASE. Solo la dirección de la API; sin secretos.
      apiBase: 'http://localhost:3001/api/v1',
    },
  },
  app: {
    head: {
      htmlAttrs: { lang: 'es' },
      title: 'H3GA | Seguros y Pensiones',
    },
  },
  typescript: { strict: true },
})
