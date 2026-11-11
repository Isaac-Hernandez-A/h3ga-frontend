import { CLIENTE } from './expediente-datos'

// Catálogos del F1 con los mismos nombres y ids que las semillas del backend.
const lista = (nombres: string[]) => nombres.map((nombre, i) => ({ id: i + 1, nombre }))

export const CAT_OBJETIVOS = lista(['Pensionarse lo antes posible', 'Maximizar pensión mensual', 'Negativa de pensión', 'Recuperar semanas no reconocidas', 'Reactivar conservación de derechos', 'Mejorar salario promedio', 'Evaluar Modalidad 40', 'Evaluar Modalidad 10 / trabajador independiente', 'Evaluar pago retroactivo de Modalidad 40', 'Regularizar historial IMSS', 'Determinar si conviene seguir trabajando', 'Otro'])
export const CAT_ESTRATEGIAS = lista(['Pensionarse sin cambios', 'Solicitar recuperación/aclaración de semanas', 'Corregir datos personales o NSS', 'Inscribirse a Modalidad 10', 'Inscribirse a Modalidad 40', 'Inscribirse a Modalidad 40 con pago retroactivo', 'Reingresar o regularizar Modalidad 40', 'Esperar y seguir cotizando con patrón', 'Estrategia mixta', 'No se recomienda realizar aportación adicional', 'Otro'])
export const CAT_INCONSISTENCIAS = lista(['Hay periodos laborados no reconocidos', 'Hay duplicidad de NSS', 'Hay homonimia o datos personales incorrectos', 'Hay semanas descontadas sin explicación clara', 'Hay periodos con salario menor al real', 'Hay patrón desaparecido o sin registros completos', 'Hay posible portabilidad ISSSTE-IMSS', 'No se detectan inconsistencias relevantes', 'Otro'])
export const CAT_GESTIONES = lista(['Aclaración de semanas cotizadas ante IMSS', 'Recuperación de semanas cotizadas ante PNT', 'Corrección de datos personales', 'Unificación de NSS', 'Revisión de semanas descontadas', 'Búsqueda de evidencia patronal', 'Portabilidad ISSSTE-IMSS', 'Otro'])
export const CAT_EVIDENCIAS = lista(['Recibos de nómina', 'Constancias laborales', 'Hojas rosas / avisos afiliatorios', 'Estados de cuenta AFORE / SAR', 'Contratos laborales', 'Credenciales o documentos del patrón', 'Declaraciones fiscales o comprobantes de pago', 'Otro'])
export const CAT_M10 = lista(['Tener cobertura médica y prestaciones', 'Seguir generando semanas', 'Reactivar derechos', 'Mejorar continuidad de cotización', 'Evaluar transición posterior a Modalidad 40', 'Otro'])
export const CAT_M40 = lista(['Aumentar salario promedio', 'Completar semanas faltantes', 'Mejorar pensión Ley 73', 'Mantener cotización para pensión', 'Reingresar tras baja por mora', 'Otro'])
export const CAT_DOCUMENTOS = lista(['Constancia de semanas cotizadas IMSS', 'Reporte de semanas cotizadas', 'Historial laboral IMSS', 'Estado de cuenta AFORE', 'Comprobantes de pagos Modalidad 10', 'Resoluciones, negativas o trámites previos', 'Recibos de nómina / pruebas laborales', 'Semanas ISSSTE o portabilidad', 'Comprobantes de pagos Modalidad 40 / 40 retroactivo'])
export const LEYES_F1 = lista(['Ley 73', 'Ley 97', 'Décimo Transitorio ISSSTE', 'Cuenta Individual ISSSTE', 'Mixto/revisar', 'No determinado'])

export const ASESOR_ID = '16699b14-2d83-4fab-9d9d-1f4f16131f61'

const vacio = {
  fecha_primera_cotizacion: null, cotizo_antes_julio_1997: null, tipo_pension_probable: null, edad_objetivo_pension: null, comentarios_cliente: null,
  observaciones_regimen: null, fecha_ultima_baja: null, ultimo_salario_cotizado: null, fecha_vencimiento_conservacion: null, tiene_conservacion_derechos: null,
  tiempo_estimado_conservacion_meses: null, dentro_de_conservacion: null, requiere_reactivacion: false, conviene_pensionar_ahora: null, comentarios_conservacion: null,
  semanas_reconocidas_al_baja: null, semanas_descontadas: 0, semanas_reintegradas: 0, semanas_efectivas_pension: null, semanas_requeridas_pension: null,
  trabaja_cuenta_propia: null, actividad_economica: null, ingreso_mensual_aproximado: null, conclusion_modalidad_10: null, comentarios_modalidad_10: null,
  dado_de_baja_regimen_obligatorio: null, conclusion_modalidad_40: null, salario_propuesto_m40: null, meses_propuestos_m40: null, evalua_retroactivo_m40: false,
  comentarios_modalidad_40: null, justificacion_estrategia: null, siguiente_paso_sugerido: null, conclusion_financiera: null,
}

export const DIAGNOSTICO = { id: 'f1000000-0000-4000-8000-000000000001', cliente_id: CLIENTE.id, fecha_analisis: '2026-11-11', asesor_id: ASESOR_ID, ...vacio }
export { vacio as DIAGNOSTICO_VACIO }
