**Descripción de los requerimientos funcionales.** Los requerimientos funcionales se relacionaron con las actividades operativas de H3GA, particularmente con el registro de clientes, la administración de expedientes, el seguimiento de modalidades previsionales y el control de actividades. Su identificación permitió establecer las operaciones que debían estar disponibles para los diferentes perfiles de usuario.

Para facilitar su documentación, los requerimientos funcionales se organizaron mediante identificadores individuales y descripciones que permiten reconocer las funciones previstas para cada módulo del sistema. Como se muestra en las **Tablas 1 a 10**, esta clasificación permite identificar las funcionalidades correspondientes a cada módulo y facilita su consulta y seguimiento durante el desarrollo del proyecto.

**Tabla de requerimientos del Módulo de Autenticación**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-01** | El sistema debe permitir el inicio de sesión mediante credenciales de usuario. |
| **RF-02** | El sistema debe otorgar el acceso a las funciones según el rol del usuario autenticado (asesor, Auxiliar, supervisión operativa). |

Tabla 1 Requerimientos funcionales del módulo de autenticación. Fuente: Elaboración propia

**Tabla de requerimientos del Módulo de Gestión Documental**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-03** | El sistema debe permitir almacenar, cargar y consultar los documentos personales de cada cliente, tales como CURP, acta de nacimiento, INE, comprobante de domicilio, RFC, manteniéndolos vinculados a su expediente digital. |
| **RF-04** | El sistema debe permitir almacenar y visualizar los documentos generados por el asesor durante el proceso de atención, asociándolos al expediente digital del cliente correspondiente. |
| **RF-05** | El sistema debe permitir consultar la información general de cada cliente, identificar a su asesor asignado y acceder a los documentos asociados a su expediente, de acuerdo con los permisos del usuario. |
| **RF-06** | El sistema debe permitir actualizar o sustituir los documentos almacenados en el expediente digital de un cliente cuando sea necesario, manteniendo la asociación con el cliente correspondiente. |
| **RF-07** | El sistema debe permitir validar la documentación incorporada al expediente digital de cada cliente, identificando si los documentos requeridos se encuentran completos, pendientes o requieren corrección, de acuerdo con los criterios establecidos para el trámite correspondiente. |

Tabla 2 Requerimientos funcionales del módulo de gestión documental. Fuente: Elaboración propia

**Tabla de requerimientos del Módulo de Administración de Formatos Institucionales**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-08** | El sistema debe permitir registrar formatos institucionales mediante enlaces de referencia, indicando su nombre y dependencia correspondiente. |
| **RF-09** | El sistema debe permitir cargar y almacenar físicamente formatos institucionales en archivos PDF (.pdf) y Word (.doc y .docx), validando su tipo y tamaño. |
| **RF-10** | El sistema debe permitir consultar la biblioteca de formatos institucionales registrados, acceder a sus enlaces de referencia y descargar los archivos almacenados. |
| **RF-11** | El sistema debe permitir actualizar la información de un formato institucional previamente registrado. |
| **RF-12** | El sistema debe permitir eliminar lógicamente un formato institucional registrado. |

Tabla 3 Requerimientos funcionales del módulo de administración de formatos institucionales. Fuente: Elaboración propia.

**Tabla de requerimientos del Módulo de Biblioteca de Recursos**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-13** | El sistema debe permitir consultar el catálogo de formatos externos de dependencias gubernamentales cargados por Supervisión operativa. |
| **RF-14** | El sistema debe permitir descargar directamente los archivos del catálogo en formato .doc o .pdf. |

Tabla 4 Requerimientos funcionales del módulo de biblioteca de recursos. Fuente: Elaboración propia.

**Tabla de requerimientos del Módulo de Dashboard Operativo**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-15** | El sistema debe mostrar en el dashboard operativo las fechas próximas de actividades y trámites pendientes de los clientes, presentando la información de forma diferenciada según el rol del usuario autenticado. |
| **RF-16** | El sistema debe mostrar la etapa actual de cada cliente y el estado de avance de sus procesos previsionales, permitiendo identificar los trámites en seguimiento. |

Tabla 5 Requerimientos funcionales del módulo de dashboard operativo. Fuente: Elaboración propia.

**Tabla de requerimientos del Módulo de Modalidades de Pensión**

