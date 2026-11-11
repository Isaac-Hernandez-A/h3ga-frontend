# F1 · Diagnóstico especializado: revisión del diseño contra el formato oficial y la base de datos

Fuentes: wireframes `docs/wireframes/Diagnostico_Especializado_F1/image 38–45.png`, el formato oficial
(`F1. Diagnóstico Especializado Actualizado.docx`, 14 secciones), la migración
`202610301006_diagnostico_especializado_f1.sql` y los contratos del Swagger (`types/api.d.ts`).

## 1. Estado del backend (lo que decide el orden de trabajo)

De las 27 rutas de `diagnosticos`, **solo 1 está implementada** (`PUT .../diagnostico/recuperacion-semanas`);
las otras 26 responden 501, incluidos los 7 catálogos (aunque las tablas y sus semillas sí existen y coinciden
con el formato oficial). Además **no existe ninguna ruta** para las tablas puente (objetivos, estrategias,
inconsistencias, gestiones y evidencias de recuperación, objetivos y criterios de M10/M40, preguntas de
conveniencia del retroactivo). Sin eso el F1 no se puede guardar: el frontend se puede construir contra los
contratos, pero solo se puede verificar cuando el backend exista.

## 2. Diferencias entre el wireframe y el formato oficial (se corrigen en el frontend)

| # | Dónde | Falta o está distinto | Corrección |
|---|-------|-----------------------|------------|
| 1 | Sección 1 y todas las listas con "Otro" | El formato oficial pide escribir el detalle ("Otro: ____"); el wireframe solo tiene la casilla. La base lo guarda en `detalle_otro`. | Al marcar "Otro" aparece un campo de texto. |
| 2 | Sección 4 | Faltan **"Revisión de inconsistencias"** (9 casillas) y la tabla **"Detalle de periodos a revisar"** (periodo, patrón, semanas esperadas/reconocidas, evidencia, acción). La base sí los tiene (`diagnostico_inconsistencias_generales`, `periodos_inconsistencias`). | Agregar ambos bloques a la vista de Semanas cotizadas. |
| 3 | Sección 3 | Falta la opción **"Otro"** y los detalles en tipo de pensión (el formato oficial lista Cesantía, Vejez, Invalidez, Viudez, Otro; la base el mismo enum). El selector del wireframe es genérico. | Selector con esas 5 opciones. |
| 4 | Secciones 3 y 6 | "Fecha estimada de vencimiento" y "¿Requiere reactivación?" aparecen dos veces; en la base es **un solo campo** cada una. Igual "Fecha de última baja" (sec. 4), "Fecha de baja más reciente" (sec. 6) y "Fecha de baja" (sec. 8): son `fecha_ultima_baja`. Y "Último salario base" (secs. 4 y 8) es `ultimo_salario_cotizado`. | Se muestran donde pide el wireframe pero comparten el mismo valor (editar uno actualiza los demás). |
| 5 | Sección 6 | "Tiempo estimado de conservación" tiene el ejemplo "4 años 2 meses", pero la base guarda **meses enteros**. | Campo numérico en meses (ej. 50) y se muestra el equivalente en años y meses. |
| 6 | Sección 3 | "Régimen probable" no tiene campo en el diagnóstico: vive en el cliente (`ley_probable_id`). "Edad actual" es calculada. | Se lee y se guarda en el cliente; edad calculada de solo lectura. |
| 7 | Sección 7 (imagen cortada) | Faltan los objetivos "Evaluar transición posterior a Modalidad 40" y "Otro", los **8 criterios de aplicabilidad** (Sí/No/Observaciones) y la **conclusión preliminar** (5 opciones). | Completar según el formato oficial. |
| 8 | Sección 8 (imagen cortada) | Faltan 2 criterios ("Entiende que M40 no otorga servicio médico", "Puede cubrir pagos mensuales adelantados") y la **conclusión preliminar** (4 opciones). | Completar: son 7 criterios. |
| 9 | Sección 9 | **No hay pantalla** para "Modalidad 40 con pago retroactivo" (sin imagen 9 entre la 43 y la 44). La base tiene `analisis_modalidad40_retroactivo` y 6 preguntas de conveniencia. | Agregar la vista con los campos del formato oficial. Pendiente que el equipo confirme el diseño. |
| 10 | Sección 11 (imagen cortada) | Faltan ingreso mensual, rentas/otras fuentes, ingreso del cónyuge, seguros, estado de salud, padecimientos, estado civil, edad y actividad del cónyuge, hijos (cuántos, edad, discapacidad), la **tabla comparativa de 3 escenarios** (8 filas), la fórmula de recuperación y la conclusión financiera. | Completar según el formato oficial. |
| 11 | Sección 10 | "Modalidad 10 por N meses" no tiene columna en `escenario_pension` (solo `meses_modalidad_40`). | Ver backend, punto B3. |
| 12 | Secciones 12 y 13 | Falta la opción "Otro" con detalle en estrategia recomendada; el plan de acción solo muestra 2 filas (el formato oficial 4, pero debe poder agregar y quitar). | Filas dinámicas con botón Agregar. |
| 13 | Encabezado | El botón dice "Diganostico inicial" (error de ortografía). "Fecha del diagnóstico" sí existe aquí (`fecha_analisis`), a diferencia del F0. | "Diagnóstico inicial"; la fecha es editable. |
| 14 | Sección 14 (Aviso y firmas) | No aparece en el wireframe. Es texto fijo y líneas de firma del PDF; la base guarda `firma_*_path`, pero las firmas se hacen en papel. | Solo va en el PDF. No se captura firma en pantalla salvo que lo pidan. |
| 15 | Sección 2 | Es una lista de 9 documentos con Sí/No y observaciones. **No hay tabla** en la base para guardarla. | Ver backend, punto B2. |

