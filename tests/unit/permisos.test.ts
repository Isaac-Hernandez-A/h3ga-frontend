import { describe, expect, it } from 'vitest'
import { puede, rutasPermitidas } from '~/utils/permisos'

describe('permisos por rol', () => {
  it('rutasPermitidas sigue la tabla de roles de la especificación', () => {
    expect(rutasPermitidas('asesor')).toEqual(['/', '/clientes', '/agenda', '/avisos', '/reportes'])
    expect(rutasPermitidas('auxiliar')).toEqual(['/', '/clientes', '/agenda', '/avisos'])
    expect(rutasPermitidas('supervisor')).toEqual(['/', '/clientes', '/agenda', '/avisos', '/reportes', '/usuarios'])
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
    expect(puede('supervisor', 'usuarios.administrar')).toBe(true)
    expect(puede('asesor', 'usuarios.administrar')).toBe(false)
  })
})