| Código | Descripción del Requisito Funcional |
| :---- | :---- |
| **RF-17** | El sistema debe permitir registrar la modalidad de pensión aplicable al cliente (modalidad 40, modalidad 40 retroactiva, modalidad 10). |
| **RF-18** | El sistema debe permitir estructurar y consultar las etapas seleccionadas para la ejecución de la modalidad correspondiente. |
| **RF-19** | El sistema debe permitir al asesor consultar el listado de sus clientes que tengan una o más modalidades de pensión registradas, mostrando la información general y el estado de seguimiento correspondiente. |
| **RF-20** | El sistema debe permitir al asesor consultar el detalle de las modalidades registradas para cada cliente, presentando de manera diferenciada la información y el avance de cada una. |
| **RF-21** | El sistema debe validar que cada cliente tenga una sola modalidad o una combinación de dos modalidades permitida, impidiendo el registro de una tercera modalidad o de combinaciones no autorizadas. |
| **RF-22** | El sistema debe permitir consultar y actualizar de forma independiente las fases y estados de cada modalidad seleccionada, evitando que los cambios realizados en una modalidad alteren el seguimiento de otra. |
| **RF-23** | El sistema debe permitir al asesor consultar los documentos relacionados con el expediente del cliente y con la modalidad correspondiente, cuando exista una asociación documental que permita identificarla. |
| **RF-24** | El sistema debe permitir incorporar documentos al expediente durante el seguimiento de una modalidad, reutilizando los mecanismos de almacenamiento y validación documental existentes. |
| **RF-25** | El sistema debe permitir buscar y filtrar los clientes por modalidad, estado de seguimiento y fechas relevantes, respetando la propiedad de los clientes y los criterios disponibles en el modelo de datos. |

Tabla 6 Requerimientos funcionales del módulo de modalidades. Fuente: Elaboración propia.

**Tabla de requerimientos del Módulo de Proceso Final**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-26** | El sistema debe permitir al asesor registrar y actualizar el avance de las etapas correspondientes a los trámites ante instituciones de seguridad social, mediante la modificación de su estado, porcentaje de progreso, acciones pendientes y fechas de compromiso. |
| **RF-27** | El sistema debe permitir al asesor registrar y consultar la información correspondiente al ingreso formal de la solicitud de pensión, incluyendo los datos institucionales, fechas y documentos asociados al trámite. |
| **RF-28** | El sistema debe permitir al asesor registrar y dar seguimiento a los diferentes escenarios de resolución del trámite de pensión. |
| **RF-29** | El sistema debe permitir al asesor consultar la información de cobranza final asociada al cierre del proceso de pensión, mediante los registros disponibles en el sistema. |
| **RF-30** | El sistema debe permitir al asesor visualizar un listado de sus clientes que cuenten con etapas activas o registradas del Proceso Final, mostrando información general y el estado de seguimiento correspondiente. |
| **RF-31** | El sistema debe permitir al asesor consultar el detalle del Proceso Final de cada cliente, presentando de manera independiente las etapas que le correspondan y su información de seguimiento. |
| **RF-32** | El sistema debe permitir al asesor consultar el estado y porcentaje de avance de cada etapa del Proceso Final, conforme a las reglas de seguimiento establecidas. |
| **RF-33** | El sistema debe permitir al asesor registrar y actualizar las acciones pendientes y fechas compromiso de cada etapa, con la finalidad de facilitar la organización y continuidad del seguimiento de los trámites. |
| **RF-34** | El sistema debe permitir al asesor consultar los documentos asociados a cada etapa del Proceso Final, facilitando su identificación y acceso mediante la integración con el expediente documental del cliente. |
| **RF-35** | El sistema debe permitir al asesor buscar y filtrar clientes de acuerdo con su información general, las etapas aplicables y el estado de sus trámites, con la finalidad de agilizar su localización y seguimiento. |
| **RF-36** | El sistema debe permitir al asesor visualizar indicadores generales del Proceso Final, incluyendo la cantidad de etapas en proceso, finalizadas, restringidas y con acciones vencidas, así como los clientes que tengan compromisos programados. |
| **RF-37** | El sistema debe permitir al asesor consultar los compromisos próximos y vencidos de las etapas correspondientes a sus clientes, considerando las fechas registradas durante el seguimiento de cada trámite. |
| **RF-38** | El sistema debe permitir al asesor consultar y actualizar la información institucional asociada a las etapas del Proceso Final, incluyendo folios, fechas de solicitud, resoluciones y observaciones, según corresponda al trámite. |
| **RF-39** | El sistema debe permitir al asesor consultar el progreso general del Proceso Final de cada cliente, considerando únicamente las etapas que le correspondan y los avances registrados en cada una de ellas. |

