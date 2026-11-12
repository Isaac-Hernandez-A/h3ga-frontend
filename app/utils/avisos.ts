import { sumarDias } from '~/utils/agenda'

// Cuánto falta (o cuánto lleva vencido) el compromiso al que se refiere un aviso.
export function textoVencimientoAviso(fecha: string, hoy: string): string {
  if (fecha === hoy) return 'Vence hoy'
  if (fecha === sumarDias(hoy, 1)) return 'Mañana'
  if (fecha === sumarDias(hoy, -1)) return 'Venció ayer'
  const dias = Math.round((new Date(`${fecha}T00:00:00`).getTime() - new Date(`${hoy}T00:00:00`).getTime()) / 86_400_000)
  return dias > 0 ? `En ${dias} días` : `Vencido hace ${-dias} días`
}
