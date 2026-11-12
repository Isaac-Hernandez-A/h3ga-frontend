import type { EstatusTramite, EtapasCliente, TipoDocumento } from '~/types/expediente'
import type { Usuario } from '~/types/usuario'
import { puede } from '~/utils/permisos'
import type { RegistroCliente } from '~/utils/dashboard'

const SIMULTANEAS = 6

// Datos del Dashboard. La API no tiene un resumen de las 16 etapas, así que se arma con lo que el rol puede leer:
// sus clientes y, de cada uno, sus etapas y documentos (unas pocas peticiones a la vez para no saturar al servidor).
export function useDashboard() {
  const sesion = useSessionStore()
  const api = useApi()
  const clientesApi = useClientes()
  const documentosApi = useDocumentos()
  const usuariosApi = useUsuarios()

  const registros = ref<RegistroCliente[]>([])
  const estatus = ref<EstatusTramite[]>([])
  const tiposDocumento = ref<TipoDocumento[]>([])
  const usuarios = ref<Usuario[]>([])
  const cargando = ref(true)
  const fallo = ref(false)

  async function cargar() {
    cargando.value = true
    fallo.value = false
    let clientes
    try {
      clientes = await clientesApi.listar()
    }
    catch {
      // useApi ya avisó los 403 y los errores de red.
      fallo.value = true
      cargando.value = false
      return
    }

    const quieta = <T>(p: Promise<T>, asignar: (v: T) => void) => p.then(asignar).catch(() => undefined)
    const rol = sesion.usuario?.rol
    const lista: RegistroCliente[] = []
    const pendientes = [...clientes]
    async function trabajador() {
      for (let c = pendientes.shift(); c; c = pendientes.shift()) {
        const cliente = c
        const [etapas, documentos] = await Promise.all([
          api.get<EtapasCliente>(`/clientes/${cliente.id}/etapas`).then(e => e.etapas).catch(() => []),
          documentosApi.listar(cliente.id).catch(() => []),
        ])
        lista.push({ cliente, etapas, documentos })
      }
    }
    await Promise.all([
      ...Array.from({ length: SIMULTANEAS }, trabajador),
      quieta(api.get<EstatusTramite[]>('/catalogos/estatus'), (v) => { estatus.value = v }),
      quieta(documentosApi.tipos(), (v) => { tiposDocumento.value = v }),
      // Solo el Supervisor lee los usuarios: de ahí salen los nombres de los asesores.
      rol && puede(rol, 'usuarios.administrar') ? quieta(usuariosApi.listar(), (v) => { usuarios.value = v }) : Promise.resolve(),
    ])
    // Se conserva el orden en que el backend entregó los clientes.
    const orden = new Map(clientes.map((c, i) => [c.id, i]))
    registros.value = lista.sort((a, b) => (orden.get(a.cliente.id) ?? 0) - (orden.get(b.cliente.id) ?? 0))
    cargando.value = false
  }

  const nombreEstatus = (id: number) => estatus.value.find(e => e.id === id)?.nombre ?? 'Sin estatus'
  const nombreTipo = (id: number) => tiposDocumento.value.find(t => t.id === id)?.nombre ?? 'Documento'
  const nombreAsesor = (id: string) => {
    const u = usuarios.value.find(x => x.id === id)
    return u ? `${u.nombre} ${u.apellido_paterno}`.trim() : null
  }

  return { registros, estatus, usuarios, cargando, fallo, cargar, nombreEstatus, nombreTipo, nombreAsesor }
}
