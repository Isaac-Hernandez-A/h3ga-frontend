<script setup lang="ts">
import type { Cliente } from '~/types/cliente'
import type { EventoAgenda } from '~/types/expediente'
import { ApiError } from '~/utils/api-error'
import { ESTATUS_EVENTO, formatearCita, rangoPeriodo, resumenAgenda, type Periodo } from '~/utils/agenda'
import { hoyISO } from '~/utils/fechas'
import { puede } from '~/utils/permisos'
import { normalizarTexto } from '~/utils/texto'

definePageMeta({ titulo: 'Agenda de citas' })

const POR_PAGINA = 8
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

const sesion = useSessionStore()
const toast = useToast()
const api = useAgenda()
const apiClientes = useClientes()
const hoy = hoyISO()

const puedeEscribir = computed(() => (sesion.usuario ? puede(sesion.usuario.rol, 'agenda.escribir') : false))

const eventos = ref<EventoAgenda[]>([])
const clientes = ref<Cliente[]>([])
const cargando = ref(true)
const falloCarga = ref(false)

async function cargar() {
  cargando.value = true
  falloCarga.value = false
  try {
    eventos.value = await api.listar()
  }
  catch {
    // useApi ya avisó los 403 y los errores de red.
    falloCarga.value = true
    cargando.value = false
    return
  }
  // Los nombres y el selector salen de los clientes que devuelve la API para este rol.
  clientes.value = await apiClientes.listar().catch(() => [])
  cargando.value = false
}
onMounted(cargar)

const nombreCompleto = (c: Cliente) => [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')
const clientePorId = (id: string) => clientes.value.find(c => c.id === id)
const nombreCliente = (id: string) => { const c = clientePorId(id); return c ? nombreCompleto(c) : 'Cliente' }
const iniciales = (id: string) => { const c = clientePorId(id); return c ? `${c.nombre.charAt(0)}${c.apellido_paterno.charAt(0)}`.toUpperCase() : 'CL' }

const resumen = computed(() => resumenAgenda(eventos.value, hoy))

// ---------- Filtros ----------
type Pestana = 'proximas' | 'pendientes' | 'todas'
const pestana = ref<Pestana>('proximas')
const desde = ref('')
const hasta = ref('')
const busqueda = ref('')
const pagina = ref(1)

const PERIODOS: { clave: Periodo, texto: string }[] = [
  { clave: 'hoy', texto: `Hoy (${Number(hoy.slice(8))} ${MESES[Number(hoy.slice(5, 7)) - 1]!.replace(/^./, c => c.toUpperCase())})` },
  { clave: 'manana', texto: 'Mañana' },
  { clave: 'semana', texto: 'Esta semana' },
  { clave: 'mes', texto: 'Mes actual' },
]
const periodoActivo = computed(() => PERIODOS.find(p => { const r = rangoPeriodo(p.clave, hoy); return r.desde === desde.value && r.hasta === hasta.value })?.clave)
function elegirPeriodo(p: Periodo) {
  const r = rangoPeriodo(p, hoy)
  desde.value = r.desde
  hasta.value = r.hasta
}
const hayFiltros = computed(() => Boolean(desde.value || hasta.value || busqueda.value))
function limpiarFiltros() {
  desde.value = ''
  hasta.value = ''
  busqueda.value = ''
}

const dia = (e: EventoAgenda) => e.fecha.slice(0, 10)
const sinResolver = (e: EventoAgenda) => e.estatus === 'pendiente' || e.estatus === 'reagendado'
const contadorPendientes = computed(() => eventos.value.filter(e => e.estatus === 'pendiente').length)

const filtrados = computed(() => {
  const texto = normalizarTexto(busqueda.value)
  return eventos.value
    .filter((e) => {
      if (pestana.value === 'proximas' && !(sinResolver(e) && dia(e) >= hoy)) return false
      if (pestana.value === 'pendientes' && e.estatus !== 'pendiente') return false
      if (desde.value && dia(e) < desde.value) return false
      if (hasta.value && dia(e) > hasta.value) return false
      return !texto || normalizarTexto(nombreCliente(e.cliente_id)).includes(texto)
    })
    .toSorted((a, b) => `${dia(a)} ${a.hora}`.localeCompare(`${dia(b)} ${b.hora}`))
})
const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / POR_PAGINA)))
const visibles = computed(() => filtrados.value.slice((pagina.value - 1) * POR_PAGINA, pagina.value * POR_PAGINA))
watch([pestana, desde, hasta, busqueda], () => { pagina.value = 1 })

// ---------- Escribir (solo el Asesor) ----------
const formularioAbierto = ref(false)
const eventoAEditar = ref<EventoAgenda | null>(null)
const formularioClave = ref(0)

