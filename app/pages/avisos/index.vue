<script setup lang="ts">
import type { Aviso } from '~/types/aviso'
import type { Cliente } from '~/types/cliente'
import type { EtapaCliente, EtapasCliente, EventoAgenda } from '~/types/expediente'
import { ApiError } from '~/utils/api-error'
import { hora12 } from '~/utils/agenda'
import { textoVencimientoAviso } from '~/utils/avisos'
import { fechaLocalISO, formatearFechaHora, formatearFechaIngreso, hoyISO } from '~/utils/fechas'
import { puede } from '~/utils/permisos'
import { normalizarTexto } from '~/utils/texto'

definePageMeta({ titulo: 'Centro de avisos' })

const SIMULTANEAS = 6

const sesion = useSessionStore()
const toast = useToast()
const api = useAvisos()
const store = useAvisosStore()
const api2 = useApi()
const apiClientes = useClientes()
const apiUsuarios = useUsuarios()
const hoy = hoyISO()

interface AvisoDetallado {
  aviso: Aviso
  tipo: 'tramite' | 'cita'
  cliente: Cliente | null
  titulo: string
  descripcion: string
  fecha: string
  hora: string | null
  etapa: EtapaCliente | null
}

const avisos = ref<Aviso[]>([])
const clientes = ref<Cliente[]>([])
const eventos = ref<EventoAgenda[]>([])
const etapas = ref<{ cliente: Cliente, etapa: EtapaCliente }[]>([])
const usuarios = ref<{ id: string, nombre: string }[]>([])
const cargando = ref(true)
const falloCarga = ref(false)

async function cargar() {
  cargando.value = true
  falloCarga.value = false
  try {
    avisos.value = await api.listar()
  }
  catch {
    // useApi ya avisó los 403 y los errores de red.
    falloCarga.value = true
    cargando.value = false
    return
  }
  // Un aviso solo trae el id de su etapa o de su cita: el detalle sale de las citas y las etapas de los clientes del usuario.
  function quieta<T>(p: Promise<T>, asignar: (v: T) => void | Promise<void>) {
    return p.then(asignar).catch(() => undefined)
  }
  await Promise.all([
    quieta(api2.get<EventoAgenda[]>('/agenda'), (v) => { eventos.value = v }),
    quieta(apiClientes.listar(), async (v) => {
      clientes.value = v
      if (!avisos.value.some(a => a.tipo === 'tramite')) return
      const pendientes = [...v]
      const lista: { cliente: Cliente, etapa: EtapaCliente }[] = []
      await Promise.all(Array.from({ length: SIMULTANEAS }, async () => {
        for (let c = pendientes.shift(); c; c = pendientes.shift()) {
          const cliente = c
          const r = await api2.get<EtapasCliente>(`/clientes/${cliente.id}/etapas`).catch(() => null)
          for (const etapa of r?.etapas ?? []) lista.push({ cliente, etapa })
        }
      }))
      etapas.value = lista
    }),
    // Solo el Supervisor puede leer los usuarios: de ahí sale el nombre del asesor.
    sesion.usuario && puede(sesion.usuario.rol, 'usuarios.administrar') ? quieta(apiUsuarios.listar(), (v) => { usuarios.value = v.map(u => ({ id: u.id, nombre: `${u.nombre} ${u.apellido_paterno}`.trim() })) }) : Promise.resolve(),
  ])
  cargando.value = false
}
onMounted(cargar)

const nombreCompleto = (c: Cliente) => [c.nombre, c.apellido_paterno, c.apellido_materno].filter(Boolean).join(' ')

const detallados = computed<AvisoDetallado[]>(() => avisos.value.map((aviso) => {
  if (aviso.tipo === 'cita') {
    const evento = eventos.value.find(e => e.id === aviso.evento_id)
    return {
      aviso, tipo: 'cita', cliente: clientes.value.find(c => c.id === evento?.cliente_id) ?? null, titulo: 'Cita programada', descripcion: evento?.motivo ?? '',
      fecha: evento?.fecha.slice(0, 10) ?? fechaLocalISO(aviso.fecha_alerta), hora: evento?.hora ?? null, etapa: null,
    }
  }
  const origen = etapas.value.find(x => x.etapa.id === aviso.etapa_tramite_id)
  return {
    aviso, tipo: 'tramite', cliente: origen?.cliente ?? null, titulo: origen?.etapa.nombre ?? 'Trámite', descripcion: origen?.etapa.accion_a_realizar ?? '',
    fecha: origen?.etapa.fecha_compromiso?.slice(0, 10) ?? fechaLocalISO(aviso.fecha_alerta), hora: null, etapa: origen?.etapa ?? null,
  }
}).sort((a, b) => a.fecha.localeCompare(b.fecha) || a.aviso.id.localeCompare(b.aviso.id)))

