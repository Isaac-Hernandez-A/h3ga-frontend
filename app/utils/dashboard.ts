import type { Cliente } from '~/types/cliente'
import type { DocumentoCliente, EtapaCliente } from '~/types/expediente'
import { ESTATUS_ID, esEtapaActual } from '~/utils/etapas'
import { fechaLocalISO } from '~/utils/fechas'
import { sumarDias } from '~/utils/agenda'

// Lo que el Dashboard sabe de cada cliente: el cliente, sus 16 etapas y sus documentos.
export interface RegistroCliente { cliente: Cliente, etapas: EtapaCliente[], documentos: DocumentoCliente[] }

export const TOTAL_ETAPAS = 16
export const DIAS_SIN_ACTIVIDAD = 15

// Las cuatro porciones de la dona: etapas 0-4, 5-7, 8-13 y 14-15.
export const GRUPOS_ETAPAS = [
  { clave: 'diagnostico', nombre: 'Diagnóstico y correcciones', desde: 0, hasta: 4, color: '#043f43' },
  { clave: 'estrategias', nombre: 'Estrategias de modalidad', desde: 5, hasta: 7, color: '#4dc9d6' },
  { clave: 'final', nombre: 'Proceso final', desde: 8, hasta: 13, color: '#ffcb05' },
  { clave: 'cobranza', nombre: 'Cobranza y finalización', desde: 14, hasta: 15, color: '#55b0d4' },
]

const ordenadas = (etapas: EtapaCliente[]) => [...etapas].sort((a, b) => a.numero_paso - b.numero_paso)

// Número de la etapa en la que está el cliente: la primera en proceso, bloqueada o detenida; si no hay, la primera por
// iniciar; y si todo está finalizado, la Finalización. Así cada cliente cuenta en una sola etapa.
export function etapaActual(etapas: EtapaCliente[]): number {
  const lista = ordenadas(etapas)
  const trabajando = lista.find(e => esEtapaActual(e.estatus_id))
  if (trabajando) return trabajando.numero_paso
  const porIniciar = lista.find(e => e.estatus_id === ESTATUS_ID.porIniciar)
  return porIniciar ? porIniciar.numero_paso : TOTAL_ETAPAS - 1
}

// Un cliente está activo mientras su última etapa (Finalización) no esté finalizada.
export const esActivo = (etapas: EtapaCliente[]) => etapas.find(e => e.numero_paso === TOTAL_ETAPAS - 1)?.estatus_id !== ESTATUS_ID.finalizado

export function contarPorEtapa(pasos: number[]): number[] {
  const cuenta = Array.from({ length: TOTAL_ETAPAS }, () => 0)
  for (const p of pasos) cuenta[p] = (cuenta[p] ?? 0) + 1
  return cuenta
}
export const porGrupo = (porEtapa: number[]) =>
  GRUPOS_ETAPAS.map(g => ({ ...g, valor: porEtapa.slice(g.desde, g.hasta + 1).reduce((a, b) => a + b, 0) }))

