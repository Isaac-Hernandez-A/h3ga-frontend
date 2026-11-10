import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt',
    include: ['tests/unit/**/*.test.ts'],
    // El entorno Nuxt tarda en arrancar cuando varios archivos corren en paralelo.
    hookTimeout: 90_000,
    testTimeout: 30_000,
  },
})