## 3. Diferencias entre el formato y la base de datos (se resuelven en el backend)

- **B1. Guardado por pasos imposible.** `diagnostico_especializado` tiene 12 columnas `NOT NULL` sin valor por omisión
  (`cotizo_antes_julio_1997`, `tipo_pension_probable`, `edad_objetivo_pension`, `tiene_conservacion_derechos`,
  `dentro_de_conservacion`, `conviene_pensionar_ahora`, `semanas_efectivas_pension`, `trabaja_cuenta_propia`,
  `conclusion_modalidad_10`, `dado_de_baja_regimen_obligatorio`, `conclusion_modalidad_40`, `justificacion_estrategia`),
  y `POST /diagnostico` las exige todas. El wizard guarda por pasos (la primera pantalla solo tiene los objetivos),
  así que no hay forma de crear el diagnóstico. Lo mismo pasa con `situacion_patrimonial` (13 columnas `NOT NULL`) y
  `escenario_pension` (`semanas_proyectadas`, `salario_promedio_proyectado`, `pension_mensual_estimada`, `incremento_mensual`).
  **Propuesta:** migración nueva que las vuelve nulables (la completitud se valida al descargar el PDF).
- **B2. Documentos requeridos del F1** (sección 2): falta tabla para "recibido Sí/No + observaciones" de los 9 documentos.
- **B3. Meses de Modalidad 10** en el escenario: falta columna (`meses_modalidad_10`).
- **B4. Rutas de tablas puente y catálogos** sin implementar (sección 1).
- **B5.** `CreateAnalisisRecuperacionSemanasDto` trae `semanas_imss_reconocidas`, que la tabla no tiene.
- **B6.** `situacion_patrimonial_hijos` guarda `numero_hijos` en cada fila de hijo: no queda claro si una fila es un hijo o un grupo.
  El formato oficial pide número de hijos, edad de cada hijo e hijos con discapacidad.

## 4. Prompt para el backend (rama `feat/actividad-4-backend`)

