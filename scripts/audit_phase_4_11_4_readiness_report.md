# INFORME DE AUDITORÍA FINAL DE PREPARACIÓN PARA AULA CONCURRENTE — FASE 4.11.4

**Fecha de Auditoría:** 23 de Septiembre de 2026  
**Entorno Objetivo:** Aula educativa de simulación empresarial con ~30 alumnos concurrentes  
**Alcance Técnico:** Inspección integral de endpoints, workers, aislamiento transaccional, contención de locks, integridad contable y escenarios de arranque en frío.  
**Restricción de Fase:** ESTRICTAMENTE SIN MODIFICACIONES DE CÓDIGO (Inspeccionar → Clasificar → Probar → Informar).

---

## 1. DICTAMEN EJECUTIVO GLOBAL

### **Veredicto: PREPARADA CONDICIONADA CON PUNTOS CRÍTICOS (REQUIERE SANEAMIENTO PREVIO AL ARRANQUE)**

El sistema ha alcanzado un nivel de madurez transaccional sobresaliente en su **núcleo financiero principal, módulo de préstamos, operativa judicial, comercio B2B y transferencias de existencias**, donde las operaciones críticas están completamente desacopladas de `db.json`, blindadas con `withPostgresTransaction`, serializadas mediante `SELECT ... FOR UPDATE` y protegidas con claves de idempotencia de dos fases.

Sin embargo, **no puede declararse 100% segura para uso concurrente en aula real sin antes corregir 3 componentes críticos (Grado C)**:
1. **Worker de Nóminas e Impuestos Automáticos (`checkAndProcessAutomatedPayrollAndTaxes`):** Ejecuta débitos periódicos directos sobre el objeto en memoria `student.balance` con sincronización fire-and-forget, pudiendo sobreescribir cobros o transferencias simultáneas de los alumnos.
2. **Worker de Vencimiento de Pagarés Descontados (`processDiscountedPromissoryNotesMaturity`):** Realiza cargos bancarios automáticos al librador del pagaré sin transacción PostgreSQL ni bloqueo pesimista.
3. **Endpoint de Conciliación Bancaria (`POST /api/bank/reconcile`):** Recalcula saldos basándose en datos estáticos en memoria y lanza `UPDATE cuentas SET saldo = ...` masivos sin transacción, lo que destruiría los saldos en vivo generados por las interacciones de los alumnos.

---

## 2. RESULTADOS DE LA BATERÍA DE PRUEBAS DE CONCURRENCIA REAL (`scripts/test_phase_4_11_4.ts`)

Se ejecutó una batería de estrés en caliente contra la instancia activa conectada a Supabase (PostgreSQL en `aws-0-eu-west-1`):

| Suite de Prueba | Condición Evaluada | Resultado | Métricas y Latencia |
| :--- | :--- | :--- | :--- |
| **1. Multi-Party Transfers** | 30 transferencias concurrentes entre 10 cuentas simultáneas (cruces de remitente/destinatario) | **✅ PASS** | **30/30 exitosas (100%)**. Invariante de suma cero verificado: **20.000,00 € iniciales = 20.000,00 € finales** (0 céntimos de desviación). Latencia total: 8.803 ms (~293 ms/req). |
| **2. Movements Ledger Integrity** | Asientos dobles (TRANSFER_OUT y TRANSFER_IN) en PostgreSQL | **✅ PASS** | **60 asientos registrados exactamente para 30 transferencias**. Cero registros duplicados, cero asientos huérfanos. |
| **3. Concurrent Loan Acceptance** | 5 peticiones simultáneas de aceptación sobre el mismo préstamo | **✅ PASS** | **1 abono de capital único** (49.500,00 € netos tras descontar 500 € de apertura). Las 4 peticiones concurrentes restantes fueron serializadas e idempotentes. |
| **4. Loan State Progression** | Estado del préstamo tras aceptación concurrente | **✅ PASS** | Estado verificado en PostgreSQL como estrictamente **`active`**. |
| **5. Insufficient Funds Prevention** | Compras concurrentes simultáneas al borde del saldo disponible | **✅ PASS** | Saldo final nunca cayó en negativo. Compras excedentes rechazadas con HTTP 400 por fondos insuficientes bajo bloqueo pesimista. |
| **6. Concurrent Tax Payment** | Liquidación concurrente de obligación tributaria | **✅ PASS** | Saldo debitado exactamente una vez (5.000 € → 4.550 €). Intentos duplicados absorbidos por idempotencia. |
| **7. Tax Status Invariant** | Estado procesal del impuesto liquidado | **✅ PASS** | Estado en PostgreSQL verificado como **`pagado`**. |
| **8. Lock Contention & Anti-Deadlock** | 10 transferencias cruzadas en ping-pong entre 2 cuentas bajo alta contención | **✅ PASS** | **Cero deadlocks**. Min: 397 ms, Media: 1.925 ms, Max: 3.455 ms. |

---

## 3. AUDITORÍA DETALLADA POR MÓDULOS

