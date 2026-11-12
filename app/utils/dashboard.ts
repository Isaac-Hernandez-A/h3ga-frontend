import { sumarDias } from '~/utils/agenda'

export const TOTAL_ETAPAS = 16

// Las cuatro porciones de la dona: etapas 0-4, 5-7, 8-13 y 14-15.
export const GRUPOS_ETAPAS = [
  { clave: 'diagnostico', nombre: 'Diagnóstico y correcciones', desde: 0, hasta: 4, color: '#043f43' },
  { clave: 'estrategias', nombre: 'Estrategias de modalidad', desde: 5, hasta: 7, color: '#4dc9d6' },
  { clave: 'final', nombre: 'Proceso final', desde: 8, hasta: 13, color: '#ffcb05' },
  { clave: 'cobranza', nombre: 'Cobranza y finalización', desde: 14, hasta: 15, color: '#55b0d4' },
]

export const porGrupo = (porEtapa: number[]) =>
  GRUPOS_ETAPAS.map(g => ({ ...g, valor: porEtapa.slice(g.desde, g.hasta + 1).reduce((a, b) => a + b, 0) }))

export type EstadoAccion = 'completada' | 'proxima' | 'vencida'

export function textoVencimiento(fecha: string, estado: EstadoAccion, hoy: string): string {
  if (estado === 'completada') return 'Completada'
  if (estado === 'vencida') return 'Vencida'
  if (fecha === hoy) return 'Hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  const dias = Math.round((new Date(`${fecha}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86_400_000)
  return `${dias} días`
}

// "2026-11-12" -> "Jueves, 12 De Noviembre De 2026"
const DIAS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
export function fechaLarga(fecha: string): string {
  const [a, m, d] = fecha.slice(0, 10).split('-').map(Number)
  return `${DIAS[new Date(a!, m! - 1, d).getDay()]}, ${String(d).padStart(2, '0')} De ${MESES[m! - 1]} De ${a}`
}

// Iniciales para el avatar: primera letra del primer y del último nombre ("María Elena Rodríguez Salas" -> "MS").
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/)
  return `${partes[0]?.charAt(0) ?? ''}${partes.length > 1 ? partes.at(-1)!.charAt(0) : ''}`.toUpperCase()
}
