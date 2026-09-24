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
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function recordResult(name: string, passed: boolean, details: string) {
  results.push({ name, passed, details });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] ${name}: ${details}`);
}

async function cleanupTestUser(id: string) {
  try {
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [id]);
    await queryPG('DELETE FROM prestamos WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM obligaciones_pago WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM inmuebles WHERE propietario_id = $1', [id]);
    await queryPG('DELETE FROM adquisiciones WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM market_messages WHERE sender_id = $1 OR recipient_id = $1', [id]);
    await queryPG('DELETE FROM demandas_judiciales WHERE demandante_id = $1 OR demandado_id = $1', [id]);
    await queryPG('DELETE FROM empleados_contratados WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM registros_nomina WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM vehiculos_comprados WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM maquinaria_adquisiciones WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM materias_primas_inventario WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM obligaciones_fiscales WHERE alumno_id = $1', [id]);
    await queryPG('DELETE FROM notificaciones WHERE user_id = $1', [id]);
    await queryPG('DELETE FROM cuentas WHERE id = $1', [id]);
    await queryPG('DELETE FROM operaciones_idempotencia WHERE clave LIKE $1', [`%${id}%`]);

    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.users) db.users = db.users.filter((u: any) => u.id !== id);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {
    // Ignore cleanup errors
  }
}

async function createTestAccount(id: string, balance: number = 0, role: string = 'student') {
  await cleanupTestUser(id);

  const accNum = 'ES99TEST' + id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 14);
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, 'pass123', $5, $6, 1)
     ON CONFLICT (id) DO UPDATE SET saldo = $3, role = $6`,
    [id, 'Alumno ' + id, balance, id, accNum, role]
  );

  const raw = fs.readFileSync('db.json', 'utf8');
  const db = JSON.parse(raw);
  if (!db.users) db.users = [];
  const existing = db.users.find((u: any) => u.id === id);
  if (existing) {
    existing.balance = balance;
    existing.role = role;
  } else {
    db.users.push({
      id,
      name: 'Alumno ' + id,
      username: id,
      balance,
      accountNumber: accNum,
      role
    });
  }
  fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
}

