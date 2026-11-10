import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { mockNuxtImport } from '@nuxt/test-utils/runtime'
import { SESION_API, errorHttp, errorRed, stubFetch } from './ayudas'

const { navigateToMock, toastAddMock } = vi.hoisted(() => ({
  navigateToMock: vi.fn(),
  toastAddMock: vi.fn(),
}))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: toastAddMock }))

async function conSesion() {
  stubFetch(() => Promise.resolve(SESION_API))
  const sesion = useSessionStore()
  await sesion.iniciarSesion('ana@ejemplo.com', 'secreta123')
  return sesion
}

describe('useApi', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    toastAddMock.mockReset()
    setActivePinia(createPinia())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('CF-03 useApi agrega Authorization: Bearer a cada petición', async () => {
    const sesion = await conSesion()
    const fetchMock = stubFetch(() => Promise.resolve({ ok: true }))
    const api = useApi()

    await api.get('/clientes')
    await api.post('/clientes', { nombre: 'X' })
    await api.put('/clientes/1', { nombre: 'Y' })
    await api.patch('/clientes/1', { nombre: 'Z' })

    expect(fetchMock).toHaveBeenCalledTimes(4)
    for (const [, opciones] of fetchMock.mock.calls as [string, { headers: Record<string, string> }][]) {
      expect(opciones.headers.Authorization).toBe(`Bearer ${sesion.token}`)
    }
  })

  it('usa la dirección de NUXT_PUBLIC_API_BASE y no manda Authorization sin sesión', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))

    await useApi().post('/auth/login', { correo_electronico: 'a@b.c', contrasena: 'x' })

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { baseURL: string, headers: Record<string, string> }]
    expect(ruta).toBe('/auth/login')
    expect(opciones.baseURL).toBe(useRuntimeConfig().public.apiBase)
    expect(opciones.headers.Authorization).toBeUndefined()
  })

  it('CF-04 un 401 con sesión limpia la sesión y redirige a /login', async () => {
    const sesion = await conSesion()
    stubFetch(() => Promise.reject(errorHttp(401, { message: 'Unauthorized' })))

    await expect(useApi().get('/clientes')).rejects.toMatchObject({ status: 401 })

    expect(sesion.token).toBeNull()
    expect(sessionStorage.getItem('h3ga.sesion')).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('un 401 sin sesión (login fallido) no redirige ni borra nada: solo lanza el error', async () => {
    stubFetch(() => Promise.reject(errorHttp(401, { message: 'Correo o contraseña incorrectos.' })))

    await expect(useApi().post('/auth/login', {})).rejects.toMatchObject({
      status: 401,
      mensaje: 'Correo o contraseña incorrectos.',
    })

    expect(navigateToMock).not.toHaveBeenCalled()
  })

  it('CF-04 un 403 muestra aviso de falta de permiso sin cerrar la sesión', async () => {
    const sesion = await conSesion()
    stubFetch(() => Promise.reject(errorHttp(403, { message: 'Forbidden resource' })))

    await expect(useApi().get('/usuarios')).rejects.toMatchObject({ status: 403 })

    expect(sesion.token).toBe(SESION_API.access_token)
    expect(navigateToMock).not.toHaveBeenCalled()
    expect(toastAddMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(toastAddMock.mock.calls[0])).toMatch(/no tienes permiso/i)
  })

  it('CF-05 un 400 con arreglo de mensajes se convierte en errores por campo', async () => {
    stubFetch(() =>
      Promise.reject(
        errorHttp(400, {
          statusCode: 400,
          error: 'Bad Request',
          message: ['correo_electronico must be an email', 'contrasena should not be empty'],
        }),
      ),
    )

    const error = await useApi()
      .post('/auth/login', {})
      .catch((e: unknown) => e)

    expect(error).toMatchObject({
      status: 400,
      campos: {
        correo_electronico: 'must be an email',
        contrasena: 'should not be empty',
      },
    })
    expect((error as { mensaje: string }).mensaje).toContain('must be an email')
  })

  it('un error de red muestra un aviso y lanza un ApiError de estado 0', async () => {
    await conSesion()
    stubFetch(() => Promise.reject(errorRed()))

    await expect(useApi().get('/clientes')).rejects.toMatchObject({ status: 0 })

    expect(toastAddMock).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(toastAddMock.mock.calls[0])).toMatch(/conectar/i)
  })

  it('si la sesión ya venció, cierra sesión y redirige sin llamar a la API', async () => {
    const sesion = await conSesion()
    sesion.expiraEn = Date.now() - 1
    const fetchMock = stubFetch(() => Promise.resolve({}))

    await expect(useApi().get('/clientes')).rejects.toMatchObject({ status: 401 })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(sesion.token).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })
})
