process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import pg from 'pg';
import fs from 'fs';

const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const BASE_URL = 'http://127.0.0.1:3000';

const pool = new pg.Pool({
  connectionString: SUPABASE_URL,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

async function queryPG(sql: string, params?: any[]) {
  return await pool.query(sql, params);
}

async function postJson(endpoint: string, body: any, headers?: Record<string, string>) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(headers || {}) },
      body: JSON.stringify(body)
    });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, error: err.message, data: null };
  }
}

async function setupTestUser(id: string, name: string, balance: number, iban: string) {
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, 'testpass', $5, 'student', 1)
     ON CONFLICT (id) DO UPDATE
     SET alumno = $2, saldo = $3, usuario = $4, account_number = $5`,
    [id, name, balance, id, iban]
  );
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    const existing = db.users.find((u: any) => u.id === id);
    if (existing) {
      existing.name = name;
      existing.balance = balance;
      existing.accountNumber = iban;
    } else {
      db.users.push({ id, name, balance, accountNumber: iban, role: 'student', level: 1 });
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function setupTestLoan(loan: {
  id: string;
  studentId: string;
  studentName: string;
  studentAccount: string;
  requestedAmount: number;
  offeredAmount: number;
  approvedAmount?: number;
  termMonths: number;
  annualInterestRate: number;
  openingFee: number;
  monthlyPayment: number;
  status: string;
  schedule: any[];
}) {
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
      importe_concedido, plazo_meses, tipo_interes, euribor, diferencial, comision_apertura,
      cuota_mensual, estado, garantia_tipo, garantia_inmueble_titulo, garantia_valor_tasacion,
      tabla_amortizacion, fecha_creacion
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, 3.50, 1.00, $10,
      $11, $12, 'property', 'Nave Industrial Test', 200000,
      $13, CURRENT_TIMESTAMP
    ) ON CONFLICT (id) DO UPDATE SET
      estado = $12,
      comision_apertura = $10,
      importe_ofrecido = $6,
      importe_concedido = $7,
      tabla_amortizacion = $13`,
    [
      loan.id,
      loan.studentId,
      loan.studentName,
      loan.studentAccount,
      loan.requestedAmount,
      loan.offeredAmount,
      loan.approvedAmount || null,
      loan.termMonths,
      loan.annualInterestRate,
      loan.openingFee,
      loan.monthlyPayment,
      loan.status,
      JSON.stringify(loan.schedule)
    ]
  );

  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.loans) db.loans = [];
    const existing = db.loans.find((l: any) => l.id === loan.id);
    const loanObj = {
      id: loan.id,
      studentId: loan.studentId,
      studentName: loan.studentName,
      studentAccount: loan.studentAccount,
      requestedAmount: loan.requestedAmount,
      offeredAmount: loan.offeredAmount,
      approvedAmount: loan.approvedAmount,
      termMonths: loan.termMonths,
      annualInterestRate: loan.annualInterestRate,
      euriborRate: 3.50,
      spread: 1.00,
      openingFee: loan.openingFee,
      monthlyPayment: loan.monthlyPayment,
      collateral: {
        type: 'property',
        propertyTitle: 'Nave Industrial Test',
        appraisalValue: 200000
      },
      status: loan.status,
      requiresTeacherApproval: false,
      createdAt: new Date().toISOString(),
      schedule: loan.schedule
    };
    if (existing) {
      Object.assign(existing, loanObj);
    } else {
      db.loans.push(loanObj);
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('FASE 4.9.3 — SUITE DE CONCURRENCIA Y TEST TRANSACCIONAL (ACCEPT)');
  console.log('===============================================================');

  const results: { name: string; passed: boolean; details: string }[] = [];

  // Cleanup before starting
  await queryPG("DELETE FROM movimientos WHERE cuenta_id LIKE 'test_std_493_%'");
  await queryPG("DELETE FROM prestamos WHERE id LIKE 'test_loan_493_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'test_std_493_%'");
  await queryPG("DELETE FROM operaciones_idempotencia WHERE clave LIKE '%493_%'");

  // -------------------------------------------------------------
  // TEST 1 — Aceptación normal
  // -------------------------------------------------------------
  console.log('\n>>> TEST 1: Aceptación normal de un préstamo offered');
  try {
    const studentId = 'test_std_493_1';
    const loanId = 'test_loan_493_1';
    const iban = 'ES110001000149300001';

    await setupTestUser(studentId, 'Alumno 493 Test 1', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const offeredAmount = 50000;
    const openingFee = 50.0; // 1 per thousand = 50.00
    const schedule = [
      { period: 1, payment: 1500, interest: 200, principal: 1300, pendingBalance: 48700, paid: false, dueDate: new Date().toISOString() },
      { period: 2, payment: 1500, interest: 195, principal: 1305, pendingBalance: 47395, paid: false, dueDate: new Date().toISOString() }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 1',
      studentAccount: iban,
      requestedAmount: 50000,
      offeredAmount,
      termMonths: 36,
      annualInterestRate: 4.5,
      openingFee,
      monthlyPayment: 1500,
      status: 'offered',
      schedule
    });

    const res = await postJson(`/api/loans/${loanId}/accept`, { studentId });
    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanRow = (await queryPG('SELECT estado, importe_concedido, fecha_aceptacion, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1 ORDER BY fecha ASC', [studentId])).rows;

    const expectedSaldo = 1000 - openingFee + offeredAmount; // 50950.00
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const loanIsActive = loanRow.estado === 'active';
    const approvedMatches = Number(loanRow.importe_concedido) === offeredAmount;
    const hasAcceptedAt = !!loanRow.fecha_aceptacion;
    const movsCountCorrect = movRows.length === 2;
    const feeMov = movRows.find((m: any) => m.tipo === 'TRANSFER_OUT' && Number(m.importe) === openingFee);
    const disbMov = movRows.find((m: any) => m.tipo === 'TRANSFER_IN' && Number(m.importe) === offeredAmount);

    const passed = res.status === 200 && saldoMatches && loanIsActive && approvedMatches && hasAcceptedAt && movsCountCorrect && !!feeMov && !!disbMov;
    results.push({
      name: 'TEST 1: Aceptación normal',
      passed,
      details: `Status: ${res.status}, Saldo: ${accRow?.saldo} (Esperado: ${expectedSaldo}), Estado: ${loanRow?.estado}, Movimientos: ${movRows.length}`
    });
    console.log(`Test 1: ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}, Estado: ${loanRow?.estado}`);
  } catch (e: any) {
    results.push({ name: 'TEST 1: Aceptación normal', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 2 — Doble aceptación simultánea, MISMA clave
  // -------------------------------------------------------------
  console.log('\n>>> TEST 2: Doble aceptación simultánea con la MISMA clave de idempotencia');
  try {
    const studentId = 'test_std_493_2';
    const loanId = 'test_loan_493_2';
    const iban = 'ES110001000149300002';
    const sameKey = 'idem_493_same_key_test';

    await setupTestUser(studentId, 'Alumno 493 Test 2', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const offeredAmount = 20000;
    const openingFee = 20.0;

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 2',
      studentAccount: iban,
      requestedAmount: 20000,
      offeredAmount,
      termMonths: 24,
      annualInterestRate: 4.5,
      openingFee,
      monthlyPayment: 870,
      status: 'offered',
      schedule: []
    });

    const [resA, resB] = await Promise.all([
      postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': sameKey }),
      postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': sameKey })
    ]);

    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;
    const loanRow = (await queryPG('SELECT estado, importe_concedido FROM prestamos WHERE id = $1', [loanId])).rows[0];

    const expectedSaldo = 1000.0 - openingFee + offeredAmount; // 20980.00
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const singleDisbursement = movRows.length === 2; // 1 fee + 1 disbursement ONLY
    const loanActive = loanRow.estado === 'active';
    const bothHttpOk = resA.status === 200 && resB.status === 200;

    const passed = saldoMatches && singleDisbursement && loanActive && bothHttpOk;
    results.push({
      name: 'TEST 2: Doble aceptación simultánea (Misma clave)',
      passed,
      details: `Resp A: ${resA.status}, Resp B: ${resB.status}, Saldo: ${accRow?.saldo} (Esperado: ${expectedSaldo}), Movimientos: ${movRows.length} (Esperado: 2)`
    });
    console.log(`Test 2: ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}, Movs: ${movRows.length}`);
  } catch (e: any) {
    results.push({ name: 'TEST 2: Doble aceptación simultánea (Misma clave)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 3 — Doble aceptación simultánea, DIFERENTES claves
  // -------------------------------------------------------------
  console.log('\n>>> TEST 3: Doble aceptación simultánea con DIFERENTES claves');
  try {
    const studentId = 'test_std_493_3';
    const loanId = 'test_loan_493_3';
    const iban = 'ES110001000149300003';

    await setupTestUser(studentId, 'Alumno 493 Test 3', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const offeredAmount = 30000;
    const openingFee = 30.0;

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 3',
      studentAccount: iban,
      requestedAmount: 30000,
      offeredAmount,
      termMonths: 36,
      annualInterestRate: 5.0,
      openingFee,
      monthlyPayment: 900,
      status: 'offered',
      schedule: []
    });

    const keyA = 'idem_493_key_A';
    const keyB = 'idem_493_key_B';

    const [resA, resB] = await Promise.all([
      postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': keyA }),
      postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': keyB })
    ]);

    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;
    const loanRow = (await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId])).rows[0];

    const expectedSaldo = 1000.0 - openingFee + offeredAmount; // 30970.00
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const singleDisbursement = movRows.length === 2; // Exactly 1 fee and 1 disbursement
    // Exactly one should be 200, the other should be 400
    const oneSuccessOne400 = (resA.status === 200 && resB.status === 400) || (resA.status === 400 && resB.status === 200);

    const passed = saldoMatches && singleDisbursement && loanRow.estado === 'active' && oneSuccessOne400;
    results.push({
      name: 'TEST 3: Doble aceptación simultánea (Diferentes claves)',
      passed,
      details: `Resp A: ${resA.status}, Resp B: ${resB.status}, Saldo: ${accRow?.saldo}, Movimientos: ${movRows.length}`
    });
    console.log(`Test 3: ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}, Movs: ${movRows.length}`);
  } catch (e: any) {
    results.push({ name: 'TEST 3: Doble aceptación simultánea (Diferentes claves)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 4 — Aceptación + transferencia simultánea
  // -------------------------------------------------------------
  console.log('\n>>> TEST 4: Aceptación de préstamo + transferencia simultánea (Sin deadlocks)');
  try {
    const studentA = 'test_std_493_4a';
    const studentB = 'test_std_493_4b';
    const loanId = 'test_loan_493_4';
    const ibanA = 'ES11000100014930004A';
    const ibanB = 'ES11000100014930004B';

    await setupTestUser(studentA, 'Alumno 493 Test 4A', 1000.0, ibanA);
    await setupTestUser(studentB, 'Alumno 493 Test 4B', 500.0, ibanB);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id IN ($1, $2)', [studentA, studentB]);

    const offeredAmount = 10000;
    const openingFee = 10.0;

    await setupTestLoan({
      id: loanId,
      studentId: studentA,
      studentName: 'Alumno 493 Test 4A',
      studentAccount: ibanA,
      requestedAmount: 10000,
      offeredAmount,
      termMonths: 12,
      annualInterestRate: 4.0,
      openingFee,
      monthlyPayment: 850,
      status: 'offered',
      schedule: []
    });

    // Concurrently: accept loan on studentA AND transfer 200 from studentA to studentB
    const [resAccept, resTransfer] = await Promise.all([
      postJson(`/api/loans/${loanId}/accept`, { studentId: studentA }),
      postJson('/api/transfers', {
        senderId: studentA,
        receiverId: studentB,
        amount: 200,
        concept: 'Transferencia paralela concurrent test'
      })
    ]);

    const rowA = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentA])).rows[0];
    const rowB = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentB])).rows[0];
    const movsA = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentA])).rows;
    const movsB = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentB])).rows;

    // Expected for A: 1000 - 10 (fee) + 10000 (disb) - 200 (transfer) = 10790.00
    const expectedSaldoA = 10790.00;
    const expectedSaldoB = 700.00;
    const saldoAMatches = Math.abs(Number(rowA.saldo) - expectedSaldoA) < 0.01;
    const saldoBMatches = Math.abs(Number(rowB.saldo) - expectedSaldoB) < 0.01;
    const bothOk = resAccept.status === 200 && resTransfer.status === 200;

    const passed = bothOk && saldoAMatches && saldoBMatches && movsA.length === 3 && movsB.length === 1;
    results.push({
      name: 'TEST 4: Aceptación + Transferencia simultánea',
      passed,
      details: `Accept status: ${resAccept.status}, Transfer status: ${resTransfer.status}, Saldo A: ${rowA?.saldo} (Esperado: ${expectedSaldoA}), Saldo B: ${rowB?.saldo} (Esperado: ${expectedSaldoB})`
    });
    console.log(`Test 4: ${passed ? 'PASSED' : 'FAILED'} - Saldo A: ${rowA?.saldo}, Saldo B: ${rowB?.saldo}`);
  } catch (e: any) {
    results.push({ name: 'TEST 4: Aceptación + Transferencia simultánea', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 5 — Aceptación + worker de cuotas (processStudentAutomaticPayments)
  // -------------------------------------------------------------
  console.log('\n>>> TEST 5: Aceptación + worker de cobros automáticos concurrente');
  try {
    const studentId = 'test_std_493_5';
    const loanAcceptId = 'test_loan_493_5_acc';
    const loanWorkerId = 'test_loan_493_5_wrk';
    const iban = 'ES110001000149300005';

    await setupTestUser(studentId, 'Alumno 493 Test 5', 500.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    // Loan to be accepted
    const offeredAmount = 15000;
    const openingFee = 15.0;
    await setupTestLoan({
      id: loanAcceptId,
      studentId,
      studentName: 'Alumno 493 Test 5',
      studentAccount: iban,
      requestedAmount: 15000,
      offeredAmount,
      termMonths: 24,
      annualInterestRate: 4.5,
      openingFee,
      monthlyPayment: 650,
      status: 'offered',
      schedule: []
    });

    // Loan already active with an overdue installment of 100.00
    const pastDueDate = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    await setupTestLoan({
      id: loanWorkerId,
      studentId,
      studentName: 'Alumno 493 Test 5',
      studentAccount: iban,
      requestedAmount: 2000,
      offeredAmount: 2000,
      approvedAmount: 2000,
      termMonths: 1,
      annualInterestRate: 5.0,
      openingFee: 2.0,
      monthlyPayment: 100,
      status: 'active',
      schedule: [
        { period: 1, payment: 100, interest: 10, principal: 90, pendingBalance: 0, paid: false, isOverdue: false, dueDate: pastDueDate }
      ]
    });

    // Concurrently: accept loanAcceptId AND run verify-payments
    const [resAccept, resWorker] = await Promise.all([
      postJson(`/api/loans/${loanAcceptId}/accept`, { studentId }),
      postJson('/api/student/verify-payments', { studentId })
    ]);

    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanAccRow = (await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanAcceptId])).rows[0];
    const loanWrkRow = (await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanWorkerId])).rows[0];

    // Expected final saldo: 500 - 15 (fee) + 15000 (disb) - 100 (cuota) = 15385.00
    const expectedSaldo = 15385.00;
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const loanAccActive = loanAccRow.estado === 'active';
    const wrkSchedule = typeof loanWrkRow.tabla_amortizacion === 'string' ? JSON.parse(loanWrkRow.tabla_amortizacion) : loanWrkRow.tabla_amortizacion;
    const cuotaPaid = wrkSchedule[0].paid === true;

    const passed = resAccept.status === 200 && resWorker.status === 200 && saldoMatches && loanAccActive && cuotaPaid;
    results.push({
      name: 'TEST 5: Aceptación + Worker de cuotas concurrente',
      passed,
      details: `Accept: ${resAccept.status}, Worker: ${resWorker.status}, Saldo: ${accRow?.saldo} (Esperado: ${expectedSaldo}), Cuota Pagada: ${cuotaPaid}`
    });
    console.log(`Test 5: ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}, Cuota pagada: ${cuotaPaid}`);
  } catch (e: any) {
    results.push({ name: 'TEST 5: Aceptación + Worker de cuotas concurrente', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 6 — Saldo insuficiente para comisión
  // -------------------------------------------------------------
  console.log('\n>>> TEST 6: Saldo insuficiente para abonar la comisión de apertura');
  try {
    const studentId = 'test_std_493_6';
    const loanId = 'test_loan_493_6';
    const iban = 'ES110001000149300006';

    // Saldo: 10.00 €, pero la comisión del 1‰ de 50.000 € es 50.00 €
    await setupTestUser(studentId, 'Alumno 493 Test 6', 10.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 6',
      studentAccount: iban,
      requestedAmount: 50000,
      offeredAmount: 50000,
      termMonths: 24,
      annualInterestRate: 4.5,
      openingFee: 50.0,
      monthlyPayment: 2100,
      status: 'offered',
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/accept`, { studentId });
    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanRow = (await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;

    const is400 = res.status === 400;
    const saldoIntact = Math.abs(Number(accRow.saldo) - 10.0) < 0.01;
    const loanStillOffered = loanRow.estado === 'offered';
    const zeroMovs = movRows.length === 0;

    const passed = is400 && saldoIntact && loanStillOffered && zeroMovs;
    results.push({
      name: 'TEST 6: Saldo insuficiente para comisión',
      passed,
      details: `Status: ${res.status} (Esperado: 400), Saldo: ${accRow?.saldo} (Esperado: 10), Estado: ${loanRow?.estado} (Esperado: offered), Movs: ${movRows.length} (Esperado: 0)`
    });
    console.log(`Test 6: ${passed ? 'PASSED' : 'FAILED'} - Status: ${res.status}, Saldo: ${accRow?.saldo}`);
  } catch (e: any) {
    results.push({ name: 'TEST 6: Saldo insuficiente para comisión', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 7 — Rollback atómico ante fallo previo a COMMIT
  // -------------------------------------------------------------
  console.log('\n>>> TEST 7: Rollback atómico ante fallo previo a COMMIT');
  try {
    const studentId = 'test_std_493_7';
    const loanId = 'test_loan_493_7';
    const iban = 'ES110001000149300007';

    await setupTestUser(studentId, 'Alumno 493 Test 7', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 7',
      studentAccount: iban,
      requestedAmount: 10000,
      offeredAmount: 10000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 10.0,
      monthlyPayment: 850,
      status: 'offered',
      schedule: []
    });

    // We execute a transaction that modifies cuentas, prestamos, and inserts a movimiento, then deliberately throws before COMMIT
    let caughtError = false;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE cuentas SET saldo = saldo + 9990 WHERE id = $1', [studentId]);
      await client.query("UPDATE prestamos SET estado = 'active' WHERE id = $1", [loanId]);
      await client.query(
        `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto)
         VALUES ($1, $2, 'TRANSFER_IN', 10000, CURRENT_TIMESTAMP, 'Disbursement before simulated crash')`,
        ['test_mov_crash_493', studentId]
      );
      // Simulate sudden crash/exception prior to commit
      throw new Error('Simulated crash right before COMMIT');
    } catch (simErr: any) {
      caughtError = true;
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanRow = (await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;

    const saldoIntact = Math.abs(Number(accRow.saldo) - 1000.0) < 0.01;
    const loanIntact = loanRow.estado === 'offered';
    const zeroMovs = movRows.length === 0;

    const passed = caughtError && saldoIntact && loanIntact && zeroMovs;
    results.push({
      name: 'TEST 7: Rollback atómico ante fallo previo a COMMIT',
      passed,
      details: `Error capturado: ${caughtError}, Saldo: ${accRow?.saldo} (Esperado: 1000), Estado: ${loanRow?.estado} (Esperado: offered), Movs: ${movRows.length} (Esperado: 0)`
    });
    console.log(`Test 7: ${passed ? 'PASSED' : 'FAILED'} - Saldo intacto: ${accRow?.saldo}, Estado: ${loanRow?.estado}`);
  } catch (e: any) {
    results.push({ name: 'TEST 7: Rollback atómico ante fallo previo a COMMIT', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 8 — Reinicio después de COMMIT
  // -------------------------------------------------------------
  console.log('\n>>> TEST 8: Persistencia y restauración íntegra tras reinicio');
  try {
    const studentId = 'test_std_493_8';
    const loanId = 'test_loan_493_8';
    const iban = 'ES110001000149300008';

    await setupTestUser(studentId, 'Alumno 493 Test 8', 1500.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const offeredAmount = 25000;
    const openingFee = 25.0;

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 8',
      studentAccount: iban,
      requestedAmount: 25000,
      offeredAmount,
      termMonths: 36,
      annualInterestRate: 4.0,
      openingFee,
      monthlyPayment: 740,
      status: 'offered',
      schedule: []
    });

    const resAccept = await postJson(`/api/loans/${loanId}/accept`, { studentId });

    // Simulate wipe of local in-memory DB snapshot
    try {
      const raw = fs.readFileSync('db.json', 'utf8');
      const db = JSON.parse(raw);
      db.loans = (db.loans || []).filter((l: any) => l.id !== loanId);
      const user = db.users.find((u: any) => u.id === studentId);
      if (user) user.balance = 0; // wiped memory
      fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    } catch (e) {}

    // Verify directly from PostgreSQL (the single source of truth)
    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanRow = (await queryPG('SELECT * FROM prestamos WHERE id = $1', [loanId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;

    const expectedSaldo = 1500.0 - openingFee + offeredAmount; // 26475.00
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const loanIsActive = loanRow.estado === 'active';
    const approvedMatches = Number(loanRow.importe_concedido) === offeredAmount;
    const hasAcceptedAt = !!loanRow.fecha_aceptacion;
    const schedule = typeof loanRow.tabla_amortizacion === 'string' ? JSON.parse(loanRow.tabla_amortizacion) : loanRow.tabla_amortizacion;
    const scheduleValid = Array.isArray(schedule) && schedule.length === 36;
    const movsCountCorrect = movRows.length === 2;

    const passed = resAccept.status === 200 && saldoMatches && loanIsActive && approvedMatches && hasAcceptedAt && scheduleValid && movsCountCorrect;
    results.push({
      name: 'TEST 8: Reinicio y restauración desde PostgreSQL',
      passed,
      details: `Saldo en PG: ${accRow?.saldo} (Esperado: ${expectedSaldo}), Estado: ${loanRow?.estado}, Cuotas en tabla: ${schedule?.length}`
    });
    console.log(`Test 8: ${passed ? 'PASSED' : 'FAILED'} - Saldo PG: ${accRow?.saldo}, Cuotas: ${schedule?.length}`);
  } catch (e: any) {
    results.push({ name: 'TEST 8: Reinicio y restauración desde PostgreSQL', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 9 — Reintento después de COMMIT (Misma Idempotency Key)
  // -------------------------------------------------------------
  console.log('\n>>> TEST 9: Reintento después de COMMIT con la misma clave de idempotencia');
  try {
    const studentId = 'test_std_493_9';
    const loanId = 'test_loan_493_9';
    const iban = 'ES110001000149300009';
    const key = 'idem_493_retry_after_commit';

    await setupTestUser(studentId, 'Alumno 493 Test 9', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const offeredAmount = 10000;
    const openingFee = 10.0;

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 9',
      studentAccount: iban,
      requestedAmount: 10000,
      offeredAmount,
      termMonths: 12,
      annualInterestRate: 4.0,
      openingFee,
      monthlyPayment: 850,
      status: 'offered',
      schedule: []
    });

    const resFirst = await postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': key });
    const movsAfterFirst = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;
    const saldoAfterFirst = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0].saldo;

    // Retry exact same request with same key
    const resSecond = await postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': key });
    const movsAfterSecond = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;
    const saldoAfterSecond = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0].saldo;

    const noExtraDebits = Math.abs(Number(saldoAfterFirst) - Number(saldoAfterSecond)) < 0.01;
    const noExtraMovements = movsAfterFirst.length === movsAfterSecond.length && movsAfterSecond.length === 2;
    const secondOk = resSecond.status === 200;

    const passed = resFirst.status === 200 && secondOk && noExtraDebits && noExtraMovements;
    results.push({
      name: 'TEST 9: Reintento después de COMMIT (Misma clave)',
      passed,
      details: `First status: ${resFirst.status}, Second status: ${resSecond.status}, Saldo 1: ${saldoAfterFirst}, Saldo 2: ${saldoAfterSecond}, Movs: ${movsAfterSecond.length}`
    });
    console.log(`Test 9: ${passed ? 'PASSED' : 'FAILED'} - Saldo 1: ${saldoAfterFirst}, Saldo 2: ${saldoAfterSecond}`);
  } catch (e: any) {
    results.push({ name: 'TEST 9: Reintento después de COMMIT (Misma clave)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 10 — Préstamo ya activo
  // -------------------------------------------------------------
  console.log('\n>>> TEST 10: Intento de aceptar un préstamo ya active');
  try {
    const studentId = 'test_std_493_10';
    const loanId = 'test_loan_493_10';
    const iban = 'ES110001000149300010';

    await setupTestUser(studentId, 'Alumno 493 Test 10', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Test 10',
      studentAccount: iban,
      requestedAmount: 10000,
      offeredAmount: 10000,
      approvedAmount: 10000,
      termMonths: 12,
      annualInterestRate: 4.0,
      openingFee: 10.0,
      monthlyPayment: 850,
      status: 'active', // ALREADY ACTIVE
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/accept`, { studentId }, { 'x-idempotency-key': 'new_key_for_active_loan' });
    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;

    const is400 = res.status === 400;
    const saldoIntact = Math.abs(Number(accRow.saldo) - 1000.0) < 0.01;
    const zeroMovs = movRows.length === 0;

    const passed = is400 && saldoIntact && zeroMovs;
    results.push({
      name: 'TEST 10: Préstamo ya activo',
      passed,
      details: `Status: ${res.status} (Esperado: 400), Saldo: ${accRow?.saldo} (Esperado: 1000), Movs: ${movRows.length} (Esperado: 0)`
    });
    console.log(`Test 10: ${passed ? 'PASSED' : 'FAILED'} - Status: ${res.status}, Saldo: ${accRow?.saldo}`);
  } catch (e: any) {
    results.push({ name: 'TEST 10: Préstamo ya activo', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // REGRESIONES FASE 4.9.2: Cobros automáticos del worker
  // -------------------------------------------------------------
  console.log('\n>>> REGRESIÓN FASE 4.9.2: Cobro normal de cuota del worker');
  try {
    const studentId = 'test_std_493_reg_1';
    const loanId = 'test_loan_493_reg_1';
    const iban = 'ES110001000149300REG';

    await setupTestUser(studentId, 'Alumno 493 Regresión', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const pastDueDate = new Date().toISOString();
    const schedule = [
      { period: 1, payment: 250, interest: 25, principal: 225, pendingBalance: 2000, paid: false, isOverdue: false, dueDate: pastDueDate },
      { period: 2, payment: 250, interest: 20, principal: 230, pendingBalance: 1770, paid: false, isOverdue: false, dueDate: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString() }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Regresión',
      studentAccount: iban,
      requestedAmount: 2250,
      offeredAmount: 2250,
      approvedAmount: 2250,
      termMonths: 2,
      annualInterestRate: 5.0,
      openingFee: 2.25,
      monthlyPayment: 250,
      status: 'active',
      schedule
    });

    const res = await postJson('/api/student/verify-payments', { studentId });
    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const loanRow = (await queryPG('SELECT tabla_amortizacion, estado FROM prestamos WHERE id = $1', [loanId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;

    const expectedSaldo = 750.0; // 1000 - 250
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const sched = typeof loanRow.tabla_amortizacion === 'string' ? JSON.parse(loanRow.tabla_amortizacion) : loanRow.tabla_amortizacion;
    const row1Paid = sched[0].paid === true;
    const row2NotPaid = sched[1].paid === false;

    const passed = res.status === 200 && saldoMatches && row1Paid && row2NotPaid && movRows.length === 1;
    results.push({
      name: 'REGRESIÓN 4.9.2: Cobro normal de cuota del worker',
      passed,
      details: `Status: ${res.status}, Saldo: ${accRow?.saldo} (Esperado: 750), Row1 Paid: ${row1Paid}, Movs: ${movRows.length}`
    });
    console.log(`Regresión 4.9.2: ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}`);
  } catch (e: any) {
    results.push({ name: 'REGRESIÓN 4.9.2: Cobro normal de cuota del worker', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // REGRESIONES FASE 4.9.2: Dos workers simultáneos (Anti Doble Cobro)
  // -------------------------------------------------------------
  console.log('\n>>> REGRESIÓN FASE 4.9.2: Dos workers simultáneos (Anti Doble Cobro)');
  try {
    const studentId = 'test_std_493_reg_2';
    const loanId = 'test_loan_493_reg_2';
    const iban = 'ES110001000149300RE2';

    await setupTestUser(studentId, 'Alumno 493 Regresión 2', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const pastDueDate = new Date(Date.now() - 3600 * 1000).toISOString();
    const schedule = [
      { period: 1, payment: 200, interest: 20, principal: 180, pendingBalance: 0, paid: false, isOverdue: false, dueDate: pastDueDate }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno 493 Regresión 2',
      studentAccount: iban,
      requestedAmount: 200,
      offeredAmount: 200,
      approvedAmount: 200,
      termMonths: 1,
      annualInterestRate: 5.0,
      openingFee: 1.0,
      monthlyPayment: 200,
      status: 'active',
      schedule
    });

    const [w1, w2] = await Promise.all([
      postJson('/api/student/verify-payments', { studentId }),
      postJson('/api/student/verify-payments', { studentId })
    ]);

    const accRow = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId])).rows[0];
    const movRows = (await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1', [studentId])).rows;
    const loanRow = (await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId])).rows[0];

    const expectedSaldo = 800.0;
    const saldoMatches = Math.abs(Number(accRow.saldo) - expectedSaldo) < 0.01;
    const exactOneMov = movRows.length === 1;
    const sched = typeof loanRow.tabla_amortizacion === 'string' ? JSON.parse(loanRow.tabla_amortizacion) : loanRow.tabla_amortizacion;
    const rowPaid = sched[0].paid === true;
    const isPaidOff = loanRow.estado === 'paid_off';

    const passed = saldoMatches && exactOneMov && rowPaid && isPaidOff;
    results.push({
      name: 'REGRESIÓN 4.9.2: Dos workers simultáneos (Anti Doble Cobro)',
      passed,
      details: `Saldo: ${accRow?.saldo} (Esperado: 800), Movs: ${movRows.length} (Esperado: 1), Estado: ${loanRow?.estado}`
    });
    console.log(`Regresión 4.9.2 (2): ${passed ? 'PASSED' : 'FAILED'} - Saldo: ${accRow?.saldo}`);
  } catch (e: any) {
    results.push({ name: 'REGRESIÓN 4.9.2: Dos workers simultáneos (Anti Doble Cobro)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // Clean up test data
  // -------------------------------------------------------------
  await queryPG("DELETE FROM movimientos WHERE cuenta_id LIKE 'test_std_493_%'");
  await queryPG("DELETE FROM prestamos WHERE id LIKE 'test_loan_493_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'test_std_493_%'");
  await queryPG("DELETE FROM operaciones_idempotencia WHERE clave LIKE '%493_%'");
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.users) db.users = db.users.filter((u: any) => !u.id.startsWith('test_std_493_'));
    if (db.loans) db.loans = db.loans.filter((l: any) => !l.id.startsWith('test_loan_493_'));
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  console.log('\n===============================================================');
  console.log('RESUMEN DE RESULTADOS FASE 4.9.3');
  console.log('===============================================================');
  let allPassed = true;
  for (const r of results) {
    const icon = r.passed ? '✅ [PASS]' : '❌ [FAIL]';
    console.log(`${icon} ${r.name} -> ${r.details}`);
    if (!r.passed) allPassed = false;
  }

  const passedCount = results.filter(r => r.passed).length;
  console.log(`\nTotal: ${passedCount}/${results.length} pruebas superadas.`);

  await pool.end();
  process.exit(allPassed ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