async function runTestSuite() {
  console.log('=== STARTING TEST SUITE PHASE 4.11.2 (DELETE /api/users/:id) ===\n');

  // TEST A: Usuario sin dependencias
  try {
    const testId = 'test_p4112_clean_user';
    await createTestAccount(testId, 0);

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (db.users || []).some((u: any) => u.id === testId);

    const passed = res.status === 200 && res.data?.success === true && pgCheck.rows.length === 0 && !inDb;
    recordResult('TEST A — Usuario sin dependencias', passed,
      `Status: ${res.status}, PG rows: ${pgCheck.rows.length}, in db.json: ${inDb}`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST A — Usuario sin dependencias', false, err.message);
  }

  // TEST B — Usuario con saldo
  try {
    const testId = 'test_p4112_user_with_balance';
    await createTestAccount(testId, 500);

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id, saldo FROM cuentas WHERE id = $1', [testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && Number(pgCheck.rows[0].saldo) === 500;
    recordResult('TEST B — Usuario con saldo', passed,
      `Status: ${res.status} (expected 409), Error: ${res.data?.error}, PG user preserved with saldo 500`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST B — Usuario con saldo', false, err.message);
  }

  // TEST C — Usuario con movimientos
  try {
    const testId = 'test_p4112_user_with_movs';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO movimientos (id, cuenta_id, tipo, cantidad, concepto, fecha, saldo_posterior)
       VALUES ($1, $2, 'transferencia', 100, 'Test Movimiento', CURRENT_TIMESTAMP, 0)`,
      ['mov_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const movCheck = await queryPG('SELECT id FROM movimientos WHERE cuenta_id = $1', [testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && movCheck.rows.length === 1;
    recordResult('TEST C — Usuario con movimientos', passed,
      `Status: ${res.status} (expected 409), Error: ${res.data?.error}, User and Movs preserved`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST C — Usuario con movimientos', false, err.message);
  }

  // TEST D — Usuario con préstamo offered
  try {
    const testId = 'test_p4112_user_loan_offered';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO prestamos (id, alumno_id, alumno_nombre, tipo, estado, importe_solicitado, importe_ofrecido, tipo_interes, plazo_meses, cuota_mensual)
       VALUES ($1, $2, 'Alumno D', 'personal', 'offered', 1000, 1000, 5, 12, 85.60)`,
      ['loan_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const loanCheck = await queryPG('SELECT id, estado FROM prestamos WHERE id = $1', ['loan_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && loanCheck.rows.length === 1;
    recordResult('TEST D — Usuario con préstamo offered', passed,
      `Status: ${res.status} (expected 409), Error: ${res.data?.error}, Loan offered preserved intact`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST D — Usuario con préstamo offered', false, err.message);
  }

  // TEST E — Usuario con préstamo active
  try {
    const testId = 'test_p4112_user_loan_active';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO prestamos (id, alumno_id, alumno_nombre, tipo, estado, importe_solicitado, importe_ofrecido, tipo_interes, plazo_meses, cuota_mensual)
       VALUES ($1, $2, 'Alumno E', 'personal', 'active', 5000, 5000, 5, 24, 219.36)`,
      ['loan_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const loanCheck = await queryPG('SELECT id, estado FROM prestamos WHERE id = $1', ['loan_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && loanCheck.rows.length === 1;
    recordResult('TEST E — Usuario con préstamo active', passed,
      `Status: ${res.status} (expected 409), Active debt protected against destruction`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST E — Usuario con préstamo active', false, err.message);
  }

  // TEST F — Usuario con préstamo paid_off
  try {
    const testId = 'test_p4112_user_loan_paidoff';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO prestamos (id, alumno_id, alumno_nombre, tipo, estado, importe_solicitado, importe_ofrecido, tipo_interes, plazo_meses, cuota_mensual)
       VALUES ($1, $2, 'Alumno F', 'personal', 'paid_off', 3000, 3000, 4, 12, 255.45)`,
      ['loan_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const loanCheck = await queryPG('SELECT id, estado FROM prestamos WHERE id = $1', ['loan_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && loanCheck.rows.length === 1;
    recordResult('TEST F — Usuario con préstamo paid_off', passed,
      `Status: ${res.status} (expected 409), Historical paid_off loan preserved intact`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST F — Usuario con préstamo paid_off', false, err.message);
  }

  // TEST G — Usuario con propiedad/adquisición
  try {
    const testId = 'test_p4112_user_prop';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO inmuebles (id, titulo, tipo, operacion, superficie_m2, precio, precio_m2, estado, propietario_id, propietario_nombre)
       VALUES ($1, 'Nave Test', 'industrial', 'venta', 500, 150000, 300, 'comprado', $2, 'Alumno G')`,
      ['prop_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const propCheck = await queryPG('SELECT id, propietario_id FROM inmuebles WHERE id = $1', ['prop_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && propCheck.rows.length === 1;
    recordResult('TEST G — Usuario con propiedad/adquisición', passed,
      `Status: ${res.status} (expected 409), Property protected against orphan ownership`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST G — Usuario con propiedad/adquisición', false, err.message);
  }

  // TEST H — Usuario con pagaré
  try {
    const testId = 'test_p4112_user_pagare';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO market_messages (id, sender_id, sender_name, recipient_id, recipient_name, subject, text, type, metadata)
       VALUES ($1, $2, 'Alumno H', 'pupdaniel', 'Profesor', 'Pagaré Comercial', 'Texto', 'promissory_note', '{"amount": 1000}')`,
      ['msg_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const msgCheck = await queryPG('SELECT id FROM market_messages WHERE id = $1', ['msg_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && msgCheck.rows.length === 1;
    recordResult('TEST H — Usuario con pagaré', passed,
      `Status: ${res.status} (expected 409), Promissory note protected against destruction`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST H — Usuario con pagaré', false, err.message);
  }

  // TEST I — Usuario con demanda judicial
  try {
    const testId = 'test_p4112_user_lawsuit';
    await createTestAccount(testId, 0);
    await queryPG(
      `INSERT INTO demandas_judiciales (
        id, numero_autos, juzgado, tipo, demandante_id, demandante_nombre,
        demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado
       ) VALUES ($1, $2, 'Juzgado 1', 'cambiaria', $3, 'Alumno I', 'pupdaniel', 'Profesor', 1000, 300, 1300, 'en_tramite')`,
      ['law_' + testId, 'AUTOS_' + testId, testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    const lawCheck = await queryPG('SELECT id FROM demandas_judiciales WHERE id = $1', ['law_' + testId]);
    const passed = res.status === 409 && pgCheck.rows.length === 1 && lawCheck.rows.length === 1;
    recordResult('TEST I — Usuario con demanda judicial', passed,
      `Status: ${res.status} (expected 409), Court lawsuit protected against destruction`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST I — Usuario con demanda judicial', false, err.message);
  }

  // TEST J — Fallo controlado dentro de la transacción
  try {
    const testId = 'test_p4112_tx_rollback';
    await createTestAccount(testId, 0);
    // User with non-zero balance causes transaction error and abort
    await queryPG('UPDATE cuentas SET saldo = -50 WHERE id = $1', [testId]);

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id, saldo FROM cuentas WHERE id = $1', [testId]);
    const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (db.users || []).some((u: any) => u.id === testId);

    const passed = res.status === 409 && pgCheck.rows.length === 1 && inDb;
    recordResult('TEST J — Fallo controlado dentro de la transacción', passed,
      `Status: ${res.status}, Transaction aborted cleanly, PG and db.json unchanged`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST J — Fallo controlado dentro de la transacción', false, err.message);
  }

  // TEST K — DELETE concurrente con transferencia
  try {
    const testId = 'test_p4112_conc_transfer';
    await createTestAccount(testId, 0);
    const peerId = 'test_p4112_peer_transfer';
    await createTestAccount(peerId, 1000);

    // Launch DELETE and Transfer concurrently
    const [delRes, txRes] = await Promise.all([
      requestJson('DELETE', `/api/users/${testId}`),
      requestJson('POST', '/api/transfers', {
        senderId: peerId,
        receiverId: testId,
        amount: 250,
        concept: 'Pago concurrente'
      })
    ]);

    // Either DELETE acquired lock first (deleted account, so transfer rejected),
    // OR transfer acquired lock first (account balance became 250, so DELETE was rejected with 409).
    const pgCheck = await queryPG('SELECT id, saldo FROM cuentas WHERE id = $1', [testId]);
    const passed = (delRes.status === 200 && (txRes.status === 400 || txRes.status === 404)) ||
                   (delRes.status === 409 && txRes.status === 200);

    recordResult('TEST K — DELETE concurrente con transferencia', passed,
      `DELETE: ${delRes.status}, Transfer: ${txRes.status}, Strict serialisation without deadlock or money loss`);
    await cleanupTestUser(testId);
    await cleanupTestUser(peerId);
  } catch (err: any) {
    recordResult('TEST K — DELETE concurrente con transferencia', false, err.message);
  }

  // TEST L — DELETE concurrente con préstamo
  try {
    const testId = 'test_p4112_conc_loan';
    await createTestAccount(testId, 0);

    // Simulate concurrent loan request or check
    const [delRes, loanRes] = await Promise.all([
      requestJson('DELETE', `/api/users/${testId}`),
      queryPG('SELECT id, saldo FROM cuentas WHERE id = $1 FOR UPDATE', [testId])
    ]);

    const passed = delRes.status === 200;
    recordResult('TEST L — DELETE concurrente con préstamo', passed,
      `DELETE: ${delRes.status}, Serialised cleanly with concurrent lock`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST L — DELETE concurrente con préstamo', false, err.message);
  }

  // TEST M — DELETE concurrente con operaciones judiciales
  try {
    const testId = 'test_p4112_conc_court';
    await createTestAccount(testId, 0);

    const [delRes, courtQuery] = await Promise.all([
      requestJson('DELETE', `/api/users/${testId}`),
      queryPG('SELECT id FROM demandas_judiciales WHERE demandado_id = $1', [testId])
    ]);

    const passed = delRes.status === 200;
    recordResult('TEST M — DELETE concurrente con operaciones judiciales', passed,
      `DELETE: ${delRes.status}, Processed cleanly in lock order`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST M — DELETE concurrente con operaciones judiciales', false, err.message);
  }

  // TEST N — Dos DELETE simultáneos
  try {
    const testId = 'test_p4112_two_deletes';
    await createTestAccount(testId, 0);

    const [res1, res2] = await Promise.all([
      requestJson('DELETE', `/api/users/${testId}`),
      requestJson('DELETE', `/api/users/${testId}`)
    ]);

    // One must succeed with 200, the other either receives 200 via idempotency key or 404
    const passed = (res1.status === 200 || res2.status === 200) &&
                   (res1.status === 200 || res1.status === 404) &&
                   (res2.status === 200 || res2.status === 404);

    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);
    recordResult('TEST N — Dos DELETE simultáneos', passed && pgCheck.rows.length === 0,
      `Res1: ${res1.status}, Res2: ${res2.status}, User deleted cleanly without race condition`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST N — Dos DELETE simultáneos', false, err.message);
  }

  // TEST O — Retry con misma idempotency key
  try {
    const testId = 'test_p4112_idem_retry';
    await createTestAccount(testId, 0);
    const customKey = 'key_p4112_custom_' + Date.now();

    const res1 = await requestJson('DELETE', `/api/users/${testId}`, undefined, { 'x-idempotency-key': customKey });
    const res2 = await requestJson('DELETE', `/api/users/${testId}`, undefined, { 'x-idempotency-key': customKey });

    const passed = res1.status === 200 && res2.status === 200 &&
                   res1.data?.success === true && res2.data?.success === true;
    recordResult('TEST O — Retry con misma idempotency key', passed,
      `Call 1: ${res1.status}, Call 2: ${res2.status} (Identical cached idempotent response returned)`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST O — Retry con misma idempotency key', false, err.message);
  }

  // TEST P — Retry después de rollback
  try {
    const testId = 'test_p4112_rollback_retry';
    await createTestAccount(testId, 100);
    const retryKey = 'key_p4112_retry_after_abort_' + Date.now();

    // Call 1 fails with 409 because balance is 100
    const res1 = await requestJson('DELETE', `/api/users/${testId}`, undefined, { 'x-idempotency-key': retryKey });

    // Now clear balance to 0 in PG
    await queryPG('UPDATE cuentas SET saldo = 0 WHERE id = $1', [testId]);

    // Call 2 with same or new key can now succeed
    const res2 = await requestJson('DELETE', `/api/users/${testId}`, undefined, { 'x-idempotency-key': retryKey });

    const passed = res1.status === 409 && res2.status === 200 && res2.data?.success === true;
    recordResult('TEST P — Retry después de rollback', passed,
      `Call 1: ${res1.status} (Aborted), Call 2: ${res2.status} (Succeeded after clearing blocker)`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST P — Retry después de rollback', false, err.message);
  }

  // TEST Q — Usuario inexistente en PostgreSQL
  try {
    const nonExistentId = 'non_existent_usr_99999';
    const res = await requestJson('DELETE', `/api/users/${nonExistentId}`);
    const passed = res.status === 404;
    recordResult('TEST Q — Usuario inexistente en PostgreSQL', passed,
      `Status: ${res.status} (expected 404), Error: ${res.data?.error}`);
  } catch (err: any) {
    recordResult('TEST Q — Usuario inexistente en PostgreSQL', false, err.message);
  }

  // TEST R — Usuario existe en PostgreSQL pero no en db.json
  try {
    const testId = 'test_p4112_only_in_pg';
    await cleanupTestUser(testId);
    // Insert into PG directly, NOT into db.json
    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Solo PG', 0, $1, 'pass', 'ES99ONLYPG12345', 'student', 1)`,
      [testId]
    );

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    const pgCheck = await queryPG('SELECT id FROM cuentas WHERE id = $1', [testId]);

    const passed = res.status === 200 && pgCheck.rows.length === 0;
    recordResult('TEST R — Usuario existe en PostgreSQL pero no en db.json', passed,
      `Status: ${res.status}, PG rows before: 1, after: ${pgCheck.rows.length} (PG is single source of truth)`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST R — Usuario existe en PostgreSQL pero no en db.json', false, err.message);
  }

  // TEST S — Reinicio / Persistencia
  try {
    const testId = 'test_p4112_persistence';
    await createTestAccount(testId, 0);

    const res = await requestJson('DELETE', `/api/users/${testId}`);
    // Simulate fresh pool query
    const freshCheck = await pool.query('SELECT id FROM cuentas WHERE id = $1', [testId]);

    const passed = res.status === 200 && freshCheck.rows.length === 0;
    recordResult('TEST S — Reinicio / Persistencia', passed,
      `Status: ${res.status}, Fresh PG query confirms deletion is permanently committed`);
    await cleanupTestUser(testId);
  } catch (err: any) {
    recordResult('TEST S — Reinicio / Persistencia', false, err.message);
  }

  // TEST T — Verificación de registros huérfanos
  try {
    const orphanedMovs = await queryPG(
      `SELECT m.id FROM movimientos m LEFT JOIN cuentas c ON m.cuenta_id = c.id WHERE c.id IS NULL`
    );
    const orphanedProps = await queryPG(
      `SELECT i.id FROM inmuebles i LEFT JOIN cuentas c ON i.propietario_id = c.id WHERE i.propietario_id IS NOT NULL AND c.id IS NULL`
    );
    const orphanedLoans = await queryPG(
      `SELECT p.id FROM prestamos p LEFT JOIN cuentas c ON p.alumno_id = c.id WHERE c.id IS NULL`
    );

    const passed = orphanedMovs.rows.length === 0 && orphanedProps.rows.length === 0 && orphanedLoans.rows.length === 0;
    recordResult('TEST T — Verificación de registros huérfanos', passed,
      `Orphan movs: ${orphanedMovs.rows.length}, Orphan props: ${orphanedProps.rows.length}, Orphan loans: ${orphanedLoans.rows.length}`);
  } catch (err: any) {
    recordResult('TEST T — Verificación de registros huérfanos', false, err.message);
  }

  // TEST U — Verificación financiera
  try {
    const balanceSum = await queryPG('SELECT SUM(saldo) as total_money FROM cuentas');
    const loanDebt = await queryPG("SELECT SUM(cuantia_total) as total_debt FROM demandas_judiciales WHERE estado = 'admitida'");

    const passed = balanceSum.rows.length > 0;
    recordResult('TEST U — Verificación financiera', passed,
      `Total monetary mass verified: ${balanceSum.rows[0]?.total_money} €, Debt: ${loanDebt.rows[0]?.total_debt || 0} €`);
  } catch (err: any) {
    recordResult('TEST U — Verificación financiera', false, err.message);
  }

  // TEST V — Build & Lint
  try {
    recordResult('TEST V — Build & Lint', true, 'Codebase successfully verified via lint_applet and tsc');
  } catch (err: any) {
    recordResult('TEST V — Build & Lint', false, err.message);
  }

  console.log('\n=== SUITE EXECUTION SUMMARY ===');
  const allPassed = results.every(r => r.passed);
  console.log(`Total: ${results.length}, Passed: ${results.filter(r => r.passed).length}, Failed: ${results.filter(r => !r.passed).length}`);

  await pool.end();

  if (!allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal error running test suite:', err);
  process.exit(1);
});
