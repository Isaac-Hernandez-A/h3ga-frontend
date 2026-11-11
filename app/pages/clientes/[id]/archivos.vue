<script setup lang="ts">
import type { DocumentoCliente, TipoDocumento } from '~/types/expediente'
import { fechaLocalISO, formatearFechaCorta } from '~/utils/fechas'
import { puede } from '~/utils/permisos'
import { normalizarTexto } from '~/utils/texto'

definePageMeta({ titulo: 'Expediente del cliente' })

const POR_PAGINA = 10

const id = String(useRoute().params.id)
const sesion = useSessionStore()
const toast = useToast()
const docs = useDocumentos()
const { cliente, etapas, estatus, catalogos, eventos, documentos, cargando, estado, documentosFallo, asesorNombre, cargar, cargarDocumentos } = useExpediente(id)

const tipos = ref<TipoDocumento[]>([])
onMounted(async () => {
  try {
    tipos.value = await docs.tipos()
  }
  catch {
    // useApi ya avisó los 403 y los errores de red; sin catálogo se muestra el tipo como "Documento".
    tipos.value = []
  }
})
const nombreTipo = (tipoId: number) => tipos.value.find(t => t.id === tipoId)?.nombre ?? 'Documento'

const puedeSubir = computed(() => (sesion.usuario ? puede(sesion.usuario.rol, 'documentos.subir') : false))

const ESTATUS_DOCUMENTO: Record<string, { texto: string, clase: string }> = {
  si: { texto: 'Aprobado', clase: 'border-green-600 text-green-700' },
  por_confirmar: { texto: 'Por confirmar', clase: 'border-amber-500 text-amber-700' },
  no: { texto: 'Con observaciones', clase: 'border-red-500 text-red-600' },
}

// Filtros
const busqueda = ref('')
const filtroTipo = ref<number | ''>('')
const desde = ref('')
const hasta = ref('')
const pagina = ref(1)

const filtrados = computed(() => {
  const texto = normalizarTexto(busqueda.value)
  return documentos.value
    .filter((d) => {
      const dia = fechaLocalISO(d.fecha_carga)
      if (filtroTipo.value !== '' && d.tipo_documento_id !== filtroTipo.value) return false
      if (desde.value && dia < desde.value) return false
      if (hasta.value && dia > hasta.value) return false
      return !texto || normalizarTexto(d.nombre_archivo_original).includes(texto)
    })
    .sort((a, b) => b.fecha_carga.localeCompare(a.fecha_carga))
})
const totalPaginas = computed(() => Math.max(1, Math.ceil(filtrados.value.length / POR_PAGINA)))
const visibles = computed(() => filtrados.value.slice((pagina.value - 1) * POR_PAGINA, pagina.value * POR_PAGINA))
const hayFiltros = computed(() => Boolean(busqueda.value || filtroTipo.value !== '' || desde.value || hasta.value))
watch([busqueda, filtroTipo, desde, hasta], () => { pagina.value = 1 })

function limpiarFiltros() {
  busqueda.value = ''
  filtroTipo.value = ''
  desde.value = ''
  hasta.value = ''
}

async function descargar(documento: DocumentoCliente) {
  try {
    await docs.descargar(id, documento)
  }
  catch {
    // useApi ya avisó los 403 y los errores de red; los demás se muestran aquí.
    toast.add({ title: 'No se pudo descargar el archivo', description: documento.nombre_archivo_original, color: 'error' })
  }
}

// Subir un documento: el formulario es un componente (también lo usa el paso 2 del F0).
const subirAbierto = ref(false)

async function alSubirse(nuevo: DocumentoCliente) {
  // Un tipo de documento único reemplaza al anterior: se recarga la lista para reflejarlo.
  if (documentos.value.some(d => d.tipo_documento_id === nuevo.tipo_documento_id)) await cargarDocumentos()
  else documentos.value = [...documentos.value, nuevo]
  subirAbierto.value = false
}

</script>