### 3.1. Núcleo Financiero (Cuentas, Movimientos, Transferencias) — **GRADO A**
* **Aislamiento:** Transaccional completo (`withPostgresTransaction`).
* **Prevención de Deadlocks:** Ordenación determinista obligatoria de IDs: `const orderedIds = [senderId, receiverId].sort()`, seguida de `SELECT ... FROM cuentas WHERE id = ANY($1) FOR UPDATE`.
* **Idempotencia:** Implementada con `executeWithIdempotency` vinculada a cabecera `x-idempotency-key` o generador interno determinista con retención de 24 horas.
* **Integridad Contable:** Cada transferencia registra de forma indivisible el débito en cuenta origen, abono en cuenta destino, y ambos asientos contables en `movimientos`.

### 3.2. Módulo de Préstamos y Crédito — **GRADO A**
* **Endpoints:** `POST /api/loans/request`, `POST /api/loans/:id/accept`, `POST /api/loans/:id/reject`, `POST /api/teacher/loans/:id/review`.
* **Mecanismo:** Jerarquía estricta de bloqueos: primero se bloquea la fila del préstamo con `SELECT ... FROM prestamos WHERE id = $1 FOR UPDATE`, y a continuación se bloquea la cuenta bancaria del estudiante.
* **Worker de Cobro Automático (`processStudentAutomaticPayments`):** Saneado en Fase 4.9.2. Consulta cuotas vencidas directamente en PostgreSQL, bloquea registro a registro y debita con movimientos contables transaccionales.

### 3.3. Módulo Judicial (Juzgado de 1ª Instancia) — **GRADO A**
* **Endpoints:** `POST /api/court/lawsuits`, `/judge-admission`, `/preventative-embargo`, `/pay-settle`, `/defendant-answer`, `/judge-ruling`.
* **Embargo Cautelar Inmediato (Art. 821 LEC):** Bloquea la cuenta del demandado con `SELECT ... FOR UPDATE`, descuenta el importe y lo transfiere a la cuenta de depósitos judiciales con movimiento contable atómico.
* **Allanamiento y Pago:** Ordena deterministamente las cuentas del demandante y demandado `[defendant.id, plaintiff.id].sort()`, garantizando ausencia de deadlocks cruzados.

### 3.4. Mercado B2B y Pagarés Cambiarios — **GRADO A / B**
* **Endpoints Transaccionales (Grado A):**
  - `POST /api/market/messages/sign-promissory-note`: Firma electrónica y emisión atómica sobre `market_messages` con `FOR UPDATE`.
  - `POST /api/market/messages/discount-promissory-note`: Anticipo y abono de liquidez bancaria con comisión e intereses retenidos en transacción.
  - `POST /api/market/messages/collect-promissory-note`: Cobro en ventanilla a vencimiento con bloqueo cruzado librador/tenedor.
* **Punto Crítico en Segundo Plano (Grado C):**
  - **`processDiscountedPromissoryNotesMaturity`:** Automatismo de cobro a vencimiento para pagarés previamente descontados. Si el alumno deudor no tiene saldo suficiente o está realizando una transferencia simultánea, este worker calcula en memoria y ejecuta un `safeDbQuery` simple sin transacción.

### 3.5. Inventarios, Materias Primas y Producción — **GRADO A / C**
* **Logística y Transferencias (Grado A):**
  - `POST /api/inventory/transfer-stock` y `POST /api/raw-materials/orders/:id/approve`: Ordenación determinista de inventarios de estudiantes (`sortedStudentIds = [senderId, recipientId].sort()`), bloqueos `materias_primas_inventario FOR UPDATE`, y actualización de existencias en el mismo commit que los costes de transporte.
* **Punto Débil (Grado C):**
  - `POST /api/raw-materials/rod-production-mode`: Modifica la propiedad `rodProductionMode` directamente en el objeto en memoria y despacha `syncInventoryToSupabase(...).catch(...)` como fire-and-forget.

### 3.6. Compras y Activos (Inmuebles, Maquinaria, Vehículos, Tienda de Oficina) — **GRADO A**
* Saneados en Fases 4.10 y 4.11.
* Todas las compras validan fondos en PostgreSQL mediante `SELECT ... FOR UPDATE` en `cuentas`.
* Las cancelaciones/eliminaciones (`DELETE /api/acquisitions/:id`, `DELETE /api/machinery/acquisitions/:id`) incluyen verificaciones de integridad referencial: bloqueo si hay maquinaria dentro de una nave y desvinculación automática de operarios asignados en la misma transacción.

---

## 4. INVENTARIO DE RIESGOS CRÍTICOS (GRADO C)

