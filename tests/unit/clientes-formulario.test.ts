import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import ClienteFormulario from '~/components/ClienteFormulario.vue'
import NuevoClientePage from '~/pages/clientes/nuevo.vue'
import { SESION_API, errorHttp, stubFetch } from './ayudas'
import { AFORES, CLIENTES, LEYES, REGIMENES } from './clientes-datos'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const catalogos = { regimenes: REGIMENES, leyesProbables: LEYES, afores: AFORES }

async function abrir(cliente: (typeof CLIENTES)[number] | null = null) {
  const wrapper = await mountSuspended(ClienteFormulario, { props: { cliente, catalogos } })
  const campo = (nombre: string) => wrapper.find(`[name="${nombre}"]`)
  return {
    wrapper,
    campo,
    enviar: async () => {
      await wrapper.find('form').trigger('submit')
      await flushPromises()
    },
    llenarValido: async () => {
      await campo('nombre').setValue('Ana María')
      await campo('apellido_paterno').setValue('Pérez')
      await campo('apellido_materno').setValue('Soto')
      await campo('telefono').setValue('9981112233')
      await campo('correo_electronico').setValue('ana.perez@ejemplo.com')
      await campo('fecha_ingreso').setValue('2026-11-10')
      await campo('fecha_nacimiento').setValue('1970-05-20')
      await campo('sexo').setValue('mujer')
      await campo('regimen_id').setValue('1')
      await campo('ley_probable_id').setValue('1')
      await campo('afore_id').setValue('2')
      await campo('objetivo_cliente').setValue('mejorar_monto_pension')
    },
  }
}

describe('ClienteFormulario', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('valida los campos obligatorios y no llama a la API si faltan', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper, campo, enviar } = await abrir()
    await campo('fecha_ingreso').setValue('')

    await enviar()

    expect(fetchMock).not.toHaveBeenCalled()
    const texto = wrapper.text()
    for (const mensaje of [/ingresa el nombre/i, /ingresa el apellido paterno/i, /ingresa el teléfono/i, /ingresa el correo/i, /fecha de ingreso/i, /fecha de nacimiento/i, /elige el sexo/i, /elige el régimen/i, /elige la ley probable/i, /elige la afore/i, /elige el objetivo/i]) {
      expect(texto).toMatch(mensaje)
    }
  })

  it('valida el formato de correo, CURP, NSS y los números enteros', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper, campo, llenarValido, enviar } = await abrir()
    await llenarValido()

    await campo('correo_electronico').setValue('no-es-correo')
    await campo('curp').setValue('CURP-MAL')
    await campo('nss').setValue('123456789012')
    await campo('dependientes_economicos').setValue('-1')
    await campo('semanas_imss_reconocidas').setValue('abc')
    await enviar()

    expect(fetchMock).not.toHaveBeenCalled()
    const texto = wrapper.text()
    expect(texto).toMatch(/correo válido/i)
    expect(texto).toMatch(/curp.*formato/i)
    expect(texto).toMatch(/no debe pasar de 11 caracteres/i)
    expect(texto).toMatch(/entero de 0 o más/i)
  })

  it('las listas de régimen, ley probable y AFORE salen del catálogo del backend', async () => {
    const { campo } = await abrir()

    expect(campo('regimen_id').text()).toContain('ISSSTE')
    expect(campo('ley_probable_id').text()).toContain('Ley 97')
    expect(campo('afore_id').text()).toContain('Profuturo')
  })

  it('crear envía POST /clientes con los campos del contrato: CURP en mayúsculas, opcionales vacíos omitidos, sin asesor_id', async () => {
    const creado = { ...CLIENTES[0]!, id: 'c9999999-9999-4999-8999-999999999999' }
    const fetchMock = stubFetch(() => Promise.resolve(creado))
    const { wrapper, campo, llenarValido, enviar } = await abrir()

    await llenarValido()
    await campo('curp').setValue('rosm800315mdfdlr09')
    await campo('dependientes_economicos').setValue('2')
    await campo('semanas_imss_reconocidas').setValue('650')
    await enviar()

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown> }]
    expect(ruta).toBe('/clientes')
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toMatchObject({
      nombre: 'Ana María',
      apellido_paterno: 'Pérez',
      apellido_materno: 'Soto',
      telefono: '9981112233',
      correo_electronico: 'ana.perez@ejemplo.com',
      fecha_ingreso: '2026-11-10',
      fecha_nacimiento: '1970-05-20',
      sexo: 'mujer',
      regimen_id: 1,
      ley_probable_id: 1,
      afore_id: 2,
      objetivo_cliente: 'mejorar_monto_pension',
      curp: 'ROSM800315MDFDLR09',
      dependientes_economicos: 2,
      semanas_imss_reconocidas: 650,
    })
    // Texto que la API exige aunque sea vacío, y opcionales que no deben viajar vacíos.
    expect(opciones.body.domicilio).toBe('')
    expect(opciones.body.observaciones_generales).toBe('')
    for (const omitido of ['asesor_id', 'rfc', 'nss', 'ine', 'ocupacion', 'semanas_a_recuperar']) {
      expect(opciones.body, omitido).not.toHaveProperty(omitido)
    }
    expect(wrapper.emitted('guardado')![0]).toEqual([creado])
  })

  it('un 409 por CURP repetida se muestra como error del campo CURP', async () => {
    stubFetch(() => Promise.reject(errorHttp(409, { message: 'Ya existe un cliente con esa CURP.' })))
    const { wrapper, campo, llenarValido, enviar } = await abrir()
    await llenarValido()
    await campo('curp').setValue('ROSM800315MDFDLR09')

    await enviar()

    const campoCurp = wrapper.find('[name="curp"]').element.closest('[data-campo]')
    expect(campoCurp?.textContent).toContain('Ya existe un cliente con esa CURP.')
    expect(wrapper.emitted('guardado')).toBeUndefined()
  })

  it('muestra bajo cada campo los errores por campo que devuelve la API (400), en español', async () => {
    stubFetch(() =>
      Promise.reject(
        errorHttp(400, {
          statusCode: 400,
          error: 'Bad Request',
          message: ['correo_electronico must be an email', 'curp debe tener el formato de una CURP (18 caracteres).'],
        }),
      ),
    )
    const { wrapper, llenarValido, enviar } = await abrir()
    await llenarValido()

    await enviar()

    expect(wrapper.find('[data-campo="correo_electronico"]').text()).toMatch(/correo válido/i)
    expect(wrapper.find('[data-campo="curp"]').text()).toMatch(/formato/i)
  })

  it('otros errores del servidor se muestran como error del formulario', async () => {
    stubFetch(() => Promise.reject(errorHttp(500, { message: 'Error interno del servidor' })))
    const { wrapper, llenarValido, enviar } = await abrir()
    await llenarValido()

    await enviar()

    expect(wrapper.find('[role="alert"]').text()).toMatch(/no se pudo guardar/i)
  })

  it('editar precarga los datos del cliente y envía PATCH /clientes/{id}', async () => {
    const cliente = CLIENTES[1]!
    const fetchMock = stubFetch(() => Promise.resolve({ ...cliente, telefono: '9990000000' }))
    const { wrapper, campo, enviar } = await abrir(cliente)

    expect((campo('nombre').element as HTMLInputElement).value).toBe('Iván')
    expect((campo('curp').element as HTMLInputElement).value).toBe('BALI750101HDFRZV05')
    expect((campo('sexo').element as HTMLSelectElement).value).toBe('hombre')
    expect((campo('fecha_nacimiento').element as HTMLInputElement).value).toBe('1965-02-21')

    await campo('telefono').setValue('9990000000')
    await enviar()

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown> }]
    expect(ruta).toBe(`/clientes/${cliente.id}`)
    expect(opciones.method).toBe('PATCH')
    expect(opciones.body).toMatchObject({ telefono: '9990000000', nombre: 'Iván' })
    expect(wrapper.emitted('guardado')).toHaveLength(1)
  })

  it('cancelar avisa sin llamar a la API', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper } = await abrir()

    await wrapper.find('button[data-accion="cancelar"]').trigger('click')

    expect(wrapper.emitted('cancelar')).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})

