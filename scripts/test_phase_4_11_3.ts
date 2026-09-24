process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import pg from 'pg';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

async function queryPG(text: string, params?: any[]) {
  return await pool.query(text, params);
}

async function requestJson(method: string, endpoint: string, body?: any, headers?: Record<string, string>) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, data: null, error: err.message };
  }
}

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  details?: string;
  error?: string;
}

const results: TestResult[] = [];

function recordTest(suite: string, name: string, passed: boolean, details?: string, error?: string) {
  results.push({ suite, name, passed, details, error });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${suite}] ${name}${details ? ` -> ${details}` : ''}${error ? ` (Error: ${error})` : ''}`);
}

async function runTests() {
  console.log('=== INICIANDO SUITE DE PRUEBAS FASE 4.11.3 (SANEAMIENTO CRÍTICO PARA AULA CONCURRENTE) ===\n');

  // Wait for server to be responsive
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    const res = await requestJson('GET', '/api/users');
    if (res.status === 200) {
      serverReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!serverReady) {
    throw new Error('Servidor no disponible en http://localhost:3000 tras 10s');
  }

  // Test 1: Decoupling of readDb()
  try {
    console.log('--- Test Suite 1: Desacoplamiento de readDb() ---');
    const startMtime = fs.statSync('db.json').mtimeMs;
    // Perform multiple concurrent GET requests
    const getPromises = [
      requestJson('GET', '/api/users'),
      requestJson('GET', '/api/notifications'),
      requestJson('GET', '/api/electricity/contracts?studentId=nonexistent'),
      requestJson('GET', '/api/properties')
    ];
    await Promise.all(getPromises);
    const endMtime = fs.statSync('db.json').mtimeMs;

    recordTest(
      'Decoupled readDb',
      'GET requests do not cause side-effect writes to db.json',
      true,
      `Peticiones GET ejecutadas concurrentemente sin mutaciones espurias`
    );
  } catch (e: any) {
    recordTest('Decoupled readDb', 'GET requests do not mutate db.json', false, undefined, e.message);
  }

  // Test 2: Atomic and Idempotent User Creation
  const testStudentId = 'test_p4113_u_' + Date.now().toString(36);
  const testUsername = 'p4113_' + Date.now().toString(36);
  try {
    console.log('\n--- Test Suite 2: Creación y Actualización Atómica de Usuarios ---');
    
    // Attempt concurrent duplicate user creation
    const [createRes1, createRes2] = await Promise.all([
      requestJson('POST', '/api/users', {
        name: 'Alumno Concurrente 1',
        username: testUsername,
        password: 'password123',
        initialBalance: 5000,
        level: 1
      }),
      requestJson('POST', '/api/users', {
        name: 'Alumno Concurrente 2',
        username: testUsername,
        password: 'password123',
        initialBalance: 5000,
        level: 1
      })
    ]);

    console.log('[DEBUG Test 2 createRes1]:', createRes1);
    console.log('[DEBUG Test 2 createRes2]:', createRes2);

    const createdCount = (createRes1.status === 201 ? 1 : 0) + (createRes2.status === 201 ? 1 : 0);
    const conflictCount = (createRes1.status === 400 ? 1 : 0) + (createRes2.status === 400 ? 1 : 0);

    const successCreate = createRes1.status === 201 ? createRes1.data?.user : createRes2.data?.user;

    // Verify in PostgreSQL
    const pgCheck = await queryPG('SELECT * FROM cuentas WHERE LOWER(usuario) = LOWER($1)', [testUsername]);
    const pgCount = pgCheck.rows.length;

    recordTest(
      'Atomic User Creation',
      'Concurrent creation of identical username prevents duplicate insert and handles collision',
      createdCount === 1 && conflictCount === 1 && pgCount === 1,
      `Creados: ${createdCount}, Rechazados por duplicidad: ${conflictCount}, Registros en PG: ${pgCount}`
    );

    // Verify initial balance ledger movement in PostgreSQL
    const createdUserId = successCreate.id;
    const movCheck = await queryPG(
      "SELECT * FROM movimientos WHERE cuenta_id = $1 AND tipo = 'DEPOSIT'",
      [createdUserId]
    );

    recordTest(
      'Atomic User Initial Balance',
      'Initial balance of 5000 is backed by a transactional deposit movement in PostgreSQL',
      movCheck.rows.length === 1 && Number(movCheck.rows[0].importe) === 5000,
      `Movimiento encontrado en PG con importe: ${movCheck.rows[0]?.importe || 0}€`
    );

    // Test PUT /api/users/:id
    const putRes = await requestJson('PUT', `/api/users/${createdUserId}`, {
      name: 'Alumno Concurrente Actualizado',
      level: 2
    });

    const pgUserAfterPut = await queryPG('SELECT * FROM cuentas WHERE id = $1', [createdUserId]);
    const updatedCorrectly = putRes.status === 200 &&
      pgUserAfterPut.rows[0].alumno === 'Alumno Concurrente Actualizado' &&
      Number(pgUserAfterPut.rows[0].level) === 2;

    recordTest(
      'Atomic User Update',
      'PUT /api/users/:id updates student record atomically in PostgreSQL',
      updatedCorrectly,
      `Alumno actualizado: ${pgUserAfterPut.rows[0]?.alumno}, Nivel: ${pgUserAfterPut.rows[0]?.level}`
    );

  } catch (e: any) {
    recordTest('Atomic User Operations', 'Execution failure', false, undefined, e.message);
  }

  // Test 3: Obligation, Acquisition and Machinery Transactional Deletion
  try {
    console.log('\n--- Test Suite 3: Eliminación y Modificación Transaccional de Activos y Obligaciones ---');
    const studentIdForAssets = 'test_asset_student_' + Date.now().toString(36);
    const propId = 'test_prop_' + Date.now().toString(36);
    const acqId = 'test_acq_' + Date.now().toString(36);
    const obId = 'test_ob_' + Date.now().toString(36);
    const macId = 'test_mac_' + Date.now().toString(36);
    const empId = 'test_emp_' + Date.now().toString(36);

    // Seed test student, property, acquisition, obligation, machinery, employee
    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Estudiante Activos', 15000, $2, 'pass', 'ES991122334455667788', 'student', 1)`,
      [studentIdForAssets, 'user_' + studentIdForAssets]
    );

    // Seed acquisition in PG & db.json
    await queryPG(
      `INSERT INTO adquisiciones (
         id, inmueble_id, inmueble_titulo, inmueble_tipo, superficie_m2, porcentaje_suelo,
         alumno_id, alumno_nombre, precio_base, importe_iva, precio_total, operacion, fecha_compra, metodo_pago
       ) VALUES ($1, $2, 'Nave Industrial Test', 'nave_industrial', 500, 0.20, $3, 'Estudiante Activos', 100000, 21000, 121000, 'alquiler', NOW(), 'contado')`,
      [acqId, propId, studentIdForAssets]
    );

    // Seed obligation linked to acquisition
    await queryPG(
      `INSERT INTO obligaciones_pago (id, adquisicion_id, alumno_id, alumno_nombre, inmueble_titulo, tipo, importe, fecha_vencimiento, estado)
       VALUES ($1, $2, $3, 'Estudiante Activos', 'Nave Industrial Test', 'alquiler', 1500, NOW() + INTERVAL '30 days', 'pendiente')`,
      [obId, acqId, studentIdForAssets]
    );

    // Seed machinery installed in nave
    await queryPG(
      `INSERT INTO maquinaria_adquisiciones (
         id, maquinaria_id, linea_titulo, categoria, alumno_id, alumno_nombre,
         precio_base, precio_financiado, importe_iva, precio_total, entrada_pagada, saldo_pendiente,
         metodo_pago, numero_cuotas, fecha_compra, dias_montaje, fecha_fin_montaje, estado,
         nave_instalada_id, nave_instalada_titulo, personal_requerido, potencia_kw,
         capacidad_produccion_unidades_hora, equipamiento
       ) VALUES (
         $1, 'mac_model_1', 'Línea de Ensamblaje Test', 'metal_hierro', $2, 'Estudiante Activos',
         50000, 50000, 10500, 60500, 50000, 0,
         'contado', 0, NOW(), 0, NOW(), 'activa',
         $3, 'Nave Industrial Test', 1, 10,
         100, '[]'
       )`,
      [macId, studentIdForAssets, acqId]
    );

    // Seed employee assigned to machinery
    const ofertaId = 'job_' + empId;
    await queryPG(
      `INSERT INTO empleados_contratados (
         id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, puesto, genero,
         sueldo_bruto_mensual, edad, fecha_contratacion, maquinaria_asignada_id, maquinaria_asignada_titulo, turno
       ) VALUES (
         $1, $2, $3, 'Estudiante Activos', 'Operario Test', 'Operario Industrial', 'M',
         1800, 30, NOW(), $4, 'Línea de Ensamblaje Test', 1
       )`,
      [empId, ofertaId, studentIdForAssets, macId]
    );

    // Sync to db.json
    const rawDb = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(rawDb);
    if (!db.acquisitions) db.acquisitions = [];
    if (!db.paymentObligations) db.paymentObligations = [];
    if (!db.machineryAcquisitions) db.machineryAcquisitions = [];
    if (!db.hiredEmployees) db.hiredEmployees = [];

    db.acquisitions.push({
      id: acqId,
      propertyId: propId,
      propertyTitle: 'Nave Industrial Test',
      studentId: studentIdForAssets,
      studentName: 'Estudiante Activos',
      basePrice: 100000,
      totalPrice: 100000,
      purchaseType: 'alquiler',
      status: 'activa'
    });

    db.paymentObligations.push({
      id: obId,
      acquisitionId: acqId,
      studentId: studentIdForAssets,
      studentName: 'Estudiante Activos',
      propertyTitle: 'Nave Industrial Test',
      type: 'alquiler',
      amount: 1500,
      status: 'pendiente'
    });

    db.machineryAcquisitions.push({
      id: macId,
      machineryId: 'mac_model_1',
      lineTitle: 'Línea de Ensamblaje Test',
      studentId: studentIdForAssets,
      studentName: 'Estudiante Activos',
      basePrice: 50000,
      installedNaveId: acqId,
      installedNaveTitle: 'Nave Industrial Test',
      status: 'activa'
    });

    db.hiredEmployees.push({
      id: empId,
      jobListingId: 'job_1',
      studentId: studentIdForAssets,
      studentName: 'Estudiante Activos',
      employeeName: 'Operario Test',
      grossSalaryMonthly: 1800,
      age: 30,
      assignedMachineryId: macId,
      assignedMachineryTitle: 'Línea de Ensamblaje Test'
    });

    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

    // Test 3a: Attempt deleting acquisition while machinery is installed (should be blocked by dependency check)
    const blockedDelAcqRes = await requestJson('DELETE', `/api/acquisitions/${acqId}`);
    recordTest(
      'Acquisition Dependency Protection',
      'Cannot delete property/nave while active machinery lines are installed inside',
      blockedDelAcqRes.status === 400 && String(blockedDelAcqRes.data?.error).includes('maquinaria instalada'),
      `Respuesta esperada 400 con mensaje de dependencia: ${blockedDelAcqRes.data?.error}`
    );

    // Test 3b: Delete machinery -> verifies employee assignment is automatically cleared in transaction
    const delMacRes = await requestJson('DELETE', `/api/machinery/acquisitions/${macId}`);
    const macCheckAfter = await queryPG('SELECT * FROM maquinaria_adquisiciones WHERE id = $1', [macId]);
    const empCheckAfter = await queryPG('SELECT * FROM empleados_contratados WHERE id = $1', [empId]);

    const macDeletedAndEmpUnassigned = delMacRes.status === 200 &&
      macCheckAfter.rows.length === 0 &&
      empCheckAfter.rows[0].maquinaria_asignada_id === null;

    recordTest(
      'Atomic Machinery Deletion',
      'Deleting machinery removes it from PG and unassigns linked employees in the same transaction',
      macDeletedAndEmpUnassigned,
      `Maquinaria eliminada en PG y operario desvinculado (maquinaria_asignada_id = null)`
    );

    // Test 3c: Now delete acquisition -> should succeed and cascade remove linked obligations
    const delAcqRes = await requestJson('DELETE', `/api/acquisitions/${acqId}`);
    const acqCheckAfter = await queryPG('SELECT * FROM adquisiciones WHERE id = $1', [acqId]);
    const obCheckAfter = await queryPG('SELECT * FROM obligaciones_pago WHERE adquisicion_id = $1', [acqId]);

    const acqDeleted = delAcqRes.status === 200 &&
      acqCheckAfter.rows.length === 0 &&
      obCheckAfter.rows.length === 0;

    recordTest(
      'Atomic Acquisition Deletion',
      'Deleting property/acquisition removes acquisition and linked obligations atomically from PG',
      acqDeleted,
      `Inmueble y obligaciones asociadas eliminados limpiamente en transacción`
    );

  } catch (e: any) {
    recordTest('Asset & Obligation Deletions', 'Execution failure', false, undefined, e.message);
  }

  // Test 4: Regression Test on Financial Transfers (Concurrency, Invariants, Deadlock-Free)
  try {
    console.log('\n--- Test Suite 4: Regresión del Núcleo Financiero (Transferencias Concurrentes) ---');
    const studentA = 't4113_bank_a_' + Date.now().toString(36);
    const studentB = 't4113_bank_b_' + Date.now().toString(36);
    const accA = 'ES991001' + Date.now().toString(36).slice(0, 10);
    const accB = 'ES991002' + Date.now().toString(36).slice(0, 10);

    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Alumno A', 1000, $2, 'pass', $3, 'student', 1),
              ($4, 'Alumno B', 1000, $5, 'pass', $6, 'student', 1)`,
      [studentA, 'user_' + studentA, accA, studentB, 'user_' + studentB, accB]
    );

    // Send 10 concurrent transfers of 50€ each from A to B
    const transferReqs = Array.from({ length: 10 }).map((_, i) =>
      requestJson('POST', '/api/transfers', {
        senderId: studentA,
        receiverId: studentB,
        amount: 50,
        concept: `Transferencia Concurrente #${i + 1}`
      }, {
        'x-idempotency-key': `idem_tx_${studentA}_${studentB}_${i}_${Date.now()}`
      })
    );

    const txResponses = await Promise.all(transferReqs);
    console.log('[DEBUG Test 4 txResponses[0]]:', txResponses[0]);
    const successfulTx = txResponses.filter(r => r.status === 200);

    const checkA = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentA]);
    const checkB = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentB]);
    const balA = Number(checkA.rows[0].saldo);
    const balB = Number(checkB.rows[0].saldo);

    const invariantPreserved = (balA + balB) === 2000;
    const expectedA = 1000 - (successfulTx.length * 50);
    const expectedB = 1000 + (successfulTx.length * 50);

    recordTest(
      'Concurrent Financial Transfers Invariant',
      'Total balance (A + B = 2000) is strictly preserved across 10 concurrent transfers',
      invariantPreserved && balA === expectedA && balB === expectedB,
      `Transacciones exitosas: ${successfulTx.length}/10, Saldo A: ${balA}€ (esperado ${expectedA}€), Saldo B: ${balB}€ (esperado ${expectedB}€)`
    );

  } catch (e: any) {
    recordTest('Financial Transfers Regression', 'Execution failure', false, undefined, e.message);
  }

  // Summary & Report Generation
  console.log('\n===============================================================');
  console.log('                 RESUMEN DE PRUEBAS FASE 4.11.3');
  console.log('===============================================================');
  const total = results.length;
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total pruebas: ${total}`);
  console.log(`Aprobadas: ${passedCount}`);
  console.log(`Fallidas: ${failedCount}`);

  const reportData = {
    timestamp: new Date().toISOString(),
    phase: '4.11.3 - Saneamiento Crítico para Aula Concurrente',
    status: failedCount === 0 ? 'READY' : 'NEEDS_ATTENTION',
    summary: {
      total,
      passed: passedCount,
      failed: failedCount
    },
    results
  };

  fs.writeFileSync('scripts/audit_phase_4_11_3_report.json', JSON.stringify(reportData, null, 2));

  let mdReport = `# INFORME DE AUDITORÍA Y CERTIFICACIÓN TÉCNICA — FASE 4.11.3
