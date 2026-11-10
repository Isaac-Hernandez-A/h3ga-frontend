import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setActivePinia, type Pinia } from 'pinia'
import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import DefaultLayout from '~/layouts/default.vue'
import { menuPara, rutaInicio } from '~/utils/menu'
import { rutasPermitidas } from '~/utils/permisos'
import type { Rol } from '~/types/sesion'
import { SESION_API, stubFetch } from './ayudas'

const { navigateToMock } = vi.hoisted(() => ({ navigateToMock: vi.fn() }))
mockNuxtImport('navigateTo', () => navigateToMock)
// $fetch es un auto-import de Nuxt: se redirige al stub global que instala stubFetch().
mockNuxtImport('$fetch', () => (...args: unknown[]) => (globalThis as unknown as { $fetch: (...a: unknown[]) => unknown }).$fetch(...args))
mockNuxtImport('useToast', () => () => ({ add: vi.fn() }))

const ROLES: Rol[] = ['asesor', 'auxiliar', 'supervisor']
const etiquetas = (rol: Rol) => menuPara(rol).map(e => e.etiqueta)
const resumen = (rol: Rol) => menuPara(rol).map(({ etiqueta, ruta }) => ({ etiqueta, ruta }))

describe('menuPara', () => {
  it('CF-07 devuelve solo las entradas de cada rol (las de la especificación y las de los wireframes)', () => {
    expect(resumen('asesor')).toEqual([
      { etiqueta: 'Inicio', ruta: '/' },
      { etiqueta: 'Clientes', ruta: '/clientes' },
      { etiqueta: 'Agenda y citas', ruta: '/agenda' },
      { etiqueta: 'Centro de avisos', ruta: '/avisos' },
      { etiqueta: 'Reportes', ruta: '/reportes' },
      { etiqueta: 'Pensión final', ruta: '/pension-final' },
      { etiqueta: 'Modalidades', ruta: '/modalidades' },
      { etiqueta: 'Servicios complementarios', ruta: '/servicios-complementarios' },
      { etiqueta: 'Diagnósticos', ruta: '/diagnosticos' },
      { etiqueta: 'Correcciones', ruta: '/correcciones' },
      { etiqueta: 'Biblioteca', ruta: '/biblioteca' },
      { etiqueta: 'Configuración del Sistema', ruta: '/configuracion' },
    ])
    expect(resumen('auxiliar')).toEqual([
      { etiqueta: 'Inicio', ruta: '/' },
      { etiqueta: 'Clientes', ruta: '/clientes' },
      { etiqueta: 'Agenda y citas', ruta: '/agenda' },
      { etiqueta: 'Centro de avisos', ruta: '/avisos' },
      { etiqueta: 'Gestión Documental', ruta: '/gestion-documental' },
      { etiqueta: 'Biblioteca', ruta: '/biblioteca' },
      { etiqueta: 'Configuración del Sistema', ruta: '/configuracion' },
    ])
    expect(resumen('supervisor')).toEqual([
      { etiqueta: 'Inicio', ruta: '/' },
      { etiqueta: 'Clientes', ruta: '/clientes' },
      { etiqueta: 'Agenda y citas', ruta: '/agenda' },
      { etiqueta: 'Centro de avisos', ruta: '/avisos' },
      { etiqueta: 'Reportes', ruta: '/reportes' },
      { etiqueta: 'Usuarios y roles', ruta: '/usuarios' },
      { etiqueta: 'Formatos institucionales', ruta: '/formatos-institucionales' },
      { etiqueta: 'Configuración del Sistema', ruta: '/configuracion' },
    ])
  })

  it('CF-07 el Auxiliar no ve Reportes ni Usuarios, y el Asesor no ve Usuarios', () => {
    expect(etiquetas('auxiliar')).not.toContain('Reportes')
    expect(etiquetas('auxiliar')).not.toContain('Usuarios y roles')
    expect(etiquetas('asesor')).not.toContain('Usuarios y roles')
    expect(etiquetas('supervisor')).not.toContain('Biblioteca')
  })

  it('cada entrada del menú es una ruta que el middleware permite a ese rol (menú y permisos no se contradicen)', () => {
    for (const rol of ROLES) {
      const permitidas = rutasPermitidas(rol)
      expect(menuPara(rol).map(e => e.ruta).sort(), rol).toEqual([...permitidas].sort())
    }
  })

  it('las secciones salen en el orden del wireframe y la configuración va aparte, al final', () => {
    const secciones = (rol: Rol) => [...new Set(menuPara(rol).map(e => e.seccion))]
    expect(secciones('asesor')).toEqual(['General', 'Estrategias y servicios', 'Diagnósticos y trámites', 'Otros', 'Sistema'])
    expect(secciones('auxiliar')).toEqual(['General', 'Otros', 'Sistema'])
    expect(secciones('supervisor')).toEqual(['General', 'Otros', 'Sistema'])
    for (const rol of ROLES) {
      expect(menuPara(rol).at(-1)!.etiqueta).toBe('Configuración del Sistema')
    }
  })

  it('cada entrada tiene sección e icono de Lucide, y las rutas no se repiten', () => {
    for (const rol of ROLES) {
      const menu = menuPara(rol)
      for (const entrada of menu) {
        expect(entrada.seccion, `${rol} ${entrada.etiqueta}`).toBeTruthy()
        expect(entrada.icono, `${rol} ${entrada.etiqueta}`).toMatch(/^i-lucide-[a-z-]+$/)
      }
      expect(new Set(menu.map(e => e.ruta)).size).toBe(menu.length)
    }
  })

  it('rutaInicio manda a cada rol a su primera pantalla de trabajo', () => {
    for (const rol of ROLES) {
      expect(rutaInicio(rol)).toBe('/clientes')
    }
  })
})

