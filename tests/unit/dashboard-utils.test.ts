import { describe, expect, it } from 'vitest'
import {
  accionesDelMes, cargaPorAsesor, contarPorEtapa, detenidos, documentosPendientes, documentosPorEstatus, esActivo, etapaActual,
  fechaLarga, GRUPOS_ETAPAS, porGrupo, type RegistroCliente, textoVencimiento,
} from '~/utils/dashboard'
import type { Cliente } from '~/types/cliente'
import type { DocumentoCliente, EtapaCliente } from '~/types/expediente'

const HOY = '2026-11-12'
const cliente = (id: string, asesor = 'A'): Cliente => ({ id, asesor_id: asesor, nombre: id, apellido_paterno: 'X', apellido_materno: '' } as unknown as Cliente)
// 16 etapas: por iniciar (2) salvo lo que se indique.
function etapas(cambios: Record<number, Partial<EtapaCliente>> = {}, actualizado = '2026-11-10T10:00:00.000Z'): EtapaCliente[] {
  return Array.from({ length: 16 }, (_, paso) => ({
    numero_paso: paso, nombre: `Etapa ${paso}`, id: `e${paso}`, cliente_id: 'c', etapa_id: paso + 1, estatus_id: 2, avance_porcentaje: 10,
    accion_a_realizar: null, fecha_compromiso: null, fecha_completada: null, reactivado_en: null, creado_el: actualizado, actualizado_el: actualizado, motivo_rechazo: null,
    ...cambios[paso],
  })) as EtapaCliente[]
}
const registro = (c: Cliente, e: EtapaCliente[], documentos: Partial<DocumentoCliente>[] = []): RegistroCliente => ({ cliente: c, etapas: e, documentos: documentos as DocumentoCliente[] })

describe('etapa actual y clientes activos', () => {
  it('la etapa actual es la primera en proceso, bloqueada o detenida', () => {
    expect(etapaActual(etapas({ 0: { estatus_id: 6 }, 1: { estatus_id: 4 }, 3: { estatus_id: 3 } }))).toBe(1)
    expect(etapaActual(etapas({ 2: { estatus_id: 9 } }))).toBe(2)
    expect(etapaActual(etapas({ 5: { estatus_id: 7 } }))).toBe(5)
  })

  it('sin etapas en trabajo, es la primera por iniciar después de las finalizadas; todo finalizado = Finalización', () => {
    expect(etapaActual(etapas())).toBe(0)
    expect(etapaActual(etapas({ 0: { estatus_id: 6 }, 1: { estatus_id: 6 } }))).toBe(2)
    expect(etapaActual(etapas(Object.fromEntries(Array.from({ length: 16 }, (_, i) => [i, { estatus_id: 6 }]))))).toBe(15)
  })

  it('un cliente está activo mientras la etapa 15 (Finalización) no esté finalizada', () => {
    expect(esActivo(etapas({ 15: { estatus_id: 6 } }))).toBe(false)
    expect(esActivo(etapas())).toBe(true)
  })

  it('cuenta clientes por etapa y los agrupa como la dona del wireframe', () => {
    const por = contarPorEtapa([1, 1, 5, 9, 15])
    expect(por).toHaveLength(16)
    expect(por[1]).toBe(2)
    expect(GRUPOS_ETAPAS.map(g => g.nombre)).toEqual(['Diagnóstico y correcciones', 'Estrategias de modalidad', 'Proceso final', 'Cobranza y finalización'])
    expect(porGrupo(por).map(g => g.valor)).toEqual([2, 1, 1, 1])
  })
})

