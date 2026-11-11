import type { CambiarEstatus, CambioEstatus, EtapaCliente, EtapasCliente } from '~/types/expediente'

// Etapas de un cliente: lectura, cambio de estatus o avance (solo el Asesor) e historial de cambios.
export function useEtapas(clienteId: string) {
  const api = useApi()

  return {
    listar: () => api.get<EtapasCliente>(`/clientes/${clienteId}/etapas`),
    cambiarEstatus: (etapaId: string, datos: CambiarEstatus) => api.patch<EtapaCliente>(`/clientes/${clienteId}/etapas/${etapaId}`, datos),
    historial: (etapaId: string) => api.get<CambioEstatus[]>(`/clientes/${clienteId}/etapas/${etapaId}/historial`),
  }
}
