import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import AvisosBadge from '~/components/AvisosBadge.vue'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const { navigateToMock, rutaActual } = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  return { navigateToMock: vi.fn(), rutaActual: reactive({ path: '/' }) }
})
mockNuxtImport('navigateTo', () => navigateToMock)
// Las pantallas aún no existen: Nuxt no deja navegar a ellas, así que el cambio de ruta se simula.
mockNuxtImport('useRoute', () => () => rutaActual)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const avisos = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `aviso-${i}`, tipo: 'tramite', atendido: false }))

describe('AvisosBadge', () => {
  beforeEach(async () => {
    rutaActual.path = '/'
    sessionStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(useNuxtApp().$pinia as Pinia)
    useSessionStore().cerrarSesion()
    stubFetch(() => Promise.resolve(SESION_API))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    navigateToMock.mockReset()
  })

  it('pide a GET /avisos solo los pendientes y muestra cuántos hay', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(avisos(3)))

    const wrapper = await mountSuspended(AvisosBadge)
    await flushPromises()

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, query: Record<string, unknown> }]
    expect(ruta).toBe('/avisos')
    expect(opciones.method).toBe('GET')
    expect(opciones.query).toEqual({ atendido: false })
    expect(wrapper.text()).toBe('3')
    expect(wrapper.find('[aria-label]').attributes('aria-label')).toMatch(/3 avisos pendientes/i)
  })

  it('no muestra nada cuando no hay avisos pendientes', async () => {
    stubFetch(() => Promise.resolve([]))

    const wrapper = await mountSuspended(AvisosBadge)
    await flushPromises()

    expect(wrapper.text()).toBe('')
    expect(wrapper.find('[aria-label]').exists()).toBe(false)
  })

  it('vuelve a pedir los avisos al cambiar de pantalla', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(avisos(1)))
    const wrapper = await mountSuspended(AvisosBadge)
    await flushPromises()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    stubFetch(() => Promise.resolve(avisos(5)))
    rutaActual.path = '/agenda'
    await flushPromises()

    expect(wrapper.text()).toBe('5')
  })

  it('si la API falla, no rompe el menú: oculta el contador', async () => {
    stubFetch(() => Promise.reject(errorHttp(500, { message: 'Error interno del servidor' })))

    const wrapper = await mountSuspended(AvisosBadge)
    await flushPromises()

    expect(wrapper.text()).toBe('')
  })
})
