<script setup lang="ts">
import type { DocumentoPendiente } from '~/types/dashboard'
import { fechaLarga, iniciales, porGrupo, TOTAL_ETAPAS, textoVencimiento, type EstadoAccion } from '~/utils/dashboard'
import { fechaLocalISO, formatearFechaCorta, hoyISO } from '~/utils/fechas'

definePageMeta({ titulo: 'Dashboard' })

const MAX_FILAS = 8

const sesion = useSessionStore()
const { datos, cargando, fallo, cargar } = useDashboard()
const hoy = hoyISO()
onMounted(cargar)

const rol = computed(() => sesion.usuario?.rol)
const esAsesor = computed(() => rol.value === 'asesor')
const esAuxiliar = computed(() => rol.value === 'auxiliar')
const esSupervisor = computed(() => rol.value === 'supervisor')
const nombrePila = computed(() => sesion.usuario?.nombre.split(' ')[0] ?? '')

// Todo viene calculado por el backend (con el alcance del rol): aquí solo se presenta.
const resumen = computed(() => datos.value?.resumen)
const activos = computed(() => resumen.value?.clientes_activos ?? 0)
const asesoresActivos = computed(() => resumen.value?.asesores_activos ?? 0)
const accionesProximas = computed(() => resumen.value?.acciones_proximas_mes ?? 0)
const detenidosTotal = computed(() => resumen.value?.clientes_avance_detenido ?? 0)
const acciones = computed(() => datos.value?.acciones_del_mes ?? [])
const sinAvance = computed(() => datos.value?.clientes_detenidos ?? [])
const carga = computed(() => {
  const filas = datos.value?.carga_por_asesor ?? []
  const suma = (k: 'clientes_activos' | 'clientes_detenidos' | 'clientes_pensionados') => filas.reduce((a, f) => a + f[k], 0)
  return { filas, total: { activos: suma('clientes_activos'), detenidos: suma('clientes_detenidos'), pensionados: suma('clientes_pensionados') } }
})

// El Asesor solo ve los documentos por confirmar; el Auxiliar también los "Con observaciones".
const pendientes = computed(() => (datos.value?.documentos_pendientes ?? []).filter(d => esAuxiliar.value || d.estatus === 'por_confirmar'))
const totalPendientes = computed(() => (resumen.value?.documentos_por_confirmar ?? 0) + (esAuxiliar.value ? (resumen.value?.documentos_con_observaciones ?? 0) : 0))

// Clientes por etapa: una barra por cada una de las 16 etapas (aunque tenga 0) y la dona por grupo.
const etapas = computed(() => datos.value?.clientes_por_etapa ?? [])
const barrasEtapas = computed(() => Array.from({ length: TOTAL_ETAPAS }, (_, p) => {
  const e = etapas.value.find(x => x.numero_paso === p)
  return { etiqueta: `${p} ${e?.nombre ?? `Etapa ${p}`}`, valor: e?.clientes ?? 0 }
}))
const dona = computed(() => porGrupo(barrasEtapas.value.map(b => b.valor)).map(g => ({ nombre: g.nombre, valor: g.valor, color: g.color })))

const estatusDocs = computed(() => datos.value?.documentos_por_estatus ?? { si: 0, por_confirmar: 0, no: 0 })
const donaDocs = computed(() => [
  { nombre: 'Aprobados', valor: estatusDocs.value.si, color: '#16a34a' },
  { nombre: 'Por confirmar', valor: estatusDocs.value.por_confirmar, color: '#e5a50a' },
  { nombre: 'Con observaciones', valor: estatusDocs.value.no, color: '#e11d48' },
])
const totalDocs = computed(() => estatusDocs.value.si + estatusDocs.value.por_confirmar + estatusDocs.value.no)

