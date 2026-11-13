<script setup lang="ts">
import type { ClienteCorrecciones, FaseCorreccion, TramitesCorreccion } from '~/types/correcciones'
import { FASES, formatearActualizado } from '~/utils/correcciones'
import { normalizarTexto } from '~/utils/texto'

definePageMeta({ titulo: 'Correcciones' })

const TAM_PAGINA = 10
const DIAS_RECIENTES = 90

const api = useTramitesCorreccion()
const datos = ref<TramitesCorreccion | null>(null)
const cargando = ref(true)
const falloCarga = ref(false)

async function cargar() {
  cargando.value = true
  falloCarga.value = false
  try {
    datos.value = await api.listar()
  }
  catch {
    // useApi ya avisó los 403 y los errores de red.
    falloCarga.value = true
  }
  cargando.value = false
}
onMounted(cargar)

const clientes = computed(() => datos.value?.clientes ?? [])
const iniciales = (nombre: string) => {
  const partes = nombre.trim().split(/\s+/)
  return `${partes[0]?.charAt(0) ?? ''}${partes.length > 1 ? partes.at(-1)!.charAt(0) : ''}`.toUpperCase()
}
const faseDe = (c: ClienteCorrecciones, paso: number) => c.fases.find(f => f.numero_paso === paso)

// F2 muestra cuántas correcciones tiene; F3 y F4 si ya se subió su documento.
const estadoFase = (f: FaseCorreccion) => (f.documentos_cargados === null ? 'correcciones' : f.documentos_cargados === 0 ? 'falta' : 'cargado')
function textoFase(f: FaseCorreccion): string {
  if (f.documentos_cargados === null) return `${f.correcciones ?? 0} ${f.correcciones === 1 ? 'corrección' : 'correcciones'}`
  if (f.documentos_cargados === 0) return 'Falta documento'
  return `${f.documentos_cargados} ${f.documentos_cargados === 1 ? 'documento cargado' : 'documentos cargados'}`
}

const busqueda = ref('')
const filtroDocumentos = ref('')
const orden = ref<'reciente' | 'antiguo'>('reciente')
const actualizadoDesde = ref('')
const pagina = ref(1)

// Con documentos: solo F3 y F4 piden documento, y solo cuentan si el cliente requiere esa fase.
const documentosEn = (c: ClienteCorrecciones) =>
  c.fases.filter(f => f.requiere && f.documentos_cargados !== null).map(f => f.documentos_cargados!)

const filtrados = computed(() => {
  const texto = normalizarTexto(busqueda.value)
  const lista = clientes.value.filter((c) => {
    if (actualizadoDesde.value && c.actualizado_el.slice(0, 10) < actualizadoDesde.value) return false
    if (filtroDocumentos.value) {
      const docs = documentosEn(c)
      if (filtroDocumentos.value === 'falta' ? !docs.some(n => n === 0) : !docs.some(n => n > 0)) return false
    }
    return !texto || normalizarTexto(c.cliente_nombre).includes(texto)
  })
  const signo = orden.value === 'reciente' ? -1 : 1
  return lista.toSorted((a, b) => signo * a.actualizado_el.localeCompare(b.actualizado_el))
})

const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / TAM_PAGINA)))
const visibles = computed(() => filtrados.value.slice((pagina.value - 1) * TAM_PAGINA, pagina.value * TAM_PAGINA))
watch([busqueda, filtroDocumentos, orden, actualizadoDesde], () => { pagina.value = 1 })

// Números de página con "…" cuando son muchas: 1 … 4 5 6 … 10.
const paginas = computed<(number | null)[]>(() => {
  const total = totalPaginas.value
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1)
  const cerca = [pagina.value - 1, pagina.value, pagina.value + 1].filter(n => n > 1 && n < total)
  const lista: (number | null)[] = [1]
  if (cerca[0]! > 2) lista.push(null)
  lista.push(...cerca)
  if (cerca.at(-1)! < total - 1) lista.push(null)
  lista.push(total)
  return lista
})

