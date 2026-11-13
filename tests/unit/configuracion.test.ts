import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ConfiguracionPage from '~/pages/configuracion.vue'
import type { Rol } from '~/types/sesion'
import { SESION_API, errorHttp, stubFetch } from './ayudas'

const { reproducirMock, toastMock } = vi.hoisted(() => ({ reproducirMock: vi.fn(), toastMock: vi.fn() }))
vi.mock('~/utils/sonido', () => ({ reproducirCampana: reproducirMock }))
mockNuxtImport('navigateTo', () => vi.fn())
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: toastMock }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]

function api(respuesta: 'ok' | { status: number, mensaje: string } = 'ok', rol: Rol = 'asesor') {
  return stubFetch((ruta, o) => {
    const r = ruta as string
    const { method } = (o ?? {}) as Llamada[1]
    if (r === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
    if (r === '/auth/contrasena' && method === 'PATCH') return respuesta === 'ok' ? Promise.resolve(undefined) : Promise.reject(errorHttp(respuesta.status, { message: respuesta.mensaje }))
    if (r === '/avisos') return Promise.resolve([])
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${r}` }))
  })
}

async function abrir(rol: Rol = 'asesor', respuesta: Parameters<typeof api>[0] = 'ok') {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(respuesta, rol)
  await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
  usePreferenciasStore().restablecer()
  const wrapper = await mountSuspended(ConfiguracionPage)
  return { wrapper, fetchMock }
}
type Pagina = Awaited<ReturnType<typeof abrir>>['wrapper']
const campo = (w: Pagina, n: string) => w.find(`input[name="${n}"]`)
async function llenar(w: Pagina, actual: string, nueva: string, confirmacion = nueva) {
  await campo(w, 'contrasena_actual').setValue(actual)
  await campo(w, 'contrasena_nueva').setValue(nueva)
  await campo(w, 'confirmacion').setValue(confirmacion)
}
const enviar = async (w: Pagina) => { await w.find('button[data-accion="cambiar-contrasena"]').trigger('click'); await flushPromises() }
const llamadasPatch = (m: ReturnType<typeof api>) => (m.mock.calls as Llamada[]).filter(([r, o]) => r === '/auth/contrasena' && o.method === 'PATCH')

describe('Configuración del sistema', () => {
  beforeEach(() => {
    sessionStorage.clear()
    localStorage.clear()
    reproducirMock.mockReset()
    toastMock.mockReset()
  })

  describe('Mi cuenta', () => {
    it('muestra el nombre, el rol y cuándo vence la sesión', async () => {
      const { wrapper } = await abrir()
      const s = wrapper.find('[data-seccion="cuenta"]')
      expect(s.text()).toContain('Ana Pérez')
      expect(s.find('[data-rol]').text()).toBe('Asesor')
      expect(s.find('[data-sesion-vence]').text()).toMatch(/vence a las \d{2}:\d{2} (AM|PM)/i)
    })

    it('el Supervisor ve el acceso a Usuarios y roles; el Asesor no', async () => {
      const sup = await abrir('supervisor')
      expect(sup.wrapper.find('a[data-accion="administrar-usuarios"]').attributes('href')).toBe('/usuarios')
      sup.wrapper.unmount()
      const ase = await abrir('asesor')
      expect(ase.wrapper.find('a[data-accion="administrar-usuarios"]').exists()).toBe(false)
    })
  })

  describe('Cambiar contraseña', () => {
    it('manda la contraseña actual y la nueva con PATCH /auth/contrasena, avisa y limpia el formulario', async () => {
      const { wrapper, fetchMock } = await abrir()
      await llenar(wrapper, 'secreta123', 'NuevaClave456')
      await enviar(wrapper)
      expect(llamadasPatch(fetchMock)).toHaveLength(1)
      expect(llamadasPatch(fetchMock)[0]![1].body).toEqual({ contrasena_actual: 'secreta123', contrasena_nueva: 'NuevaClave456' })
      expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Contraseña actualizada', color: 'success' }))
      expect((campo(wrapper, 'contrasena_actual').element as HTMLInputElement).value).toBe('')
      expect((campo(wrapper, 'contrasena_nueva').element as HTMLInputElement).value).toBe('')
      expect((campo(wrapper, 'confirmacion').element as HTMLInputElement).value).toBe('')
    })

    it('los campos de contraseña están ocultos y con el autocompletado correcto', async () => {
      const { wrapper } = await abrir()
      expect(campo(wrapper, 'contrasena_actual').attributes('type')).toBe('password')
      expect(campo(wrapper, 'contrasena_actual').attributes('autocomplete')).toBe('current-password')
      expect(campo(wrapper, 'contrasena_nueva').attributes('autocomplete')).toBe('new-password')
    })

    it('valida antes de enviar: todo obligatorio, de 8 a 72 caracteres, confirmación igual y distinta a la actual', async () => {
      const { wrapper, fetchMock } = await abrir()
      await enviar(wrapper)
      expect(wrapper.text()).toMatch(/ingresa tu contraseña actual/i)
      expect(wrapper.text()).toMatch(/ingresa la nueva contraseña/i)

      await llenar(wrapper, 'secreta123', 'corta')
      await enviar(wrapper)
      expect(wrapper.text()).toMatch(/al menos 8 caracteres/i)

      await llenar(wrapper, 'secreta123', 'a'.repeat(73))
      await enviar(wrapper)
      expect(wrapper.text()).toMatch(/no debe pasar de 72/i)

      await llenar(wrapper, 'secreta123', 'NuevaClave456', 'OtraClave789')
      await enviar(wrapper)
      expect(wrapper.text()).toMatch(/las contraseñas no coinciden/i)

      await llenar(wrapper, 'secreta123', 'secreta123')
      await enviar(wrapper)
      expect(wrapper.text()).toMatch(/distinta a la actual/i)

      expect(llamadasPatch(fetchMock)).toHaveLength(0)
    })

    it('si el backend dice que la contraseña actual es incorrecta lo muestra en el campo y la sesión sigue abierta', async () => {
      const { wrapper } = await abrir('asesor', { status: 400, mensaje: 'La contraseña actual es incorrecta.' })
      await llenar(wrapper, 'equivocada1', 'NuevaClave456')
      await enviar(wrapper)
      expect(wrapper.find('[data-campo="contrasena_actual"]').text()).toContain('La contraseña actual es incorrecta.')
      expect(useSessionStore().token).not.toBeNull()
      expect(toastMock).not.toHaveBeenCalledWith(expect.objectContaining({ title: 'Contraseña actualizada' }))
    })

    it('otros errores del servidor se muestran como error del formulario sin borrar lo escrito', async () => {
      const { wrapper } = await abrir('asesor', { status: 500, mensaje: 'Error' })
      await llenar(wrapper, 'secreta123', 'NuevaClave456')
      await enviar(wrapper)
      expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo cambiar la contraseña/i)
      expect((campo(wrapper, 'contrasena_nueva').element as HTMLInputElement).value).toBe('NuevaClave456')
    })
  })

  describe('Avisos y campana', () => {
    it('muestra las preferencias de la campana (sonido y movimiento) tal como están guardadas', async () => {
      const { wrapper } = await abrir()
      expect((campo(wrapper, 'sonido-campana').element as HTMLInputElement).checked).toBe(true)
      expect((campo(wrapper, 'movimiento-campana').element as HTMLInputElement).checked).toBe(true)
    })

    it('cambiarlas se guarda en este navegador', async () => {
      const { wrapper } = await abrir()
      await campo(wrapper, 'sonido-campana').setValue(false)
      await campo(wrapper, 'movimiento-campana').setValue(false)
      await flushPromises()
      expect(usePreferenciasStore().sonidoCampana).toBe(false)
      expect(usePreferenciasStore().movimientoCampana).toBe(false)
      expect(JSON.parse(localStorage.getItem('h3ga.preferencias')!)).toEqual({ sonidoCampana: false, movimientoCampana: false })
      expect(wrapper.find('[data-seccion="campana"]').text()).toMatch(/se guardan en este navegador/i)
    })

    it('"Probar sonido" hace sonar la campana', async () => {
      const { wrapper } = await abrir()
      await wrapper.find('button[data-accion="probar-sonido"]').trigger('click')
      expect(reproducirMock).toHaveBeenCalledTimes(1)
    })
  })
})