const claseEstado = (estado: EstadoAccion) => estado === 'completada' ? 'border-green-600 text-green-700' : estado === 'vencida' ? 'border-red-500 text-red-600' : 'border-amber-500 text-amber-700'
const subidoPor = (d: DocumentoPendiente) => d.subido_por_id === sesion.usuario?.id ? 'Tú' : d.subido_por_nombre ?? '—'
const dias = (n: number) => (n === 1 ? '1 día' : `${n} días`)

const claseTarjeta = 'flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm'
const claseSeccion = 'rounded-2xl bg-white p-5 shadow-sm'
const claseTabla = 'w-full min-w-[40rem] text-left text-sm'
const claseCabecera = 'border-b border-neutral-200 text-neutral-600'
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2
          data-saludo
          class="font-display text-3xl font-semibold text-profundo-900"
        >
          Hola, {{ nombrePila }}!
        </h2>
        <p class="text-neutral-700">
          <template v-if="esAsesor">
            Da seguimiento a tus clientes, tus fechas próximas y los documentos que esperan tu revisión.
          </template>
          <template v-else>
            Consulta las acciones del mes, los documentos pendientes y los clientes sin avance reciente.
          </template>
        </p>
      </div>
      <div class="flex items-center gap-4">
        <span class="flex items-center gap-2 text-sm text-neutral-600">
          <UIcon
            name="i-lucide-calendar"
            class="size-4"
          />
          <span data-fecha-hoy>{{ fechaLarga(hoy) }}</span>
        </span>
        <UButton
          data-accion="refrescar"
          icon="i-lucide-refresh-cw"
          :loading="cargando"
          class="bg-profundo-500 text-white hover:bg-profundo-600"
          @click="cargar"
        >
          Refrescar
        </UButton>
      </div>
    </div>

    <p
      v-if="cargando && !datos"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando el dashboard…
    </p>

    <div
      v-else-if="fallo"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
      role="alert"
    >
      <p class="text-red-700">
        No se pudo cargar el dashboard.
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

    <p
      v-else-if="activos === 0"
      class="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center text-neutral-500"
    >
      Aún no tienes clientes activos.
    </p>

    <template v-else>
      <!-- Tarjetas -->
      <div
        class="grid gap-4 md:grid-cols-2 xl:grid-cols-4"
      >
        <article
          data-tarjeta="clientes"
          :class="claseTarjeta"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-neutral-100"><UIcon
            name="i-lucide-users"
            class="size-6 text-neutral-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-4xl font-semibold text-profundo-900"
            >
              {{ activos }}
            </p>
            <p class="text-sm text-neutral-600">
              {{ esAsesor ? 'Mis clientes activos' : 'Clientes activos' }}
            </p>
          </div>
        </article>
        <article
          v-if="esSupervisor"
          data-tarjeta="asesores"
          :class="claseTarjeta"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-neutral-100"><UIcon
            name="i-lucide-user-round-check"
            class="size-6 text-neutral-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-4xl font-semibold text-profundo-900"
            >
              {{ asesoresActivos }}
            </p>
            <p class="text-sm text-neutral-600">
              Asesores activos
            </p>
          </div>
        </article>
        <article
          data-tarjeta="acciones"
          :class="claseTarjeta"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-marca-100"><UIcon
            name="i-lucide-calendar-days"
            class="size-6 text-marca-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-4xl font-semibold text-profundo-900"
            >
              {{ accionesProximas }}
            </p>
            <p class="text-sm text-neutral-600">
              Acciones próximas del mes
            </p>
          </div>
        </article>
        <article
          v-if="!esSupervisor"
          data-tarjeta="documentos"
          :class="claseTarjeta"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-amber-100"><UIcon
            name="i-lucide-file-text"
            class="size-6 text-amber-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-4xl font-semibold text-profundo-900"
            >
              {{ totalPendientes }}
            </p>
            <p class="text-sm text-neutral-600">
              {{ esAsesor ? 'Documentos pendientes' : 'Documentos pendientes de revisión' }}
            </p>
          </div>
        </article>
        <article
          data-tarjeta="detenidos"
          :class="claseTarjeta"
        >
          <span class="flex size-14 items-center justify-center rounded-full bg-neutral-100"><UIcon
            name="i-lucide-clock"
            class="size-6 text-neutral-700"
          /></span>
          <div>
            <p
              data-valor
              class="font-display text-4xl font-semibold text-profundo-900"
            >
              {{ detenidosTotal }}
            </p>
            <p class="text-sm text-neutral-600">
              Clientes con avance detenido
            </p>
          </div>
        </article>
      </div>

      <!-- Acciones y fechas próximas del mes -->
      <article
        data-seccion="acciones"
        :class="claseSeccion"
      >
        <h3 class="font-display text-lg font-semibold text-profundo-700">
          Acciones y fechas próximas del mes
        </h3>
        <p class="mb-3 text-sm text-neutral-600">
          Ordenadas por fecha compromiso
        </p>
        <p
          v-if="acciones.length === 0"
          class="rounded-xl border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-500"
        >
          No hay acciones con fecha compromiso este mes.
        </p>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table :class="claseTabla">
            <thead :class="claseCabecera">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Cliente
                </th>
                <th
                  v-if="esSupervisor"
                  data-columna-asesor
                  class="px-3 py-2 font-medium"
                >
                  Asesor
                </th>
                <th class="px-3 py-2 font-medium">
                  Fecha compromiso
                </th>
                <th class="px-3 py-2 font-medium">
                  Etapa
                </th>
                <th class="px-3 py-2 font-medium">
                  Acción pendiente
                </th>
                <th class="px-3 py-2 text-center font-medium">
                  Status
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100">
              <tr
                v-for="a in acciones.slice(0, MAX_FILAS)"
                :key="`${a.cliente_id}-${a.numero_paso}`"
                data-accion-fila
              >
                <td class="px-3 py-2.5">
                  <span class="flex items-center gap-2"><span class="flex size-8 items-center justify-center rounded-lg bg-marca-100 text-xs font-semibold text-marca-800">{{ iniciales(a.cliente_nombre) }}</span>{{ a.cliente_nombre }}</span>
                </td>
                <td
                  v-if="esSupervisor"
                  data-asesor
                  class="px-3 py-2.5"
                >
                  {{ a.asesor_nombre }}
                </td>
                <td class="px-3 py-2.5">
                  {{ formatearFechaCorta(a.fecha_compromiso.slice(0, 10)) }}
                </td>
                <td class="px-3 py-2.5">
                  {{ a.etapa }}
                </td>
                <td class="px-3 py-2.5">
                  {{ a.accion_a_realizar || '—' }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  <span
                    data-estado-accion
                    class="inline-block rounded border px-2 py-0.5 text-xs"
                    :class="claseEstado(a.estado)"
                  >{{ textoVencimiento(a.fecha_compromiso.slice(0, 10), a.estado, hoy) }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <!-- Clientes por etapa -->
      <div class="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <article
          data-seccion="etapas"
          :class="claseSeccion"
        >
          <h3 class="font-display text-lg font-semibold text-profundo-700">
            {{ esAsesor ? 'Mis clientes por etapa del proceso' : 'Clientes por etapa del proceso' }}
          </h3>
          <p class="mb-4 text-sm text-neutral-600">
            {{ activos }} clientes activos en 16 etapas
          </p>
          <BarrasHorizontales :filas="barrasEtapas" />
        </article>
        <div class="space-y-5">
          <article :class="claseSeccion">
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Clientes por etapa del proceso
            </h3>
            <p class="mb-4 text-sm text-neutral-600">
              {{ esAsesor ? 'Tus clientes activos por grupo de etapas' : 'Clientes activos por grupo de etapas' }}
            </p>
            <DonaGrafica
              data-dona="etapas"
              :segmentos="dona"
              :total="activos"
              etiqueta="Clientes"
            />
            <NuxtLink
              to="/clientes"
              class="mt-4 block text-center text-sm font-semibold text-profundo-700 hover:underline"
            >
              Ver detalle por etapa →
            </NuxtLink>
          </article>
        </div>
      </div>

      <!-- Documentos pendientes (y por estatus para el Auxiliar) -->
      <div
        v-if="!esSupervisor"
        class="grid gap-5 xl:grid-cols-[2fr_1fr]"
      >
        <article
          data-seccion="documentos"
          :class="claseSeccion"
        >
          <h3 class="font-display text-lg font-semibold text-profundo-700">
            {{ esAsesor ? 'Documentos pendientes' : 'Documentos pendientes o no válidos' }}
          </h3>
          <p class="mb-3 text-sm text-neutral-600">
            {{ esAsesor ? 'Documentos con estatus Por confirmar' : 'Documentos por confirmar o con observaciones' }}
          </p>
          <p
            v-if="pendientes.length === 0"
            class="rounded-xl border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-500"
          >
            No hay documentos pendientes.
          </p>
          <div
            v-else
            class="overflow-x-auto"
          >
            <table :class="claseTabla">
              <thead :class="claseCabecera">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Cliente
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Documento
                  </th>
                  <th
                    v-if="esAuxiliar"
                    class="px-3 py-2 font-medium"
                  >
                    Subido por
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Fecha de carga
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Etapa
                  </th>
                  <th class="px-3 py-2 text-center font-medium">
                    {{ esAsesor ? 'Estatus' : 'Revisión' }}
                  </th>
                  <th class="px-3 py-2 text-center font-medium">
                    Acción
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100">
                <tr
                  v-for="d in pendientes.slice(0, MAX_FILAS)"
                  :key="d.documento_id"
                  data-documento-fila
                >
                  <td class="px-3 py-2.5">
                    <span class="flex items-center gap-2"><span class="flex size-8 items-center justify-center rounded-lg bg-marca-100 text-xs font-semibold text-marca-800">{{ iniciales(d.cliente_nombre) }}</span>{{ d.cliente_nombre }}</span>
                  </td>
                  <td class="px-3 py-2.5">
                    {{ d.tipo_documento }}
                  </td>
                  <td
                    v-if="esAuxiliar"
                    data-subido-por
                    class="px-3 py-2.5"
                  >
                    {{ subidoPor(d) }}
                  </td>
                  <td class="px-3 py-2.5">
                    {{ formatearFechaCorta(fechaLocalISO(d.fecha_carga)) }}
                  </td>
                  <td class="px-3 py-2.5">
                    {{ d.etapa_actual }}
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    <span
                      data-revision
                      class="inline-block rounded border px-2 py-0.5 text-xs"
                      :class="d.estatus === 'no' ? 'border-red-500 text-red-600' : 'border-amber-500 text-amber-700'"
                    >{{ d.estatus === 'no' ? 'No validado' : 'Pendiente' }}</span>
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    <UButton
                      :to="`/clientes/${d.cliente_id}/archivos`"
                      data-accion="revisar"
                      size="sm"
                      class="bg-profundo-500 text-white hover:bg-profundo-600"
                    >
                      Revisar
                    </UButton>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
        <article
          data-seccion="documentos-estatus"
          :class="claseSeccion"
        >
          <h3 class="font-display text-lg font-semibold text-profundo-700">
            Documentos por estatus
          </h3>
          <p class="mb-4 text-sm text-neutral-600">
            Documentos de clientes activos
          </p>
          <DonaGrafica
            data-dona="documentos"
            :segmentos="donaDocs"
            :total="totalDocs"
            etiqueta="Documentos"
          />
        </article>
      </div>

      <!-- Carga de trabajo por asesor (Supervisor) -->
      <article
        v-if="esSupervisor"
        data-seccion="carga-tabla"
        :class="claseSeccion"
      >
        <h3 class="font-display text-lg font-semibold text-profundo-700">
          Carga de trabajo por asesor
        </h3>
        <p class="mb-3 text-sm text-neutral-600">
          Clientes activos, casos detenidos y clientes pensionados
        </p>
        <div class="overflow-x-auto">
          <table :class="claseTabla">
            <thead :class="claseCabecera">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Asesor
                </th>
                <th class="px-3 py-2 text-center font-medium">
                  Clientes activos
                </th>
                <th class="px-3 py-2 text-center font-medium">
                  Con avance detenido
                </th>
                <th class="px-3 py-2 text-center font-medium">
                  Clientes pensionados
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100">
              <tr
                v-for="f in carga.filas"
                :key="f.asesor_id"
                data-carga-fila
              >
                <td class="px-3 py-2.5">
                  {{ f.asesor_nombre }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ f.clientes_activos }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ f.clientes_detenidos }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ f.clientes_pensionados }}
                </td>
              </tr>
              <tr
                data-carga-total
                class="font-semibold"
              >
                <td class="px-3 py-2.5">
                  Total
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ carga.total.activos }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ carga.total.detenidos }}
                </td>
                <td class="px-3 py-2.5 text-center">
                  {{ carga.total.pensionados }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>

      <!-- Clientes con avance detenido -->
      <article
        data-seccion="detenidos"
        :class="claseSeccion"
      >
        <h3 class="font-display text-lg font-semibold text-profundo-700">
          Clientes con avance detenido
        </h3>
        <p class="mb-3 text-sm text-neutral-600">
          Estatus Detenido o 15 días o más sin actividad
        </p>
        <p
          v-if="sinAvance.length === 0"
          class="rounded-xl border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-500"
        >
          Ningún cliente tiene el avance detenido.
        </p>
        <div
          v-else
          class="overflow-x-auto"
        >
          <table :class="claseTabla">
            <thead :class="claseCabecera">
              <tr>
                <th class="px-3 py-2 font-medium">
                  Cliente
                </th>
                <th
                  v-if="esSupervisor"
                  class="px-3 py-2 font-medium"
                >
                  Asesor
                </th>
                <th class="px-3 py-2 font-medium">
                  Etapa
                </th>
                <th class="px-3 py-2 font-medium">
                  Estatus
                </th>
                <th class="px-3 py-2 font-medium">
                  Última actividad
                </th>
                <th class="px-3 py-2 text-center font-medium">
                  Días sin actividad
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-neutral-100">
              <tr
                v-for="d in sinAvance.slice(0, MAX_FILAS)"
                :key="d.cliente_id"
                data-detenido-fila
              >
                <td class="px-3 py-2.5">
                  <span class="flex items-center gap-2"><span class="flex size-8 items-center justify-center rounded-lg bg-marca-100 text-xs font-semibold text-marca-800">{{ iniciales(d.cliente_nombre) }}</span>{{ d.cliente_nombre }}</span>
                </td>
                <td
                  v-if="esSupervisor"
                  data-asesor
                  class="px-3 py-2.5"
                >
                  {{ d.asesor_nombre }}
                </td>
                <td class="px-3 py-2.5">
                  {{ d.etapa_actual }}
                </td>
                <td class="px-3 py-2.5 font-medium">
                  <span
                    class="mr-1.5 inline-block size-2 rounded-full"
                    :class="d.estatus_id === 9 ? 'bg-red-500' : 'bg-amber-400'"
                  />{{ d.estatus ?? '—' }}
                </td>
                <td class="px-3 py-2.5">
                  {{ formatearFechaCorta(fechaLocalISO(d.ultima_actividad)) }}
                </td>
                <td
                  data-dias
                  class="px-3 py-2.5 text-center"
                >
                  {{ dias(d.dias_sin_actividad) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </article>
    </template>
  </section>
</template>