```text
Lee primero CLAUDE.md, apps/api/src/diagnosticos/ y db/migrations/202610301006_diagnostico_especializado_f1.sql, y
el documento docs/2026-11-11-f1-revision-diseno-y-backend.md del repositorio del frontend (secciones 1 y 3). Hay
cambios sin commit de otras tareas: no los reviertas ni los incluyas; NO hagas commit ni push. Mismo ciclo de
siempre: pruebas primero (CP-… a continuación del último de docs/pruebas-resultados.md), sin editar migraciones
existentes, solo base local, America/Cancun, errores en español, sin dependencias nuevas, nunca un 500.

Tarea: implementar el Diagnóstico Especializado (F1) para que el frontend lo capture por pasos.

A. Migración nueva (no edites la 006):
 1. Vuelve nulables las columnas NOT NULL de diagnostico_especializado (excepto id, cliente_id, asesor_id,
    fecha_analisis), de situacion_patrimonial y de escenario_pension, para poder guardar por pasos. Los DTO de
    creación/actualización quedan con todos los campos opcionales. La validación de que está completo se hará al
    descargar el PDF (responder 409 con la lista de campos faltantes).
 2. Tabla diagnostico_documentos (diagnostico_id, tipo de documento del F1, recibido BOOLEAN NULL, observaciones),
    con catálogo de los 9 documentos del formato oficial (Constancia de semanas cotizadas IMSS, Reporte de semanas
    cotizadas, Historial laboral IMSS, Estado de cuenta AFORE, Comprobantes de pagos Modalidad 10, Resoluciones,
    negativas o trámites previos, Recibos de nómina / pruebas laborales, Semanas ISSSTE o portabilidad,
    Comprobantes de pagos Modalidad 40 / 40 retroactivo).
 3. Columna meses_modalidad_10 en escenario_pension.
 4. Define con claridad situacion_patrimonial_hijos: una fila por hijo (edad, tiene_discapacidad); el número de
    hijos se calcula. Quita numero_hijos o documenta su uso.

B. Rutas (todas del Asesor dueño; Supervisor 403, sin token 401, cliente ajeno 404; el Supervisor podrá leer F1 en
   solo lectura si lo decide el contrato de permisos: déjalo como está hoy y avísame):
 1. GET/POST/PATCH /clientes/:id/diagnostico (POST crea el borrador con asesor_id = el asesor del cliente).
 2. Para cada tabla puente, un PUT que reemplaza la lista completa y un GET: objetivos (con detalle_otro),
    estrategias recomendadas, inconsistencias generales, gestiones y evidencias de recuperación, objetivos de
    Modalidad 10 y de Modalidad 40, criterios de Modalidad 10 y de Modalidad 40, preguntas de conveniencia del
    retroactivo, documentos requeridos. Rutas bajo /clientes/:id/diagnostico/…
 3. Implementa los GET que hoy dan 501: recuperacion-semanas, modalidad-40-retroactivo (GET y PUT), escenarios
    (GET/POST/PATCH, máximo 3 con orden 1 a 3), periodos-inconsistencias, plan-accion (GET/POST/PATCH y DELETE),
    situacion-patrimonial (GET/PUT) y sus hijos.
 4. Los 7 catálogos: estrategias-recomendadas, objetivos-diagnostico, tipos-inconsistencia,
    tipos-gestion-recuperacion, tipos-evidencia-recuperacion, objetivos-modalidad-10, objetivos-modalidad-40
    (y el de documentos requeridos), accesibles a los tres roles.
 5. El avance de la etapa 1 (Diagnóstico especializado) se actualiza al guardar (el wireframe muestra 0, 10, 15, 30,
    40, 60, 75, 90 %): propón la regla (porcentaje por sección completada) y documéntala.
 6. GET /clientes/:id/diagnostico/pdf: el formato F1 en PDF con el diseño de
    docs/wireframes/Diagnostico_Especializado_F1/F1. Diagnóstico Especializado Actualizado.docx (14 secciones, aviso
    de alcance y líneas de firma), del mismo modo que el PDF del F0.
 7. Corrige CreateAnalisisRecuperacionSemanasDto (quita semanas_imss_reconocidas o impleméntalo).

Terminado cuando: suite completa en verde, lint sin errores (salida real), matriz de acceso y docs/endpoints.md,
arquitectura.md y pruebas-resultados.md actualizados, y me des el contrato exacto de cada ruta (método, ruta,
cuerpo, respuestas) para que el frontend lo use. Sin commit ni push.
```

## 5. Hallazgos al construir el F1 contra el backend real (2026-11-11)

El backend del punto 4 quedó implementado (54 de 54 rutas de `diagnosticos`) y el frontend ya lo usa en `/clientes/{id}/f1`.
Quedan estos detalles:

- **Falta `DELETE /clientes/:id/diagnostico/escenarios/:escenarioId`** (responde 404). El frontend ya lo llama al
  desmarcar un escenario guardado. Mientras no exista, quitar un escenario guardado muestra un error. Prompt corto para el backend:

  ```text
  Agrega DELETE /api/v1/clientes/:clienteId/diagnostico/escenarios/:escenarioId (204; 404 si no existe o es de otro
  cliente; solo el Asesor dueño), igual que el de plan-accion. Actualiza el avance de la etapa 1, la matriz de acceso,
  docs/endpoints.md y las pruebas. Sin commit ni push.
  ```

- **El PDF exige dos campos por escenario que el formato oficial no pide**: "Semanas proyectadas" y "Salario promedio
  proyectado". Se agregaron a cada columna de escenario en el frontend; conviene confirmar con el equipo si son
  necesarios en el formato oficial.
- **`PUT situacion-patrimonial` reemplaza el registro completo**: lo que no se envía queda en null. El frontend siempre
  envía todos los campos con valor.
- "Pensión mensual base" no tiene columna: el frontend la calcula (proyectada − incremento) y no la guarda.
