import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UsuariosPage from '~/pages/usuarios/index.vue'
import { useUsuarios } from '~/composables/useUsuarios'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { ROLES, USUARIOS } from './usuarios-datos'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Llamada = [string, { method: string, body?: Record<string, unknown> }]

function api(usuarios = USUARIOS) {
  const lista = usuarios.map(u => ({ ...u }))
  return stubFetch((ruta, opciones) => {
    const { method, body } = opciones as Llamada[1]
    if (ruta === '/auth/login') {
      return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol: 'supervisor' } })
    }
    if (ruta === '/usuarios' && method === 'GET') return Promise.resolve(lista)
    if (ruta === '/catalogos/roles') return Promise.resolve(ROLES)
    if (ruta === '/catalogos/tipos-asesor') return Promise.resolve([])
    if ((ruta as string).startsWith('/usuarios/') && method === 'PATCH') {
      const actual = lista.find(u => ruta === `/usuarios/${u.id}`)!
      return Promise.resolve(Object.assign(actual, body))
    }
    return Promise.reject(errorHttp(404, { message: `sin simular: ${method} ${ruta}` }))
  })
}

async function abrirPantalla(usuarios = USUARIOS) {
  setActivePinia(useNuxtApp().$pinia as Pinia)
  const fetchMock = api(usuarios)
  await useSessionStore().iniciarSesion('laura.hernandez@h3ga.mx', 'secreta123')
  const wrapper = await mountSuspended(UsuariosPage)
  await vi.waitFor(() => expect(wrapper.findAll('tbody tr').length).toBeGreaterThan(0))
  return { wrapper, fetchMock }
}

const filas = (wrapper: Awaited<ReturnType<typeof abrirPantalla>>['wrapper']) => wrapper.findAll('tbody tr')
const filaDe = (wrapper: Awaited<ReturnType<typeof abrirPantalla>>['wrapper'], nombre: string) =>
  filas(wrapper).find(f => f.text().includes(nombre))!
const enDocumento = (selector: string) => document.body.querySelector<HTMLElement>(selector)