const nombreEtapa = (etapas: EtapaCliente[], paso: number) => etapas.find(e => e.numero_paso === paso)?.nombre ?? `Etapa ${paso}`
const nombreCliente = (c: Cliente) => [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')
const activos = (r: RegistroCliente[]) => r.filter(x => esActivo(x.etapas))

// ---------- Acciones y fechas próximas del mes ----------
export type EstadoAccion = 'completada' | 'proxima' | 'vencida'
export interface FilaAccion { cliente: Cliente, fecha: string, etapa: string, accion: string, estado: EstadoAccion }

export function accionesDelMes(registros: RegistroCliente[], hoy: string): FilaAccion[] {
  const mes = hoy.slice(0, 7)
  const filas: FilaAccion[] = []
  for (const r of activos(registros)) {
    for (const e of r.etapas) {
      const fecha = e.fecha_compromiso?.slice(0, 10)
      if (!fecha || !fecha.startsWith(mes) || e.estatus_id === ESTATUS_ID.cancelado || e.estatus_id === ESTATUS_ID.noAplica) continue
      const estado: EstadoAccion = e.estatus_id === ESTATUS_ID.finalizado || e.fecha_completada ? 'completada' : fecha < hoy ? 'vencida' : 'proxima'
      filas.push({ cliente: r.cliente, fecha, etapa: e.nombre, accion: e.accion_a_realizar ?? '', estado })
    }
  }
  return filas.sort((a, b) => a.fecha.localeCompare(b.fecha) || nombreCliente(a.cliente).localeCompare(nombreCliente(b.cliente)))
}

export function textoVencimiento(fecha: string, estado: EstadoAccion, hoy: string): string {
  if (estado === 'completada') return 'Completada'
  if (estado === 'vencida') return 'Vencida'
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  const dias = Math.round((new Date(`${fecha}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86_400_000)
  return `${dias} días`
}

// ---------- Documentos ----------
export interface FilaDocumento { cliente: Cliente, documento: DocumentoCliente, etapa: string }

// Documentos por confirmar de clientes activos; con `conObservaciones` también los marcados "Con observaciones".
export function documentosPendientes(registros: RegistroCliente[], conObservaciones: boolean): FilaDocumento[] {
  const filas: FilaDocumento[] = []
  for (const r of activos(registros)) {
    for (const d of r.documentos) {
      if (d.estatus === 'por_confirmar' || (conObservaciones && d.estatus === 'no')) filas.push({ cliente: r.cliente, documento: d, etapa: nombreEtapa(r.etapas, etapaActual(r.etapas)) })
    }
  }
  return filas.sort((a, b) => a.documento.fecha_carga.localeCompare(b.documento.fecha_carga))
}

export function documentosPorEstatus(registros: RegistroCliente[]) {
  const cuenta = { si: 0, por_confirmar: 0, no: 0 }
  for (const r of activos(registros)) for (const d of r.documentos) cuenta[d.estatus]++
  return cuenta
}

// ---------- Avance detenido ----------
export interface FilaDetenido { cliente: Cliente, etapa: string, estatusId: number, ultima: string, dias: number }

const diasEntre = (desde: string, hoy: string) => Math.round((new Date(`${hoy}T00:00:00`).getTime() - new Date(`${desde}T00:00:00`).getTime()) / 86_400_000)

function estadoDeAvance(r: RegistroCliente, hoy: string): FilaDetenido | null {
  if (r.etapas.length === 0) return null
  const ultima = r.etapas.map(e => fechaLocalISO(e.actualizado_el)).sort().at(-1)!
  const dias = diasEntre(ultima, hoy)
  const paso = etapaActual(r.etapas)
  const actual = r.etapas.find(e => e.numero_paso === paso)!
  const detenido = r.etapas.some(e => e.estatus_id === ESTATUS_ID.detenido)
  return detenido || dias >= DIAS_SIN_ACTIVIDAD ? { cliente: r.cliente, etapa: actual.nombre, estatusId: actual.estatus_id, ultima, dias } : null
}

// Clientes activos con una etapa detenida o 15 días o más sin actividad, los de más días primero.
export function detenidos(registros: RegistroCliente[], hoy: string): FilaDetenido[] {
  return activos(registros).map(r => estadoDeAvance(r, hoy)).filter((x): x is FilaDetenido => x !== null).sort((a, b) => b.dias - a.dias)
}

// ---------- Carga por asesor (Supervisor) ----------
export function cargaPorAsesor(registros: RegistroCliente[], hoy: string) {
  const filas = new Map<string, { asesorId: string, activos: number, detenidos: number, pensionados: number }>()
  for (const r of registros) {
    const f = filas.get(r.cliente.asesor_id) ?? { asesorId: r.cliente.asesor_id, activos: 0, detenidos: 0, pensionados: 0 }
    if (esActivo(r.etapas)) {
      f.activos++
      if (estadoDeAvance(r, hoy)) f.detenidos++
    }
    else {
      f.pensionados++
    }
    filas.set(r.cliente.asesor_id, f)
  }
  const lista = [...filas.values()]
  return {
    filas: lista,
    total: { activos: lista.reduce((a, f) => a + f.activos, 0), detenidos: lista.reduce((a, f) => a + f.detenidos, 0), pensionados: lista.reduce((a, f) => a + f.pensionados, 0) },
  }
}

// "2026-11-12" -> "Jueves, 12 De Noviembre De 2026"
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return `${DIAS[new Date(a!, m! - 1, d).getDay()]}, ${String(d).padStart(2, '0')} De ${MESES[m! - 1]} De ${a}`
}

export { nombreCliente }