describe('Diseño con menú lateral', () => {
  async function abrirComo(rol: Rol, pendientes = 0) {
    setActivePinia(useNuxtApp().$pinia as Pinia)
    const fetchMock = stubFetch((ruta) => {
      if (ruta === '/auth/login') return Promise.resolve({ ...SESION_API, usuario: { ...SESION_API.usuario, rol } })
      return Promise.resolve(Array.from({ length: pendientes }, (_, i) => ({ id: String(i), atendido: false })))
    })
    await useSessionStore().iniciarSesion('ana@ejemplo.com', 'secreta123')
    const wrapper = await mountSuspended(DefaultLayout, { slots: { default: '<p id="contenido">Contenido de la página</p>' } })
    return { wrapper, fetchMock }
  }

  beforeEach(() => {
    sessionStorage.clear()
    navigateToMock.mockReset()
    setActivePinia(useNuxtApp().$pinia as Pinia)
    useSessionStore().cerrarSesion()
    navigateToMock.mockReset()
    delete useRoute().meta.titulo
  })

  it('el menú renderizado coincide con menuPara de cada rol (la configuración va abajo, fuera de la navegación)', async () => {
    for (const rol of ROLES) {
      const { wrapper } = await abrirComo(rol)
      const principales = menuPara(rol).filter(e => e.seccion !== 'Sistema')
      const enlaces = wrapper.findAll('nav a')

      expect(enlaces.map(a => a.text().replace(/\d+$/, '').trim()), rol).toEqual(principales.map(e => e.etiqueta))
      expect(enlaces.map(a => a.attributes('href')), rol).toEqual(principales.map(e => e.ruta))
      expect(wrapper.find('aside a[href="/configuracion"]').text(), rol).toContain('Configuración del Sistema')
      expect(wrapper.find('#contenido').exists()).toBe(true)
      wrapper.unmount()
    }
  })

  it('agrupa las entradas bajo los títulos de sección del wireframe', async () => {
    const { wrapper } = await abrirComo('asesor')
    const titulos = wrapper.findAll('nav [data-seccion]').map(t => t.text())

    expect(titulos).toEqual(['General', 'Estrategias y servicios', 'Diagnósticos y trámites', 'Otros'])
  })

  it('muestra el contador de avisos pendientes junto a Centro de avisos', async () => {
    const { wrapper } = await abrirComo('asesor', 4)
    await vi.waitFor(() => {
      const enlace = wrapper.findAll('nav a').find(a => a.attributes('href') === '/avisos')!
      expect(enlace.text()).toContain('4')
    })
  })

  it('el botón de cerrar sesión limpia la sesión y manda a /login', async () => {
    const { wrapper } = await abrirComo('asesor')
    const sesion = useSessionStore()
    expect(sesion.token).not.toBeNull()

    await wrapper.find('button[aria-label="Cerrar sesión"]').trigger('click')

    expect(sesion.token).toBeNull()
    expect(sesion.usuario).toBeNull()
    expect(sessionStorage.getItem('h3ga.sesion')).toBeNull()
    expect(navigateToMock).toHaveBeenCalledWith('/login')
  })

  it('el botón de contraer está en la cabecera, junto al título, y deja solo los iconos con su etiqueta accesible', async () => {
    const { wrapper } = await abrirComo('supervisor')
    expect(wrapper.find('nav').text()).toContain('Reportes')
    expect(wrapper.find('aside button[aria-label="Contraer menú"]').exists()).toBe(false)

    await wrapper.find('header button[aria-label="Contraer menú"]').trigger('click')

    expect(wrapper.find('nav').text()).not.toContain('Reportes')
    expect(wrapper.find('nav a[href="/reportes"]').attributes('aria-label')).toBe('Reportes')
    expect(wrapper.find('header button[aria-label="Expandir menú"]').exists()).toBe(true)
  })

  it('la cabecera muestra el título de la pantalla, el nombre y el rol del usuario', async () => {
    useRoute().meta.titulo = 'Modalidades'
    const { wrapper } = await abrirComo('auxiliar')
    const cabecera = wrapper.find('header')

    expect(cabecera.find('h1').text()).toBe('Modalidades')
    expect(cabecera.text()).toContain('Ana Pérez')
    expect(cabecera.text()).toMatch(/auxiliar/i)
  })
})