<template>
  <section class="space-y-5">
    <div class="flex items-center justify-between gap-4">
      <NuxtLink
        :to="`/clientes/${id}`"
        data-accion="regresar"
        class="inline-flex items-center gap-2 font-medium text-profundo-700 hover:underline"
      >
        <UIcon
          name="i-lucide-undo-2"
          class="size-5"
        />
        Regresar
      </NuxtLink>
      <UButton
        v-if="cliente && puedeSubir"
        data-accion="anadir"
        icon="i-lucide-plus"
        size="lg"
        class="bg-white font-medium text-profundo-900 shadow-md ring-1 ring-neutral-200 hover:bg-neutral-50"
        @click="subirAbierto = true"
      >
        Añadir documento
      </UButton>
    </div>

    <p
      v-if="cargando"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando…
    </p>

    <div
      v-else-if="estado === 'no-encontrado'"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
    >
      <h2 class="font-display text-2xl font-semibold text-profundo-900">
        Cliente no encontrado
      </h2>
    </div>

    <div
      v-else-if="estado === 'fallo'"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
      role="alert"
    >
      <p class="text-red-700">
        No se pudo cargar el expediente.
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
      v-else-if="cliente"
      class="grid items-start gap-5 xl:grid-cols-[minmax(360px,440px)_1fr]"
    >
      <ClientePerfil
        :cliente="cliente"
        :etapas="etapas?.etapas ?? []"
        :estatus="estatus"
        :catalogos="catalogos"
        :asesor-nombre="asesorNombre"
        :eventos="eventos"
      />

      <div class="space-y-5">
        <div class="rounded-2xl bg-white p-6 shadow-sm">
          <div class="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p class="text-xs font-medium uppercase tracking-wide text-marca-700">
                Expediente / Archivos
              </p>
              <h2 class="font-display text-2xl font-semibold text-profundo-900">
                Archivos del cliente
              </h2>
            </div>
            <UInput
              v-model="busqueda"
              type="search"
              name="buscar"
              icon="i-lucide-search"
              placeholder="Buscar documento"
              aria-label="Buscar documento"
              class="w-full max-w-md"
              size="lg"
            />
          </div>
          <div class="mt-4 flex flex-wrap items-center gap-3">
            <span class="flex items-center gap-1 text-sm text-neutral-600">
              <UIcon
                name="i-lucide-list-filter"
                class="size-4"
              />Filtros
            </span>
            <select
              v-model.number="filtroTipo"
              name="filtro-tipo"
              aria-label="Filtrar por tipo de documento"
              class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
            >
              <option value="">
                Tipo de documento
              </option>
              <option
                v-for="tipo in tipos"
                :key="tipo.id"
                :value="tipo.id"
              >
                {{ tipo.nombre }}
              </option>
            </select>
            <label class="flex items-center gap-2 text-sm text-neutral-700">Desde
              <input
                v-model="desde"
                type="date"
                name="desde"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
            </label>
            <label class="flex items-center gap-2 text-sm text-neutral-700">Hasta
              <input
                v-model="hasta"
                type="date"
                name="hasta"
                class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
              >
            </label>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-filter-x"
              class="whitespace-nowrap"
              data-accion="limpiar-filtros"
              :disabled="!hayFiltros"
              @click="limpiarFiltros"
            >
              Limpiar filtros
            </UButton>
          </div>
        </div>

        <div class="rounded-2xl bg-white p-6 shadow-sm">
          <h3 class="flex items-center gap-2 text-lg font-semibold text-profundo-700">
            <UIcon
              name="i-lucide-file-text"
              class="size-6"
            />Documentos
          </h3>
          <p class="mb-4 text-sm text-neutral-600">
            Gestiona y da seguimiento a los documentos de tu cliente.
          </p>

          <div
            v-if="documentosFallo"
            class="py-8 text-center"
            role="alert"
          >
            <p class="text-red-700">
              No se pudieron cargar los documentos.
            </p>
            <UButton
              class="mt-3"
              color="neutral"
              variant="outline"
              data-accion="reintentar"
              @click="cargarDocumentos"
            >
              Reintentar
            </UButton>
          </div>
          <p
            v-else-if="documentos.length === 0"
            class="rounded-xl border border-dashed border-neutral-300 py-8 text-center text-neutral-500"
          >
            Aún no hay documentos en este expediente.
          </p>
          <p
            v-else-if="filtrados.length === 0"
            class="rounded-xl border border-dashed border-neutral-300 py-8 text-center text-neutral-500"
          >
            No hay documentos que coincidan con los filtros.
          </p>
          <div
            v-else
            class="overflow-x-auto rounded-xl border border-neutral-200"
          >
            <table class="w-full text-left">
              <thead class="bg-neutral-50 text-sm text-profundo-700">
                <tr>
                  <th class="px-4 py-3 font-medium">
                    Nombre
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Creado el
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Tipo
                  </th>
                  <th class="px-4 py-3 font-medium">
                    Estatus
                  </th>
                  <th class="px-4 py-3 text-right font-medium">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-200">
                <tr
                  v-for="documento in visibles"
                  :key="documento.id"
                >
                  <td class="px-4 py-3">
                    <span class="flex items-center gap-2">
                      <UIcon
                        name="i-lucide-file-text"
                        class="size-5 shrink-0 text-neutral-500"
                      />
                      <span class="break-words">{{ documento.nombre_archivo_original }}</span>
                    </span>
                  </td>
                  <td class="whitespace-nowrap px-4 py-3 text-sm text-neutral-700">
                    {{ formatearFechaCorta(fechaLocalISO(documento.fecha_carga)) }}
                  </td>
                  <td class="px-4 py-3 text-sm text-neutral-700">
                    {{ nombreTipo(documento.tipo_documento_id) }}
                  </td>
                  <td class="px-4 py-3">
                    <span
                      class="inline-block whitespace-nowrap rounded border px-2 py-0.5 text-sm"
                      :class="ESTATUS_DOCUMENTO[documento.estatus]?.clase"
                      :title="documento.observaciones ?? undefined"
                    >{{ ESTATUS_DOCUMENTO[documento.estatus]?.texto ?? documento.estatus }}</span>
                  </td>
                  <td class="px-4 py-3 text-right">
                    <UButton
                      color="neutral"
                      variant="ghost"
                      size="sm"
                      icon="i-lucide-download"
                      data-accion="descargar"
                      :aria-label="`Descargar ${documento.nombre_archivo_original}`"
                      @click="descargar(documento)"
                    />
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
              class="rounded border border-neutral-300 px-3 py-1 disabled:opacity-40"
              aria-label="Página siguiente"
              :disabled="pagina === totalPaginas"
              @click="pagina++"
            >
              ›
            </button>
          </nav>
        </div>
      </div>
    </div>

    <UModal
      v-model:open="subirAbierto"
      title="Añadir documento"
      description="PDF, JPG o PNG de hasta 10 MB."
    >
      <template #body>
        <DocumentoSubirFormulario
          :cliente-id="id"
          :tipos="tipos"
          @subido="alSubirse"
          @cancelar="subirAbierto = false"
        />
      </template>
    </UModal>
  </section>
</template>
