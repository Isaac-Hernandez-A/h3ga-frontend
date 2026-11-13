<script setup lang="ts">
import type { PeriodoReporte, ReporteOperativo } from '~/types/reporte'
import { formatearFechaCorta, hoyISO } from '~/utils/fechas'
import { colorEstatus, porcentaje, porcentajeDe, totalesPorEstatus, tramos } from '~/utils/reportes'

definePageMeta({ titulo: 'Reportes' })

const toast = useToast()
const api = useReportes()

const periodo = ref<PeriodoReporte>('semanal')
const fecha = ref(hoyISO())
const reporte = ref<ReporteOperativo | null>(null)
const cargando = ref(true)
const falloCarga = ref(false)
const descargando = ref(false)

const fechaValida = computed(() => /^\d{4}-\d{2}-\d{2}$/.test(fecha.value))

// Si el usuario cambia el periodo o la fecha mientras llega una respuesta, solo vale la última consulta.
let consultaActual = 0
async function cargar() {
  if (!fechaValida.value) return
  const consulta = ++consultaActual
  cargando.value = true
  falloCarga.value = false
  try {
    const datos = await api.generar(periodo.value, fecha.value)
    if (consulta === consultaActual) reporte.value = datos
  }
  catch {
    // useApi ya avisó los 403 y los errores de red.
    if (consulta === consultaActual) falloCarga.value = true
  }
  if (consulta === consultaActual) cargando.value = false
}
onMounted(cargar)
watch([periodo, fecha], cargar)

async function exportarPdf() {
  if (!fechaValida.value) return
  descargando.value = true
  try {
    await api.descargarPdf(periodo.value, fecha.value)
  }
  catch {
    toast.add({ title: 'No se pudo descargar el reporte en PDF', color: 'error' })
  }
  descargando.value = false
}

