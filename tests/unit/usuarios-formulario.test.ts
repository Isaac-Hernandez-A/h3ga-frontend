import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { flushPromises } from '@vue/test-utils'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import UsuarioFormulario from '~/components/UsuarioFormulario.vue'
import { errorHttp, stubFetch } from './ayudas'
import { ROLES, TIPOS_ASESOR, USUARIOS } from './usuarios-datos'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

type Props = { usuario: (typeof USUARIOS)[number] | null, roles: typeof ROLES, tiposAsesor: typeof TIPOS_ASESOR }

async function abrir(props: Partial<Props> = {}) {
  const wrapper = await mountSuspended(UsuarioFormulario, {
    props: { usuario: null, roles: ROLES, tiposAsesor: [], ...props },
  })
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
      await campo('correo_electronico').setValue('ana.perez@h3ga.mx')
      await campo('contrasena').setValue('clave-segura-1')
      await campo('rol_id').setValue('1')
    },
  }
}

describe('UsuarioFormulario', () => {
  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(useNuxtApp().$pinia as Pinia)
  })

  it('la lista de roles no muestra el "(Admin)" del nombre del rol', async () => {
    const { campo } = await abrir()

    expect(campo('rol_id').text()).toContain('Supervisor Operativo')
    expect(campo('rol_id').text()).not.toContain('(Admin)')
  })

  it('valida los campos obligatorios y no llama a la API si faltan', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper, enviar } = await abrir()

    await enviar()

    expect(fetchMock).not.toHaveBeenCalled()
    const texto = wrapper.text()
    expect(texto).toMatch(/ingresa el nombre/i)
    expect(texto).toMatch(/ingresa el apellido paterno/i)
    expect(texto).toMatch(/ingresa el correo/i)
    expect(texto).toMatch(/ingresa una contraseña/i)
    expect(texto).not.toMatch(/apellido materno es obligatorio/i)
  })

  it('valida el formato del correo y el largo de la contraseña', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper, llenarValido, campo, enviar } = await abrir()

    await llenarValido()
    await campo('correo_electronico').setValue('no-es-correo')
    await campo('contrasena').setValue('corta')
    await enviar()

    expect(fetchMock).not.toHaveBeenCalled()
    expect(wrapper.text()).toMatch(/correo válido/i)
    expect(wrapper.text()).toMatch(/al menos 8 caracteres/i)
  })

  it('muestra bajo cada campo los errores por campo que devuelve la API (400), en español', async () => {
    stubFetch(() =>
      Promise.reject(
        errorHttp(400, {
          statusCode: 400,
          error: 'Bad Request',
          message: ['correo_electronico must be an email', 'nombre should not be empty'],
        }),
      ),
    )
    const { wrapper, llenarValido, enviar } = await abrir()

    await llenarValido()
    await enviar()

    expect(wrapper.text()).toMatch(/correo válido/i)
    expect(wrapper.text()).toMatch(/obligatorio/i)
    expect(wrapper.emitted('guardado')).toBeUndefined()
  })

  it('un 409 por correo repetido se muestra como error del campo correo', async () => {
    stubFetch(() => Promise.reject(errorHttp(409, { message: 'Ya existe un usuario con ese correo electrónico.' })))
    const { wrapper, llenarValido, enviar } = await abrir()

    await llenarValido()
    await enviar()

    const campoCorreo = wrapper.find('[name="correo_electronico"]').element.closest('[data-campo]')
    expect(campoCorreo?.textContent).toContain('Ya existe un usuario con ese correo electrónico.')
    expect(wrapper.emitted('guardado')).toBeUndefined()
  })

  it('crear envía POST /usuarios con los campos del contrato y avisa al guardar', async () => {
    const creado = { ...USUARIOS[1]!, id: '99999999-9999-4999-8999-999999999999', nombre: 'Ana María' }
    const fetchMock = stubFetch(() => Promise.resolve(creado))
    const { wrapper, llenarValido, enviar } = await abrir()

    await llenarValido()
    await enviar()

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown> }]
    expect(ruta).toBe('/usuarios')
    expect(opciones.method).toBe('POST')
    expect(opciones.body).toEqual({
      rol_id: 1,
      nombre: 'Ana María',
      apellido_paterno: 'Pérez',
      apellido_materno: 'Soto',
      correo_electronico: 'ana.perez@h3ga.mx',
      contrasena: 'clave-segura-1',
    })
    expect(wrapper.emitted('guardado')![0]).toEqual([creado])
  })

  it('el apellido materno puede ir vacío (se envía como cadena vacía)', async () => {
    const fetchMock = stubFetch(() => Promise.resolve(USUARIOS[1]))
    const { llenarValido, campo, enviar } = await abrir()

    await llenarValido()
    await campo('apellido_materno').setValue('')
    await enviar()

    const [, opciones] = fetchMock.mock.calls[0] as [string, { body: Record<string, unknown> }]
    expect(opciones.body.apellido_materno).toBe('')
  })

  it('el tipo de asesor solo aparece para el rol Asesor y solo si hay tipos en el catálogo', async () => {
    const { wrapper, campo } = await abrir({ tiposAsesor: TIPOS_ASESOR })

    await campo('rol_id').setValue('1')
    expect(wrapper.find('[name="tipo_asesor_id"]').exists()).toBe(true)

    await campo('rol_id').setValue('2')
    expect(wrapper.find('[name="tipo_asesor_id"]').exists()).toBe(false)

    const sinTipos = await abrir({ tiposAsesor: [] })
    await sinTipos.campo('rol_id').setValue('1')
    expect(sinTipos.wrapper.find('[name="tipo_asesor_id"]').exists()).toBe(false)
  })

  it('editar precarga los datos, no pide contraseña y envía PATCH /usuarios/{id}', async () => {
    const usuario = USUARIOS[3]!
    const fetchMock = stubFetch(() => Promise.resolve({ ...usuario, nombre: 'Iván Andrés' }))
    const { wrapper, campo, enviar } = await abrir({ usuario })

    expect((campo('nombre').element as HTMLInputElement).value).toBe('Iván')
    expect((campo('correo_electronico').element as HTMLInputElement).value).toBe('ivan.barrera@h3ga.mx')
    expect((campo('rol_id').element as HTMLSelectElement).value).toBe('2')
    expect(wrapper.find('[name="contrasena"]').exists()).toBe(false)

    await campo('nombre').setValue('Iván Andrés')
    await enviar()

    const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown> }]
    expect(ruta).toBe(`/usuarios/${usuario.id}`)
    expect(opciones.method).toBe('PATCH')
    expect(opciones.body).toMatchObject({ nombre: 'Iván Andrés', rol_id: 2, correo_electronico: 'ivan.barrera@h3ga.mx' })
    expect(opciones.body).not.toHaveProperty('contrasena')
    expect(wrapper.emitted('guardado')).toHaveLength(1)
  })

  describe('restablecer contraseña (solo al editar)', () => {
    const usuario = USUARIOS[3]!

    it('el botón solo se ofrece al editar, no al crear', async () => {
      const edicion = await abrir({ usuario })
      expect(edicion.wrapper.find('button[data-accion="restablecer-contrasena"]').exists()).toBe(true)

      const alta = await abrir()
      expect(alta.wrapper.find('button[data-accion="restablecer-contrasena"]').exists()).toBe(false)
    })

    async function abrirReinicio() {
      const base = await abrir({ usuario })
      await base.wrapper.find('button[data-accion="restablecer-contrasena"]').trigger('click')
      const guardarContrasena = async () => {
        await base.wrapper.find('button[data-accion="guardar-contrasena"]').trigger('click')
        await flushPromises()
      }
      return { ...base, guardarContrasena, nueva: () => base.wrapper.find('input[name="nueva_contrasena"]') }
    }

    it('valida que la nueva contraseña no esté vacía ni sea corta, sin llamar a la API', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(undefined))
      const { wrapper, nueva, guardarContrasena } = await abrirReinicio()
      expect(nueva().attributes('type')).toBe('password')

      await guardarContrasena()
      expect(wrapper.text()).toMatch(/ingresa la nueva contraseña/i)

      await nueva().setValue('corta')
      await guardarContrasena()
      expect(wrapper.text()).toMatch(/al menos 8 caracteres/i)
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('envía PATCH /usuarios/{id}/contrasena con la nueva contraseña, acepta el 204 sin cuerpo y avisa del éxito', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(undefined))
      const { wrapper, nueva, guardarContrasena } = await abrirReinicio()

      await nueva().setValue('clave-nueva-123')
      await guardarContrasena()

      const [ruta, opciones] = fetchMock.mock.calls[0] as [string, { method: string, body: Record<string, unknown> }]
      expect(ruta).toBe(`/usuarios/${usuario.id}/contrasena`)
      expect(opciones.method).toBe('PATCH')
      expect(opciones.body).toEqual({ contrasena: 'clave-nueva-123' })
      expect(wrapper.text()).toMatch(/contraseña restablecida/i)
      expect(wrapper.find('input[name="nueva_contrasena"]').exists()).toBe(false)
      // El restablecimiento no guarda ni cierra el formulario de datos.
      expect(wrapper.emitted('guardado')).toBeUndefined()
    })

    it('no deja la contraseña escrita en pantalla ni en el cuerpo del PATCH de los datos del usuario', async () => {
      const fetchMock = stubFetch((ruta) => Promise.resolve(ruta === `/usuarios/${usuario.id}/contrasena` ? undefined : usuario))
      const { wrapper, nueva, guardarContrasena, enviar } = await abrirReinicio()

      await nueva().setValue('clave-nueva-123')
      await guardarContrasena()
      await enviar()

      expect(wrapper.html()).not.toContain('clave-nueva-123')
      const datos = fetchMock.mock.calls.find(([ruta]) => ruta === `/usuarios/${usuario.id}`) as [string, { body: Record<string, unknown> }]
      expect(datos[1].body).not.toHaveProperty('contrasena')
    })

    it('muestra bajo el campo el error de validación que devuelve la API (400), en español', async () => {
      stubFetch(() =>
        Promise.reject(errorHttp(400, { statusCode: 400, error: 'Bad Request', message: ['contrasena must be longer than or equal to 8 characters'] })),
      )
      const { wrapper, nueva, guardarContrasena } = await abrirReinicio()

      await nueva().setValue('clave-nueva-123')
      await guardarContrasena()

      expect(wrapper.find('[data-campo="nueva_contrasena"]').text()).toContain('Debe tener al menos 8 caracteres')
      expect(wrapper.find('input[name="nueva_contrasena"]').exists()).toBe(true)
    })

    it('un 404 (usuario inexistente) se muestra como error del formulario y no oculta el campo', async () => {
      stubFetch(() => Promise.reject(errorHttp(404, { message: 'Usuario no encontrado.' })))
      const { wrapper, nueva, guardarContrasena } = await abrirReinicio()

      await nueva().setValue('clave-nueva-123')
      await guardarContrasena()

      expect(wrapper.find('[role="alert"]').text()).toContain('Usuario no encontrado.')
      expect(wrapper.find('input[name="nueva_contrasena"]').exists()).toBe(true)
    })

    it('cancelar oculta el campo y borra lo escrito', async () => {
      const fetchMock = stubFetch(() => Promise.resolve(undefined))
      const { wrapper, nueva } = await abrirReinicio()
      await nueva().setValue('clave-nueva-123')

      await wrapper.find('button[data-accion="cancelar-contrasena"]').trigger('click')
      expect(wrapper.find('input[name="nueva_contrasena"]').exists()).toBe(false)

      await wrapper.find('button[data-accion="restablecer-contrasena"]').trigger('click')
      expect((wrapper.find('input[name="nueva_contrasena"]').element as HTMLInputElement).value).toBe('')
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  it('cancelar avisa sin llamar a la API', async () => {
    const fetchMock = stubFetch(() => Promise.resolve({}))
    const { wrapper } = await abrir()

    await wrapper.find('button[data-accion="cancelar"]').trigger('click')

    expect(wrapper.emitted('cancelar')).toHaveLength(1)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