const vencido = (d: AvisoDetallado) => !d.aviso.atendido && d.fecha < hoy
const resumen = computed(() => ({
  sinAtender: detallados.value.filter(d => !d.aviso.atendido).length,
  porVencer: detallados.value.filter(d => !d.aviso.atendido && d.tipo === 'tramite' && !vencido(d)).length,
  vencidos: detallados.value.filter(vencido).length,
  atendidos: detallados.value.filter(d => d.aviso.atendido).length,
}))

// ---------- Filtros ----------
type Pestana = 'sin-atender' | 'atendidos' | 'todos'
const pestana = ref<Pestana>('sin-atender')
const tipo = ref('')
const busqueda = ref('')

const visibles = computed(() => {
  const texto = normalizarTexto(busqueda.value)
  return detallados.value.filter((d) => {
    if (pestana.value === 'sin-atender' && d.aviso.atendido) return false
    if (pestana.value === 'atendidos' && !d.aviso.atendido) return false
    if (tipo.value && d.tipo !== tipo.value) return false
    return !texto || normalizarTexto(d.cliente ? nombreCompleto(d.cliente) : '').includes(texto)
  })
})

const seleccionId = ref<string | null>(null)
const seleccionado = computed(() => visibles.value.find(d => d.aviso.id === seleccionId.value) ?? visibles.value[0] ?? null)

const nombreAsesor = (c: Cliente | null) => {
  if (!c) return null
  if (sesion.usuario?.rol === 'asesor' && sesion.usuario.id === c.asesor_id) return sesion.usuario.nombre
  return usuarios.value.find(u => u.id === c.asesor_id)?.nombre ?? null
}

// ---------- Atender ----------
const atendiendo = ref(false)
const errorAtender = ref<string | null>(null)

async function atender(d: AvisoDetallado) {
  errorAtender.value = null
  atendiendo.value = true
  try {
    const actualizado = await api.atender(d.aviso.id)
    avisos.value = avisos.value.map(a => (a.id === actualizado.id ? actualizado : a))
    toast.add({ title: 'Aviso atendido', description: d.titulo, color: 'success' })
    // El contador del menú baja al atender.
    void store.cargar()
  }
  catch (e) {
    if (!(e instanceof ApiError)) throw e
    // Sin conexión y sin permiso ya los avisó useApi.
    if (e.status !== 0 && e.status !== 403) errorAtender.value = e.status === 404 ? e.mensaje : 'No se pudo marcar el aviso como atendido. Inténtalo de nuevo.'
  }
  finally {
    atendiendo.value = false
  }
}

const claseVencimiento = (d: AvisoDetallado) => d.aviso.atendido ? 'bg-green-100 text-green-800' : vencido(d) ? 'bg-red-100 text-red-700' : d.fecha === hoy ? 'bg-amber-100 text-amber-800' : 'bg-amber-50 text-amber-700'
const textoChip = (d: AvisoDetallado) => d.aviso.atendido ? 'Atendido' : textoVencimientoAviso(d.fecha, hoy)
const fechaAlerta = (d: AvisoDetallado) => formatearFechaIngreso(fechaLocalISO(d.aviso.fecha_alerta))
const fechaCompromiso = (d: AvisoDetallado) => `${formatearFechaIngreso(d.fecha)}${d.hora ? ` · ${hora12(d.hora)}` : ''}`
const claseTarjeta = 'flex items-center gap-4 rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm'
</script>