describe('acciones del mes', () => {
  it('lista las fechas compromiso del mes, ordenadas, con su estado', () => {
    const c1 = cliente('c1')
    const c2 = cliente('c2')
    const r = [
      registro(c1, etapas({ 1: { estatus_id: 4, fecha_compromiso: '2026-11-14', accion_a_realizar: 'Entregar constancia' } })),
      registro(c2, etapas({ 4: { estatus_id: 6, fecha_compromiso: '2026-11-03', fecha_completada: '2026-11-03', accion_a_realizar: 'Subir acta' }, 2: { estatus_id: 4, fecha_compromiso: '2026-12-01' } })),
    ]
    const filas = accionesDelMes(r, HOY)
    expect(filas.map(f => [f.cliente.id, f.fecha, f.estado])).toEqual([['c2', '2026-11-03', 'completada'], ['c1', '2026-11-14', 'proxima']])
    expect(filas[1]!.accion).toBe('Entregar constancia')
    expect(filas[1]!.etapa).toBe('Etapa 1')
  })

  it('una acción pasada y sin completar está vencida', () => {
    const filas = accionesDelMes([registro(cliente('c1'), etapas({ 1: { estatus_id: 4, fecha_compromiso: '2026-11-05' } }))], HOY)
    expect(filas[0]!.estado).toBe('vencida')
  })

  it('textoVencimiento dice Hoy, Mañana, N días, Vencida o Completada', () => {
    expect(textoVencimiento('2026-11-12', 'proxima', HOY)).toBe('Hoy')
    expect(textoVencimiento('2026-11-13', 'proxima', HOY)).toBe('Mañana')
    expect(textoVencimiento('2026-11-17', 'proxima', HOY)).toBe('5 días')
    expect(textoVencimiento('2026-11-05', 'vencida', HOY)).toBe('Vencida')
    expect(textoVencimiento('2026-11-03', 'completada', HOY)).toBe('Completada')
  })
})

describe('documentos', () => {
  const doc = (id: string, estatus: DocumentoCliente['estatus'], fecha = '2026-11-01T10:00:00.000Z') => ({ id, estatus, fecha_carga: fecha, tipo_documento_id: 1, subido_por: 'u' })

  it('pendientes: por confirmar y, si se pide, con observaciones, solo de clientes activos', () => {
    const r = [
      registro(cliente('c1'), etapas({ 1: { estatus_id: 4 } }), [doc('d1', 'por_confirmar'), doc('d2', 'no'), doc('d3', 'si')]),
      registro(cliente('c2'), etapas({ 15: { estatus_id: 6 } }), [doc('d4', 'por_confirmar')]),
    ]
    expect(documentosPendientes(r, false).map(d => d.documento.id)).toEqual(['d1'])
    expect(documentosPendientes(r, true).map(d => d.documento.id)).toEqual(['d1', 'd2'])
    expect(documentosPendientes(r, false)[0]!.etapa).toBe('Etapa 1')
  })

  it('cuenta documentos por estatus de los clientes activos', () => {
    const r = [registro(cliente('c1'), etapas(), [doc('1', 'si'), doc('2', 'si'), doc('3', 'por_confirmar'), doc('4', 'no')])]
    expect(documentosPorEstatus(r)).toEqual({ si: 2, por_confirmar: 1, no: 1 })
  })
})

describe('avance detenido y carga por asesor', () => {
  it('detenidos: etapa detenida o 15 días o más sin actividad; con los días sin actividad', () => {
    const r = [
      registro(cliente('c1'), etapas({ 2: { estatus_id: 9 } }, '2026-11-10T10:00:00.000Z')),
      registro(cliente('c2'), etapas({ 5: { estatus_id: 3 } }, '2026-10-20T10:00:00.000Z')),
      registro(cliente('c3'), etapas({ 5: { estatus_id: 3 } }, '2026-11-05T10:00:00.000Z')),
    ]
    const d = detenidos(r, HOY)
    expect(d.map(x => x.cliente.id)).toEqual(['c2', 'c1']) // más días sin actividad primero
    expect(d[0]!.dias).toBe(23)
    expect(d[0]!.etapa).toBe('Etapa 5')
    expect(d[1]!.dias).toBe(2)
  })

  it('carga por asesor: activos, detenidos y pensionados (finalizados), con total', () => {
    const r = [
      registro(cliente('c1', 'A'), etapas({ 2: { estatus_id: 9 } })),
      registro(cliente('c2', 'A'), etapas({ 5: { estatus_id: 3 } })),
      registro(cliente('c3', 'B'), etapas({ 15: { estatus_id: 6 } })),
      registro(cliente('c4', 'B'), etapas({ 5: { estatus_id: 3 } })),
    ]
    const carga = cargaPorAsesor(r, HOY)
    expect(carga.filas).toEqual([
      { asesorId: 'A', activos: 2, detenidos: 1, pensionados: 0 },
      { asesorId: 'B', activos: 1, detenidos: 0, pensionados: 1 },
    ])
    expect(carga.total).toEqual({ activos: 3, detenidos: 1, pensionados: 1 })
  })
})

describe('fecha larga', () => {
  it('"Jueves, 12 De Noviembre De 2026" con cada palabra en mayúscula', () => {
    expect(fechaLarga('2026-11-12')).toBe('Jueves, 12 De Noviembre De 2026')
  })
})
