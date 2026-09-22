import type { RequestStatus } from '../../tipos';

/**
 * Ayuda contextual — fuente central y tipada del contenido.
 * Describe el workflow REAL (BORRADOR → … → INSERTADO_PROFIT) y las
 * responsabilidades REALES por rol. No contiene secretos, credenciales,
 * SQL, servidores ni lógica de negocio: solo presentación.
 */

export interface HelpSource {
  label: string;
  desc: string;
}

export interface HelpEntry {
  key: string;
  title: string;
  subtitle: string;
  what: string;
  whyHere: string;
  responsibility?: string;
  steps: string[];
  doNot: string[];
  sources: HelpSource[];
  next: string;
  nextOwner: string;
  /** Etapa que el mini workflow destaca cuando no hay solicitud concreta. */
  flowStatus: RequestStatus;
}

const HELP: Record<string, HelpEntry> = {
  dashboard: {
    key: 'dashboard',
    title: 'Ayuda — Dashboard Gerencial',
    subtitle: 'Resumen general de la operación de Data-Maestra.',
    what: 'El Dashboard Gerencial muestra indicadores globales: volumen de solicitudes, trabajo pendiente por bandeja, actividad reciente y acceso a Todas las solicitudes. Sus números representan la operación general, no tus solicitudes personales.',
    whyHere: 'Ves esta pantalla porque tu rol tiene asignada esta vista gerencial. Tu vista principal normal es Mis solicitudes.',
    responsibility: 'Tu responsabilidad es revisar tus pendientes y entrar a la bandeja que corresponda. El panel no aprueba ni modifica nada.',
    steps: [
      'Revisa el resumen general de solicitudes.',
      'Entra a cada bandeja de Trabajo pendiente para actuar.',
      'Usa Todas las solicitudes para consultar el universo autorizado.',
    ],
    doNot: [
      'No confundas estos indicadores con tus solicitudes: para eso está Mis solicitudes.',
      'No intentes aprobar desde el resumen: cada acción se hace en su bandeja.',
      'No uses el panel como prueba de auditoría: consulta Auditoría.',
    ],
    sources: [
      { label: 'Resumen general', desc: 'proviene de todas las solicitudes del ámbito autorizado.' },
      { label: 'Trabajo pendiente', desc: 'proviene de las colas reales de cada módulo.' },
      { label: 'Actividad reciente', desc: 'proviene de las últimas acciones registradas.' },
    ],
    next: 'El trabajo continúa en la bandeja que elijas (Solicitudes, Almacén, Aprobaciones o Contabilidad).',
    nextOwner: 'Tú, según tu rol.',
    flowStatus: 'BORRADOR',
  },
  todas: {
    key: 'todas',
    title: 'Ayuda — Todas las solicitudes',
    subtitle: 'Universo completo del ámbito autorizado.',
    what: 'Todas las solicitudes permite consultar el universo completo de solicitudes disponibles para tu ámbito gerencial autorizado, con búsqueda, filtros, orden y paginación.',
    whyHere: 'Estás aquí porque tienes autorización de consulta global. Esta vista no otorga permisos de aprobación o registro.',
    steps: [
      'Filtra por estado, empresa, solicitante o búsqueda.',
      'Abre el detalle para ver el recorrido completo.',
    ],
    doNot: [
      'No uses esta vista para actuar sobre solicitudes: cada acción se hace en su bandeja.',
    ],
    sources: [
      { label: 'Listado', desc: 'proviene de las solicitudes del ámbito autorizado.' },
    ],
    next: 'Cada solicitud avanza a su siguiente etapa responsable.',
    nextOwner: 'Responsable de la etapa actual.',
    flowStatus: 'BORRADOR',
  },
  solicitudes: {
    key: 'solicitudes',
    title: 'Ayuda — Mis solicitudes',
    subtitle: 'Seguimiento de las solicitudes que has creado.',
    what: 'Mis solicitudes muestra exclusivamente tus solicitudes, en todos sus estados: en proceso, completadas, con error o rechazadas. Sus métricas coinciden siempre con tu listado personal.',
    whyHere: 'Esta es tu vista principal: aquí consultas el estado y seguimiento de lo que has creado.',
    steps: [
      'Filtra por pestaña (activas o historial) y búsqueda.',
      'Abre el detalle para ver el recorrido completo.',
      'Crea una solicitud nueva si tienes el permiso.',
    ],
    doNot: [
      'No modifiques solicitudes que ya salieron de tu etapa.',
      'No uses esta bandeja para clasificar: eso ocurre en Almacén.',
    ],
    sources: [
      { label: 'Descripción y propósito', desc: 'provienen del solicitante.' },
      { label: 'Estado y etapa', desc: 'provienen del workflow real.' },
      { label: 'Código Master', desc: 'se propone en Almacén y se valida en Contabilidad.' },
    ],
    next: 'Cada solicitud avanza a su siguiente etapa responsable (Gerente, Almacén, Encargado, Contabilidad o Profit).',
    nextOwner: 'Responsable de la etapa actual.',
    flowStatus: 'BORRADOR',
  },
  'solicitud-create': {
    key: 'solicitud-create',
    title: 'Ayuda — Nueva solicitud',
    subtitle: 'Crear una solicitud de artículo.',
    what: 'Estás creando el pedido formal para homologar un artículo. Nace en BORRADOR y al enviarse pasa a Gerente.',
    whyHere: 'Llegaste aquí con el permiso de crear solicitudes. El formulario reúne la información mínima que el flujo necesita.',
    responsibility: 'Tu responsabilidad es describir con precisión qué artículo necesitas y para qué.',
    steps: [
      'Describe el artículo con el mayor detalle posible (marca, modelo, medidas).',
      'Indica el propósito o uso del artículo.',
      'Agrega una foto referencial cuando ayude a identificarlo.',
      'Revisa el resumen y envía la solicitud.',
    ],
    doNot: [
      'No uses descripciones vagas: dificultan la clasificación.',
      'No inventes códigos: el código se genera en etapas posteriores.',
      'No adjuntes imágenes que no correspondan al artículo.',
    ],
    sources: [
      { label: 'Descripción y propósito', desc: 'los aportas tú como solicitante.' },
      { label: 'Solicitante y área', desc: 'provienen de tu sesión y organización.' },
    ],
    next: 'Al enviar, la solicitud pasa a Gerente para su aprobación.',
    nextOwner: 'Gerente del departamento.',
    flowStatus: 'BORRADOR',
  },
  'solicitud-detail': {
    key: 'solicitud-detail',
    title: 'Ayuda — Detalle de solicitud',
    subtitle: 'Recorrido y estado de una solicitud.',
    what: 'El detalle muestra la información, la clasificación, el recorrido por etapas y el registro en Profit de una solicitud concreta.',
    whyHere: 'Abriste una solicitud para consultar su estado, su historia o actuar si eres responsable de su etapa actual.',
    steps: [
      'Revisa el recorrido para saber en qué etapa está.',
      'Consulta la clasificación y la información contable.',
      'Actúa solo si la etapa actual es tu responsabilidad.',
    ],
    doNot: [
      'No edites información de etapas que ya terminaron.',
      'No confundas “devuelta” con “rechazada”: devuelta vuelve para corrección.',
    ],
    sources: [
      { label: 'Información', desc: 'proviene de la solicitud original.' },
      { label: 'Clasificación', desc: 'proviene de Almacén.' },
      { label: 'Datos contables', desc: 'provienen de Contabilidad.' },
      { label: 'Registro Profit', desc: 'proviene del registro técnico, no es edición manual.' },
    ],
    next: 'Depende de la etapa actual; el recorrido indica el siguiente responsable.',
    nextOwner: 'Responsable de la etapa actual.',
    flowStatus: 'PENDIENTE_ALMACEN',
  },
  almacen: {
    key: 'almacen',
    title: 'Ayuda — Almacén',
    subtitle: 'Bandeja de clasificación de artículos.',
    what: 'Esta bandeja reúne las solicitudes que esperan clasificación por el área de Almacén.',
    whyHere: 'Las solicitudes llegan aquí porque fueron aprobadas por el gerente del departamento y ahora corresponde clasificar el artículo.',
    responsibility: 'Tu responsabilidad en esta etapa es clasificar el artículo con los catálogos oficiales, sin alterar la solicitud original.',
    steps: [
      'Abre cada solicitud con Clasificar.',
      'Revisa la descripción original y la foto referencial.',
      'Completa la clasificación en el formulario.',
    ],
    doNot: [
      'No clasifiques solicitudes que no estén en tu bandeja.',
    ],
    sources: [
      { label: 'Solicitudes', desc: 'provienen de Gerente tras su aprobación.' },
    ],
    next: 'Al clasificar, la solicitud queda lista para tu formulario de clasificación.',
    nextOwner: 'Almacén (tú).',
    flowStatus: 'PENDIENTE_ALMACEN',
  },
  'almacen-classify': {
    key: 'almacen-classify',
    title: 'Ayuda — Clasificación',
    subtitle: 'Clasificar el artículo con catálogos oficiales.',
    what: 'Esta etapa permite clasificar el artículo utilizando la información de la solicitud y los catálogos oficiales correspondientes.',
    whyHere: 'Esta solicitud está aquí porque fue aprobada por el gerente responsable del departamento y ahora corresponde al área de Almacén realizar la clasificación.',
    responsibility: 'Tu responsabilidad en esta etapa es definir grupo, subgrupo y datos del artículo con base en los catálogos, y validar antes de aprobar.',
    steps: [
      'Revisa la información recibida y la imagen referencial.',
      'Selecciona el tipo de artículo y el grupo; luego el subgrupo del grupo.',
      'Completa categoría, marca, unidad, impuesto y part number.',
      'Guarda borrador cuando necesites pausar, sin cambiar el estado.',
      'Valida el artículo y aprueba la clasificación cuando esté completa.',
    ],
    doNot: [
      'No modifiques la descripción original de la solicitud.',
      'No inventes códigos: usa los catálogos oficiales.',
      'No modifiques información que corresponde a Contabilidad.',
      'No apruebes etapas que pertenecen a otros responsables.',
      'No registres artículos directamente en Profit.',
    ],
    sources: [
      { label: 'Descripción original', desc: 'Proviene de la solicitud; es de solo lectura.' },
      { label: 'Grupo y subgrupo', desc: 'Povienen de los catálogos oficiales de Profit.' },
      { label: 'Código propuesto', desc: 'Se calcula desde la clasificación que defines.' },
      { label: 'Código de origen', desc: 'Corresponde al part number informado.' },
    ],
    next: 'Después de aprobar, la solicitud pasa a Aprobación Almacén.',
    nextOwner: 'Encargado de Almacén.',
    flowStatus: 'PENDIENTE_ALMACEN',
  },
  'aprobacion-almacen': {
    key: 'aprobacion-almacen',
    title: 'Ayuda — Aprobación Almacén',
    subtitle: 'Revisión del Encargado de Almacén.',
    what: 'Esta etapa revisa la clasificación realizada por Almacén antes de enviarla a Contabilidad.',
    whyHere: 'Las solicitudes llegan aquí porque Almacén completó su clasificación y requieren la revisión del Encargado.',
    responsibility: 'Tu responsabilidad es verificar que la clasificación esté completa y sea coherente, sin rehacer el trabajo de clasificación.',
    steps: [
      'Abre cada caso con Revisar.',
      'Verifica grupo, subgrupo y datos del artículo.',
      'Aprueba para enviar a Contabilidad, o devuelve con el motivo.',
    ],
    doNot: [
      'No modifiques la clasificación: si hay error, devuelve al área responsable.',
      'No apruebes casos con información incompleta.',
      'No registres artículos directamente en Profit.',
    ],
    sources: [
      { label: 'Clasificación', desc: 'Proviene del área de Almacén.' },
      { label: 'Devolución', desc: 'Requiere indicar el motivo para corrección.' },
    ],
    next: 'Al aprobar, la solicitud pasa a Contabilidad.',
    nextOwner: 'Contabilidad.',
    flowStatus: 'ALMACEN_APROBADO',
  },
  aprobaciones: {
    key: 'aprobaciones',
    title: 'Ayuda — Aprobaciones de Gerencia',
    subtitle: 'Aprobación del gerente del departamento.',
    what: 'Esta bandeja presenta las solicitudes que esperan la decisión del gerente responsable del departamento solicitante.',
    whyHere: 'Las solicitudes llegan aquí porque un miembro de tu departamento las envió y requieren tu aprobación para continuar.',
    responsibility: 'Tu responsabilidad es revisar que la solicitud esté justificada y completa antes de dejarla avanzar.',
    steps: [
      'Revisa descripción, propósito y prioridad.',
      'Aprueba para enviar a Almacén.',
      'Devuelve con comentario cuando falte información.',
    ],
    doNot: [
      'Aprobar en Gerencia únicamente permite continuar el flujo: no registra nada en Profit.',
      'No apruebes solicitudes de otros departamentos.',
      'No devuelvas sin explicar qué debe corregirse.',
    ],
    sources: [
      { label: 'Solicitud', desc: 'proviene del solicitante de tu departamento.' },
    ],
    next: 'Al aprobar, la solicitud pasa a Almacén para su clasificación.',
    nextOwner: 'Almacén.',
    flowStatus: 'PENDIENTE_GERENTE',
  },
  contabilidad: {
    key: 'contabilidad',
    title: 'Ayuda — Contabilidad',
    subtitle: 'Validación contable y registro en Profit.',
    what: 'Esta etapa valida la clasificación desde el punto de vista contable y, una vez aprobada, habilita el registro técnico en Profit.',
    whyHere: 'Las solicitudes llegan aquí porque el Encargado de Almacén aprobó la clasificación y ahora corresponde la validación contable.',
    responsibility: 'Tu responsabilidad es verificar el estándar contable y las posiciones, sin asumir la clasificación que pertenece a Almacén.',
    steps: [
      'Revisa la información y la clasificación recibida.',
      'Verifica el estándar contable del grupo (Profit).',
      'Confirma el código Master propuesto.',
      'Asegura al menos una posición contable válida.',
      'Aprueba para habilitar la pestaña de Registro en Profit.',
    ],
    doNot: [
      'No cambies grupo o subgrupo: si están mal, devuelve a Almacén.',
      'No apruebes sin el estándar contable verificado.',
      'Validar no equivale a escribir en Profit: el registro es un paso posterior y protegido.',
    ],
    sources: [
      { label: 'Clasificación', desc: 'Proviene de Almacén.' },
      { label: 'Código Master', desc: 'Se propone desde la clasificación.' },
      { label: 'Estándar y posiciones', desc: 'Provienen de la información contable de Profit.' },
      { label: 'Registro Profit', desc: 'Es una operación técnica posterior a tu aprobación.' },
    ],
    next: 'Al aprobar, se habilita el registro técnico en Profit (requiere permiso de escritura).',
    nextOwner: 'Responsable del registro Profit.',
    flowStatus: 'PENDIENTE_CONTABILIDAD',
  },
  personas: {
    key: 'personas',
    title: 'Ayuda — Personas y acceso',
    subtitle: 'Usuarios, organización y acceso.',
    what: 'Esta pantalla administra quiénes usan el sistema: usuarios, su estado, su organización y la sincronización funcional con Profit.',
    whyHere: 'Estás aquí con permiso de administración para mantener el acceso correcto de cada persona.',
    steps: [
      'Busca usuarios por nombre o código.',
      'Administra cada usuario: empresa, departamento, roles y estado.',
      'Sincroniza con Profit cuando ingresen usuarios nuevos.',
      'Gestiona el cambio obligatorio de contraseña cuando corresponda.',
    ],
    doNot: [
      'No compartas cuentas entre personas.',
      'No desactives usuarios sin verificar sus pendientes.',
      'Nunca se muestran ni se editan contraseñas aquí.',
    ],
    sources: [
      { label: 'Usuarios', desc: 'provienen del sistema y de la sincronización con Profit.' },
      { label: 'Organización', desc: 'proviene de empresas y departamentos configurados.' },
    ],
    next: 'Los cambios aplican al acceso y a las bandejas que cada usuario puede ver.',
    nextOwner: 'Administración.',
    flowStatus: 'BORRADOR',
  },
  roles: {
    key: 'roles',
    title: 'Ayuda — Roles y permisos',
    subtitle: 'Qué puede hacer cada rol.',
    what: 'Un rol agrupa permisos. Los usuarios reciben permisos a través de sus roles (herencia) o por excepciones individuales (overrides). ✓ HEREDADO significa que el permiso proviene del rol. + CONCEDIDO significa que se otorgó explícitamente. − DENEGADO es una excepción que tiene prioridad sobre los demás: DENEGADO > CONCEDIDO > HEREDADO.',
    whyHere: 'Estás aquí con permiso de administración para revisar y ajustar qué puede hacer cada rol.',
    responsibility: 'Tu responsabilidad es otorgar el mínimo necesario: cada rol debe permitir su trabajo y nada más.',
    steps: [
      'Elige un rol con Administrar.',
      'Revisa sus permisos agrupados por módulo.',
      'Concede solo los permisos necesarios.',
      'Retira con confirmación cuando un permiso sobre.',
    ],
    doNot: [
      'No concedas permisos “por si acaso”.',
      'No retires permisos sin revisar qué usuarios los heredan.',
    ],
    sources: [
      { label: 'Permisos', desc: 'provienen del catálogo del sistema.' },
      { label: 'Herencia', desc: 'lo concedido al rol lo reciben sus usuarios.' },
    ],
    next: 'Los cambios aplican de inmediato a las acciones que cada usuario puede ejecutar.',
    nextOwner: 'Administración.',
    flowStatus: 'BORRADOR',
  },
  organizacion: {
    key: 'organizacion',
    title: 'Ayuda — Organización',
    subtitle: 'Empresas y departamentos.',
    what: 'La organización define empresas y departamentos. Se usa para asignar responsabilidades: cada solicitud pertenece a un departamento y la aprueba su gerente.',
    whyHere: 'Estás aquí con permiso de administración para consultar la estructura organizacional.',
    steps: [
      'Consulta empresas y sus departamentos.',
      'Verifica el gerente responsable de cada departamento.',
    ],
    doNot: [
      'No uses esta pantalla para editar solicitudes.',
    ],
    sources: [
      { label: 'Empresas y departamentos', desc: 'provienen de la configuración del sistema.' },
    ],
    next: 'La estructura se usa en solicitudes, aprobaciones y permisos.',
    nextOwner: 'Administración.',
    flowStatus: 'BORRADOR',
  },
  catalogos: {
    key: 'catalogos',
    title: 'Ayuda — Catálogos Profit',
    subtitle: 'Catálogos oficiales de solo lectura.',
    what: 'Los catálogos (grupos, subgrupos, marcas, unidades, impuestos) representan la información oficial proveniente de Profit y alimentan la clasificación.',
    whyHere: 'Estás aquí con permiso de administración para consultar la visibilidad y sincronización de los catálogos.',
    steps: [
      'Consulta cada tipo de catálogo.',
      'Verifica la sincronización con Profit.',
      'Revisa la visibilidad por empresa cuando aplique.',
    ],
    doNot: [
      'No edites valores si la pantalla los muestra como solo lectura.',
      'No uses catálogos deshabilitados para clasificar.',
    ],
    sources: [
      { label: 'Catálogos', desc: 'provienen de Profit (solo lectura).' },
      { label: 'Almacén y Contabilidad', desc: 'son los módulos que los utilizan.' },
    ],
    next: 'Los catálogos visibles alimentan los formularios de clasificación.',
    nextOwner: 'Almacén y Contabilidad.',
    flowStatus: 'PENDIENTE_ALMACEN',
  },
  'empresas-profit': {
    key: 'empresas-profit',
    title: 'Ayuda — Empresas Profit',
    subtitle: 'Disponibilidad de empresas para inserción multiempresa.',
    what: 'La lista de empresas proviene de AD_GRUP.dbo.TEmpresas. Aquí solo se habilita o deshabilita la inserción y se marca la empresa estándar; no se modifica Profit.',
    whyHere: 'Estás aquí con permiso de administración para controlar en qué empresas puede insertarse un artículo aprobado.',
    responsibility: 'Tu responsabilidad es mantener habilitadas solo las empresas operativas y una única empresa estándar.',
    steps: [
      'Revisa las empresas descubiertas.',
      'Deshabilita las que no deban recibir inserciones.',
      'Marca la empresa estándar con confirmación.',
    ],
    doNot: [
      'No deshabilites la empresa estándar sin designar otra.',
      'No uses esta pantalla para modificar datos en Profit.',
    ],
    sources: [
      { label: 'Empresas', desc: 'provienen de TEmpresas (descubrimiento dinámico).' },
      { label: 'Inserción', desc: 'la ejecuta el Analizador multiempresa por empresa.' },
    ],
    next: 'Las empresas habilitadas aparecen en el Analizador de inserción multiempresa.',
    nextOwner: 'Responsable del registro en Profit.',
    flowStatus: 'CONTABILIDAD_APROBADA',
  },
  auditoria: {
    key: 'auditoria',
    title: 'Ayuda — Auditoría',
    subtitle: 'Trazabilidad de acciones.',
    what: 'La auditoría registra quién hizo qué, cuándo y sobre qué: creación, aprobaciones, devoluciones, sincronizaciones y cambios.',
    whyHere: 'Estás aquí con permiso de consulta para investigar el historial de una solicitud o del sistema.',
    steps: [
      'Filtra por acción, actor, entidad o fechas.',
      'Abre el detalle para ver el contexto registrado.',
    ],
    doNot: [
      'La auditoría permite consultar los eventos registrados, pero no modificarlos.',
    ],
    sources: [
      { label: 'Actor', desc: 'quién realizó la acción.' },
      { label: 'Acción', desc: 'qué ocurrió (aprobación, devolución, sincronización…).' },
      { label: 'Fecha y transición', desc: 'cuándo y entre qué estados.' },
    ],
    next: 'Lo consultado sirve como evidencia; no genera acciones.',
    nextOwner: 'Quien consulta.',
    flowStatus: 'BORRADOR',
  },
  importaciones: {
    key: 'importaciones',
    title: 'Ayuda — Importaciones',
    subtitle: 'Módulo reservado.',
    what: 'Esta pantalla está reservada para futuras capacidades de importación y calidad de datos.',
    whyHere: 'Ves esta pantalla porque el módulo existe en la navegación, pero su funcionalidad aún no está implementada.',
    steps: [
      'Continúa tu trabajo en los módulos operativos disponibles.',
    ],
    doNot: [
      'No esperes resultados de importación en esta pantalla.',
    ],
    sources: [],
    next: 'Sin siguiente etapa por ahora.',
    nextOwner: '—',
    flowStatus: 'BORRADOR',
  },
  homologacion: {
    key: 'homologacion',
    title: 'Ayuda — Homologación corporativa',
    subtitle: 'Comparar contra el estándar y sincronizar empresas.',
    what: 'La homologación compara los catálogos de cada empresa destino contra la empresa estándar y propone crear los elementos faltantes o actualizar descripciones, siempre con el mismo código.',
    whyHere: 'Estás aquí con permiso de administración para comparar y, si tienes autorización de escritura, homologar.',
    steps: [
      'Selecciona las empresas destino.',
      'Usa Comparar para ver las diferencias (solo lectura).',
      'Usa Validar para comprobar que todas pueden sincronizarse.',
      'Si tienes autorización, usa Homologar para sincronizar en una sola operación.',
    ],
    doNot: [
      'No se escribe en ninguna empresa si alguna falla la validación.',
      'Los elementos que requieren revisión no se homologan automáticamente.',
    ],
    sources: [
      { label: 'Empresa estándar', desc: 'define los valores de referencia.' },
      { label: 'Auditoría', desc: 'registra comparación, validación y homologación.' },
    ],
    next: 'Con los catálogos homologados, el artículo puede registrarse con el mismo código en todas las empresas.',
    nextOwner: 'Almacén y Contabilidad.',
    flowStatus: 'CONTABILIDAD_APROBADA',
  },
  mantenimiento: {
    key: 'mantenimiento',
    title: 'Ayuda — Mantenimiento',
    subtitle: 'Borrado de datos de prueba.',
    what: 'Esta zona permite borrar, en modo pruebas, las solicitudes y su rastro operativo (datos, workflow, aprobaciones, vínculos, notificaciones y auditoría). Se conserva el sistema, los catálogos Profit, el universo histórico, los master items y las importaciones.',
    whyHere: 'Estás aquí con permiso de administración para limpiar datos de prueba cuando se acumula basura.',
    steps: [
      'Revisa la vista previa: muestra cuántos registros se borrarán por tabla.',
      'Pulsa Borrar datos de prueba y escribe BORRAR TODO para confirmar.',
      'Verifica el resumen del borrado y la nueva vista previa.',
    ],
    doNot: [
      'No uses esta pantalla en producción: requiere el flag ALLOW_TEST_RESET.',
      'No esperes recuperar lo borrado: la operación es irreversible.',
      'Profit nunca se modifica desde aquí.',
    ],
    sources: [
      { label: 'Vista previa', desc: 'conteos reales por tabla antes de borrar.' },
      { label: 'Auditoría', desc: 'el borrado queda registrado como primer evento posterior.' },
    ],
    next: 'Tras el borrado puedes volver a crear solicitudes de prueba.',
    nextOwner: 'Quien prueba.',
    flowStatus: 'BORRADOR',
  },
};

export function getHelp(key: string): HelpEntry | undefined {
  return HELP[key];
}

export function helpKeys(): string[] {
  return Object.keys(HELP);
}