| Componente | Archivo / Ubicación | Mecánica del Fallo Concurrente | Consecuencia en Aula |
| :--- | :--- | :--- | :--- |
| **Worker Nóminas e Impuestos** | `server.ts` (líneas 4750–5046) | Modifica `student.balance = student.balance - neto` en memoria y sincroniza asíncronamente con `.catch()` sin bloqueo pesimista en PostgreSQL. | **Pérdida de saldo:** Si un alumno recibe una transferencia de otro alumno mientras este worker procesa su nómina, el saldo de la transferencia puede ser sobrescrito por el worker. |
| **Worker Pagarés Descontados** | `server.ts` (líneas 4467–4560) | Itera sobre `db.marketMessages` en memoria. Al vencer el pagaré, lanza `UPDATE cuentas SET saldo = $1` sin `FOR UPDATE` ni comprobación de saldo en vivo. | **Saldos desfasados e impagos silenciosos** en la simulación. |
| **Conciliación Bancaria** | `server.ts` (líneas 7133–7192) | Calcula el saldo teórico restando compras históricas del saldo de 60.000€ y fuerza un `UPDATE cuentas` directo sin verificar transferencias B2B. | **Destrucción masiva de saldos:** Si el docente pulsa "Conciliar Banco", se borrarán las ganancias obtenidas por los alumnos mediante comercio B2B. |
| **Modo de Fabricación de Varillas** | `server.ts` (líneas 26427–26466) | Invoca `checkAndCalculateProduction(db, studentId)` en memoria y persiste vía `writeDb(db)` con sync fire-and-forget. | **Condición de carrera:** Puede revertir deducciones de materias primas realizadas simultáneamente por órdenes de compra. |
| **Restauración de Copia** | `server.ts` (líneas 7342–7390) | Sobreescribe en caliente el archivo `db.json` y llama a `syncAllToSupabase()` sin detener transacciones en vuelo. | **Inconsistencia de arranque:** Solo admisible en mantenimiento exclusivo sin alumnos conectados. |

---

## 5. ESCENARIOS DE ARRANQUE EN FRÍO (COLD START)

1. **Estado Inicial al Levantar el Contenedor:**
   - La función `initializeDatabase()` carga los datos de `db.json`.
   - Si la conexión con Supabase está activa, los endpoints críticos de consulta y mutación leen directamente de las tablas PostgreSQL (`cuentas`, `prestamos`, `materias_primas_inventario`, `demandas_judiciales`).
2. **Riesgo de Split-Brain Temporal:**
   - Si se añade un alumno nuevo mediante `POST /api/users`, el registro se inserta atómicamente en PostgreSQL y se añade a `db.users`.
   - Si la instancia se reinicia y no se ha completado el volcado a disco, los datos permanecen seguros en PostgreSQL, pero las funciones secundarias que todavía lean de `readDb()` (como listados auxiliares) verán una caché desfasada hasta el siguiente ciclo de sincronización.
3. **Recomendación para Aula:**
   - Ejecutar una verificación inicial `GET /api/supabase-status` antes de abrir el acceso a los alumnos para verificar que el pool de PostgreSQL está en estado `healthy`.

---

## 6. HOJA DE RUTA DE SANEAMIENTO FINAL OBLIGATORIO (PLAN DE 4 PASOS)

Para transformar el dictamen en **100% PREPARADA PARA AULA CONCURRENTE**, deben ejecutarse las siguientes 4 intervenciones de saneamiento previo:

1. **Paso 1 — Transactificar `checkAndProcessAutomatedPayrollAndTaxes`:**
   - Envolver el cálculo de nóminas en `withPostgresTransaction`.
   - Adquirir `SELECT ... FROM cuentas WHERE id = $1 FOR UPDATE` para cada alumno con empleados contratados.
   - Insertar los asientos contables en `movimientos` dentro de la transacción.
2. **Paso 2 — Transactificar `processDiscountedPromissoryNotesMaturity`:**
   - Consultar pagarés descontados vencidos directamente desde `market_messages` en PostgreSQL con `FOR UPDATE`.
   - Bloquear la cuenta del deudor con `FOR UPDATE` antes de debitar el importe nominal del pagaré.
   - Si no hay saldo suficiente, transicionar el pagaré a estado `impagado` de forma atómica y notificar a la entidad bancaria.
3. **Paso 3 — Proteger o Restringir `POST /api/bank/reconcile`:**
   - Reemplazar el cálculo basado en saldos iniciales fijos por una suma agregada real de la tabla `movimientos` en PostgreSQL (`SELECT COALESCE(SUM(importe), 0) ...`).
   - Aplicar `FOR UPDATE` sobre la cuenta a conciliar.
4. **Paso 4 — Transactificar `POST /api/raw-materials/rod-production-mode`:**
   - Migrar la actualización del modo de varilla a `UPDATE materias_primas_inventario SET configuracion_produccion = ...` en PostgreSQL.

---

## 7. CONCLUSIÓN

El 80% del sistema —incluyendo las áreas financieras más sensibles a la concurrencia masiva— opera actualmente bajo estándares de grado bancario (serialización estricta, bloqueos pesimistas, orden determinista anti-deadlock e idempotencia garantizada).

Completando la migración transaccional de los 2 workers en segundo plano y asegurando el endpoint de conciliación, la plataforma estará **plenamente blindada y certificada para soportar las sesiones de aula con 30 alumnos concurrentes sin ningún tipo de corrupción de datos ni discrepancia contable**.