function abrirNueva() {
  eventoAEditar.value = null
  formularioClave.value++
  formularioAbierto.value = true
}
function abrirReagendar(e: EventoAgenda) {
  eventoAEditar.value = e
  formularioClave.value++
  formularioAbierto.value = true
}
function alGuardarse(e: EventoAgenda) {
  const existe = eventos.value.some(x => x.id === e.id)
  eventos.value = existe ? eventos.value.map(x => (x.id === e.id ? e : x)) : [...eventos.value, e]
  toast.add({ title: existe ? 'Cita actualizada' : 'Cita agendada', description: nombreCliente(e.cliente_id), color: 'success' })
  formularioAbierto.value = false
}

async function cambiarEstatus(e: EventoAgenda, estatus: 'cumplido' | 'cancelado') {
  try {
    const actualizado = await api.actualizar(e.id, { estatus })
    eventos.value = eventos.value.map(x => (x.id === actualizado.id ? actualizado : x))
    toast.add({ title: estatus === 'cumplido' ? 'Cita cumplida' : 'Cita cancelada', description: nombreCliente(e.cliente_id), color: 'success' })
  }
  catch (error) {
    if (!(error instanceof ApiError)) throw error
    // Sin conexión y sin permiso ya los avisó useApi.
    if (error.status !== 0 && error.status !== 403) toast.add({ title: 'No se pudo actualizar la cita', description: error.mensaje, color: 'error' })
  }
}

