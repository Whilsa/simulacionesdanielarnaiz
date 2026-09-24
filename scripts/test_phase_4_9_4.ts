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
  requiresTeacherApproval?: boolean;
  teacherNotes?: string;
}) {
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
      importe_concedido, plazo_meses, tipo_interes, euribor, diferencial, comision_apertura,
      cuota_mensual, estado, requiere_profesor, notas_profesor, garantia_tipo, garantia_inmueble_titulo, garantia_valor_tasacion,
      tabla_amortizacion, fecha_creacion
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, 3.50, 1.00, $10,
      $11, $12, $13, $14, 'property', 'Nave Industrial Test', 200000,
      $15, CURRENT_TIMESTAMP
    ) ON CONFLICT (id) DO UPDATE SET
      estado = $12,
      comision_apertura = $10,
      importe_ofrecido = $6,
      importe_concedido = $7,
      plazo_meses = $8,
      tipo_interes = $9,
      cuota_mensual = $11,
      requiere_profesor = $13,
      notas_profesor = $14,
      tabla_amortizacion = $15`,
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
      Boolean(loan.requiresTeacherApproval),
      loan.teacherNotes || null,
      JSON.stringify(loan.schedule)
    ]
  );

  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.loans) db.loans = [];
    const idx = db.loans.findIndex((l: any) => l.id === loan.id);
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
        appraisalValue: 200000,
        surfaceM2: 500
      },
      status: loan.status,
      requiresTeacherApproval: Boolean(loan.requiresTeacherApproval),
      teacherNotes: loan.teacherNotes,
      createdAt: new Date().toISOString(),
      schedule: loan.schedule
    };
    if (idx !== -1) {
      db.loans[idx] = loanObj;
    } else {
      db.loans.push(loanObj);
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

async function waitForServerReady() {
  for (let i = 0; i < 30; i++) {
    try {
      const res = await fetch(`${BASE_URL}/api/users`);
      if (res.ok) return;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Server did not become ready in time');
}

async function runTestSuite() {
  console.log('===============================================================');
  console.log('SUITE DE VERIFICACIÓN FASE 4.9.4: REJECT Y REVIEW DOCENTE');
  console.log('===============================================================');

  await waitForServerReady();

  const results: TestResult[] = [];

  // Ensure clean test state
  await queryPG("DELETE FROM prestamos WHERE id LIKE 'test_loan_494_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'test_std_494_%'");
  await queryPG("DELETE FROM movimientos WHERE cuenta_id LIKE 'test_std_494_%'");
  await queryPG("DELETE FROM operaciones_idempotencia WHERE clave LIKE '%494_%'");

  // -------------------------------------------------------------
  // TEST 1: Reject de préstamo en estado 'offered'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_01';
    const loanId = 'test_loan_494_01';
    await setupTestUser(stdId, 'Alumno 494 01', 5000, 'ES000049401');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 01',
      studentAccount: 'ES000049401',
      requestedAmount: 50000,
      offeredAmount: 50000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 50,
      monthlyPayment: 4268.22,
      status: 'offered',
      schedule: [{ installmentNumber: 1, payment: 4268.22, principal: 4080.72, interest: 187.5, remainingBalance: 45919.28, dueDate: '2026-10-01', paid: false }]
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 200 && res.data.success && pgRes.rows[0]?.estado === 'rejected';

    results.push({
      name: 'TEST 1: Reject de préstamo en estado "offered"',
      passed,
      details: `HTTP: ${res.status}, Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 1: Reject de préstamo en estado "offered"', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 2: Reject de préstamo en estado 'teacher_offered'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_02';
    const loanId = 'test_loan_494_02';
    await setupTestUser(stdId, 'Alumno 494 02', 5000, 'ES000049402');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 02',
      studentAccount: 'ES000049402',
      requestedAmount: 60000,
      offeredAmount: 55000,
      termMonths: 24,
      annualInterestRate: 4.0,
      openingFee: 55,
      monthlyPayment: 2388.00,
      status: 'teacher_offered',
      schedule: [{ installmentNumber: 1, payment: 2388.00, principal: 2204.67, interest: 183.33, remainingBalance: 52795.33, dueDate: '2026-10-01', paid: false }]
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 200 && res.data.success && pgRes.rows[0]?.estado === 'rejected';

    results.push({
      name: 'TEST 2: Reject de préstamo en estado "teacher_offered"',
      passed,
      details: `HTTP: ${res.status}, Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 2: Reject de préstamo en estado "teacher_offered"', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 3: Reject de préstamo en estado 'pending_teacher'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_03';
    const loanId = 'test_loan_494_03';
    await setupTestUser(stdId, 'Alumno 494 03', 5000, 'ES000049403');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 03',
      studentAccount: 'ES000049403',
      requestedAmount: 100000,
      offeredAmount: 100000,
      termMonths: 36,
      annualInterestRate: 5.0,
      openingFee: 100,
      monthlyPayment: 2997.09,
      status: 'pending_teacher',
      requiresTeacherApproval: true,
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 200 && res.data.success && pgRes.rows[0]?.estado === 'rejected';

    results.push({
      name: 'TEST 3: Reject de préstamo en estado "pending_teacher"',
      passed,
      details: `HTTP: ${res.status}, Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 3: Reject de préstamo en estado "pending_teacher"', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 4: Validación de pertenencia en reject (alumno no autorizado)
  // -------------------------------------------------------------
  try {
    const stdIdOwner = 'test_std_494_04_owner';
    const stdIdAttacker = 'test_std_494_04_attacker';
    const loanId = 'test_loan_494_04';
    await setupTestUser(stdIdOwner, 'Alumno Owner', 5000, 'ES000049404A');
    await setupTestUser(stdIdAttacker, 'Alumno Attacker', 5000, 'ES000049404B');
    await setupTestLoan({
      id: loanId,
      studentId: stdIdOwner,
      studentName: 'Alumno Owner',
      studentAccount: 'ES000049404A',
      requestedAmount: 30000,
      offeredAmount: 30000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 30,
      monthlyPayment: 2560.93,
      status: 'offered',
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdIdAttacker });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 403 && pgRes.rows[0]?.estado === 'offered';

    results.push({
      name: 'TEST 4: Validación de pertenencia en reject (403 Forbidden)',
      passed,
      details: `HTTP: ${res.status} (Esperado 403), Estado PG: ${pgRes.rows[0]?.estado} (Esperado offered)`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 4: Validación de pertenencia en reject (403 Forbidden)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 5: Reject prohibido en préstamo 'active'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_05';
    const loanId = 'test_loan_494_05';
    await setupTestUser(stdId, 'Alumno 494 05', 5000, 'ES000049405');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 05',
      studentAccount: 'ES000049405',
      requestedAmount: 40000,
      offeredAmount: 40000,
      approvedAmount: 40000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 40,
      monthlyPayment: 3414.58,
      status: 'active',
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 400 && pgRes.rows[0]?.estado === 'active';

    results.push({
      name: 'TEST 5: Reject prohibido en préstamo "active" (400 Bad Request)',
      passed,
      details: `HTTP: ${res.status} (Esperado 400), Estado PG: ${pgRes.rows[0]?.estado} (Esperado active)`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 5: Reject prohibido en préstamo "active" (400 Bad Request)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 6: Reject prohibido en préstamo 'paid_off'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_06';
    const loanId = 'test_loan_494_06';
    await setupTestUser(stdId, 'Alumno 494 06', 5000, 'ES000049406');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 06',
      studentAccount: 'ES000049406',
      requestedAmount: 20000,
      offeredAmount: 20000,
      approvedAmount: 20000,
      termMonths: 6,
      annualInterestRate: 4.5,
      openingFee: 20,
      monthlyPayment: 3377.30,
      status: 'paid_off',
      schedule: []
    });

    const res = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId });
    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 400 && pgRes.rows[0]?.estado === 'paid_off';

    results.push({
      name: 'TEST 6: Reject prohibido en préstamo "paid_off" (400 Bad Request)',
      passed,
      details: `HTTP: ${res.status} (Esperado 400), Estado PG: ${pgRes.rows[0]?.estado} (Esperado paid_off)`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 6: Reject prohibido en préstamo "paid_off" (400 Bad Request)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 7: Reject sobre préstamo inexistente (404)
  // -------------------------------------------------------------
  try {
    const res = await postJson('/api/loans/test_loan_non_existent_494/reject', { studentId: 'any_student' });
    const passed = res.status === 404;

    results.push({
      name: 'TEST 7: Reject sobre préstamo inexistente (404 Not Found)',
      passed,
      details: `HTTP: ${res.status} (Esperado 404)`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 7: Reject sobre préstamo inexistente (404 Not Found)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 8: Idempotencia en reject con x-idempotency-key
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_08';
    const loanId = 'test_loan_494_08';
    const idemKey = 'idem_494_reject_08';
    await setupTestUser(stdId, 'Alumno 494 08', 5000, 'ES000049408');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 08',
      studentAccount: 'ES000049408',
      requestedAmount: 35000,
      offeredAmount: 35000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 35,
      monthlyPayment: 2987.75,
      status: 'offered',
      schedule: []
    });

    const res1 = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId }, { 'x-idempotency-key': idemKey });
    const res2 = await postJson(`/api/loans/${loanId}/reject`, { studentId: stdId }, { 'x-idempotency-key': idemKey });

    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res1.status === 200 && res2.status === 200 && res1.data.success && res2.data.success && pgRes.rows[0]?.estado === 'rejected';

    results.push({
      name: 'TEST 8: Idempotencia de reject con clave idéntica',
      passed,
      details: `Call 1: ${res1.status}, Call 2: ${res2.status}, Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 8: Idempotencia de reject con clave idéntica', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 9: Review docente - Acción 'deny' sobre 'pending_teacher'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_09';
    const loanId = 'test_loan_494_09';
    await setupTestUser(stdId, 'Alumno 494 09', 5000, 'ES000049409');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 09',
      studentAccount: 'ES000049409',
      requestedAmount: 80000,
      offeredAmount: 80000,
      termMonths: 24,
      annualInterestRate: 5.0,
      openingFee: 80,
      monthlyPayment: 3509.84,
      status: 'pending_teacher',
      requiresTeacherApproval: true,
      schedule: []
    });

    const teacherNote = 'Riesgo crediticio excesivo para el perfil del estudiante.';
    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'deny',
      teacherNotes: teacherNote
    });

    const pgRes = await queryPG('SELECT estado, notas_profesor FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 200 && res.data.success &&
                   pgRes.rows[0]?.estado === 'denied_teacher' &&
                   pgRes.rows[0]?.notas_profesor === teacherNote;

    results.push({
      name: 'TEST 9: Review docente: Acción "deny" cambia estado a denied_teacher',
      passed,
      details: `HTTP: ${res.status}, Estado PG: ${pgRes.rows[0]?.estado}, Notas: ${pgRes.rows[0]?.notas_profesor}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 9: Review docente: Acción "deny" cambia estado a denied_teacher', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 10: Review docente: Aprobación con recalculo francés y comisión 1‰
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_10';
    const loanId = 'test_loan_494_10';
    await setupTestUser(stdId, 'Alumno 494 10', 5000, 'ES000049410');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 10',
      studentAccount: 'ES000049410',
      requestedAmount: 100000,
      offeredAmount: 100000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 100,
      monthlyPayment: 8537.85,
      status: 'pending_teacher',
      requiresTeacherApproval: true,
      schedule: []
    });

    const teacherNote = 'Aprobado con importe ajustado a 75.000€ y 24 meses al 4.25%.';
    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'approve',
      offeredAmount: 75000,
      annualInterestRate: 4.25,
      termMonths: 24,
      teacherNotes: teacherNote
    });

    const pgRes = await queryPG(
      'SELECT estado, importe_ofrecido, plazo_meses, tipo_interes, comision_apertura, cuota_mensual, notas_profesor, tabla_amortizacion FROM prestamos WHERE id = $1',
      [loanId]
    );
    const row = pgRes.rows[0];
    const sched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    const expectedFee = Number((0.001 * 75000).toFixed(2)); // 75.00
    const passed = res.status === 200 && res.data.success &&
                   row.estado === 'teacher_offered' &&
                   Number(row.importe_ofrecido) === 75000 &&
                   Number(row.plazo_meses) === 24 &&
                   Number(row.tipo_interes) === 4.25 &&
                   Number(row.comision_apertura) === expectedFee &&
                   Number(row.cuota_mensual) > 0 &&
                   Array.isArray(sched) && sched.length === 24 &&
                   row.notas_profesor === teacherNote;

    results.push({
      name: 'TEST 10: Review docente: Aprobación con recalculo francés y comisión 1‰',
      passed,
      details: `HTTP: ${res.status}, Estado: ${row.estado}, Importe: ${row.importe_ofrecido}€, Comisión: ${row.comision_apertura}€, Cuota: ${row.cuota_mensual}€, Cuotas: ${sched?.length}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 10: Review docente: Aprobación con recalculo francés y comisión 1‰', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 11: Review docente sobre préstamo 'offered'
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_11';
    const loanId = 'test_loan_494_11';
    await setupTestUser(stdId, 'Alumno 494 11', 5000, 'ES000049411');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 11',
      studentAccount: 'ES000049411',
      requestedAmount: 45000,
      offeredAmount: 45000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 45,
      monthlyPayment: 3841.40,
      status: 'offered',
      schedule: []
    });

    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'approve',
      offeredAmount: 40000,
      annualInterestRate: 4.0,
      termMonths: 12,
      teacherNotes: 'Profesor mejora la tasa al 4% reduciendo importe a 40.000€.'
    });

    const pgRes = await queryPG('SELECT estado, importe_ofrecido, tipo_interes FROM prestamos WHERE id = $1', [loanId]);
    const row = pgRes.rows[0];
    const passed = res.status === 200 && res.data.success &&
                   row.estado === 'teacher_offered' &&
                   Number(row.importe_ofrecido) === 40000 &&
                   Number(row.tipo_interes) === 4.0;

    results.push({
      name: 'TEST 11: Review docente: Modificación de oferta previa "offered"',
      passed,
      details: `HTTP: ${res.status}, Estado: ${row.estado}, Ofrecido: ${row.importe_ofrecido}€, Tasa: ${row.tipo_interes}%`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 11: Review docente: Modificación de oferta previa "offered"', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 12: Review docente prohibido sobre préstamo 'active' (400)
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_12';
    const loanId = 'test_loan_494_12';
    await setupTestUser(stdId, 'Alumno 494 12', 5000, 'ES000049412');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 12',
      studentAccount: 'ES000049412',
      requestedAmount: 60000,
      offeredAmount: 60000,
      approvedAmount: 60000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 60,
      monthlyPayment: 5121.87,
      status: 'active',
      schedule: []
    });

    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'approve',
      offeredAmount: 30000
    });

    const pgRes = await queryPG('SELECT estado, importe_ofrecido FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 400 && pgRes.rows[0]?.estado === 'active' && Number(pgRes.rows[0]?.importe_ofrecido) === 60000;

    results.push({
      name: 'TEST 12: Review docente prohibido en préstamo "active" (400 Bad Request)',
      passed,
      details: `HTTP: ${res.status} (Esperado 400), Estado PG: ${pgRes.rows[0]?.estado}, Importe intacto: ${pgRes.rows[0]?.importe_ofrecido}€`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 12: Review docente prohibido en préstamo "active" (400 Bad Request)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 13: Review docente prohibido sobre préstamo 'paid_off' (400)
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_13';
    const loanId = 'test_loan_494_13';
    await setupTestUser(stdId, 'Alumno 494 13', 5000, 'ES000049413');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 13',
      studentAccount: 'ES000049413',
      requestedAmount: 15000,
      offeredAmount: 15000,
      approvedAmount: 15000,
      termMonths: 6,
      annualInterestRate: 4.5,
      openingFee: 15,
      monthlyPayment: 2532.97,
      status: 'paid_off',
      schedule: []
    });

    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'deny',
      teacherNotes: 'Intento denegar después de pagado'
    });

    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 400 && pgRes.rows[0]?.estado === 'paid_off';

    results.push({
      name: 'TEST 13: Review docente prohibido en préstamo "paid_off" (400 Bad Request)',
      passed,
      details: `HTTP: ${res.status} (Esperado 400), Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 13: Review docente prohibido en préstamo "paid_off" (400 Bad Request)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 14: Review docente prohibido sobre préstamo 'rejected' (400)
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_14';
    const loanId = 'test_loan_494_14';
    await setupTestUser(stdId, 'Alumno 494 14', 5000, 'ES000049414');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 14',
      studentAccount: 'ES000049414',
      requestedAmount: 25000,
      offeredAmount: 25000,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: 25,
      monthlyPayment: 2134.11,
      status: 'rejected',
      schedule: []
    });

    const res = await postJson(`/api/teacher/loans/${loanId}/review`, {
      action: 'approve',
      offeredAmount: 20000
    });

    const pgRes = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const passed = res.status === 400 && pgRes.rows[0]?.estado === 'rejected';

    results.push({
      name: 'TEST 14: Review docente prohibido en préstamo "rejected" (400 Bad Request)',
      passed,
      details: `HTTP: ${res.status} (Esperado 400), Estado PG: ${pgRes.rows[0]?.estado}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 14: Review docente prohibido en préstamo "rejected" (400 Bad Request)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 15: Concurrencia - Reject vs Accept (Carrera simultánea)
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_15';
    const loanId = 'test_loan_494_15';
    const initialBalance = 1000;
    const loanAmt = 30000;
    const fee = 30; // 1‰
    await setupTestUser(stdId, 'Alumno 494 15', initialBalance, 'ES000049415');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 15',
      studentAccount: 'ES000049415',
      requestedAmount: loanAmt,
      offeredAmount: loanAmt,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: fee,
      monthlyPayment: 2560.93,
      status: 'offered',
      schedule: [{ installmentNumber: 1, payment: 2560.93, principal: 2448.43, interest: 112.5, remainingBalance: 27551.57, dueDate: '2026-10-01', paid: false }]
    });

    // Launch Reject and Accept concurrently
    const [rejectRes, acceptRes] = await Promise.all([
      postJson(`/api/loans/${loanId}/reject`, { studentId: stdId }, { 'x-idempotency-key': 'idem_494_race_reject' }),
      postJson(`/api/loans/${loanId}/accept`, { studentId: stdId }, { 'x-idempotency-key': 'idem_494_race_accept' })
    ]);

    const pgLoan = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [stdId]);
    const finalState = pgLoan.rows[0]?.estado;
    const finalBalance = Number(pgAcc.rows[0]?.saldo);

    // Exactly one must succeed with 200, the other must fail with 400
    const oneSucceeded = (rejectRes.status === 200 && acceptRes.status === 400) ||
                         (rejectRes.status === 400 && acceptRes.status === 200);

    let stateMatches = false;
    if (rejectRes.status === 200) {
      // Reject won: loan must be rejected, balance must be initialBalance
      stateMatches = finalState === 'rejected' && finalBalance === initialBalance;
    } else {
      // Accept won: loan must be active, balance must be initialBalance - fee + loanAmt
      const expectedBalance = Number((initialBalance - fee + loanAmt).toFixed(2));
      stateMatches = finalState === 'active' && finalBalance === expectedBalance;
    }

    const passed = oneSucceeded && stateMatches;

    results.push({
      name: 'TEST 15: Concurrencia Reject vs Accept (Exclusión mutua garantizada)',
      passed,
      details: `Reject: ${rejectRes.status}, Accept: ${acceptRes.status}, Estado PG: ${finalState}, Saldo PG: ${finalBalance}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 15: Concurrencia Reject vs Accept (Exclusión mutua garantizada)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 16: Concurrencia - Teacher Review vs Accept (Carrera simultánea)
  // -------------------------------------------------------------
  try {
    const stdId = 'test_std_494_16';
    const loanId = 'test_loan_494_16';
    const initialBalance = 1000;
    const originalAmt = 50000;
    const originalFee = 50;
    const revisedAmt = 40000;
    const revisedFee = 40;

    await setupTestUser(stdId, 'Alumno 494 16', initialBalance, 'ES000049416');
    await setupTestLoan({
      id: loanId,
      studentId: stdId,
      studentName: 'Alumno 494 16',
      studentAccount: 'ES000049416',
      requestedAmount: originalAmt,
      offeredAmount: originalAmt,
      termMonths: 12,
      annualInterestRate: 4.5,
      openingFee: originalFee,
      monthlyPayment: 4268.22,
      status: 'pending_teacher',
      requiresTeacherApproval: true,
      schedule: []
    });

    // Teacher approves/modifies while student attempts to accept concurrently
    // Note: since initial state is 'pending_teacher', accept will initially fail if it executes first,
    // or if review executes first, accept sees 'teacher_offered' and can accept the revised terms!
    const [reviewRes, acceptRes] = await Promise.all([
      postJson(`/api/teacher/loans/${loanId}/review`, {
        action: 'approve',
        offeredAmount: revisedAmt,
        annualInterestRate: 4.0,
        termMonths: 12,
        teacherNotes: 'Aprobado con 40.000€'
      }, { 'x-idempotency-key': 'idem_494_race_review' }),
      postJson(`/api/loans/${loanId}/accept`, { studentId: stdId }, { 'x-idempotency-key': 'idem_494_race_accept_16' })
    ]);

    const pgLoan = await queryPG('SELECT estado, importe_ofrecido, importe_concedido FROM prestamos WHERE id = $1', [loanId]);
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [stdId]);
    const finalState = pgLoan.rows[0]?.estado;
    const finalBalance = Number(pgAcc.rows[0]?.saldo);

    // Consistency check:
    // If review executed first: review -> 200 (teacher_offered), then accept could be 200 (active with revisedAmt)
    // If accept executed first: accept -> 400 (cannot accept pending_teacher), then review -> 200 (teacher_offered)
    const reviewOk = reviewRes.status === 200;
    let consistent = false;

    if (acceptRes.status === 200) {
      // Both succeeded: review was first, then accept took the revised offer!
      const expectedBalance = Number((initialBalance - revisedFee + revisedAmt).toFixed(2));
      consistent = reviewOk && finalState === 'active' && finalBalance === expectedBalance;
    } else {
      // Accept failed (either before review or error), review succeeded:
      consistent = reviewOk && finalState === 'teacher_offered' && finalBalance === initialBalance;
    }

    results.push({
      name: 'TEST 16: Concurrencia Teacher Review vs Student Accept (Consistencia estricta)',
      passed: consistent,
      details: `Review: ${reviewRes.status}, Accept: ${acceptRes.status}, Estado PG: ${finalState}, Saldo PG: ${finalBalance}`
    });
  } catch (e: any) {
    results.push({ name: 'TEST 16: Concurrencia Teacher Review vs Student Accept (Consistencia estricta)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // Clean up test data
  // -------------------------------------------------------------
  await queryPG("DELETE FROM movimientos WHERE cuenta_id LIKE 'test_std_494_%'");
  await queryPG("DELETE FROM prestamos WHERE id LIKE 'test_loan_494_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'test_std_494_%'");
  await queryPG("DELETE FROM operaciones_idempotencia WHERE clave LIKE '%494_%'");
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.users) db.users = db.users.filter((u: any) => !u.id.startsWith('test_std_494_'));
    if (db.loans) db.loans = db.loans.filter((l: any) => !l.id.startsWith('test_loan_494_'));
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  console.log('\n===============================================================');
  console.log('RESUMEN DE RESULTADOS FASE 4.9.4');
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