describe('useUsuarios', () => {
  beforeEach(() => {
    sessionStorage.clear()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('usa las rutas de usuarios y de catálogos del backend', async () => {
    const fetchMock = stubFetch(() => Promise.resolve([]))
    const usuarios = useUsuarios()

    await usuarios.listar()
    await usuarios.crear({ rol_id: 1, nombre: 'A', apellido_paterno: 'B', apellido_materno: '', correo_electronico: 'a@b.mx', contrasena: '12345678' })
    await usuarios.actualizar('abc', { nombre: 'Z' })
    await usuarios.desactivar('abc')
    await usuarios.restablecer('abc')
    await usuarios.restablecerContrasena('abc', 'nueva-clave-1')
    await usuarios.catalogos()

    const llamadas = (fetchMock.mock.calls as Llamada[]).map(([ruta, o]) => `${o.method} ${ruta} ${JSON.stringify(o.body ?? null)}`)
    expect(llamadas).toEqual([
      'GET /usuarios null',
      'POST /usuarios {"rol_id":1,"nombre":"A","apellido_paterno":"B","apellido_materno":"","correo_electronico":"a@b.mx","contrasena":"12345678"}',
      'PATCH /usuarios/abc {"nombre":"Z"}',
      'PATCH /usuarios/abc {"activo":false}',
      'PATCH /usuarios/abc {"activo":true}',
      'PATCH /usuarios/abc/contrasena {"contrasena":"nueva-clave-1"}',
      'GET /catalogos/roles null',
      'GET /catalogos/tipos-asesor null',
    ])
  })
})

describe('Pantalla de usuarios y roles', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    document.body.innerHTML = ''
  })

  it('lista los usuarios con su rol y estado, el total y marca al usuario actual con "Tú"', async () => {
    const { wrapper } = await abrirPantalla()

    expect(wrapper.text()).toContain('Total: 5 usuarios')
    expect(filas(wrapper)).toHaveLength(5)
    const laura = filaDe(wrapper, 'Laura Hernández Ibarra')
    expect(laura.text()).toContain('Tú')
    expect(laura.text()).toContain('laura.hernandez@h3ga.mx')
    expect(laura.text()).toContain('Supervisor Operativo')
    expect(laura.text()).toContain('Activo')
    expect(filaDe(wrapper, 'Carlos Montes Quiroz').text()).not.toContain('Tú')
    expect(filaDe(wrapper, 'Fernanda Olvera Núñez').text()).toContain('Revocado')
  })

  it('no muestra el "(Admin)" del nombre del rol en ningún lado y las etiquetas de rol no se parten en dos renglones', async () => {
    const { wrapper } = await abrirPantalla()

    expect(wrapper.text()).toContain('Supervisor Operativo')
    expect(wrapper.text()).not.toContain('(Admin)')
    expect(wrapper.find('select[name="filtro-rol"]').text()).not.toContain('(Admin)')
    const etiquetas = wrapper.findAll('[data-etiqueta-rol]')
    expect(etiquetas.length).toBeGreaterThanOrEqual(8)
    for (const etiqueta of etiquetas) {
      expect(etiqueta.classes(), etiqueta.text()).toContain('whitespace-nowrap')
    }
  })

  it('muestra por rol cuántos usuarios hay activos del total', async () => {
    const { wrapper } = await abrirPantalla()
    const tarjetas = wrapper.findAll('[data-tarjeta-rol]')

    expect(tarjetas).toHaveLength(3)
    expect(tarjetas[0]!.text()).toContain('Asesor')
    expect(tarjetas[0]!.text().replace(/\s+/g, ' ')).toContain('2 / 2 activos')
    expect(tarjetas[1]!.text().replace(/\s+/g, ' ')).toContain('1 / 2 activos')
    expect(tarjetas[2]!.text().replace(/\s+/g, ' ')).toContain('1 / 1 activos')
  })

  it('busca por nombre o correo sin distinguir mayúsculas ni acentos, y filtra por rol y por estado', async () => {
    const { wrapper } = await abrirPantalla()

    await wrapper.find('input[type="search"]').setValue('IVAN')
    expect(filas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Iván Barrera Lozano')

    await wrapper.find('input[type="search"]').setValue('daniela.cruz@')
    expect(filas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Daniela Cruz Palacios')

    await wrapper.find('input[type="search"]').setValue('')
    await wrapper.find('select[name="filtro-rol"]').setValue('2')
    expect(filas(wrapper)).toHaveLength(2)

    await wrapper.find('select[name="filtro-estado"]').setValue('inactivos')
    expect(filas(wrapper)).toHaveLength(1)
    expect(wrapper.text()).toContain('Fernanda Olvera Núñez')

    await wrapper.find('input[type="search"]').setValue('zzz')
    expect(filas(wrapper)).toHaveLength(0)
    expect(wrapper.text()).toMatch(/no hay usuarios/i)
  })

  it('desactivar un usuario llama a PATCH con activo=false y actualiza la lista', async () => {
    const { wrapper, fetchMock } = await abrirPantalla()
    const carlos = USUARIOS[1]!

    await filaDe(wrapper, 'Carlos Montes Quiroz').find('button[data-accion="revocar"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('[data-accion="confirmar-revocar"]')).not.toBeNull())
    expect(document.body.textContent).toContain('Carlos Montes Quiroz')
    expect(document.body.textContent).toMatch(/dejará de poder iniciar sesión/i)
    enDocumento('[data-accion="confirmar-revocar"]')!.click()
    await flushPromises()

    const patch = (fetchMock.mock.calls as Llamada[]).find(([ruta, o]) => ruta === `/usuarios/${carlos.id}` && o.method === 'PATCH')!
    expect(patch[1].body).toEqual({ activo: false })
    const fila = filaDe(wrapper, 'Carlos Montes Quiroz')
    expect(fila.text()).toContain('Revocado')
    expect(fila.find('button[data-accion="restablecer"]').exists()).toBe(true)
    expect(fila.find('button[data-accion="revocar"]').exists()).toBe(false)
  })

  it('cancelar la confirmación no cambia nada', async () => {
    const { wrapper, fetchMock } = await abrirPantalla()

    await filaDe(wrapper, 'Carlos Montes Quiroz').find('button[data-accion="revocar"]').trigger('click')
    await vi.waitFor(() => expect(enDocumento('[data-accion="cancelar-revocar"]')).not.toBeNull())
    enDocumento('[data-accion="cancelar-revocar"]')!.click()
    await flushPromises()

    expect((fetchMock.mock.calls as Llamada[]).some(([, o]) => o.method === 'PATCH')).toBe(false)
    expect(filaDe(wrapper, 'Carlos Montes Quiroz').text()).toContain('Activo')
  })

  it('restablecer un usuario revocado llama a PATCH con activo=true y lo deja activo', async () => {
    const { wrapper, fetchMock } = await abrirPantalla()
    const fernanda = USUARIOS[4]!

    await filaDe(wrapper, 'Fernanda Olvera Núñez').find('button[data-accion="restablecer"]').trigger('click')
    await flushPromises()

    const patch = (fetchMock.mock.calls as Llamada[]).find(([ruta, o]) => ruta === `/usuarios/${fernanda.id}` && o.method === 'PATCH')!
    expect(patch[1].body).toEqual({ activo: true })
    expect(filaDe(wrapper, 'Fernanda Olvera Núñez').text()).toContain('Activo')
  })

  it('no ofrece revocarse a uno mismo, para no quedarse sin acceso', async () => {
    const { wrapper } = await abrirPantalla()

    expect(filaDe(wrapper, 'Laura Hernández Ibarra').find('button[data-accion="revocar"]').exists()).toBe(false)
    expect(filaDe(wrapper, 'Laura Hernández Ibarra').find('button[data-accion="editar"]').exists()).toBe(true)
  })

  it('Nuevo usuario abre el formulario de alta y Editar el de edición con los datos del usuario', async () => {
    const { wrapper } = await abrirPantalla()

    await wrapper.find('button[data-accion="nuevo"]').trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Registra una cuenta y asígnale un rol'))
    expect(document.body.querySelector('input[name="contrasena"]')).not.toBeNull()
    enDocumento('button[data-accion="cancelar"]')!.click()
    await flushPromises()

    await filaDe(wrapper, 'Iván Barrera Lozano').find('button[data-accion="editar"]').trigger('click')
    await vi.waitFor(() => expect(document.body.textContent).toContain('Editar usuario'))
    expect(document.body.querySelector<HTMLInputElement>('input[name="correo_electronico"]')!.value).toBe('ivan.barrera@h3ga.mx')
    expect(document.body.querySelector('input[name="contrasena"]')).toBeNull()
  })

  it('pagina de 10 en 10: con 12 usuarios muestra 10 y el resto en la página siguiente', async () => {
    const muchos = Array.from({ length: 12 }, (_, i) => ({
      ...USUARIOS[1]!,
      id: `aaaaaaaa-0000-4000-8000-${String(i).padStart(12, '0')}`,
      nombre: `Persona${String(i).padStart(2, '0')}`,
      apellido_paterno: 'Prueba',
      correo_electronico: `persona${i}@h3ga.mx`,
    }))
    const { wrapper } = await abrirPantalla([USUARIOS[0]!, ...muchos].slice(0, 12))

    expect(filas(wrapper)).toHaveLength(10)
    await wrapper.find('button[aria-label="Página siguiente"], button[data-pagina-siguiente]').trigger('click')
    expect(filas(wrapper)).toHaveLength(2)
  })

  it('si la API falla muestra un mensaje de error con opción de reintentar, en vez de quedarse cargando', async () => {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    stubFetch((ruta) => {
      if (ruta === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol: 'supervisor' } })
      return Promise.reject(errorHttp(500, { message: 'Error interno del servidor' }))
    })
    await useSessionStore().iniciarSesion('laura.hernandez@h3ga.mx', 'secreta123')

    const wrapper = await mountSuspended(UsuariosPage)
    await vi.waitFor(() => expect(wrapper.text()).toMatch(/no se pudieron cargar/i))

    expect(wrapper.find('button[data-accion="reintentar"]').exists()).toBe(true)
    expect(wrapper.text()).not.toMatch(/cargando/i)
  })
})