const cancelando = ref<EventoAgenda | null>(null)
const confirmacionAbierta = computed({ get: () => cancelando.value !== null, set: (v) => { if (!v) cancelando.value = null } })
async function confirmarCancelar() {
  const e = cancelando.value
  cancelando.value = null
  if (e) await cambiarEstatus(e, 'cancelado')
}
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-center justify-between gap-4">
      <p class="text-lg text-neutral-700">
        Gestión ejecutiva de citas y seguimiento de trámites para clientes.
      </p>
      <UButton
        v-if="puedeEscribir"
        data-accion="nueva-cita"
        icon="i-lucide-circle-plus"
        size="lg"
        class="bg-profundo-500 font-semibold text-white shadow-md hover:bg-profundo-600"
        @click="abrirNueva"
      >
        Registrar nueva cita
      </UButton>
    </div>

    <p
      v-if="cargando"
      class="py-10 text-center text-neutral-500"
      role="status"
    >
      Cargando la agenda…
    </p>

    <div
      v-else-if="falloCarga"
      class="py-10 text-center"
      role="alert"
    >
      <p class="text-red-700">
        No se pudo cargar la agenda.
      </p>
      <UButton
        class="mt-3"
        color="neutral"
        variant="outline"
        data-accion="reintentar"
        @click="cargar"
      >
        Reintentar
      </UButton>
    </div>

    <template v-else>
      <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <article
          data-resumen="hoy"
          class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-neutral-700">
              Citas hoy
            </h3>
            <UIcon
              name="i-lucide-calendar"
              class="size-6 text-marca-600"
            />
          </div>
          <p class="mt-3 flex items-baseline gap-2 text-neutral-700">
            <span
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >{{ resumen.hoy }}</span>
            {{ resumen.hoy === 1 ? 'Cita agendada' : 'Citas agendadas' }}
          </p>
          <p class="mt-2 flex items-center gap-2 text-sm text-neutral-600">
            <UIcon
              name="i-lucide-clock"
              class="size-4"
            />
            {{ resumen.hoyPendientes }} {{ resumen.hoyPendientes === 1 ? 'pendiente' : 'pendientes' }} hoy
          </p>
        </article>
        <article
          data-resumen="pendientes"
          class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-neutral-700">
              Pendientes próximas
            </h3>
            <UIcon
              name="i-lucide-calendar-clock"
              class="size-6 text-marca-600"
            />
          </div>
          <p class="mt-3 flex items-baseline gap-2 text-neutral-700">
            <span
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >{{ resumen.pendientesProximas }}</span>
            Sin resolución
          </p>
          <span class="mt-2 inline-block rounded-lg bg-amber-100 px-3 py-1 text-sm text-amber-800">Prioridad semanal</span>
        </article>
        <article
          data-resumen="reagendadas"
          class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-neutral-700">
              Reagendadas
            </h3>
            <UIcon
              name="i-lucide-calendar-sync"
              class="size-6 text-marca-600"
            />
          </div>
          <p class="mt-3 flex items-baseline gap-2 text-neutral-700">
            <span
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >{{ resumen.reagendadas }}</span>
            {{ resumen.reagendadas === 1 ? 'Asesoría reagendada' : 'Asesorías reagendadas' }}
          </p>
        </article>
        <article
          data-resumen="cumplidas"
          class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm"
        >
          <div class="flex items-center justify-between">
            <h3 class="text-neutral-700">
              Cumplidas esta semana
            </h3>
            <UIcon
              name="i-lucide-circle-check-big"
              class="size-6 text-marca-600"
            />
          </div>
          <p class="mt-3 flex items-baseline gap-2 text-neutral-700">
            <span
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >{{ resumen.cumplidasSemana }}</span>
            {{ resumen.cumplidasSemana === 1 ? 'Asesoría efectiva' : 'Asesorías efectivas' }}
          </p>
        </article>
      </div>

      <div class="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
        <h3 class="font-display text-xl font-semibold text-profundo-700">
          Bandeja activa
        </h3>
        <p class="text-sm text-neutral-600">
          Gestiona y da seguimiento a las actividades pendientes con tus clientes.
        </p>

        <div class="mt-4 flex flex-wrap items-center gap-3">
          <span class="text-sm uppercase tracking-wide text-neutral-500">Período:</span>
          <button
            v-for="p in PERIODOS"
            :key="p.clave"
            type="button"
            :data-periodo="p.clave"
            :aria-pressed="periodoActivo === p.clave"
            class="rounded-full px-4 py-1.5 text-sm font-medium"
            :class="periodoActivo === p.clave ? 'bg-profundo-500 text-white' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'"
            @click="elegirPeriodo(p.clave)"
          >
            {{ p.texto }}
          </button>
          <div class="flex items-center gap-2 rounded-lg border border-neutral-300 px-3 py-1 text-sm text-neutral-700">
            <UIcon
              name="i-lucide-calendar"
              class="size-4"
            />
            <label class="flex items-center gap-1">
              Desde:
              <input
                v-model="desde"
                type="date"
                name="desde"
                class="bg-transparent"
              >
            </label>
            <label class="flex items-center gap-1 border-l border-neutral-300 pl-2">
              Hasta:
              <input
                v-model="hasta"
                type="date"
                name="hasta"
                class="bg-transparent"
              >
            </label>
          </div>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-filter-x"
            data-accion="limpiar-filtros"
            class="whitespace-nowrap"
            :disabled="!hayFiltros"
            @click="limpiarFiltros"
          >
            Limpiar filtros
          </UButton>
        </div>

        <div class="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 pt-4">
          <div
            role="tablist"
            class="flex gap-1 rounded-xl bg-neutral-100 p-1"
          >
            <button
              type="button"
              role="tab"
              data-pestana="proximas"
              :aria-selected="pestana === 'proximas'"
              class="rounded-lg px-4 py-1.5 text-sm font-medium"
              :class="pestana === 'proximas' ? 'bg-white text-profundo-700 shadow-sm' : 'text-neutral-600'"
              @click="pestana = 'proximas'"
            >
              Próximas
            </button>
            <button
              type="button"
              role="tab"
              data-pestana="pendientes"
              :aria-selected="pestana === 'pendientes'"
              class="flex items-center gap-2 rounded-lg px-4 py-1.5 text-sm font-medium"
              :class="pestana === 'pendientes' ? 'bg-white text-profundo-700 shadow-sm' : 'text-neutral-600'"
              @click="pestana = 'pendientes'"
            >
              Pendientes
              <span
                data-contador-pendientes
                class="rounded-full bg-amber-300 px-2 text-xs font-semibold text-amber-900"
              >{{ contadorPendientes }}</span>
            </button>
            <button
              type="button"
              role="tab"
              data-pestana="todas"
              :aria-selected="pestana === 'todas'"
              class="rounded-lg px-4 py-1.5 text-sm font-medium"
              :class="pestana === 'todas' ? 'bg-white text-profundo-700 shadow-sm' : 'text-neutral-600'"
              @click="pestana = 'todas'"
            >
              Todas
            </button>
          </div>
          <UInput
            v-model="busqueda"
            type="search"
            name="buscar"
            icon="i-lucide-search"
            placeholder="Buscar por nombre del cliente..."
            aria-label="Buscar por nombre del cliente"
            class="min-w-64 flex-1 md:max-w-md"
          />
        </div>

        <p
          v-if="filtrados.length === 0"
          class="mt-4 rounded-xl border border-dashed border-neutral-300 py-10 text-center text-neutral-500"
        >
          No hay citas que mostrar.
        </p>

        <div
          v-else
          class="mt-4 overflow-x-auto rounded-xl border border-neutral-200"
        >
          <table class="w-full min-w-[48rem] text-left">
            <thead class="bg-neutral-50 text-xs uppercase tracking-wide text-neutral-600">
              <tr>
                <th class="px-4 py-3 font-medium">
                  Cliente
                </th>
                <th class="px-4 py-3 font-medium">
                  Fecha
                </th>
                <th class="px-4 py-3 font-medium">
                  Motivo
                </th>
                <th class="px-4 py-3 text-center font-medium">
                  Estatus
                </th>
                <th
                  v-if="puedeEscribir"
                  class="px-4 py-3 text-center font-medium"
                >
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-200">
              <tr
                v-for="e in visibles"
                :key="e.id"
                data-evento
              >
                <td class="px-4 py-3">
                  <span class="flex items-center gap-3">
                    <span class="flex size-9 shrink-0 items-center justify-center rounded-full bg-marca-100 text-sm font-semibold text-marca-800">{{ iniciales(e.cliente_id) }}</span>
                    <span
                      data-cliente
                      class="font-medium text-neutral-900"
                    >{{ nombreCliente(e.cliente_id) }}</span>
                  </span>
                </td>
                <td
                  data-fecha
                  class="whitespace-nowrap px-4 py-3 text-sm text-neutral-700"
                >
                  {{ formatearCita(e.fecha, e.hora, hoy) }}
                </td>
                <td
                  data-motivo
                  class="px-4 py-3 text-sm text-neutral-700"
                >
                  {{ e.motivo }}
                </td>
                <td class="px-4 py-3 text-center">
                  <span
                    data-estatus
                    class="inline-block rounded px-2.5 py-0.5 text-xs font-semibold uppercase"
                    :class="ESTATUS_EVENTO[e.estatus].clase"
                  >{{ ESTATUS_EVENTO[e.estatus].texto }}</span>
                </td>
                <td
                  v-if="puedeEscribir"
                  class="px-4 py-3"
                >
                  <div class="flex items-center justify-center gap-1">
                    <UButton
                      v-if="e.estatus === 'pendiente' || e.estatus === 'reagendado'"
                      color="success"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-circle-check"
                      data-accion="cumplir"
                      :aria-label="`Marcar como cumplida la cita de ${nombreCliente(e.cliente_id)}`"
                      @click="cambiarEstatus(e, 'cumplido')"
                    />
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-calendar-sync"
                      data-accion="reagendar"
                      :aria-label="`Reagendar la cita de ${nombreCliente(e.cliente_id)}`"
                      @click="abrirReagendar(e)"
                    />
                    <UButton
                      v-if="e.estatus === 'pendiente' || e.estatus === 'reagendado'"
                      color="error"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-circle-x"
                      data-accion="cancelar"
                      :aria-label="`Cancelar la cita de ${nombreCliente(e.cliente_id)}`"
                      @click="cancelando = e"
                    />
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <nav
          v-if="totalPaginas > 1"
          class="mt-4 flex items-center justify-center gap-1"
          aria-label="Paginación"
        >
          <button
            type="button"
            data-accion="pagina-anterior"
            class="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40"
            aria-label="Página anterior"
            :disabled="pagina === 1"
            @click="pagina--"
          >
            ‹
          </button>
          <button
            v-for="n in totalPaginas"
            :key="n"
            type="button"
            class="rounded border px-3 py-1"
            :class="n === pagina ? 'border-marca-500 bg-marca-500 text-white' : 'border-neutral-300'"
            :aria-current="n === pagina ? 'page' : undefined"
            @click="pagina = n"
          >
            {{ n }}
          </button>
          <button
            type="button"
            data-accion="pagina-siguiente"
            class="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40"
            aria-label="Página siguiente"
            :disabled="pagina === totalPaginas"
            @click="pagina++"
          >
            ›
          </button>
        </nav>
      </div>
    </template>

    <UModal
      v-model:open="formularioAbierto"
      :title="eventoAEditar ? 'Reagendar cita' : 'Nueva cita'"
      :description="eventoAEditar ? 'Modifica la fecha, hora o motivo del compromiso programado con el cliente.' : 'Vincula el compromiso a un cliente de tu cartera.'"
    >
      <template #body>
        <EventoFormulario
          :key="formularioClave"
          :clientes="clientes"
          :evento="eventoAEditar"
          @guardado="alGuardarse"
          @cancelar="formularioAbierto = false"
        />
      </template>
    </UModal>

    <UModal
      v-model:open="confirmacionAbierta"
      title="Cancelar cita"
      description="La cita quedará con estatus Cancelado."
    >
      <template #body>
        <p v-if="cancelando">
          ¿Cancelar la cita de <strong>{{ nombreCliente(cancelando.cliente_id) }}</strong> ({{ formatearCita(cancelando.fecha, cancelando.hora, hoy) }})?
        </p>
      </template>
      <template #footer>
        <div class="flex w-full justify-end gap-3">
          <UButton
            color="neutral"
            variant="outline"
            data-accion="volver"
            @click="cancelando = null"
          >
            Volver
          </UButton>
          <UButton
            color="error"
            data-accion="confirmar-cancelar"
            @click="confirmarCancelar"
          >
            Cancelar cita
          </UButton>
        </div>
      </template>
    </UModal>
  </section>
</template>
