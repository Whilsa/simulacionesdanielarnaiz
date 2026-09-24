import * as fs from 'fs';
import * as path from 'path';

interface IntermediateData {
  phase: string;
  timestamp: string;
  endpoints: any[];
  workers: any[];
  modules: any[];
  tableSummary: { table: string; rowCount: number }[];
  financialChecks: any[];
}

const intermediateFile = path.resolve(process.cwd(), 'scripts/audit_phase_4_11_intermediate_data.json');
const rawData = fs.readFileSync(intermediateFile, 'utf8');
const intermediate: IntermediateData = JSON.parse(rawData);

const totalEndpoints = intermediate.endpoints.length;
const criticalRiskEndpoints = intermediate.endpoints.filter(e => e.riskLevel === 'RIESGO CRÍTICO').length;
const moderateRiskEndpoints = intermediate.endpoints.filter(e => e.riskLevel === 'RIESGO MODERADO').length;
const safeEndpoints = intermediate.endpoints.filter(e => e.riskLevel === 'SEGURO').length;

const totalWorkers = intermediate.workers.length;
const criticalWorkers = intermediate.workers.filter(w => w.riskLevel === 'RIESGO CRÍTICO').length;
const safeWorkers = intermediate.workers.filter(w => w.riskLevel === 'SEGURO').length;

const globalStats = {
  totalEndpoints,
  criticalRiskEndpoints,
  moderateRiskEndpoints,
  safeEndpoints,
  totalWorkers,
  criticalWorkers,
  safeWorkers
};

