import { describe, expect, it } from 'vitest'
import { puede, rutaPermitida, rutasPermitidas } from '~/utils/permisos'

describe('permisos por rol', () => {
  it('rutasPermitidas sigue la tabla de roles de la especificación y de los wireframes', () => {
    expect(rutasPermitidas('asesor')).toEqual([
      '/', '/clientes', '/agenda', '/avisos', '/reportes',
      '/pension-final', '/modalidades', '/servicios-complementarios',
      '/diagnosticos', '/correcciones', '/biblioteca', '/configuracion',
    ])
    expect(rutasPermitidas('auxiliar')).toEqual([
      '/', '/clientes', '/agenda', '/avisos',
      '/gestion-documental', '/biblioteca', '/configuracion',
    ])
    expect(rutasPermitidas('supervisor')).toEqual([
      '/', '/clientes', '/agenda', '/avisos', '/reportes', '/usuarios',
      '/formatos-institucionales', '/configuracion',
    ])
  })

  it('las pantallas exclusivas de un rol no están permitidas a los demás', () => {
    expect(rutaPermitida('auxiliar', '/reportes')).toBe(false)
    expect(rutaPermitida('auxiliar', '/usuarios')).toBe(false)
    expect(rutaPermitida('asesor', '/usuarios')).toBe(false)
    expect(rutaPermitida('supervisor', '/modalidades')).toBe(false)
    expect(rutaPermitida('supervisor', '/biblioteca')).toBe(false)
    expect(rutaPermitida('asesor', '/formatos-institucionales')).toBe(false)
    expect(rutaPermitida('asesor', '/gestion-documental')).toBe(false)
    expect(rutaPermitida('asesor', '/modalidades/123')).toBe(true)
  })

  it('puede distingue las acciones de cada rol', () => {
    expect(puede('asesor', 'clientes.crear')).toBe(true)
    expect(puede('supervisor', 'clientes.crear')).toBe(false)
    expect(puede('supervisor', 'clientes.reasignar')).toBe(true)
    expect(puede('asesor', 'clientes.reasignar')).toBe(false)
    expect(puede('asesor', 'etapas.cambiarEstatus')).toBe(true)
    expect(puede('auxiliar', 'etapas.cambiarEstatus')).toBe(false)
    expect(puede('supervisor', 'etapas.cambiarEstatus')).toBe(false)
    expect(puede('auxiliar', 'agenda.escribir')).toBe(false)
    expect(puede('asesor', 'agenda.escribir')).toBe(true)
    expect(puede('auxiliar', 'reportes.ver')).toBe(false)
    expect(puede('asesor', 'documentos.subir')).toBe(true)
    expect(puede('auxiliar', 'documentos.subir')).toBe(true)
    expect(puede('supervisor', 'documentos.subir')).toBe(false)
    expect(puede('supervisor', 'usuarios.administrar')).toBe(true)
    expect(puede('asesor', 'usuarios.administrar')).toBe(false)
  })
})