const hayFiltros = computed(() => Boolean(busqueda.value || filtroDocumentos.value || actualizadoDesde.value || orden.value !== 'reciente'))
function limpiarFiltros() {
  busqueda.value = ''
  filtroDocumentos.value = ''
  actualizadoDesde.value = ''
  orden.value = 'reciente'
}

function fechaUltimosDias() {
  const d = new Date()
  d.setDate(d.getDate() - DIAS_RECIENTES)
  const dos = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}`
}
const ultimosDiasActivo = computed(() => actualizadoDesde.value === fechaUltimosDias())

const claseCampo = 'rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm'
</script>

<template>
  <section class="space-y-6">
    <div class="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h2 class="font-display text-3xl font-semibold text-profundo-700">
          Clientes con correcciones
        </h2>
        <p class="text-neutral-700">
          Corrige los datos (F2) y sube los documentos de la unificación de NSS (F3) y de la recuperación de semanas (F4). Solo aparecen los clientes que requieren alguna.
        </p>
      </div>
      <div
        v-if="datos"
        data-documentos-por-subir
        class="flex h-14 items-center gap-3 rounded-xl border border-neutral-200 bg-white px-3 shadow-sm"
      >
        <span class="flex size-9 items-center justify-center rounded-lg bg-amber-100 text-lg font-semibold text-amber-700">{{ datos.resumen.documentos_por_subir }}</span>
        <span class="text-sm">
          <strong class="block text-neutral-900">Documentos por subir</strong>
          <span class="text-xs text-neutral-600">en {{ datos.resumen.clientes_con_correcciones }} {{ datos.resumen.clientes_con_correcciones === 1 ? 'cliente con correcciones' : 'clientes con correcciones' }}</span>
        </span>
      </div>
    </div>

    <div class="flex flex-wrap items-center gap-3 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
      <UInput
        v-model="busqueda"
        type="search"
        name="buscar"
        icon="i-lucide-search"
        placeholder="Buscar por nombre"
        aria-label="Buscar cliente por nombre"
        class="min-w-56 flex-1"
      />
      <select
        v-model="orden"
        name="orden"
        aria-label="Ordenar por actualización"
        :class="claseCampo"
      >
        <option value="reciente">
          Actualizados recientemente
        </option>
        <option value="antiguo">
          Actualizados hace más tiempo
        </option>
      </select>
      <select
        v-model="filtroDocumentos"
        name="filtro-documentos"
        aria-label="Filtrar por documentos"
        :class="claseCampo"
      >
        <option value="">
          Todos los documentos
        </option>
        <option value="falta">
          Falta documento
        </option>
        <option value="cargado">
          Documento cargado
        </option>
      </select>
      <UButton
        color="neutral"
        variant="outline"
        data-accion="ultimos-dias"
        :aria-pressed="ultimosDiasActivo"
        :class="ultimosDiasActivo ? 'border-acento-500 bg-acento-100 font-semibold text-profundo-900 ring-1 ring-acento-500 hover:bg-acento-100' : ''"
        @click="actualizadoDesde = fechaUltimosDias()"
      >
        Últimos {{ DIAS_RECIENTES }} días
      </UButton>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-filter-x"
        data-accion="limpiar-filtros"
        :disabled="!hayFiltros"
        @click="limpiarFiltros"
      >
        Limpiar filtros
      </UButton>
    </div>

    <p
      v-if="cargando"
      class="py-10 text-center text-neutral-500"
      role="status"
    >
      Cargando los clientes con correcciones…
    </p>

    <div
      v-else-if="falloCarga"
      class="py-10 text-center"
      role="alert"
    >
      <p class="text-red-700">
        No se pudieron cargar los clientes con correcciones.
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

    <div
      v-else
      class="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm"
    >
      <p
        v-if="clientes.length === 0"
        class="py-10 text-center text-neutral-500"
      >
        Ningún cliente requiere correcciones por ahora.
      </p>
      <p
        v-else-if="filtrados.length === 0"
        class="py-10 text-center text-neutral-500"
      >
        No hay clientes que coincidan con los filtros.
      </p>

      <div
        v-else
        class="overflow-x-auto"
      >
        <table class="w-full min-w-[56rem] text-left text-sm">
          <thead class="border-b border-neutral-200 text-neutral-700">
            <tr>
              <th class="px-5 py-4 font-medium">
                Cliente
              </th>
              <th class="px-5 py-4 text-center font-medium">
                Actualizado
              </th>
              <th
                v-for="f in FASES"
                :key="f.clave"
                class="px-5 py-4 text-center font-medium"
              >
                {{ f.titulo }}
              </th>
              <th class="px-5 py-4 text-center font-medium uppercase">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="c in visibles"
              :key="c.cliente_id"
              data-tramite
              class="border-b border-neutral-100 last:border-0 hover:bg-marca-50"
            >
              <td class="px-5 py-4">
                <span class="flex items-center gap-2">
                  <span class="flex size-8 shrink-0 items-center justify-center rounded-md bg-marca-100 text-xs font-medium text-marca-800">{{ iniciales(c.cliente_nombre) }}</span>
                  <span
                    data-nombre
                    class="font-medium text-neutral-900"
                  >{{ c.cliente_nombre }}</span>
                </span>
              </td>
              <td
                data-actualizado
                class="px-5 py-4 text-center text-neutral-600"
              >
                {{ formatearActualizado(c.actualizado_el) }}
              </td>
              <td
                v-for="f in FASES"
                :key="f.clave"
                :data-fase="f.clave"
                class="px-5 py-4 text-center"
              >
                <span
                  v-if="!faseDe(c, f.paso)?.requiere"
                  class="text-neutral-500"
                >No requiere</span>
                <span
                  v-else
                  data-pastilla
                  :data-estado="estadoFase(faseDe(c, f.paso)!)"
                  class="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium"
                  :class="estadoFase(faseDe(c, f.paso)!) === 'falta' ? 'bg-amber-100 text-amber-800' : estadoFase(faseDe(c, f.paso)!) === 'cargado' ? 'bg-green-100 text-green-800' : 'bg-marca-100 text-marca-800'"
                >{{ textoFase(faseDe(c, f.paso)!) }}</span>
              </td>
              <td class="px-5 py-4 text-center">
                <UButton
                  data-accion="gestionar"
                  size="sm"
                  class="bg-profundo-500 font-medium text-white hover:bg-profundo-600"
                  :aria-label="`Gestionar los trámites de ${c.cliente_nombre}`"
                  @click="navigateTo(`/correcciones/${c.cliente_id}`)"
                >
                  Gestionar
                </UButton>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <nav
        v-if="filtrados.length > TAM_PAGINA"
        aria-label="Páginas"
        class="flex items-center justify-center gap-1.5 border-t border-neutral-100 py-4"
      >
        <button
          type="button"
          data-accion="pagina-anterior"
          aria-label="Página anterior"
          :disabled="pagina === 1"
          class="flex size-9 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-40"
          @click="pagina--"
        >
          <UIcon
            name="i-lucide-chevron-left"
            class="size-4"
          />
        </button>
        <template
          v-for="(n, i) in paginas"
          :key="i"
        >
          <span
            v-if="n === null"
            class="px-1 text-neutral-500"
          >…</span>
          <button
            v-else
            type="button"
            data-pagina
            :aria-current="n === pagina ? 'page' : undefined"
            class="size-9 rounded-md border text-sm"
            :class="n === pagina ? 'border-marca-500 bg-marca-500 text-white' : 'border-neutral-300'"
            @click="pagina = n"
          >
            {{ n }}
          </button>
        </template>
        <button
          type="button"
          data-accion="pagina-siguiente"
          aria-label="Página siguiente"
          :disabled="pagina === totalPaginas"
          class="flex size-9 items-center justify-center rounded-md border border-neutral-300 disabled:opacity-40"
          @click="pagina++"
        >
          <UIcon
            name="i-lucide-chevron-right"
            class="size-4"
          />
        </button>
      </nav>
    </div>
  </section>
</template>