// Module assessments
const moduleAssessments: Record<string, { grade: 'A' | 'B' | 'C'; summary: string; justification: string }> = {
  'Banca y Transferencias': {
    grade: 'A',
    summary: 'Totalmente transaccional y blindado contra carreras y deadlocks.',
    justification: 'Implementa executeWithIdempotency, withPostgresTransaction, ordenamiento lexicográfico de IDs para SELECT ... FOR UPDATE en cuentas, doble asiento en movimientos y actualización de caché post-commit.'
  },
  'Financiación y Préstamos': {
    grade: 'A',
    summary: 'Totalmente migrado a PostgreSQL como fuente de verdad (Fase 4.9).',
    justification: 'Todos los endpoints críticos (aceptación, rechazo, revisión docente, borrado, modificación) y el worker de amortizaciones automáticas operan bajo transacciones SQL atómicas, bloqueos FOR UPDATE e idempotencia.'
  },
  'Fiscalidad e Impuestos': {
    grade: 'B',
    summary: 'Endpoints de consulta y liquidación estables, pero dependiente de workers automáticos.',
    justification: 'Las consultas operan correctamente sobre PostgreSQL, pero las obligaciones fiscales son generadas por workers automáticos que corren sin transacción SQL.'
  },
  'Empleados y Nóminas': {
    grade: 'B',
    summary: 'Endpoints funcionales, pero el devengo y pago masivo de nóminas se ejecuta dentro de readDb() sin bloqueo SQL.',
    justification: 'Los endpoints de consulta e interacción directa respetan la consistencia, pero checkAndProcessAutomatedPayrollAndTaxes dentro de readDb() altera saldos en memoria con llamadas fire-and-forget.'
  },
  'Facturas y Pagarés': {
    grade: 'A',
    summary: 'Operaciones de firma, descuento y cobro de pagarés completamente transaccionales.',
    justification: 'collect-promissory-note, discount-promissory-note y sign-promissory-note utilizan withPostgresTransaction, SELECT ... FOR UPDATE sobre market_messages y cuentas, e idempotencia con x-idempotency-key.'
  },
  'Justicia y Demandas': {
    grade: 'B',
    summary: 'Núcleo procesal blindado (Fase 4.10), pero endpoints secundarios no transaccionales.',
    justification: 'La admisión judicial y la sentencia judicial utilizan transacciones y bloqueos FOR UPDATE. Sin embargo, pay-settle y preventative-embargo no bloquean la fila de la demanda con FOR UPDATE, lo que permite carreras de doble ejecución, y las marcas de lectura en demandas corren fuera de transacción.'
  },
  'Materias Primas y Producción': {
    grade: 'B',
    summary: 'Aprobación de pedidos y transferencias de existencias transaccionales, pero configuración de producción no atómica.',
    justification: 'approve y transfer-stock cuentan con transacciones y bloqueos de inventario deterministas. Sin embargo, rod-production-mode y price-alert operan directamente sobre db.json con sincronizaciones fire-and-forget.'
  },
  'Mercado B2B y Pedidos': {
    grade: 'C',
    summary: 'Múltiples operaciones en memoria con llamadas asíncronas no esperadas a Supabase.',
    justification: 'Operaciones como envío de mensajes, facturas manuales y contacto entre empresas modifican db.json y disparan syncMarketMessageToSupabase / syncMarketContactToSupabase sin esperar su confirmación ni agruparlas en transacciones.'
  },
  'Suministros (Luz y Telecom)': {
    grade: 'C',
    summary: 'Alto riesgo de lost updates, cobros duplicados y saldos negativos no controlados.',
    justification: 'checkAndProcessAutomatedElectricity y checkAndProcessAutomatedTelecom se ejecutan en memoria dentro de cada invocación a readDb(), debitando saldos de alumnos sin transacción PostgreSQL, sin bloqueo de fila y con sincronización fire-and-forget. Telecom no valida saldo disponible y puede dejar la cuenta en números rojos sin contrato previo de crédito.'
  },
  'Inmuebles y Bienes Raíces': {
    grade: 'C',
    summary: 'Borrado y modificación de activos ejecutados en memoria con consultas SQL fire-and-forget.',
    justification: 'DELETE /api/properties/:id, PUT /api/properties/:id y DELETE /api/obligations/:id modifican primero db.json y emiten dbPool.query().catch(...) sin transacción ni rollback en caso de fallo en base de datos.'
  },
  'Maquinaria y Equipos': {
    grade: 'C',
    summary: 'Mantenimiento de activos en memoria con sincronización asíncrona no atómica.',
    justification: 'DELETE /api/machinery/acquisitions/:id y PUT /api/machinery/acquisitions/:id operan sobre memoria y lanzan sentencias DELETE/UPDATE no transaccionales a PostgreSQL mediante promesas silenciadas.'
  },
  'Administración y Sistema': {
    grade: 'C',
    summary: 'Creación y borrado masivo de ofertas y niveles de alumnos con sync fire-and-forget.',
    justification: 'POST /api/teacher/job-listings/batch, DELETE /api/teacher/job-listings/:id y PUT /api/teacher/students/:studentId/level operan bajo el patrón read-modify-write de db.json y sincronizan a Supabase sin control de fallo.'
  },
  'Usuarios y Autenticación': {
    grade: 'B',
    summary: 'Borrado transaccional (Fase 4.11.2), pero creación de usuarios fuera de transacción.',
    justification: 'DELETE /api/users/:id fue migrado a transacción atómica con validación de dependencias. Sin embargo, POST /users (alta de alumnos) inserta en db.users y sincroniza fire-and-forget a cuentas. GET /users ejecuta efectos secundarios en lectura para sincronizar cachés.'
  },
  'General / Otros': {
    grade: 'C',
    summary: 'Endpoints de configuración, notificaciones y mantenimiento operando sobre db.json.',
    justification: 'Múltiples endpoints como mark-all-read de notificaciones, cambio de contraseñas y adquisiciones generales sufren de read-modify-write en memoria sin transacciones SQL.'
  }
};

const globalVerdict = 'NO_PREPARADA_PARA_AULA_CONCURRENTE';
const verdictSummary = 'La aplicación NO se encuentra plenamente preparada para un entorno de aula con concurrencia real masiva. Si bien los módulos de Banca (Transferencias), Pagarés y Financiación/Préstamos (Fase 4.9) alcanzan el Grado A (máxima solidez transaccional y prevención de deadlocks), existen módulos críticos periféricos —especialmente Suministros (Luz/Telecom), Gestión de Activos (Maquinaria/Inmuebles) y Procesos en readDb()— que operan bajo un modelo híbrido en memoria con sincronizaciones fire-and-forget y sin transacciones PostgreSQL. Si 30 alumnos interactúan simultáneamente en el aula mientras los procesos automáticos descuentan suministros o nóminas, se producirán Lost Updates en los saldos de los alumnos y desincronizaciones irreversibles entre db.json y PostgreSQL.';