Tabla 7 Requerimientos funcionales del módulo de proceso final. Fuente: Elaboración propia.

**Tabla de requerimientos del Módulo de Servicios Complementarios**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-40** | El sistema debe permitir al asesor registrar una solicitud de servicio complementario asociada a un cliente existente, de manera independiente al proceso de gestión de pensión. |
| **RF-41** | El sistema debe permitir consultar el catálogo de servicios complementarios (Mejoravit, Apoyo por Desempleo, préstamos a pensionados y Plan Privado de Retiro), permitiendo al asesor seleccionar el servicio que considere adecuado para el cliente. |
| **RF-42** | El sistema debe permitir registrar un servicio distinto o menos común, capturando su nombre y una descripción libre. |
| **RF-43** | El sistema debe mostrar un formulario general de seguimiento del servicio complementario, permitiendo al asesor registrar el estado, la acción pendiente, la fecha compromiso y las observaciones correspondientes. |
| **RF-44** | El sistema debe permitir consultar, buscar y filtrar las solicitudes de servicios complementarios registradas por el asesor, así como visualizar su información detallada. |
| **RF-45** | El sistema debe permitir actualizar y guardar los datos de seguimiento de una solicitud de servicio complementario, conservando la información de la última actualización para su posterior consulta. |
| **RF-46** | El sistema debe permitir al asesor eliminar una solicitud de servicio complementario en cualquier momento, sin afectar el registro del cliente ni su expediente digital. |
| **RF-47** | El sistema debe permitir que cada cliente tenga únicamente un servicio complementario activo a la vez, habilitando el registro de una nueva solicitud cuando el servicio anterior haya finalizado. |
| **RF-48** | El sistema debe permitir al asesor cambiar el servicio complementario asignado a un cliente, solicitando previamente la confirmación de la acción y advirtiendo que se reiniciará la información de seguimiento del servicio anterior, sin afectar los documentos almacenados en el expediente digital del cliente. |
| **RF-49** | El sistema debe permitir gestionar el estado de cada servicio complementario mediante un flujo de seguimiento independiente, considerando los estados Por iniciar, En proceso cliente, Proceso asesor, Proceso instituto y Finalizado. |
| **RF-50** | El sistema debe permitir cargar, consultar y gestionar los documentos asociados a un servicio complementario, vinculándolos al expediente digital del cliente. |
| **RF-51** | El sistema debe permitir consultar las actividades de agenda relacionadas con el seguimiento de un servicio complementario. |
| **RF-52** | El sistema debe permitir al asesor registrar alertas asociadas a un servicio complementario, indicando el motivo y la fecha correspondiente. |
| **RF-53** | El sistema debe calcular, actualizar y visualizar automáticamente el porcentaje de avance del servicio complementario en función del estado de seguimiento seleccionado por el asesor, de manera independiente al proceso de gestión de pensión. |

Tabla 8 Requerimientos funcionales del módulo de servicios complementarios. Fuente: Elaboración propia.

**Tabla de requerimientos de la Migración y Consolidación de Datos**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-54** | El sistema debe permitir consolidar la información de clientes previamente almacenada en archivos de Excel hacia la base de datos del sistema. |
| **RF-55** | El proceso de migración debe permitir extraer y transformar la información de los archivos de Excel mediante un servicio desarrollado con NestJS y SheetJS, adaptando los datos a la estructura requerida por la base de datos PostgreSQL. |

Tabla 9 Requerimientos funcionales de migración y consolidación de información. Fuente: Elaboración propia.

**Tabla de requerimientos del módulo de Gestión de Auxiliares**

