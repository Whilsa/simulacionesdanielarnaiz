# INFORME TÉCNICO GLOBAL DE PREPARACIÓN PARA USO EN AULA (FASE 4.11)
**Auditoría Integral de Concurrencia, Transaccionalidad, Fuente Única de Verdad y Resiliencia**

---

## 1. RESUMEN EJECUTIVO Y DICTAMEN GLOBAL

| Parámetro | Resultado de Auditoría |
| :--- | :--- |
| **Dictamen de Preparación para Aula** | **NO PREPARADA PARA AULA CONCURRENTE (REQUIERE SANEAMIENTO PREVIO)** |
| **Total de Endpoints Auditados** | **126 endpoints** (86 Seguros, 12 Riesgo Moderado, 28 Riesgo Crítico) |
| **Total de Background Workers Auditados** | **4 workers** (1 Seguro Grado A, 3 Críticos Grado C) |
| **Fuente de Verdad Actual** | **HÍBRIDA** (PostgreSQL como fuente de verdad en Banca y Préstamos; db.json/memoria en Suministros y Activos) |
| **Riesgo Financiero Principal** | **Lost Updates y Doble Gasto** por colisiones entre workers en memoria y transacciones bancarias concurrentes |

### Veredicto Técnico Justificado
La aplicación presenta dos mitades arquitectónicas claramente diferenciadas:
1. **Los Módulos Blindados (Grado A):** Los subsistemas de **Banca y Transferencias**, **Facturas y Pagarés** y **Financiación y Préstamos (Fase 4.9)** han sido migrados con rigor técnico pleno. Utilizan `withPostgresTransaction`, claves de idempotencia, bloqueos pesimistas ordenados (`ORDER BY id FOR UPDATE`) que eliminan la posibilidad de deadlocks, y asientos contables simétricos en PostgreSQL.
2. **Los Módulos Heredados con Riesgo Crítico (Grados B y C):** Módulos como **Suministros (Luz y Telecomunicaciones)**, **Gestión de Inmuebles**, **Maquinaria**, **Administración de Ofertas** y los workers automáticos que se disparan en el ciclo de lectura `readDb()` operan sobre `db.json` en memoria y despachan consultas a PostgreSQL mediante llamadas asíncronas no esperadas (`fire-and-forget`).

**Conclusión:** Si un aula de 25-30 alumnos utiliza el sistema simultáneamente, la concurrencia en transferencias y préstamos no sufrirá fallos; sin embargo, en cuanto se active el cómputo automático de electricidad, telecomunicaciones o nóminas, o los alumnos operen con maquinaria e inmuebles, se producirán **Lost Updates en saldos bancarios**, **desincronizaciones entre la memoria y PostgreSQL** y **descuentos no atómicos**, comprometiendo la fiabilidad contable del aula.

---

## 2. EVALUACIÓN Y CALIFICACIÓN POR MÓDULOS

| Módulo Funcional | Endpoints | Grado | Estado de Concurrencia y Transaccionalidad |
| :--- | :---: | :---: | :--- |
| **Banca y Transferencias** | 4 | **A** | **Listo para Producción.** Transaccional, orden determinista anti-deadlock, doble movimiento (`TRANSFER_OUT` / `TRANSFER_IN`), idempotente. |
| **Financiación y Préstamos** | 7 | **A** | **Listo para Producción (Fase 4.9).** Bloqueo FOR UPDATE en préstamos y cuentas, worker de amortizaciones automáticas 100% transaccional. |
| **Facturas y Pagarés** | 1 | **A** | **Listo para Producción.** Descuento, cobro y firma de pagarés con bloqueo pesimista en `market_messages` y `cuentas`. |
| **Justicia y Demandas** | 10 | **B** | **Apto con advertencias.** Admisión (Fase 4.10) y sentencia blindadas. Embargos y allanamientos requieren bloqueo FOR UPDATE en la demanda. |
| **Fiscalidad e Impuestos** | 1 | **B** | **Apto con advertencias.** Consultas estables; las obligaciones dependen de workers en memoria. |
| **Materias Primas y Producción** | 13 | **B** | **Apto con advertencias.** Aprobación de pedidos y transferencias de existencias transaccionales; modos de producción en memoria. |
| **Usuarios y Autenticación** | 12 | **B** | **Apto con advertencias.** Borrado de usuarios transaccional (Fase 4.11.2); alta de alumnos en memoria con sync fire-and-forget. |
| **Empleados y Nóminas** | 5 | **B** | **Apto con advertencias.** Endpoints estables; el devengo periódico de nóminas dentro de `readDb()` requiere desacoplamiento. |
| **Mercado B2B y Pedidos** | 14 | **C** | **No preparado.** Mensajería contractual y facturación manual despachan sync asíncrona sin transacciones SQL. |
| **Suministros (Luz y Telecom)** | 9 | **C** | **No preparado.** Workers modifican saldos en memoria sin transacciones SQL, arriesgando números rojos y Lost Updates. |
| **Inmuebles y Bienes Raíces** | 5 | **C** | **No preparado.** Borrado y edición de inmuebles y obligaciones operan en memoria con `dbPool.query().catch(...)`. |
| **Maquinaria y Equipos** | 5 | **C** | **No preparado.** Altas y bajas de maquinaria operan en memoria con sincronización fire-and-forget. |
| **Administración y Sistema** | 6 | **C** | **No preparado.** Modificación de niveles y borrado de ofertas de empleo operan sobre `db.json` sin transacciones. |
| **General / Otros** | 34 | **C** | **No preparado.** Notificaciones y utilidades varias con mutaciones no atómicas y efectos secundarios en lecturas. |

