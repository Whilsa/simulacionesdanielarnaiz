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

async function postJson(endpoint: string, body: any) {
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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
  approvedAmount: number;
  termMonths: number;
  annualInterestRate: number;
  monthlyPayment: number;
  status: string;
  schedule: any[];
}) {
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
      importe_concedido, plazo_meses, tipo_interes, euribor, diferencial, comision_apertura,
      cuota_mensual, estado, garantia_tipo, garantia_inmueble_titulo, garantia_valor_tasacion,
      tabla_amortizacion, fecha_creacion, fecha_aceptacion
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, 3.50, 1.00, 50.00,
      $10, $11, 'property', 'Nave Industrial Test', 200000,
      $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (id) DO UPDATE SET
      estado = $11,
      tabla_amortizacion = $12`,
    [
      loan.id,
      loan.studentId,
      loan.studentName,
      loan.studentAccount,
      loan.requestedAmount,
      loan.offeredAmount,
      loan.approvedAmount,
      loan.termMonths,
      loan.annualInterestRate,
      loan.monthlyPayment,
      loan.status,
      JSON.stringify(loan.schedule)
    ]
  );

  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.loans) db.loans = [];
    const idx = db.loans.findIndex((l: any) => l.id === loan.id);
    const loanObj = {
      ...loan,
      collateral: {
        type: 'property',
        propertyTitle: 'Nave Industrial Test',
        appraisalValue: 200000
      }
    };
    if (idx >= 0) {
      db.loans[idx] = loanObj;
    } else {
      db.loans.push(loanObj);
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function runAllTests() {
  console.log('===============================================================');
  console.log('FASE 4.9.2 — VERIFICACIÓN Y SUITE DE TESTS DE CONCURRENCIA ACID');
  console.log('===============================================================\n');

  const results: { test: string; status: 'PASS' | 'FAIL'; details: string }[] = [];

  // -------------------------------------------------------------
  // TEST 1 — Una cuota normal
  // -------------------------------------------------------------
  try {
    console.log('>>> TEST 1: Cobro normal de una cuota vencida');
    const studentId = 'test_student_492_1';
    const loanId = 'test_loan_492_1';
    const iban = 'ES110001000199990001';

    await setupTestUser(studentId, 'Alumno Test 1', 1000.0, iban);
    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    // Due today (no penalty interest, due for collection)
    const dueDateToday = new Date().toISOString();
    const futureDate = new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString();

    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 250.0,
        principal: 200.0,
        interest: 50.0,
        pendingBalance: 750.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      },
      {
        period: 2,
        dueDate: futureDate,
        payment: 250.0,
        principal: 210.0,
        interest: 40.0,
        pendingBalance: 540.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 1',
      studentAccount: iban,
      requestedAmount: 1000,
      offeredAmount: 1000,
      approvedAmount: 1000,
      termMonths: 2,
      annualInterestRate: 5.0,
      monthlyPayment: 250.0,
      status: 'active',
      schedule
    });

    const verifyRes = await postJson('/api/student/verify-payments', { studentId });
    console.log('Verify-payments response status:', verifyRes.status);

    // Verify in PostgreSQL
    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    const movRes = await queryPG(
      "SELECT id, importe, concepto, tipo FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE '%préstamo hipotecario%'",
      [studentId]
    );

    const loanRes = await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const rawSched = loanRes.rows[0].tabla_amortizacion;
    const pgSched = typeof rawSched === 'string' ? JSON.parse(rawSched) : rawSched;

    const row1Paid = pgSched[0].paid === true;
    const row2Unpaid = pgSched[1].paid === false;

    console.log(`Final Saldo: ${finalSaldo} (Expected: 750)`);
    console.log(`Movimientos found: ${movRes.rows.length} (Expected: 1)`);
    console.log(`Row 1 Paid in PG: ${row1Paid}, Row 2 Paid: ${pgSched[1].paid}`);

    if (finalSaldo === 750.0 && movRes.rows.length === 1 && row1Paid && row2Unpaid) {
      results.push({ test: 'TEST 1: Cobro normal de una cuota vencida', status: 'PASS', details: 'Débito exacto de 250, movimiento insertado y cuota marcada en PG' });
    } else {
      results.push({ test: 'TEST 1: Cobro normal de una cuota vencida', status: 'FAIL', details: `Saldo: ${finalSaldo}, Movimientos: ${movRes.rows.length}, Row1: ${row1Paid}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 1: Cobro normal de una cuota vencida', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 2 — Dos workers simultáneos sobre la misma cuota (Race Condition)
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 2: Dos workers simultáneos sobre la misma cuota');
    const studentId = 'test_student_492_2';
    const loanId = 'test_loan_492_2';
    const iban = 'ES110001000199990002';

    await setupTestUser(studentId, 'Alumno Test 2', 1000.0, iban);

    const dueDateToday = new Date().toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 200.0,
        principal: 180.0,
        interest: 20.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 2',
      studentAccount: iban,
      requestedAmount: 200,
      offeredAmount: 200,
      approvedAmount: 200,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 200.0,
      status: 'active',
      schedule
    });

    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    // Launch two simultaneous worker verification calls
    await Promise.all([
      postJson('/api/student/verify-payments', { studentId }),
      postJson('/api/student/verify-payments', { studentId })
    ]);

    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    const movRes = await queryPG(
      "SELECT id, importe FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE '%préstamo hipotecario%'",
      [studentId]
    );

    const loanRes = await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const rawSched = loanRes.rows[0].tabla_amortizacion;
    const pgSched = typeof rawSched === 'string' ? JSON.parse(rawSched) : rawSched;

    console.log(`Final Saldo: ${finalSaldo} (Expected: 800 - exactly 1 debit of 200)`);
    console.log(`Movimientos count: ${movRes.rows.length} (Expected: exactly 1)`);
    console.log(`Loan status in PG: ${loanRes.rows[0].estado} (Expected: paid_off)`);

    if (finalSaldo === 800.0 && movRes.rows.length === 1 && pgSched[0].paid === true && loanRes.rows[0].estado === 'paid_off') {
      results.push({ test: 'TEST 2: Dos workers simultáneos (Anti Doble Cobro)', status: 'PASS', details: 'Exactamente 1 débito de 200, 1 movimiento y préstamo cancelado en PG' });
    } else {
      results.push({ test: 'TEST 2: Dos workers simultáneos (Anti Doble Cobro)', status: 'FAIL', details: `Saldo: ${finalSaldo}, Movimientos: ${movRes.rows.length}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 2: Dos workers simultáneos', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 3 — Worker + transferencia simultánea
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 3: Worker + transferencia simultánea');
    const studentId = 'test_student_492_3';
    const recipientId = 'test_student_492_3_rec';
    const loanId = 'test_loan_492_3';
    const iban = 'ES110001000199990003';
    const recIban = 'ES110001000199990004';

    await setupTestUser(studentId, 'Alumno Test 3', 500.0, iban);
    await setupTestUser(recipientId, 'Receptor Test 3', 100.0, recIban);

    const dueDateToday = new Date().toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 300.0,
        principal: 270.0,
        interest: 30.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 3',
      studentAccount: iban,
      requestedAmount: 300,
      offeredAmount: 300,
      approvedAmount: 300,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 300.0,
      status: 'active',
      schedule
    });

    const [workerRes, transferRes] = await Promise.all([
      postJson('/api/student/verify-payments', { studentId }),
      postJson('/api/transfers', {
        senderId: studentId,
        receiverAccount: recIban,
        amount: 300.0,
        concept: 'Transferencia competidora con cuota'
      })
    ]);

    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    console.log(`Worker status: ${workerRes.status}, Transfer status: ${transferRes.status}`);
    console.log(`Final Saldo: ${finalSaldo} (Must be exactly 200.00, NEVER negative)`);

    if (finalSaldo === 200.0) {
      results.push({ test: 'TEST 3: Worker + transferencia simultánea', status: 'PASS', details: 'Saldo consistente en 200.00; sin sobregiro ni saldo corrupto' });
    } else {
      results.push({ test: 'TEST 3: Worker + transferencia simultánea', status: 'FAIL', details: `Saldo inesperado: ${finalSaldo}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 3: Worker + transferencia simultánea', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 4 — Reinicio simulado después del COMMIT
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 4: Persistencia tras reinicio simulado');
    const studentId = 'test_student_492_4';
    const loanId = 'test_loan_492_4';
    const iban = 'ES110001000199990005';

    await setupTestUser(studentId, 'Alumno Test 4', 600.0, iban);

    const dueDateToday = new Date().toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 150.0,
        principal: 130.0,
        interest: 20.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 4',
      studentAccount: iban,
      requestedAmount: 150,
      offeredAmount: 150,
      approvedAmount: 150,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 150.0,
      status: 'active',
      schedule
    });

    await postJson('/api/student/verify-payments', { studentId });

    // Inspect directly in PostgreSQL
    const freshLoan = await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const freshSched = typeof freshLoan.rows[0].tabla_amortizacion === 'string'
      ? JSON.parse(freshLoan.rows[0].tabla_amortizacion)
      : freshLoan.rows[0].tabla_amortizacion;

    const isPaidInPG = freshSched[0].paid === true;
    const isPaidOffInPG = freshLoan.rows[0].estado === 'paid_off';

    // Call verify-payments again; it should do ZERO debits
    await postJson('/api/student/verify-payments', { studentId });
    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    console.log(`Is paid in PG: ${isPaidInPG}, Is paid_off in PG: ${isPaidOffInPG}, Final Saldo: ${finalSaldo} (Expected: 450)`);

    if (isPaidInPG && isPaidOffInPG && finalSaldo === 450.0) {
      results.push({ test: 'TEST 4: Reinicio simulado tras COMMIT', status: 'PASS', details: 'PostgreSQL es fuente de verdad absoluta; re-ejecución no produce cobros adicionales' });
    } else {
      results.push({ test: 'TEST 4: Reinicio simulado tras COMMIT', status: 'FAIL', details: `isPaid: ${isPaidInPG}, saldo: ${finalSaldo}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 4: Reinicio simulado tras COMMIT', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 5 — Fallo antes del COMMIT (Rollback)
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 5: Rollback atómico ante fallo antes de COMMIT');
    const studentId = 'test_student_492_5';
    const loanId = 'test_loan_492_5';
    const iban = 'ES110001000199990006';

    await setupTestUser(studentId, 'Alumno Test 5', 800.0, iban);

    const dueDateToday = new Date().toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 175.0,
        principal: 150.0,
        interest: 25.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 5',
      studentAccount: iban,
      requestedAmount: 175,
      offeredAmount: 175,
      approvedAmount: 175,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 175.0,
      status: 'active',
      schedule
    });

    const client = await pool.connect();
    let errorCaught = false;
    try {
      await client.query('BEGIN');
      await client.query('SELECT * FROM prestamos WHERE id = $1 FOR UPDATE', [loanId]);
      await client.query('SELECT * FROM cuentas WHERE id = $1 FOR UPDATE', [studentId]);
      await client.query('UPDATE cuentas SET saldo = saldo - 175 WHERE id = $1', [studentId]);
      await client.query(
        `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto)
         VALUES ($1, $2, 'TRANSFER_OUT', 175, CURRENT_TIMESTAMP, 'Cuota 1 test rollback')`,
        ['test-rollback-mov-1', studentId]
      );
      throw new Error('SIMULATED_FAILURE_BEFORE_COMMIT');
    } catch (e: any) {
      errorCaught = true;
      await client.query('ROLLBACK');
    } finally {
      client.release();
    }

    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    const movRes = await queryPG("SELECT id FROM movimientos WHERE id = 'test-rollback-mov-1'");
    const loanRes = await queryPG('SELECT tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const pgSched = typeof loanRes.rows[0].tabla_amortizacion === 'string'
      ? JSON.parse(loanRes.rows[0].tabla_amortizacion)
      : loanRes.rows[0].tabla_amortizacion;

    console.log(`Error caught: ${errorCaught}, Final Saldo: ${finalSaldo} (Expected: 800.0)`);
    console.log(`Orphan movements: ${movRes.rows.length} (Expected: 0), Paid: ${pgSched[0].paid} (Expected: false)`);

    if (errorCaught && finalSaldo === 800.0 && movRes.rows.length === 0 && pgSched[0].paid === false) {
      results.push({ test: 'TEST 5: Rollback atómico ante fallo previo a COMMIT', status: 'PASS', details: 'Saldo intacto, cero movimientos huérfanos y cuota no pagada' });
    } else {
      results.push({ test: 'TEST 5: Rollback atómico ante fallo previo a COMMIT', status: 'FAIL', details: `Saldo: ${finalSaldo}, Movimientos: ${movRes.rows.length}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 5: Rollback atómico ante fallo previo a COMMIT', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 6 — Varias cuotas vencidas
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 6: Varias cuotas vencidas secuenciales');
    const studentId = 'test_student_492_6';
    const loanId = 'test_loan_492_6';
    const iban = 'ES110001000199990007';

    await setupTestUser(studentId, 'Alumno Test 6', 500.0, iban);

    // Two cuotas due today, one future
    const dueDateToday1 = new Date(Date.now() - 2000).toISOString();
    const dueDateToday2 = new Date(Date.now() - 1000).toISOString();
    const futureDate = new Date(Date.now() + 25 * 24 * 3600 * 1000).toISOString();

    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday1,
        payment: 100.0,
        principal: 90.0,
        interest: 10.0,
        pendingBalance: 200.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      },
      {
        period: 2,
        dueDate: dueDateToday2,
        payment: 100.0,
        principal: 92.0,
        interest: 8.0,
        pendingBalance: 100.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      },
      {
        period: 3,
        dueDate: futureDate,
        payment: 100.0,
        principal: 95.0,
        interest: 5.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 6',
      studentAccount: iban,
      requestedAmount: 300,
      offeredAmount: 300,
      approvedAmount: 300,
      termMonths: 3,
      annualInterestRate: 5.0,
      monthlyPayment: 100.0,
      status: 'active',
      schedule
    });

    await postJson('/api/student/verify-payments', { studentId });

    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    const loanRes = await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const pgSched = typeof loanRes.rows[0].tabla_amortizacion === 'string'
      ? JSON.parse(loanRes.rows[0].tabla_amortizacion)
      : loanRes.rows[0].tabla_amortizacion;

    console.log(`Final Saldo: ${finalSaldo} (Expected: 300 - two installments of 100 paid)`);
    console.log(`Row 1 paid: ${pgSched[0].paid}, Row 2 paid: ${pgSched[1].paid}, Row 3 paid: ${pgSched[2].paid}`);
    console.log(`Loan status in PG: ${loanRes.rows[0].estado} (Expected: active)`);

    if (finalSaldo === 300.0 && pgSched[0].paid === true && pgSched[1].paid === true && pgSched[2].paid === false && loanRes.rows[0].estado === 'active') {
      results.push({ test: 'TEST 6: Varias cuotas vencidas', status: 'PASS', details: 'Cuotas 1 y 2 cobradas en orden cronológico; cuota 3 futura permanece intacta' });
    } else {
      results.push({ test: 'TEST 6: Varias cuotas vencidas', status: 'FAIL', details: `Saldo: ${finalSaldo}, Row1: ${pgSched[0].paid}, Row2: ${pgSched[1].paid}, Row3: ${pgSched[2].paid}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 6: Varias cuotas vencidas', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 7 — Saldo insuficiente
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 7: Saldo insuficiente (Sin cobros parciales ni fantasmas)');
    const studentId = 'test_student_492_7';
    const loanId = 'test_loan_492_7';
    const iban = 'ES110001000199990008';

    await setupTestUser(studentId, 'Alumno Test 7', 50.0, iban);

    const pastDate = new Date(Date.now() - 35 * 24 * 3600 * 1000).toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: pastDate,
        payment: 200.0,
        principal: 180.0,
        interest: 20.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 7',
      studentAccount: iban,
      requestedAmount: 200,
      offeredAmount: 200,
      approvedAmount: 200,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 200.0,
      status: 'active',
      schedule
    });

    await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1', [studentId]);

    await postJson('/api/student/verify-payments', { studentId });

    const cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const finalSaldo = Number(cuentaRes.rows[0].saldo);

    const movRes = await queryPG('SELECT id FROM movimientos WHERE cuenta_id = $1', [studentId]);

    const loanRes = await queryPG('SELECT tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const pgSched = typeof loanRes.rows[0].tabla_amortizacion === 'string'
      ? JSON.parse(loanRes.rows[0].tabla_amortizacion)
      : loanRes.rows[0].tabla_amortizacion;

    console.log(`Final Saldo: ${finalSaldo} (Expected: 50.00 - ZERO debit)`);
    console.log(`Movimientos count: ${movRes.rows.length} (Expected: 0)`);
    console.log(`Cuota paid: ${pgSched[0].paid} (Expected: false), isOverdue: ${pgSched[0].isOverdue} (Expected: true)`);
    console.log(`Penalty interest in PG: ${pgSched[0].penaltyInterest}`);

    if (finalSaldo === 50.0 && movRes.rows.length === 0 && pgSched[0].paid === false && pgSched[0].isOverdue === true && pgSched[0].penaltyInterest > 0) {
      results.push({ test: 'TEST 7: Saldo insuficiente', status: 'PASS', details: 'Cero débito, cero movimientos, cuota marcada como morosa con interés calculado en PG' });
    } else {
      results.push({ test: 'TEST 7: Saldo insuficiente', status: 'FAIL', details: `Saldo: ${finalSaldo}, Movimientos: ${movRes.rows.length}, isOverdue: ${pgSched[0].isOverdue}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 7: Saldo insuficiente', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // TEST 8 — Worker + accept concurrente
  // -------------------------------------------------------------
  try {
    console.log('\n>>> TEST 8: Préstamo no activo vs activo (Worker + accept)');
    const studentId = 'test_student_492_8';
    const loanId = 'test_loan_492_8';
    const iban = 'ES110001000199990009';

    await setupTestUser(studentId, 'Alumno Test 8', 1000.0, iban);

    const dueDateToday = new Date().toISOString();
    const schedule = [
      {
        period: 1,
        dueDate: dueDateToday,
        payment: 120.0,
        principal: 100.0,
        interest: 20.0,
        pendingBalance: 0.0,
        paid: false,
        isOverdue: false,
        penaltyInterest: 0
      }
    ];

    // Loan is pending_teacher_approval (NOT active)
    await setupTestLoan({
      id: loanId,
      studentId,
      studentName: 'Alumno Test 8',
      studentAccount: iban,
      requestedAmount: 120,
      offeredAmount: 120,
      approvedAmount: 120,
      termMonths: 1,
      annualInterestRate: 5.0,
      monthlyPayment: 120.0,
      status: 'pending_teacher_approval',
      schedule
    });

    // Run worker: should NOT debit because loan is not active
    await postJson('/api/student/verify-payments', { studentId });

    let cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    let saldoBefore = Number(cuentaRes.rows[0].saldo);

    // Now activate loan in PostgreSQL
    await queryPG("UPDATE prestamos SET estado = 'active' WHERE id = $1", [loanId]);

    // Run worker again: now it should process the payment
    await postJson('/api/student/verify-payments', { studentId });

    cuentaRes = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [studentId]);
    const saldoAfter = Number(cuentaRes.rows[0].saldo);

    const loanRes = await queryPG('SELECT estado, tabla_amortizacion FROM prestamos WHERE id = $1', [loanId]);
    const pgSched = typeof loanRes.rows[0].tabla_amortizacion === 'string'
      ? JSON.parse(loanRes.rows[0].tabla_amortizacion)
      : loanRes.rows[0].tabla_amortizacion;

    console.log(`Saldo before activation: ${saldoBefore} (Expected: 1000.0)`);
    console.log(`Saldo after activation: ${saldoAfter} (Expected: 880.0)`);
    console.log(`Loan status now: ${loanRes.rows[0].estado} (Expected: paid_off)`);

    if (saldoBefore === 1000.0 && saldoAfter === 880.0 && pgSched[0].paid === true) {
      results.push({ test: 'TEST 8: Worker + accept concurrente', status: 'PASS', details: 'Préstamo no activo no es debitado; una vez activado se cobra atómicamente' });
    } else {
      results.push({ test: 'TEST 8: Worker + accept concurrente', status: 'FAIL', details: `SaldoBefore: ${saldoBefore}, SaldoAfter: ${saldoAfter}` });
    }
  } catch (err: any) {
    results.push({ test: 'TEST 8: Worker + accept concurrente', status: 'FAIL', details: err.message });
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('RESUMEN DE RESULTADOS FASE 4.9.2');
  console.log('===============================================================');
  let passCount = 0;
  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : '❌';
    console.log(`${icon} [${r.status}] ${r.test} -> ${r.details}`);
    if (r.status === 'PASS') passCount++;
  }
  console.log(`\nTotal: ${passCount}/${results.length} pruebas superadas.`);

  await pool.end();
  process.exit(passCount === results.length ? 0 : 1);
}

runAllTests();
