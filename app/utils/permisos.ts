import type { Rol } from '~/types/sesion'

// El menú y el middleware ocultan lo que no corresponde, pero el backend es quien impone los permisos.
const RUTAS_POR_ROL: Record<Rol, string[]> = {
  asesor: ['/', '/clientes', '/agenda', '/avisos', '/reportes'],
  auxiliar: ['/', '/clientes', '/agenda', '/avisos'],
  supervisor: ['/', '/clientes', '/agenda', '/avisos', '/reportes', '/usuarios'],
}

const ACCIONES_POR_ROL = {
  'clientes.crear': ['asesor'],
  'clientes.reasignar': ['supervisor'],
  'etapas.cambiarEstatus': ['asesor'],
  'auxiliares.autorizar': ['asesor'],
  'documentos.revisar': ['auxiliar', 'supervisor'],
  'agenda.escribir': ['asesor'],
  'reportes.ver': ['asesor', 'supervisor'],
  'usuarios.administrar': ['supervisor'],
} as const satisfies Record<string, readonly Rol[]>

export type Accion = keyof typeof ACCIONES_POR_ROL

export function rutasPermitidas(rol: Rol): string[] {
  return [...RUTAS_POR_ROL[rol]]
}

// '/clientes' permite también '/clientes/123'; '/' solo permite el inicio.
export function rutaPermitida(rol: Rol, ruta: string): boolean {
  return RUTAS_POR_ROL[rol].some(base => ruta === base || (base !== '/' && ruta.startsWith(`${base}/`)))
}

export function puede(rol: Rol, accion: Accion): boolean {
  return (ACCIONES_POR_ROL[accion] as readonly Rol[]).includes(rol)
}