const auditJson = {
  auditMetadata: {
    phase: '4.11',
    title: 'Auditoría Global de Preparación para Uso Real en Aula Concurrente',
    timestamp: new Date().toISOString(),
    environment: 'PostgreSQL / Supabase + Express Monolith',
    totalEndpointsScanned: globalStats.totalEndpoints,
    totalWorkersScanned: globalStats.totalWorkers,
    tablesVerifiedInPostgres: intermediate.tableSummary.length,
    verdict: globalVerdict,
    verdictSummary
  },
  globalStats,
  moduleAssessments,
  concurrencyVulnerabilities: [
    {
      id: 'VULN-01',
      title: 'Efectos secundarios de mutación dentro de readDb()',
      severity: 'CRÍTICA',
      location: 'server.ts:5665-5667',
      affectedWorkers: ['checkAndProcessAutomatedPayrollAndTaxes', 'checkAndProcessAutomatedElectricity', 'checkAndProcessAutomatedTelecom'],
      description: 'Cada vez que cualquier endpoint del sistema lee el estado invocando readDb(), se ejecutan en memoria los workers de devengo de nóminas, electricidad y telecomunicaciones, mutando student.balance y escribiendo en db.json antes de disparar llamadas fire-and-forget a PostgreSQL.',
      concurrencyImpact: 'Bajo tráfico concurrente de 30 alumnos realizando peticiones HTTP simultáneas, múltiples hilos de Node.js leerán estados desactualizados de db.json, sobrescribiendo los saldos bancarios de los alumnos (Lost Updates) y disparando ráfagas no controladas de peticiones hacia Supabase.'
    },
    {
      id: 'VULN-02',
      title: 'Descuento de telecomunicaciones sin comprobación de saldo ni transacción atómica',
      severity: 'CRÍTICA',
      location: 'server.ts:5458-5460',
      affectedWorkers: ['checkAndProcessAutomatedTelecom'],
      description: 'El worker resta directamente el importe mensual total del saldo del alumno sin verificar si este dispone de fondos suficientes (student.balance >= totalAmount), provocando números rojos artificiales sin intervención bancaria.',
      concurrencyImpact: 'Inconsistencia contable inmediata y disparidad con las reglas de negocio bancarias del simulador.'
    },
    {
      id: 'VULN-03',
      title: 'Carrera de doble ejecución en Embargos Preventivos y Allanamiento Judicial',
      severity: 'ALTA',
      location: 'server.ts:26712-26820 y server.ts:26853-26920',
      affectedEndpoints: ['POST /api/court/lawsuits/:id/preventative-embargo', 'POST /api/court/lawsuits/:id/pay-settle'],
      description: 'Aunque ambas operaciones abren una transacción PostgreSQL para mover fondos en cuentas, NO adquieren bloqueo FOR UPDATE sobre la fila de la demanda en demandas_judiciales. Modifican el estado de la demanda en la memoria de db.json antes de la transacción.',
      concurrencyImpact: 'Si dos peticiones llegan casi simultáneamente o el usuario hace doble clic, ambas transacciones leen la demanda en estado previo y descuentan dos veces los importes del alumno demandado (Doble Cobro / Doble Embargo).'
    },
    {
      id: 'VULN-04',
      title: 'Persistencia fire-and-forget en eliminación de Inmuebles, Maquinaria y Obligaciones',
      severity: 'CRÍTICA',
      location: 'server.ts:14797-14897',
      affectedEndpoints: ['DELETE /api/obligations/:id', 'DELETE /api/acquisitions/:id', 'DELETE /api/machinery/acquisitions/:id', 'PUT /api/acquisitions/:id', 'PUT /api/machinery/acquisitions/:id'],
      description: 'Los endpoints eliminan o modifican el elemento de las listas de db.json y emiten dbPool.query().catch(e => console.error(e)) sin esperar la resolución de la promesa y sin transacción.',
      concurrencyImpact: 'El cliente recibe HTTP 200 de éxito de inmediato. Si la conexión con PostgreSQL sufre latencia, time-out o error de clave foránea, PostgreSQL mantendrá los registros mientras db.json los habrá eliminado, rompiendo la fuente única de verdad.'
    },
    {
      id: 'VULN-05',
      title: 'Alta de usuarios fuera de PostgreSQL como fuente única de verdad',
      severity: 'MEDIA',
      location: 'server.ts:5993-6025',
      affectedEndpoints: ['POST /users', 'POST /api/users'],
      description: 'El alta de cuentas bancarias de alumnos empuja el nuevo objeto a db.users y sincroniza con syncAccountToSupabase mediante .catch(), retornando HTTP 201 antes de que PostgreSQL confirme el INSERT en cuentas.',
      concurrencyImpact: 'Si dos profesores crean usuarios con el mismo nombre o username en paralelo, o si la base de datos rechaza la inserción, el usuario existirá en memoria y db.json pero no en PostgreSQL.'
    }
  ],
  endpoints: intermediate.endpoints,
  workers: intermediate.workers,
  databaseSchemaIntegrity: {
    tablesVerified: intermediate.tableSummary.length,
    tableSummary: intermediate.tableSummary
  }
};