| Código | Descripción del Requisito Funcional |
| :---: | :---- |
| **RF-58** | El sistema debe permitir al asesor asignar y autorizar auxiliares a los clientes bajo su responsabilidad. |
| **RF-57** | El sistema debe permitir consultar las asignaciones de auxiliares por cliente, identificando cuáles se encuentran activas. |
| **RF-59** | El sistema debe permitir al asesor crear tareas dirigidas a un Auxiliar asignado al cliente, especificando el título y las instrucciones correspondientes. |
| **RF-60** | El sistema debe permitir al Auxiliar consultar las tareas que le han sido asignadas, identificando el cliente relacionado, las instrucciones y el estado de cada tarea. |
| **RF-61** | El sistema debe permitir al auxiliar elaborar y cargar documentos solicitados por el asesor, vinculándolos con el cliente y la tarea correspondiente. |
| **RF-62** | El sistema debe permitir al auxiliar descargar, editar y actualizar los archivos oficiales y técnicos relacionados con la gestión documental de los clientes, respetando sus permisos. |
| **RF-63** | El sistema debe permitir al asesor consultar los documentos enviados por el auxiliar y realizar su revisión. |
| **RF-64** | El sistema debe permitir al asesor aprobar un documento o marcarlo como no validado, registrando observaciones cuando requiera correcciones. |
| **RF-65** | El sistema debe permitir al auxiliar atender las observaciones del asesor mediante la carga de nuevas versiones del documento, conservando las versiones anteriores para mantener el historial de revisión. |
| **RF-66** | El sistema debe permitir al asesor consultar el estado de revisión de los documentos enviados por el auxiliar, identificando aquellos pendientes, no validados, validados o cancelados. |
| **RF-67** | El sistema debe permitir al auxiliar eliminar únicamente los archivos que haya generado, respetando las restricciones de propiedad y conservación documental. |
| **RF-68** | El sistema debe permitir actualizar el estado de las tareas asignadas, identificando aquellas pendientes, completadas o canceladas. |

Tabla 10 Requerimientos funcionales de gestión de auxiliares. Fuente: Elaboración propia

**Descripción de los requerimientos no funcionales.** Los requerimientos no funcionales se enfocaron en establecer las condiciones técnicas y de calidad necesarias para el funcionamiento del sistema web. Entre los aspectos considerados se encuentran la seguridad de la información, la disponibilidad del sistema, el rendimiento de las operaciones y la facilidad de uso de las interfaces.

Estas características resultan relevantes debido a que la plataforma está destinada a administrar información personal y documentos relacionados con los procesos previsionales de los clientes. Por ello, se contempló la necesidad de incorporar mecanismos de control de acceso, mantener la integridad de los registros y proporcionar una experiencia de uso adecuada para los perfiles operativos de la empresa.

En la **Tabla 11** se presentan los requerimientos no funcionales, organizados de acuerdo con las condiciones técnicas consideradas para el desarrollo del sistema.

| Código | Descripción de la Funcionalidad |
| :---: | :---- |
| **RNF-01** | El sistema debe mostrar tiempos de respuesta no mayores a 3 segundos en operaciones de consulta, como listados de clientes, documentos y calendario, y no mayores a 5 segundos en operaciones de generación de reportes PDF. |
| **RNF-02** | Escalabilidad: El sistema debe estar diseñado para soportar el crecimiento en el número de clientes más allá de los 100 actuales, así como el incremento en la cantidad de usuarios (asesores, auxiliares, supervisor operativo), utilizando la infraestructura de DigitalOcean para la base de datos y el almacenamiento de documentos, sin afectar el rendimiento. |
| **RNF-03** | Usabilidad: deberá contar con una interfaz intuitiva, clara y consistente que permita a los usuarios con roles de asesor, Auxiliar y supervisor operativo realizar las tareas de registro, consulta y actualización de información de clientes, de acuerdo con sus permisos. |
| **RNF-04** | Trazabilidad: El sistema debe garantizar trazabilidad sobre las acciones relevantes realizadas por los usuarios, incluyendo cambios de etapa y operaciones sobre documentos, permitiendo identificar quién realizó cada acción y cuándo se ejecutó, con el fin de mantener control y responsabilidad sobre la información gestionada. |
| **RNF-05** | Disponibilidad de documentos: El sistema deberá garantizar el almacenamiento centralizado de los documentos personales de los clientes y de los archivos generados por los asesores, vinculándolos a sus expedientes digitales y manteniéndolos disponibles para usuarios autorizados. Asimismo, debe contemplar respaldos periódicos de PostgreSQL y DigitalOcean Spaces. |

Tabla 11 Requerimientos no funcionales. Fuente: Elaboración propia