---

## 3. AUDITORÍA DE WORKERS Y TAREAS EN SEGUNDO PLANO

El sistema cuenta con 4 procesos automáticos. Se auditaron sus puntos de entrada, periodicidad, concurrencia y mecanismos de bloqueo:

### 1. `processStudentAutomaticPayments` (Préstamos y Amortizaciones)
* **Grado de Seguridad:** **GRADO A (SEGURO)**
* **Mecanismo:** Se ejecuta en el arranque y cada 15 minutos (`setInterval` en `server.ts:28433`).
* **Transaccionalidad:** Utiliza `withPostgresTransaction` para cada préstamo pendiente.
* **Bloqueos:** Bloquea la cuota en `prestamos` y la cuenta corriente en `cuentas` mediante `ORDER BY id FOR UPDATE`.
* **Idempotencia:** Comprueba el estado del préstamo y no realiza doble cobro si la cuota ya fue liquidada.

### 2. `checkAndProcessAutomatedElectricity` (Facturación y Cobro de IberLuz)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta periódicamente en `setInterval` Y ADEMÁS en **cada llamada a `readDb()`** (`server.ts:5666`).
* **Vulnerabilidad de Concurrencia:** Modifica directamente el saldo en memoria (`student.balance = Math.round((student.balance - bill.totalAmount) * 100) / 100`). No abre transacción PostgreSQL. Emite llamadas `syncAccountToSupabase(...).catch(...)` y `syncMovimientoToSupabase(...).catch(...)` de manera fire-and-forget.
* **Impacto:** Si un alumno transfiere dinero mientras otro endpoint dispara `readDb()`, se sobrescribirá el saldo en memoria o en PostgreSQL, causando un **Lost Update**.

### 3. `checkAndProcessAutomatedTelecom` (Facturas de Telecomunicaciones)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta en **cada llamada a `readDb()`** (`server.ts:5667`).
* **Vulnerabilidad:** No valida si el alumno tiene saldo suficiente (`student.balance >= totalAmount`). Resta el importe directamente en memoria, pudiendo dejar al alumno en saldo negativo sin autorización crediticia. Sincroniza a Supabase con promesas no esperadas.

### 4. `checkAndProcessAutomatedPayrollAndTaxes` (Devengo de Nóminas y Seguridad Social)
* **Grado de Seguridad:** **GRADO C (RIESGO CRÍTICO)**
* **Mecanismo:** Se ejecuta en **cada llamada a `readDb()`** (`server.ts:5665`).
* **Vulnerabilidad:** Calcula sueldos netos, deducciones y cuotas patronales en memoria. Resta saldos con `student.balance = Math.round((student.balance - empNet) * 100) / 100` y emite múltiples inserciones fire-and-forget a `registros_nomina`, `obligaciones_fiscales` y `movimientos`.

---

## 4. HALLAZGOS DE CONCURRENCIA, DEADLOCKS Y DOBLE GASTO

### Hallazgo 1: Mutaciones con Efectos Secundarios Ocultos dentro de `readDb()`
* **Ubicación:** `server.ts:5665-5667`
* **Descripción:** `readDb()` debe ser una función pura de lectura de estado. Sin embargo, contiene llamadas activas a los 3 workers automáticos. Debido a que casi todos los endpoints de Express llaman a `readDb()` al inicio de su ejecución, un simple `GET /api/notifications` o `GET /users` puede desencadenar débitos bancarios y reescritura de `db.json`.
* **Consecuencia:** En un entorno concurrente con 30 alumnos, el fichero `db.json` se reescribe docenas de veces por segundo, creando condiciones de carrera entre hilos de Node.js.