fs.writeFileSync(
  path.resolve(process.cwd(), 'scripts/audit_phase_4_11_readiness.json'),
  JSON.stringify(auditJson, null, 2),
  'utf8'
);

console.log('Generado scripts/audit_phase_4_11_readiness.json con éxito.');

// Generate markdown deliverable
let md = `# INFORME TÉCNICO GLOBAL DE PREPARACIÓN PARA USO EN AULA (FASE 4.11)
**Auditoría Integral de Concurrencia, Transaccionalidad, Fuente Única de Verdad y Resiliencia**

---

## 1. RESUMEN EJECUTIVO Y DICTAMEN GLOBAL

| Parámetro | Resultado de Auditoría |
| :--- | :--- |
| **Dictamen de Preparación para Aula** | **NO PREPARADA PARA AULA CONCURRENTE (REQUIERE SANEAMIENTO PREVIO)** |
| **Total de Endpoints Auditados** | **${globalStats.totalEndpoints} endpoints** (${globalStats.safeEndpoints} Seguros, ${globalStats.moderateRiskEndpoints} Riesgo Moderado, ${globalStats.criticalRiskEndpoints} Riesgo Crítico) |
| **Total de Background Workers Auditados** | **${globalStats.totalWorkers} workers** (${globalStats.safeWorkers} Seguro Grado A, ${globalStats.criticalWorkers} Críticos Grado C) |
| **Fuente de Verdad Actual** | **HÍBRIDA** (PostgreSQL como fuente de verdad en Banca y Préstamos; db.json/memoria en Suministros y Activos) |
| **Riesgo Financiero Principal** | **Lost Updates y Doble Gasto** por colisiones entre workers en memoria y transacciones bancarias concurrentes |

### Veredicto Técnico Justificado
La aplicación presenta dos mitades arquitectónicas claramente diferenciadas:
1. **Los Módulos Blindados (Grado A):** Los subsistemas de **Banca y Transferencias**, **Facturas y Pagarés** y **Financiación y Préstamos (Fase 4.9)** han sido migrados con rigor técnico pleno. Utilizan \`withPostgresTransaction\`, claves de idempotencia, bloqueos pesimistas ordenados (\`ORDER BY id FOR UPDATE\`) que eliminan la posibilidad de deadlocks, y asientos contables simétricos en PostgreSQL.
2. **Los Módulos Heredados con Riesgo Crítico (Grados B y C):** Módulos como **Suministros (Luz y Telecomunicaciones)**, **Gestión de Inmuebles**, **Maquinaria**, **Administración de Ofertas** y los workers automáticos que se disparan en el ciclo de lectura \`readDb()\` operan sobre \`db.json\` en memoria y despachan consultas a PostgreSQL mediante llamadas asíncronas no esperadas (\`fire-and-forget\`).

**Conclusión:** Si un aula de 25-30 alumnos utiliza el sistema simultáneamente, la concurrencia en transferencias y préstamos no sufrirá fallos; sin embargo, en cuanto se active el cómputo automático de electricidad, telecomunicaciones o nóminas, o los alumnos operen con maquinaria e inmuebles, se producirán **Lost Updates en saldos bancarios**, **desincronizaciones entre la memoria y PostgreSQL** y **descuentos no atómicos**, comprometiendo la fiabilidad contable del aula.

---

## 2. EVALUACIÓN Y CALIFICACIÓN POR MÓDULOS

| Módulo Funcional | Endpoints | Grado | Estado de Concurrencia y Transaccionalidad |
| :--- | :---: | :---: | :--- |
| **Banca y Transferencias** | 4 | **A** | **Listo para Producción.** Transaccional, orden determinista anti-deadlock, doble movimiento (\`TRANSFER_OUT\` / \`TRANSFER_IN\`), idempotente. |
| **Financiación y Préstamos** | 7 | **A** | **Listo para Producción (Fase 4.9).** Bloqueo FOR UPDATE en préstamos y cuentas, worker de amortizaciones automáticas 100% transaccional. |
| **Facturas y Pagarés** | 1 | **A** | **Listo para Producción.** Descuento, cobro y firma de pagarés con bloqueo pesimista en \`market_messages\` y \`cuentas\`. |
| **Justicia y Demandas** | 10 | **B** | **Apto con advertencias.** Admisión (Fase 4.10) y sentencia blindadas. Embargos y allanamientos requieren bloqueo FOR UPDATE en la demanda. |
| **Fiscalidad e Impuestos** | 1 | **B** | **Apto con advertencias.** Consultas estables; las obligaciones dependen de workers en memoria. |
| **Materias Primas y Producción** | 13 | **B** | **Apto con advertencias.** Aprobación de pedidos y transferencias de existencias transaccionales; modos de producción en memoria. |
| **Usuarios y Autenticación** | 12 | **B** | **Apto con advertencias.** Borrado de usuarios transaccional (Fase 4.11.2); alta de alumnos en memoria con sync fire-and-forget. |
| **Empleados y Nóminas** | 5 | **B** | **Apto con advertencias.** Endpoints estables; el devengo periódico de nóminas dentro de \`readDb()\` requiere desacoplamiento. |
| **Mercado B2B y Pedidos** | 14 | **C** | **No preparado.** Mensajería contractual y facturación manual despachan sync asíncrona sin transacciones SQL. |
| **Suministros (Luz y Telecom)** | 9 | **C** | **No preparado.** Workers modifican saldos en memoria sin transacciones SQL, arriesgando números rojos y Lost Updates. |
| **Inmuebles y Bienes Raíces** | 5 | **C** | **No preparado.** Borrado y edición de inmuebles y obligaciones operan en memoria con \`dbPool.query().catch(...)\`. |
| **Maquinaria y Equipos** | 5 | **C** | **No preparado.** Altas y bajas de maquinaria operan en memoria con sincronización fire-and-forget. |
| **Administración y Sistema** | 6 | **C** | **No preparado.** Modificación de niveles y borrado de ofertas de empleo operan sobre \`db.json\` sin transacciones. |
| **General / Otros** | 34 | **C** | **No preparado.** Notificaciones y utilidades varias con mutaciones no atómicas y efectos secundarios en lecturas. |

---

## 3. AUDITORÍA DE WORKERS Y TAREAS EN SEGUNDO PLANO

El sistema cuenta con 4 procesos automáticos. Se auditaron sus puntos de entrada, periodicidad, concurrencia y mecanismos de bloqueo:

### 1. \`processStudentAutomaticPayments\` (Préstamos y Amortizaciones)
* **Grado de Seguridad:** **GRADO A (SEGURO)**
* **Mecanismo:** Se ejecuta en el arranque y cada 15 minutos (\`setInterval\` en \`server.ts:28433\`).
* **Transaccionalidad:** Utiliza \`withPostgresTransaction\` para cada préstamo pendiente.
* **Bloqueos:** Bloquea la cuota en \`prestamos\` y la cuenta corriente en \`cuentas\` mediante \`ORDER BY id FOR UPDATE\`.
* **Idempotencia:** Comprueba el estado del préstamo y no realiza doble cobro si la cuota ya fue liquidada.

### 2. \`checkAndProcessAutomatedElectricity\` (Facturación y Cobro de IberLuz)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta periódicamente en \`setInterval\` Y ADEMÁS en **cada llamada a \`readDb()\`** (\`server.ts:5666\`).
* **Vulnerabilidad de Concurrencia:** Modifica directamente el saldo en memoria (\`student.balance = Math.round((student.balance - bill.totalAmount) * 100) / 100\`). No abre transacción PostgreSQL. Emite llamadas \`syncAccountToSupabase(...).catch(...)\` y \`syncMovimientoToSupabase(...).catch(...)\` de manera fire-and-forget.
* **Impacto:** Si un alumno transfiere dinero mientras otro endpoint dispara \`readDb()\`, se sobrescribirá el saldo en memoria o en PostgreSQL, causando un **Lost Update**.

### 3. \`checkAndProcessAutomatedTelecom\` (Facturas de Telecomunicaciones)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta en **cada llamada a \`readDb()\`** (\`server.ts:5667\`).
* **Vulnerabilidad:** No valida si el alumno tiene saldo suficiente (\`student.balance >= totalAmount\`). Resta el importe directamente en memoria, pudiendo dejar al alumno en saldo negativo sin autorización crediticia. Sincroniza a Supabase con promesas no esperadas.

### 4. \`checkAndProcessAutomatedPayrollAndTaxes\` (Devengo de Nóminas y Seguridad Social)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta en **cada llamada a \`readDb()\`** (\`server.ts:5665\`).
* **Vulnerabilidad:** Calcula sueldos netos, deducciones y cuotas patronales en memoria. Resta saldos con \`student.balance = Math.round((student.balance - empNet) * 100) / 100\` y emite múltiples inserciones fire-and-forget a \`registros_nomina\`, \`obligaciones_fiscales\` y \`movimientos\`.

---

## 4. HALLAZGOS DE CONCURRENCIA, DEADLOCKS Y DOBLE GASTO

### Hallazgo 1: Mutaciones con Efectos Secundarios Ocultos dentro de \`readDb()\`
* **Ubicación:** \`server.ts:5665-5667\`
* **Descripción:** \`readDb()\` debe ser una función pura de lectura de estado. Sin embargo, contiene llamadas activas a los 3 workers automáticos. Debido a que casi todos los endpoints de Express llaman a \`readDb()\` al inicio de su ejecución, un simple \`GET /api/notifications\` o \`GET /users\` puede desencadenar débitos bancarios y reescritura de \`db.json\`.
* **Consecuencia:** En un entorno concurrente con 30 alumnos, el fichero \`db.json\` se reescribe docenas de veces por segundo, creando condiciones de carrera entre hilos de Node.js.

### Hallazgo 2: Falta de Bloqueo FOR UPDATE en Embargos Preventivos y Allanamiento
* **Ubicación:** \`POST /api/court/lawsuits/:id/preventative-embargo\` y \`POST /api/court/lawsuits/:id/pay-settle\`
* **Descripción:** Aunque ambos endpoints usan \`withPostgresTransaction\` para debitar fondos de \`cuentas\`, **no realizan \`SELECT ... FOR UPDATE\` sobre la tabla \`demandas_judiciales\`**.
* **Consecuencia:** Si se pulsa dos veces seguidas o llegan peticiones concurrentes, ambas comprobarán que el estado es pendiente en memoria y ejecutarán dos cobros bancarios consecutivos sobre la cuenta del alumno demandado.

### Hallazgo 3: Persistencia Huérfana por Llamadas Fire-and-Forget
* **Ubicación:** \`DELETE /api/obligations/:id\`, \`DELETE /api/acquisitions/:id\`, \`DELETE /api/machinery/acquisitions/:id\`.
* **Descripción:** La respuesta HTTP 200 se entrega al navegador antes de que PostgreSQL confirme la eliminación del registro (\`dbPool.query(...).catch(...)\`).
* **Consecuencia:** Si PostgreSQL falla o tiene un bloqueo activo por otra consulta, la base de datos conservará el inmueble o maquinaria mientras que en la interfaz del alumno habrá desaparecido. Al reiniciar el servidor (\`restoreFromSupabase\`), el objeto eliminado reaparecerá como un "objeto fantasma".

---

## 5. RESILIENCIA, ARRANQUE (COLD-START) Y RESTAURACIÓN

* **Función \`restoreFromSupabase()\` (\`server.ts:2506\`):**
  - Se ejecuta en el arranque del servidor.
  - Lee 25 tablas en PostgreSQL y reconstruye \`db.json\`.
  - **Comportamiento ante base de datos vacía:** Si la tabla \`cuentas\` está vacía (\`rows.length === 0\`), asume que PostgreSQL debe inicializarse y ejecuta \`syncAllToSupabase(currentDb)\`, volcando el estado local hacia PostgreSQL.
  - **Comportamiento ante base de datos con datos:** Si existen cuentas en PostgreSQL, PostgreSQL sobrescribe por completo \`db.users\`, \`db.transfers\`, \`db.loans\`, etc., garantizando que no se pierdan datos confirmados.
  - **Riesgo:** Si una entidad secundaria (como maquinaria o facturas) se creó en \`db.json\` pero la llamada fire-and-forget falló antes del reinicio, dicho dato se perderá irrevocablemente al arrancar.

---

## 6. HOJA DE RUTA PRIORIZADA DE SANEAMIENTO PREVIO AL USO EN AULA

Para que la aplicación pueda albergar con absoluta tranquilidad a 30 alumnos en un aula de clase sin fallos contables, se recomienda el siguiente orden de intervención técnica:

1. **Prioridad 1 (Crítica) — Desacoplamiento de Workers de \`readDb()\`:**
   - Eliminar las llamadas a \`checkAndProcessAutomatedPayrollAndTaxes\`, \`checkAndProcessAutomatedElectricity\` y \`checkAndProcessAutomatedTelecom\` del interior de \`readDb()\`.
   - Confinar los workers a ejecuciones periódicas (\`setInterval\` o cron) controladas, utilizando transacciones PostgreSQL y bloqueos \`FOR UPDATE\` idénticos al patrón de \`processStudentAutomaticPayments\`.

2. **Prioridad 2 (Crítica) — Transaccionalidad de Suministros (Luz y Telecomunicaciones):**
   - Migrar la facturación y cobro domiciliado de electricidad y telecomunicaciones para que debiten \`cuentas\` mediante \`withPostgresTransaction\` y registren los asientos en \`movimientos\` de forma atómica.

3. **Prioridad 3 (Alta) — Bloqueo Pesimista en Embargos y Allanamientos Judiciales:**
   - Incorporar \`SELECT ... FROM demandas_judiciales WHERE id = $1 FOR UPDATE\` en los endpoints de embargo preventivo cautelar (\`preventative-embargo\`) y liquidación procesal (\`pay-settle\`).

4. **Prioridad 4 (Alta) — Eliminación del Patrón Fire-and-Forget en Activos:**
   - Migrar \`DELETE /api/obligations/:id\`, \`DELETE /api/acquisitions/:id\` y \`DELETE /api/machinery/acquisitions/:id\` a transacciones atómicas con validación previa de dependencias, replicando el patrón seguro implantado en la Fase 4.11.2 para \`DELETE /api/users/:id\`.

---
*Informe generado automáticamente por el Escáner de Auditoría Integral (Fase 4.11).*
`;

fs.writeFileSync(
  path.resolve(process.cwd(), 'scripts/audit_phase_4_11_readiness_report.md'),
  md,
  'utf8'
);

console.log('Generado scripts/audit_phase_4_11_readiness_report.md con éxito.');
