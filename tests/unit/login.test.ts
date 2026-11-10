import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import LoginPage from '~/pages/login.vue'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

async function abrirLogin() {
  const wrapper = await mountSuspended(LoginPage)
  return {
    wrapper,
    correo: wrapper.find('input[type="email"]'),
    contrasena: wrapper.find('input[name="contrasena"]'),
    enviar: () => wrapper.find('form').trigger('submit'),
  }
}

describe('Pantalla de login', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    // La página montada usa el Pinia de la aplicación Nuxt: la prueba debe usar el mismo.
    setActivePinia(useNuxtApp().$pinia as Pinia)
    useSessionStore().cerrarSesion()
    navigateToMock.mockReset()
  })

  it('CF-08 valida campos obligatorios y no llama a la API si faltan', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(SESION_API))
    const { wrapper, enviar } = await abrirLogin()

    await enviar()
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toMatch(/ingresa tu correo/i)
    expect(wrapper.text()).toMatch(/ingresa tu contraseña/i)
  })

  it('CF-08 rechaza un correo con formato inválido', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(SESION_API))
    const { wrapper, correo, contrasena, enviar } = await abrirLogin()

    await correo.setValue('no-es-un-correo')
    await contrasena.setValue('secreta123')
    await enviar()
    await flushPromises()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toMatch(/correo válido/i)
  })

  it('CF-08 muestra el error genérico cuando el login responde 401', async () => {
    stubFetch(() => Promise.reject(errorHttp(401, { message: 'Correo o contraseña incorrectos.' })))
    const { wrapper, correo, contrasena, enviar } = await abrirLogin()

    await correo.setValue('ana@ejemplo.com')
    await contrasena.setValue('equivocada')
    await enviar()
    await flushPromises()

    expect(wrapper.text()).toContain('Correo o contraseña incorrectos.')
    expect(navigateToMock).not.toHaveBeenCalledWith('/')
    expect(useSessionStore().token).toBeNull()
  })

  it('con credenciales válidas inicia sesión y va al inicio', async () => {
    stubFetch(() => Promise.resolve(SESION_API))
    const { correo, contrasena, enviar } = await abrirLogin()

    await correo.setValue('ana@ejemplo.com')
    await contrasena.setValue('secreta123')
    await enviar()
    await flushPromises()

    expect(useSessionStore().token).toBe(SESION_API.access_token)
    expect(navigateToMock).toHaveBeenCalledWith('/')
  })

  it('muestra el motivo de cierre de sesión (por ejemplo, token vencido)', async () => {
    useSessionStore().mensaje = 'Tu sesión venció. Inicia sesión de nuevo.'
    const { wrapper } = await abrirLogin()

    expect(wrapper.text()).toContain('Tu sesión venció')
  })

  it('el botón de ver contraseña alterna entre password y text', async () => {
    const { wrapper, contrasena } = await abrirLogin()
    expect(contrasena.attributes('type')).toBe('password')

    await wrapper.find('button[aria-label="Mostrar contraseña"]').trigger('click')

    expect(wrapper.find('input[name="contrasena"]').attributes('type')).toBe('text')
  })
})
