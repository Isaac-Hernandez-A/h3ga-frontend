import type { DocumentoCliente, TipoDocumento } from '~/types/expediente'

// Documentos del expediente: listar, descargar con el token y subir (multipart).
export function useDocumentos() {
  const api = useApi()

  return {
    listar: (clienteId: string) => api.get<DocumentoCliente[]>(`/clientes/${clienteId}/documentos`),
    tipos: () => api.get<TipoDocumento[]>('/catalogos/tipos-documento'),
    // El cuerpo es un FormData con tipo_documento_id, archivo y, opcionales, numero_referencia y observaciones.
    subir: (clienteId: string, datos: FormData) => api.post<DocumentoCliente>(`/clientes/${clienteId}/documentos`, datos),
    descargar: (clienteId: string, documento: DocumentoCliente) =>
      api.descargar(`/clientes/${clienteId}/documentos/${documento.id}/descargar`, documento.nombre_archivo_original),
  }
}