<template>
  <section class="space-y-5">
    <p class="text-neutral-700">
      Bandeja de alertas sobre los compromisos y citas de tus expedientes.
    </p>

    <p
      v-if="cargando"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando los avisos…
    </p>

    <div
      v-else-if="falloCarga"
      class="py-10 text-center"
      role="alert"
    >
      <p class="text-red-700">
        No se pudieron cargar los avisos.
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
          data-tarjeta="sin-atender"
          :class="claseTarjeta"
        >
          <span class="flex size-12 items-center justify-center rounded-xl bg-amber-100"><UIcon
            name="i-lucide-inbox"
            class="size-6 text-amber-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >
              {{ resumen.sinAtender }}
            </p>
            <p class="text-sm text-neutral-600">
              Avisos sin atender
            </p>
          </div>
        </article>
        <article
          data-tarjeta="por-vencer"
          :class="claseTarjeta"
        >
          <span class="flex size-12 items-center justify-center rounded-xl bg-red-50"><UIcon
            name="i-lucide-flag"
            class="size-6 text-red-600"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >
              {{ resumen.porVencer }}
            </p>
            <p class="text-sm text-neutral-600">
              Trámites por vencer
            </p>
          </div>
        </article>
        <article
          data-tarjeta="vencidos"
          :class="claseTarjeta"
        >
          <span class="flex size-12 items-center justify-center rounded-xl bg-red-50"><UIcon
            name="i-lucide-triangle-alert"
            class="size-6 text-red-600"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >
              {{ resumen.vencidos }}
            </p>
            <p class="text-sm text-neutral-600">
              Compromisos vencidos
            </p>
          </div>
        </article>
        <article
          data-tarjeta="atendidos"
          :class="claseTarjeta"
        >
          <span class="flex size-12 items-center justify-center rounded-xl bg-green-50"><UIcon
            name="i-lucide-check"
            class="size-6 text-green-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-3xl font-semibold text-neutral-900"
            >
              {{ resumen.atendidos }}
            </p>
            <p class="text-sm text-neutral-600">
              Atendidos
            </p>
          </div>
        </article>
      </div>

      <p
        v-if="avisos.length === 0"
        class="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center text-neutral-500"
      >
        No hay avisos por ahora. Aparecen 2 días antes de cada compromiso o cita.
      </p>

      <div
        v-else
        class="grid overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm lg:grid-cols-[minmax(320px,420px)_1fr]"
      >
        <!-- Bandeja -->
        <div class="border-b border-neutral-200 lg:border-b-0 lg:border-r">
          <div class="space-y-3 p-4">
            <UInput
              v-model="busqueda"
              type="search"
              name="buscar"
              icon="i-lucide-search"
              placeholder="Buscar por nombre del cliente..."
              aria-label="Buscar por nombre del cliente"
            />
            <div class="flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                class="flex gap-1 rounded-xl bg-neutral-100 p-1"
              >
                <button
                  v-for="p in [{ c: 'sin-atender', t: 'Sin atender' }, { c: 'atendidos', t: 'Atendidos' }, { c: 'todos', t: 'Todos' }] as { c: Pestana, t: string }[]"
                  :key="p.c"
                  type="button"
                  role="tab"
                  :data-pestana="p.c"
                  :aria-selected="pestana === p.c"
                  class="rounded-lg px-3 py-1.5 text-sm font-medium"
                  :class="pestana === p.c ? 'bg-white text-profundo-700 shadow-sm' : 'text-neutral-600'"
                  @click="pestana = p.c"
                >
                  {{ p.t }}
                </button>
              </div>
              <select
                v-model="tipo"
                name="tipo"
                aria-label="Filtrar por tipo"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">
                  Todos los tipos
                </option>
                <option value="tramite">
                  Trámite
                </option>
                <option value="cita">
                  Cita
                </option>
              </select>
            </div>
          </div>
          <p
            v-if="visibles.length === 0"
            class="px-4 py-10 text-center text-sm text-neutral-500"
          >
            No hay avisos que coincidan con los filtros.
          </p>
          <ul class="max-h-[34rem] divide-y divide-neutral-100 overflow-y-auto">
            <li
              v-for="d in visibles"
              :key="d.aviso.id"
              data-aviso
              :aria-current="seleccionado?.aviso.id === d.aviso.id ? 'true' : undefined"
              class="cursor-pointer px-4 py-3 hover:bg-marca-50"
              :class="seleccionado?.aviso.id === d.aviso.id ? 'border-l-4 border-marca-500 bg-marca-50' : 'border-l-4 border-transparent'"
              @click="seleccionId = d.aviso.id"
            >
              <div class="flex items-center justify-between text-xs">
                <span
                  data-tipo
                  class="rounded px-2 py-0.5 font-semibold"
                  :class="d.tipo === 'cita' ? 'bg-marca-100 text-marca-800' : 'bg-sky-100 text-sky-800'"
                >{{ d.tipo === 'cita' ? 'Cita' : 'Trámite' }}</span>
                <span
                  data-fecha-alerta
                  class="text-neutral-500"
                >{{ fechaAlerta(d) }}</span>
              </div>
              <p
                data-titulo
                class="mt-1 font-semibold text-neutral-900"
              >
                {{ d.titulo }}
              </p>
              <p
                data-cliente
                class="text-sm text-neutral-600"
              >
                {{ d.cliente ? nombreCompleto(d.cliente) : 'Cliente' }}
              </p>
              <span
                data-vencimiento
                class="mt-1 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold"
                :class="claseVencimiento(d)"
              >{{ textoChip(d) }}</span>
            </li>
          </ul>
        </div>

        <!-- Detalle -->
        <div class="p-6">
          <p
            v-if="!seleccionado"
            class="py-20 text-center text-neutral-500"
          >
            Elige un aviso para ver su detalle.
          </p>
          <div
            v-else
            data-detalle
            class="space-y-5"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center gap-2 text-xs font-semibold">
                <span
                  class="rounded px-2 py-0.5"
                  :class="seleccionado.tipo === 'cita' ? 'bg-marca-100 text-marca-800' : 'bg-sky-100 text-sky-800'"
                >{{ seleccionado.tipo === 'cita' ? 'Cita' : 'Trámite' }}</span>
                <span
                  class="rounded-full px-2.5 py-0.5"
                  :class="claseVencimiento(seleccionado)"
                >{{ textoChip(seleccionado) }}</span>
              </div>
              <span class="text-sm text-marca-700">Alerta del {{ fechaAlerta(seleccionado) }}</span>
            </div>
            <span
              v-if="nombreAsesor(seleccionado.cliente)"
              data-asesor
              class="inline-flex items-center gap-2 rounded-lg border border-profundo-500 px-3 py-1 text-sm"
            >
              <UIcon
                name="i-lucide-user-round"
                class="size-4"
              />Asesor(a) {{ nombreAsesor(seleccionado.cliente) }}
            </span>
            <div>
              <h3
                data-detalle-titulo
                class="font-display text-2xl font-semibold text-profundo-900"
              >
                {{ seleccionado.titulo }}
              </h3>
              <p
                data-detalle-descripcion
                class="mt-1 text-neutral-700"
              >
                {{ seleccionado.descripcion }}
              </p>
            </div>
            <dl class="grid overflow-hidden rounded-xl border border-neutral-200 sm:grid-cols-2">
              <div
                data-dato="cliente"
                class="border-b border-neutral-200 p-3 sm:border-r"
              >
                <dt class="text-xs text-neutral-500">
                  Cliente
                </dt>
                <dd class="font-medium text-neutral-900">
                  {{ seleccionado.cliente ? nombreCompleto(seleccionado.cliente) : 'Cliente' }}
                </dd>
              </div>
              <div
                data-dato="fecha"
                class="border-b border-neutral-200 p-3"
              >
                <dt class="text-xs text-neutral-500">
                  Fecha compromiso
                </dt>
                <dd class="font-medium text-neutral-900">
                  {{ fechaCompromiso(seleccionado) }}
                </dd>
              </div>
              <div
                data-dato="origen"
                class="p-3 sm:border-r sm:border-neutral-200"
              >
                <dt class="text-xs text-neutral-500">
                  Origen
                </dt>
                <dd class="font-medium text-neutral-900">
                  {{ seleccionado.tipo === 'cita' ? 'Agenda de citas' : seleccionado.titulo }}
                </dd>
              </div>
              <div
                data-dato="estado"
                class="p-3"
              >
                <dt class="text-xs text-neutral-500">
                  Estado
                </dt>
                <dd class="font-medium text-neutral-900">
                  {{ seleccionado.aviso.atendido && seleccionado.aviso.fecha_atencion ? `Atendido el ${formatearFechaHora(seleccionado.aviso.fecha_atencion)}` : seleccionado.aviso.atendido ? 'Atendido' : 'No atendido' }}
                </dd>
              </div>
            </dl>
            <div
              v-if="seleccionado.etapa"
              data-avance
            >
              <div class="flex justify-between text-sm text-neutral-600">
                <span>Avance de la etapa</span>
                <span class="font-display text-lg text-marca-700">{{ seleccionado.etapa.avance_porcentaje }}%</span>
              </div>
              <div
                role="progressbar"
                aria-label="Avance de la etapa"
                aria-valuemin="0"
                aria-valuemax="100"
                :aria-valuenow="seleccionado.etapa.avance_porcentaje"
                class="mt-1 h-2.5 overflow-hidden rounded-full bg-neutral-200"
              >
                <div
                  class="h-full rounded-full bg-gradient-to-r from-marca-400 to-profundo-500"
                  :style="{ width: `${seleccionado.etapa.avance_porcentaje}%` }"
                />
              </div>
            </div>
            <p
              v-if="errorAtender"
              role="alert"
              class="text-sm font-medium text-red-700"
            >
              {{ errorAtender }}
            </p>
            <div class="flex flex-wrap gap-3">
              <UButton
                v-if="!seleccionado.aviso.atendido"
                data-accion="atender"
                icon="i-lucide-check"
                :loading="atendiendo"
                class="bg-acento-500 font-semibold text-profundo-900 hover:bg-acento-400"
                @click="atender(seleccionado)"
              >
                Marcar como atendido
              </UButton>
              <UButton
                v-if="seleccionado.cliente"
                :to="`/clientes/${seleccionado.cliente.id}`"
                data-accion="ver-expediente"
                color="neutral"
                variant="outline"
                icon="i-lucide-eye"
              >
                Ver expediente
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>
