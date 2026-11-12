import { describe, expect, it } from 'vitest'
import { fechaLarga, GRUPOS_ETAPAS, iniciales, porGrupo, textoVencimiento } from '~/utils/dashboard'

const HOY = '2026-11-12'

// Las reglas de negocio (cliente activo, etapa actual, avance detenido, carga por asesor) ya las calcula el backend
// en GET /dashboard; aquí solo queda la presentación.
describe('clientes por grupo de etapas', () => {
  it('suma las etapas 0-4, 5-7, 8-13 y 14-15 como la dona del wireframe', () => {
    const porEtapa = [1, 1, 0, 0, 1, 2, 0, 0, 0, 0, 0, 0, 0, 0, 3, 1]
    expect(GRUPOS_ETAPAS).toHaveLength(4)
    expect(porGrupo(porEtapa).map(g => g.valor)).toEqual([3, 2, 0, 4])
  })
})

describe('textoVencimiento', () => {
  it('dice Hoy, Mañana, N días, Vencida o Completada', () => {
    expect(textoVencimiento('2026-11-12', 'proxima', HOY)).toBe('Hoy')
    expect(textoVencimiento('2026-11-13', 'proxima', HOY)).toBe('Mañana')
    expect(textoVencimiento('2026-11-20', 'proxima', HOY)).toBe('8 días')
    expect(textoVencimiento('2026-11-01', 'vencida', HOY)).toBe('Vencida')
    expect(textoVencimiento('2026-11-01', 'completada', HOY)).toBe('Completada')
  })
})

describe('fecha larga', () => {
  it('"Jueves, 12 De Noviembre De 2026" con cada palabra en mayúscula', () => {
    expect(fechaLarga('2026-11-12')).toBe('Jueves, 12 De Noviembre De 2026')
    expect(fechaLarga('2026-01-05T10:00:00.000Z')).toBe('Lunes, 05 De Enero De 2026')
  })
})

describe('iniciales', () => {
  it('primera letra del primer y del último nombre', () => {
    expect(iniciales('María Elena Rodríguez Salas')).toBe('MS')
    expect(iniciales('Iván Torres')).toBe('IT')
    expect(iniciales('Ana')).toBe('A')
  })
})