### Hallazgo 2: Falta de Bloqueo FOR UPDATE en Embargos Preventivos y Allanamiento
* **Ubicación:** `POST /api/court/lawsuits/:id/preventative-embargo` y `POST /api/court/lawsuits/:id/pay-settle`
* **Descripción:** Aunque ambos endpoints usan `withPostgresTransaction` para debitar fondos de `cuentas`, **no realizan `SELECT ... FOR UPDATE` sobre la tabla `demandas_judiciales`**.
* **Consecuencia:** Si se pulsa dos veces seguidas o llegan peticiones concurrentes, ambas comprobarán que el estado es pendiente en memoria y ejecutarán dos cobros bancarios consecutivos sobre la cuenta del alumno demandado.

### Hallazgo 3: Persistencia Huérfana por Llamadas Fire-and-Forget
* **Ubicación:** `DELETE /api/obligations/:id`, `DELETE /api/acquisitions/:id`, `DELETE /api/machinery/acquisitions/:id`.
* **Descripción:** La respuesta HTTP 200 se entrega al navegador antes de que PostgreSQL confirme la eliminación del registro (`dbPool.query(...).catch(...)`).
* **Consecuencia:** Si PostgreSQL falla o tiene un bloqueo activo por otra consulta, la base de datos conservará el inmueble o maquinaria mientras que en la interfaz del alumno habrá desaparecido. Al reiniciar el servidor (`restoreFromSupabase`), el objeto eliminado reaparecerá como un "objeto fantasma".

---

## 5. RESILIENCIA, ARRANQUE (COLD-START) Y RESTAURACIÓN

* **Función `restoreFromSupabase()` (`server.ts:2506`):**
  - Se ejecuta en el arranque del servidor.
  - Lee 25 tablas en PostgreSQL y reconstruye `db.json`.
  - **Comportamiento ante base de datos vacía:** Si la tabla `cuentas` está vacía (`rows.length === 0`), asume que PostgreSQL debe inicializarse y ejecuta `syncAllToSupabase(currentDb)`, volcando el estado local hacia PostgreSQL.
  - **Comportamiento ante base de datos con datos:** Si existen cuentas en PostgreSQL, PostgreSQL sobrescribe por completo `db.users`, `db.transfers`, `db.loans`, etc., garantizando que no se pierdan datos confirmados.
  - **Riesgo:** Si una entidad secundaria (como maquinaria o facturas) se creó en `db.json` pero la llamada fire-and-forget falló antes del reinicio, dicho dato se perderá irrevocablemente al arrancar.

---

## 6. HOJA DE RUTA PRIORIZADA DE SANEAMIENTO PREVIO AL USO EN AULA

Para que la aplicación pueda albergar con absoluta tranquilidad a 30 alumnos en un aula de clase sin fallos contables, se recomienda el siguiente orden de intervención técnica:

1. **Prioridad 1 (Crítica) — Desacoplamiento de Workers de `readDb()`:**
   - Eliminar las llamadas a `checkAndProcessAutomatedPayrollAndTaxes`, `checkAndProcessAutomatedElectricity` y `checkAndProcessAutomatedTelecom` del interior de `readDb()`.
   - Confinar los workers a ejecuciones periódicas (`setInterval` o cron) controladas, utilizando transacciones PostgreSQL y bloqueos `FOR UPDATE` idénticos al patrón de `processStudentAutomaticPayments`.

2. **Prioridad 2 (Crítica) — Transaccionalidad de Suministros (Luz y Telecomunicaciones):**
   - Migrar la facturación y cobro domiciliado de electricidad y telecomunicaciones para que debiten `cuentas` mediante `withPostgresTransaction` y registren los asientos en `movimientos` de forma atómica.

3. **Prioridad 3 (Alta) — Bloqueo Pesimista en Embargos y Allanamientos Judiciales:**
   - Incorporar `SELECT ... FROM demandas_judiciales WHERE id = $1 FOR UPDATE` en los endpoints de embargo preventivo cautelar (`preventative-embargo`) y liquidación procesal (`pay-settle`).

4. **Prioridad 4 (Alta) — Eliminación del Patrón Fire-and-Forget en Activos:**
   - Migrar `DELETE /api/obligations/:id`, `DELETE /api/acquisitions/:id` y `DELETE /api/machinery/acquisitions/:id` a transacciones atómicas con validación previa de dependencias, replicando el patrón seguro implantado en la Fase 4.11.2 para `DELETE /api/users/:id`.

---
*Informe generado automáticamente por el Escáner de Auditoría Integral (Fase 4.11).*
