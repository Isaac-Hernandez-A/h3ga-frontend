import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { SESION_API, stubFetch } from './ayudas'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))

describe('Sesión (almacén Pinia)', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('CF-01 iniciar sesión guarda token y usuario en sessionStorage y en el almacén; no usa localStorage', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(SESION_API))
    const sesion = useSessionStore()

    await sesion.iniciarSesion('ana@ejemplo.com', 'secreta123')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0]![0]).toBe('/auth/login')
    expect(sesion.token).toBe(SESION_API.access_token)
    expect(sesion.usuario).toEqual(SESION_API.usuario)
    expect(sesion.estaVigente).toBe(true)

    const guardado = JSON.parse(sessionStorage.getItem('h3ga.sesion') ?? 'null')
    expect(guardado.token).toBe(SESION_API.access_token)
    expect(guardado.usuario).toEqual(SESION_API.usuario)
    expect(guardado.expiraEn).toBeGreaterThan(Date.now())

    expect(localStorage.length).toBe(0)
    expect(JSON.stringify(Object.entries(localStorage))).not.toContain(SESION_API.access_token)
  })

  it('CF-01 la sesión se rehidrata desde sessionStorage al recargar', async () => {
    stubFetch(() => Promise.resolve(SESION_API))
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    setActivePinia(createPinia()) // simula una recarga: almacén nuevo, mismo sessionStorage
    const recargada = useSessionStore()

    expect(recargada.token).toBe(SESION_API.access_token)
    expect(recargada.usuario?.rol).toBe('asesor')
    expect(recargada.estaVigente).toBe(true)
  })

  it('una sesión guardada que ya venció no se rehidrata y se borra', () => {
    sessionStorage.setItem(
      'h3ga.sesion',
      JSON.stringify({ token: 'viejo', usuario: SESION_API.usuario, expiraEn: Date.now() - 1000 }),
    )

    const sesion = useSessionStore()

    expect(sesion.token).toBeNull()
    expect(sesion.usuario).toBeNull()
    expect(sesion.estaVigente).toBe(false)
    expect(sessionStorage.getItem('h3ga.sesion')).toBeNull()
  })

  it('CF-02 al vencer el token se cierra la sesión, se limpian los datos y se redirige a /login con mensaje', async () => {
    vi.useFakeTimers()
    stubFetch(() => Promise.resolve({ ...SESION_API, expires_in: 10 }))
    const sesion = useSessionStore()
    await sesion.iniciarSesion('ana@ejemplo.com', 'secreta123')
    expect(sesion.estaVigente).toBe(true)

    await vi.advanceTimersByTimeAsync(10_001)

    expect(sesion.token).toBeNull()
    expect(sesion.usuario).toBeNull()
    expect(sesion.estaVigente).toBe(false)
    expect(sessionStorage.getItem('h3ga.sesion')).toBeNull()
    expect(sesion.mensaje).toMatch(/venci/i)
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('cerrarSesion limpia todo y deja el motivo indicado', async () => {
    stubFetch(() => Promise.resolve(SESION_API))
    const sesion = useSessionStore()
    await sesion.iniciarSesion('ana@ejemplo.com', 'secreta123')

    sesion.cerrarSesion('Cerraste sesión.')

    expect(sesion.token).toBeNull()
    expect(sesion.usuario).toBeNull()
    expect(sesion.mensaje).toBe('Cerraste sesión.')
    expect(sessionStorage.getItem('h3ga.sesion')).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