const dia = (f: string) => formatearFechaCorta(f.slice(0, 10))
const etapas = computed(() => reporte.value?.cartera.etapas ?? [])
const catalogoEstatus = computed(() => reporte.value?.cartera.estatus ?? [])
const maximoEtapa = computed(() => Math.max(1, ...etapas.value.map(e => e.total)))
const totalCartera = computed(() => etapas.value.reduce((a, e) => a + e.total, 0))
const donaCartera = computed(() => totalesPorEstatus(etapas.value, catalogoEstatus.value))
const maximoMotivo = computed(() => Math.max(1, ...(reporte.value?.rechazo.motivos ?? []).map(m => m.total)))
const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`

const claseTarjeta = 'flex items-center gap-4 rounded-2xl bg-white p-5 shadow-sm'
const claseSeccion = 'rounded-2xl bg-white p-5 shadow-sm'
const claseTabla = 'w-full min-w-[28rem] text-left text-sm'
const claseCabecera = 'border-b border-neutral-200 text-neutral-600'
const claseVacio = 'rounded-xl border border-dashed border-neutral-300 py-6 text-center text-sm text-neutral-500'
</script>

<template>
  <section class="space-y-5">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 class="font-display text-3xl font-semibold text-profundo-900">
          Reporte operativo
        </h2>
        <p class="text-neutral-700">
          Avance de la cartera en las etapas 0 a 4: qué se finalizó, qué está por vencer, por qué se bloquea y cuántos clientes nuevos entraron.
        </p>
      </div>
      <div class="flex flex-wrap items-center gap-3">
        <select
          v-model="periodo"
          name="periodo"
          aria-label="Periodo de reporte"
          class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
          <option value="semanal">
            Semanal
          </option>
          <option value="mensual">
            Mensual
          </option>
          <option value="trimestral">
            Trimestral
          </option>
        </select>
        <input
          v-model="fecha"
          type="date"
          name="fecha"
          aria-label="Fecha del reporte"
          class="rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm"
        >
        <UButton
          data-accion="exportar-pdf"
          icon="i-lucide-file-down"
          :loading="descargando"
          :disabled="!fechaValida"
          class="bg-acento-500 font-semibold text-profundo-900 hover:bg-acento-600"
          @click="exportarPdf"
        >
          Exportar a PDF
        </UButton>
      </div>
    </div>

    <p
      v-if="reporte"
      data-rango
      class="flex items-center gap-2 text-sm text-neutral-600"
    >
      <UIcon
        name="i-lucide-calendar-range"
        class="size-4"
      />
      Del {{ dia(reporte.desde) }} al {{ dia(reporte.hasta) }}
      <span v-if="reporte.alcance === 'supervisor'">· Todos los asesores</span>
      <span v-else>· Tus clientes</span>
    </p>

    <p
      v-if="cargando && !reporte"
      class="py-16 text-center text-neutral-500"
      role="status"
    >
      Cargando el reporte…
    </p>

    <div
      v-else-if="falloCarga && !reporte"
      class="rounded-2xl bg-white p-10 text-center shadow-sm"
      role="alert"
    >
      <p class="text-red-700">
        No se pudo cargar el reporte.
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

    <template v-else-if="reporte">
      <p
        v-if="falloCarga"
        class="rounded-xl bg-red-50 px-4 py-2 text-sm text-red-700"
        role="alert"
      >
        No se pudo actualizar el reporte; se muestra el último que se cargó.
        <button
          type="button"
          data-accion="reintentar"
          class="font-semibold underline"
          @click="cargar"
        >
          Reintentar
        </button>
      </p>

      <div
        class="space-y-5 transition-opacity"
        :class="cargando ? 'opacity-60' : ''"
      >
        <!-- Tarjetas -->
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <article
            data-tarjeta="finalizadas"
            :class="claseTarjeta"
          >
            <span class="flex size-14 items-center justify-center rounded-full bg-green-100"><UIcon
              name="i-lucide-check"
              class="size-6 text-green-700"
            /></span>
            <div>
              <p
                data-valor
                class="font-display text-4xl font-semibold text-profundo-900"
              >
                {{ reporte.finalizados.total }}
              </p>
              <p class="text-sm text-neutral-600">
                Etapas finalizadas en el periodo
              </p>
            </div>
          </article>
          <article
            data-tarjeta="vencidas"
            :class="claseTarjeta"
          >
            <span class="flex size-14 items-center justify-center rounded-full bg-red-100"><UIcon
              name="i-lucide-alarm-clock-off"
              class="size-6 text-red-700"
            /></span>
            <div>
              <p
                data-valor
                class="font-display text-4xl font-semibold text-profundo-900"
              >
                {{ reporte.vencimientos.vencidos }}
              </p>
              <p class="text-sm text-neutral-600">
                Compromisos vencidos
              </p>
            </div>
          </article>
          <article
            data-tarjeta="por-vencer"
            :class="claseTarjeta"
          >
            <span class="flex size-14 items-center justify-center rounded-full bg-amber-100"><UIcon
              name="i-lucide-clock"
              class="size-6 text-amber-700"
            /></span>
            <div>
              <p
                data-valor
                class="font-display text-4xl font-semibold text-profundo-900"
              >
                {{ reporte.vencimientos.por_vencer }}
              </p>
              <p class="text-sm text-neutral-600">
                Compromisos por vencer
              </p>
            </div>
          </article>
          <article
            data-tarjeta="nuevos"
            :class="claseTarjeta"
          >
            <span class="flex size-14 items-center justify-center rounded-full bg-marca-100"><UIcon
              name="i-lucide-user-plus"
              class="size-6 text-marca-700"
            /></span>
            <div>
              <p
                data-valor
                class="font-display text-4xl font-semibold text-profundo-900"
              >
                {{ reporte.clientes_nuevos.total }}
              </p>
              <p class="text-sm text-neutral-600">
                Clientes nuevos
              </p>
            </div>
          </article>
        </div>

        <!-- Cartera por etapa y estatus -->
        <div class="grid gap-5 xl:grid-cols-[2fr_1fr]">
          <article
            data-seccion="cartera"
            :class="claseSeccion"
          >
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Cartera por etapa y estatus
            </h3>
            <p class="mb-4 text-sm text-neutral-600">
              En qué estatus está cada etapa (0 a 4) de los clientes
            </p>
            <ul class="space-y-2">
              <li
                v-for="e in etapas"
                :key="e.numero_paso"
                data-etapa-fila
                class="grid items-center gap-3 text-sm"
                style="grid-template-columns: minmax(8rem, 15rem) 1fr 2rem"
              >
                <span class="text-right text-neutral-600">{{ e.numero_paso }} {{ e.nombre }}</span>
                <span
                  class="flex h-5 overflow-hidden rounded-full bg-neutral-100"
                  :style="{ width: `${(e.total / maximoEtapa) * 100}%`, minWidth: e.total ? '0.5rem' : '0' }"
                >
                  <span
                    v-for="t in tramos(e, catalogoEstatus)"
                    :key="t.nombre"
                    data-segmento
                    :title="`${t.nombre}: ${t.valor}`"
                    class="h-full"
                    :style="{ width: `${(t.valor / e.total) * 100}%`, backgroundColor: colorEstatus(t.nombre) }"
                  />
                </span>
                <span class="font-semibold text-neutral-900">{{ e.total }}</span>
              </li>
            </ul>
          </article>
          <article :class="claseSeccion">
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Estatus de las etapas
            </h3>
            <p class="mb-4 text-sm text-neutral-600">
              Todas las etapas 0 a 4 de la cartera
            </p>
            <DonaGrafica
              data-dona="cartera"
              :segmentos="donaCartera"
              :total="totalCartera"
              etiqueta="Etapas"
            />
          </article>
        </div>

        <!-- Finalizadas y vencimientos -->
        <div class="grid gap-5 xl:grid-cols-2">
          <article
            data-seccion="finalizados"
            :class="claseSeccion"
          >
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Etapas finalizadas
            </h3>
            <p class="mb-3 text-sm text-neutral-600">
              Las más recientes del periodo ({{ reporte.finalizados.total }} en total)
            </p>
            <p
              v-if="reporte.finalizados.lista.length === 0"
              :class="claseVacio"
            >
              Ninguna etapa se finalizó en el periodo.
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
                      Etapa
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-100">
                  <tr
                    v-for="(f, i) in reporte.finalizados.lista"
                    :key="`${f.cliente}-${f.numero_paso}-${i}`"
                    data-finalizado-fila
                  >
                    <td class="px-3 py-2.5">
                      {{ f.cliente }}
                    </td>
                    <td class="px-3 py-2.5">
                      {{ f.numero_paso }} {{ f.etapa }}
                    </td>
                    <td class="px-3 py-2.5">
                      {{ dia(f.fecha_completada) }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>

          <article
            data-seccion="vencimientos"
            :class="claseSeccion"
          >
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Vencidos y por vencer
            </h3>
            <p class="mb-3 text-sm text-neutral-600">
              Compromisos de etapas sin finalizar: los más atrasados y los más próximos
            </p>
            <p
              v-if="reporte.vencimientos.lista.length === 0"
              :class="claseVacio"
            >
              No hay compromisos vencidos ni por vencer.
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
                      Etapa
                    </th>
                    <th class="px-3 py-2 font-medium">
                      Compromiso
                    </th>
                    <th class="px-3 py-2 text-center font-medium">
                      Situación
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-neutral-100">
                  <tr
                    v-for="(v, i) in reporte.vencimientos.lista"
                    :key="`${v.cliente}-${v.numero_paso}-${i}`"
                    data-vencimiento-fila
                  >
                    <td class="px-3 py-2.5">
                      {{ v.cliente }}
                    </td>
                    <td class="px-3 py-2.5">
                      {{ v.numero_paso }} {{ v.etapa }}
                    </td>
                    <td class="px-3 py-2.5">
                      {{ dia(v.fecha_compromiso) }}
                    </td>
                    <td class="px-3 py-2.5 text-center">
                      <span
                        data-situacion
                        class="inline-block rounded border px-2 py-0.5 text-xs"
                        :class="v.situacion === 'vencido' ? 'border-red-500 text-red-600' : 'border-amber-500 text-amber-700'"
                      >{{ v.situacion === 'vencido' ? 'Vencido' : 'Por vencer' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </div>

        <!-- Rechazo y clientes nuevos -->
        <div class="grid gap-5 xl:grid-cols-2">
          <article
            data-seccion="rechazo"
            :class="claseSeccion"
          >
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Tasa de rechazo
            </h3>
            <p class="mb-3 text-sm text-neutral-600">
              Etapas bloqueadas con motivo entre las que cambiaron de estatus en el periodo
            </p>
            <div class="mb-4 flex items-baseline gap-3">
              <p
                data-tasa
                class="font-display text-4xl font-semibold text-profundo-900"
              >
                {{ porcentaje(reporte.rechazo.tasa) }}
              </p>
              <p class="text-sm text-neutral-600">
                {{ plural(reporte.rechazo.bloqueos, 'bloqueo', 'bloqueos') }} de {{ plural(reporte.rechazo.etapas_con_cambios, 'etapa', 'etapas') }} con cambios
              </p>
            </div>
            <p
              v-if="reporte.rechazo.motivos.length === 0"
              :class="claseVacio"
            >
              No hubo bloqueos con motivo en el periodo.
            </p>
            <ul
              v-else
              class="space-y-2"
            >
              <li
                v-for="m in reporte.rechazo.motivos"
                :key="m.motivo"
                data-motivo-fila
                class="text-sm"
              >
                <div class="flex justify-between gap-3">
                  <span>{{ m.motivo }}</span>
                  <span class="font-semibold">{{ m.total }}</span>
                </div>
                <div class="mt-1 h-2 rounded-full bg-neutral-100">
                  <div
                    class="h-2 rounded-full bg-amber-400"
                    :style="{ width: `${(m.total / maximoMotivo) * 100}%` }"
                  />
                </div>
              </li>
            </ul>
          </article>

          <article
            data-seccion="nuevos"
            :class="claseSeccion"
          >
            <h3 class="font-display text-lg font-semibold text-profundo-700">
              Clientes nuevos por régimen
            </h3>
            <p class="mb-4 text-sm text-neutral-600">
              {{ plural(reporte.clientes_nuevos.total, 'cliente nuevo', 'clientes nuevos') }} en el periodo
            </p>
            <p
              v-if="reporte.clientes_nuevos.por_regimen.length === 0"
              :class="claseVacio"
            >
              No hubo clientes nuevos en el periodo.
            </p>
            <BarrasHorizontales
              v-else
              :filas="reporte.clientes_nuevos.por_regimen.map(r => ({ etiqueta: r.regimen, valor: r.total }))"
            />
          </article>
        </div>

        <!-- Trazabilidad de etapas -->
        <article
          data-seccion="trazabilidad"
          :class="claseSeccion"
        >
          <h3 class="font-display text-lg font-semibold text-profundo-700">
            Trazabilidad de etapas
          </h3>
          <p class="mb-3 text-sm text-neutral-600">
            <template v-if="reporte.trazabilidad.lista.length < reporte.trazabilidad.total">
              Últimos cambios de estatus: {{ reporte.trazabilidad.lista.length }} de {{ plural(reporte.trazabilidad.total, 'cambio', 'cambios') }} del periodo
            </template>
            <template v-else>
              {{ plural(reporte.trazabilidad.total, 'cambio', 'cambios') }} de estatus en el periodo, del más reciente al más antiguo
            </template>
          </p>
          <p
            v-if="reporte.trazabilidad.lista.length === 0"
            :class="claseVacio"
          >
            No hubo cambios de estatus en el periodo.
          </p>
          <div
            v-else
            class="overflow-x-auto"
          >
            <table :class="claseTabla">
              <thead :class="claseCabecera">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Etapa
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Cambio de estatus
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Fecha
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Asesor
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100">
                <tr
                  v-for="(c, i) in reporte.trazabilidad.lista"
                  :key="`${c.cliente}-${c.numero_paso}-${c.fecha}-${i}`"
                  data-cambio-fila
                >
                  <td class="px-3 py-2.5">
                    <span class="font-medium">{{ c.numero_paso }} {{ c.etapa }}</span>
                    <span class="block text-xs text-neutral-600">{{ c.cliente }}</span>
                  </td>
                  <td class="px-3 py-2.5">
                    <span class="flex flex-wrap items-center gap-1.5">
                      <template v-if="c.estatus_anterior">
                        <span
                          data-estatus-anterior
                          class="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-700"
                        >{{ c.estatus_anterior }}</span>
                        <UIcon
                          name="i-lucide-chevron-right"
                          class="size-3.5 text-neutral-400"
                        />
                      </template>
                      <span
                        data-estatus-nuevo
                        class="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        :style="{ backgroundColor: colorEstatus(c.estatus_nuevo) }"
                      >{{ c.estatus_nuevo }}</span>
                    </span>
                  </td>
                  <td class="px-3 py-2.5">
                    {{ dia(c.fecha) }}
                  </td>
                  <td class="px-3 py-2.5">
                    {{ c.asesor }}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>

        <!-- Avance por asesor (solo Supervisor) -->
        <article
          v-if="reporte.por_asesor"
          data-seccion="por-asesor"
          :class="claseSeccion"
        >
          <h3 class="font-display text-lg font-semibold text-profundo-700">
            Avance por asesor
          </h3>
          <p class="mb-3 text-sm text-neutral-600">
            Promedio del avance de las etapas 0 a 4 de sus clientes
          </p>
          <p
            v-if="reporte.por_asesor.length === 0"
            :class="claseVacio"
          >
            Aún no hay asesores con clientes.
          </p>
          <div
            v-else
            class="overflow-x-auto"
          >
            <table :class="claseTabla">
              <thead :class="claseCabecera">
                <tr>
                  <th class="px-3 py-2 font-medium">
                    Asesor
                  </th>
                  <th class="px-3 py-2 text-center font-medium">
                    Clientes
                  </th>
                  <th class="px-3 py-2 font-medium">
                    Avance promedio
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-neutral-100">
                <tr
                  v-for="a in reporte.por_asesor"
                  :key="a.asesor_id"
                  data-asesor-fila
                >
                  <td class="px-3 py-2.5">
                    {{ a.asesor }}
                  </td>
                  <td class="px-3 py-2.5 text-center">
                    {{ a.clientes }}
                  </td>
                  <td class="px-3 py-2.5">
                    <span class="flex items-center gap-3">
                      <span class="h-2 w-40 rounded-full bg-neutral-100"><span
                        class="block h-2 rounded-full bg-profundo-500"
                        :style="{ width: `${Math.min(100, a.avance_promedio)}%` }"
                      /></span>
                      <span class="font-semibold">{{ porcentajeDe(a.avance_promedio) }}</span>
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </article>
      </div>
    </template>
  </section>
</template>
