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
    title: 'Ayuda — Panel principal',
    subtitle: 'Resumen de tu operación en Data-Maestra.',
    what: 'El panel muestra el resumen de tu operación: solicitudes pendientes, trabajo por bandeja y actividad reciente. No es una bandeja de trabajo.',
    whyHere: 'Ves esta pantalla porque es el punto de partida después de iniciar sesión. Resume lo que requiere tu atención según tus permisos.',
    responsibility: 'Tu responsabilidad es revisar tus pendientes y entrar a la bandeja que corresponda. El panel no aprueba ni modifica nada.',
    steps: [
      'Revisa el resumen de solicitudes.',
      'Entra a cada bandeja de Trabajo pendiente para actuar.',
      'Usa Acciones rápidas para crear o consultar solicitudes.',
    ],
    doNot: [
      'No intentes aprobar desde el resumen: cada acción se hace en su bandeja.',
      'No uses el panel como prueba de auditoría: consulta Auditoría.',
    ],
    sources: [
      { label: 'Resumen', desc: 'proviene de las solicitudes y su estado actual.' },
      { label: 'Trabajo pendiente', desc: 'proviene de las colas reales de cada módulo.' },
      { label: 'Actividad reciente', desc: 'proviene de las últimas acciones registradas.' },
    ],
    next: 'El trabajo continúa en la bandeja que elijas (Solicitudes, Almacén, Aprobaciones o Contabilidad).',
    nextOwner: 'Tú, según tu rol.',
    flowStatus: 'BORRADOR',
  },
  solicitudes: {
    key: 'solicitudes',
    title: 'Ayuda — Solicitudes',
    subtitle: 'Bandeja de solicitudes de artículos.',
    what: 'Una solicitud es el pedido formal de crear u homologar un artículo. Contiene descripción, propósito, prioridad, solicitante, área y su recorrido por el flujo.',
    whyHere: 'Estás aquí para consultar el estado de las solicitudes visibles según tu rol y permisos.',
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
      { label: 'Descripción original', desc: 'proviene de la solicitud; es de solo lectura.' },
      { label: 'Grupo y subgrupo', desc: 'provienen de los catálogos oficiales de Profit.' },
      { label: 'Código propuesto', desc: 'se calcula desde la clasificación que defines.' },
      { label: 'Código de origen', desc: 'corresponde al part number informado.' },
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
      { label: 'Clasificación', desc: 'proviene del área de Almacén.' },
      { label: 'Devolución', desc: 'requiere indicar el motivo para corrección.' },
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
      { label: 'Clasificación', desc: 'proviene de Almacén.' },
      { label: 'Código Master', desc: 'se propone desde la clasificación.' },
      { label: 'Estándar y posiciones', desc: 'provienen de la información contable de Profit.' },
      { label: 'Registro Profit', desc: 'es una operación técnica posterior a tu aprobación.' },
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
};

export function getHelp(key: string): HelpEntry | undefined {
  return HELP[key];
}

export function helpKeys(): string[] {
  return Object.keys(HELP);
}