describe('Pantalla de alta de cliente', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  function api(rol: 'asesor' | 'supervisor' | 'auxiliar', creado = CLIENTES[0]!) {
    return stubFetch((ruta, opciones) => {
      const { method } = opciones as { method: string }
      if (ruta === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
      if (ruta === '/catalogos/regimenes') return Promise.resolve(REGIMENES)
      if (ruta === '/catalogos/leyes-probables') return Promise.resolve(LEYES)
      if (ruta === '/catalogos/afores') return Promise.resolve(AFORES)
      if (ruta === '/clientes' && method === 'POST') return Promise.resolve(creado)
      return Promise.resolve([])
    })
  }

  it('el Asesor ve el formulario con los catálogos cargados', async () => {
    const fetchMock = api('asesor')
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')

    const wrapper = await mountSuspended(NuevoClientePage)
    await vi.waitFor(() => expect(wrapper.find('select[name="afore_id"]').text()).toContain('Profuturo'))

    expect(wrapper.find('form').exists()).toBe(true)
    expect((fetchMock.mock.calls as [string][]).map(([r]) => r)).toEqual(expect.arrayContaining(['/catalogos/regimenes', '/catalogos/leyes-probables', '/catalogos/afores']))
    expect(navigateToMock).not.toHaveBeenCalledWith('/clientes')
  })

  it('el Supervisor y el Auxiliar no pueden dar de alta: vuelven al listado', async () => {
    for (const rol of ['supervisor', 'auxiliar'] as const) {
      navigateToMock.mockReset()
      api(rol)
      useSessionStore().cerrarSesion()
      await useSessionStore().iniciarSesion('x@ejemplo.com', 'secreta123')
      navigateToMock.mockReset()

      await mountSuspended(NuevoClientePage)
      await flushPromises()

      expect(navigateToMock, rol).toHaveBeenCalledWith('/clientes')
    }
  })

  it('al guardar vuelve al listado y cancelar también', async () => {
    api('asesor')
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(NuevoClientePage)
    await vi.waitFor(() => expect(wrapper.find('select[name="afore_id"]').text()).toContain('Profuturo'))
    navigateToMock.mockReset()

    await wrapper.find('button[data-accion="cancelar"]').trigger('click')

    expect(navigateToMock).toHaveBeenCalledWith('/clientes')
  })
})