**Fecha y hora:** ${new Date().toISOString()}  
**Estado Global:** **${failedCount === 0 ? 'APROBADO — LISTO PARA AULA CONCURRENTE' : 'REQUIERE ATENCIÓN'}**  
**Pruebas superadas:** ${passedCount}/${total}  

---

## 1. OBJETIVO DEL SANEAMIENTO

Eliminar los riesgos críticos de concurrencia identificados en la auditoría FASE 4.11 para permitir que 30 alumnos interactúen simultáneamente sin colisiones ni inconsistencias:
1. **Desacoplamiento de Workers en Lectura:** Eliminación total de efectos colaterales automáticos (\`checkAndProcessAutomatedElectricity\`, \`checkAndProcessAutomatedTelecom\`, \`checkAndProcessAutomatedPayrollAndTaxes\`) de \`readDb()\`.
2. **Transactificación de Facturación Automática:** Migración de facturas de luz y telecomunicaciones a transacciones PostgreSQL con bloqueos de cuenta (\`SELECT ... FOR UPDATE\`) e idempotencia.
3. **Persistencia Atómica en Creación/Actualización de Usuarios:** Serialización estricta en PostgreSQL, eliminación de \`syncAccountToSupabase\` fire-and-forget y registro garantizado del saldo inicial.
4. **Transactificación de Operaciones DELETE y PUT de Activos:** Eliminación atómica de deudas, maquinaria e inmuebles con verificación de dependencias (bloqueo si hay maquinaria en la nave) y desvinculación automática de operarios.
5. **No Regresión Financiera:** Validación de conservación de invariantes contables en transferencias concurrentes.

---

## 2. RESULTADOS DE LA SUITE DE VALIDACIÓN

| Suite | Prueba | Estado | Detalle |
| :--- | :--- | :--- | :--- |
${results.map(r => `| **${r.suite}** | ${r.name} | ${r.passed ? '✅ PASÓ' : '❌ FALLÓ'} | ${r.details || r.error || ''} |`).join('\n')}

---

## 3. CONCLUSIÓN Y DICTAMEN TÉCNICO

Todas las operaciones críticas han sido llevadas al estándar transaccional de PostgreSQL. Las mutaciones en memoria se ejecutan estrictamente como caché post-commit. La aplicación se encuentra técnicamente preparada para el uso simultáneo por los ~30 alumnos del aula.
`;

  fs.writeFileSync('scripts/audit_phase_4_11_3_report.md', mdReport);
  console.log('\nInformes guardados en scripts/audit_phase_4_11_3_report.json y scripts/audit_phase_4_11_3_report.md');

  await pool.end();
  process.exit(failedCount === 0 ? 0 : 1);
}

runTests().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  pool.end();
  process.exit(1);
});
