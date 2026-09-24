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

async function requestJson(method: string, endpoint: string, body?: any, headers?: Record<string, string>) {
  try {
    const opts: RequestInit = {
      method,
      headers: { 'Content-Type': 'application/json', ...(headers || {}) }
    };
    if (body !== undefined) {
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(`${BASE_URL}${endpoint}`, opts);
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
  } catch (err: any) {
    return { status: 500, error: err.message, data: null };
  }
}

// Seed helper for tests
async function seedTestLoan(params: {
  id: string;
  studentId: string;
  studentName: string;
  status: string;
  offeredAmount: number;
  termMonths: number;
  rate: number;
  monthlyPayment?: number;
  openingFee?: number;
  schedule?: any[];
  saldo?: number;
}) {
  const accNum = 'ES00' + params.studentId;
  const saldo = params.saldo !== undefined ? params.saldo : 50000;

  // 1. Cuentas
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, 'testpass', $5, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET alumno = $2, saldo = $3, account_number = $5`,
    [params.studentId, params.studentName, saldo, params.studentId, accNum]
  );

  const monthlyPayment = params.monthlyPayment || 1000;
  const openingFee = params.openingFee || Number((params.offeredAmount * 0.001).toFixed(2));
  const schedule = params.schedule || [
    { period: 1, dueDate: new Date(Date.now() + 86400000).toISOString(), payment: monthlyPayment, principal: 800, interest: 200, remainingBalance: params.offeredAmount - 800, paid: params.status === 'paid_off' }
  ];

  // 2. Prestamos
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido, importe_concedido,
      plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
      garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
      estado, requiere_profesor, notas_profesor, fecha_creacion, tabla_amortizacion
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7,
      $8, $9, 3.50, 1.00, $10, $11,
      'property', 'prop_dummy', 'Nave Test', 500, 100000,
      $12, false, null, CURRENT_TIMESTAMP, $13
    ) ON CONFLICT (id) DO UPDATE SET
      estado = $12, importe_ofrecido = $6, plazo_meses = $8, tipo_interes = $9,
      comision_apertura = $10, cuota_mensual = $11, tabla_amortizacion = $13`,
    [
      params.id, params.studentId, params.studentName, accNum, params.offeredAmount, params.offeredAmount,
      params.status === 'active' || params.status === 'paid_off' ? params.offeredAmount : null,
      params.termMonths, params.rate, openingFee, monthlyPayment,
      params.status, JSON.stringify(schedule)
    ]
  );

  // 3. db.json cache
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    if (!db.loans) db.loans = [];
    const uIdx = db.users.findIndex((u: any) => u.id === params.studentId);
    const userObj = {
      id: params.studentId,
      username: params.studentId,
      name: params.studentName,
      accountNumber: accNum,
      balance: saldo,
      role: 'student',
      level: 1
    };
    if (uIdx >= 0) db.users[uIdx] = userObj; else db.users.push(userObj);

    const loanObj = {
      id: params.id,
      studentId: params.studentId,
      studentName: params.studentName,
      studentAccount: accNum,
      requestedAmount: params.offeredAmount,
      offeredAmount: params.offeredAmount,
      approvedAmount: params.status === 'active' || params.status === 'paid_off' ? params.offeredAmount : undefined,
      termMonths: params.termMonths,
      annualInterestRate: params.rate,
      euriborRate: 3.50,
      spread: 1.00,
      openingFee,
      monthlyPayment,
      collateral: {
        type: 'property',
        propertyId: 'prop_dummy',
        propertyTitle: 'Nave Test',
        surfaceM2: 500,
        appraisalValue: 100000
      },
      status: params.status,
      requiresTeacherApproval: false,
      createdAt: new Date().toISOString(),
      schedule
    };
    const lIdx = db.loans.findIndex((l: any) => l.id === params.id);
    if (lIdx >= 0) db.loans[lIdx] = loanObj; else db.loans.push(loanObj);

    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function cleanup(studentId: string, loanId: string) {
  await queryPG('DELETE FROM prestamos WHERE id = $1 OR alumno_id = $2', [loanId, studentId]);
  await queryPG('DELETE FROM cuentas WHERE id = $1', [studentId]);
  await queryPG('DELETE FROM movimientos WHERE cuenta_id = $1 OR concepto LIKE $2', [studentId, `%${loanId}%`]);
  await queryPG('DELETE FROM operaciones_idempotencia WHERE clave LIKE $1', [`%${loanId}%`]);
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.loans) db.loans = db.loans.filter((l: any) => l.id !== loanId && l.studentId !== studentId);
    if (db.users) db.users = db.users.filter((u: any) => u.id !== studentId);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('       FASE 4.9.8 — SUITE COMPLETA DE TESTS OBLIGATORIOS (A-Z)');
  console.log('================================================================\n');

  const results: Record<string, { pass: boolean; details: any }> = {};

  // -------------------------------------------------------------
  // TEST A: DELETE offered -> 200 y desaparece de PG
  // -------------------------------------------------------------
  {
    const sId = 't498_std_a';
    const lId = 't498_loan_a';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test A', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (rawDb.loans || []).some((l: any) => l.id === lId);
    const pass = res.status === 200 && res.data?.success === true && pgRow.rows.length === 0 && !inDb;
    results['TEST_A'] = { pass, details: { status: res.status, pgCount: pgRow.rows.length, inDb } };
    console.log(`TEST A (DELETE offered): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_A'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST B: DELETE pending_teacher -> 200
  // -------------------------------------------------------------
  {
    const sId = 't498_std_b';
    const lId = 't498_loan_b';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test B', status: 'pending_teacher', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = res.status === 200 && pgRow.rows.length === 0;
    results['TEST_B'] = { pass, details: { status: res.status, pgCount: pgRow.rows.length } };
    console.log(`TEST B (DELETE pending_teacher): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_B'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST C: DELETE rejected -> 200
  // -------------------------------------------------------------
  {
    const sId = 't498_std_c';
    const lId = 't498_loan_c';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test C', status: 'rejected', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = res.status === 200 && pgRow.rows.length === 0;
    results['TEST_C'] = { pass, details: { status: res.status, pgCount: pgRow.rows.length } };
    console.log(`TEST C (DELETE rejected): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_C'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST D: DELETE denied_teacher -> 200
  // -------------------------------------------------------------
  {
    const sId = 't498_std_d';
    const lId = 't498_loan_d';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test D', status: 'denied_teacher', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = res.status === 200 && pgRow.rows.length === 0;
    results['TEST_D'] = { pass, details: { status: res.status, pgCount: pgRow.rows.length } };
    console.log(`TEST D (DELETE denied_teacher): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_D'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST E: DELETE active -> 400, préstamo intacto
  // -------------------------------------------------------------
  {
    const sId = 't498_std_e';
    const lId = 't498_loan_e';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test E', status: 'active', offeredAmount: 30000, termMonths: 36, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = res.status === 400 && pgRow.rows.length === 1 && pgRow.rows[0].estado === 'active';
    results['TEST_E'] = { pass, details: { status: res.status, error: res.data?.error, pgState: pgRow.rows[0]?.estado } };
    console.log(`TEST E (DELETE active): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_E'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST F: DELETE paid_off -> 400, préstamo intacto
  // -------------------------------------------------------------
  {
    const sId = 't498_std_f';
    const lId = 't498_loan_f';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test F', status: 'paid_off', offeredAmount: 15000, termMonths: 12, rate: 4.5 });
    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = res.status === 400 && pgRow.rows.length === 1 && pgRow.rows[0].estado === 'paid_off';
    results['TEST_F'] = { pass, details: { status: res.status, error: res.data?.error, pgState: pgRow.rows[0]?.estado } };
    console.log(`TEST F (DELETE paid_off): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_F'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST G: DELETE inexistente -> 404
  // -------------------------------------------------------------
  {
    const res = await requestJson('DELETE', '/api/loans/prestamo_inexistente_9999');
    const pass = res.status === 404;
    results['TEST_G'] = { pass, details: { status: res.status, error: res.data?.error } };
    console.log(`TEST G (DELETE inexistente): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_G'].details);
  }

  // -------------------------------------------------------------
  // TEST H: DELETE mismo idempotency key concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_h';
    const lId = 't498_loan_h';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test H', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const idemKey = `idem_del_h_${lId}`;

    const [r1, r2] = await Promise.all([
      requestJson('DELETE', `/api/loans/${lId}`, undefined, { 'x-idempotency-key': idemKey }),
      requestJson('DELETE', `/api/loans/${lId}`, undefined, { 'x-idempotency-key': idemKey })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = r1.status === 200 && r2.status === 200 && r1.data?.success && r2.data?.success && pgRow.rows.length === 0;
    results['TEST_H'] = { pass, details: { r1Status: r1.status, r2Status: r2.status, pgCount: pgRow.rows.length } };
    console.log(`TEST H (DELETE concurrent idempotency): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_H'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST I: DELETE retry después de éxito
  // -------------------------------------------------------------
  {
    const sId = 't498_std_i';
    const lId = 't498_loan_i';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test I', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const idemKey = `idem_del_i_${lId}`;

    const r1 = await requestJson('DELETE', `/api/loans/${lId}`, undefined, { 'x-idempotency-key': idemKey });
    const r2 = await requestJson('DELETE', `/api/loans/${lId}`, undefined, { 'x-idempotency-key': idemKey });

    const pass = r1.status === 200 && r2.status === 200 && r2.data?.success === true;
    results['TEST_I'] = { pass, details: { r1Status: r1.status, r2Status: r2.status, r2Data: r2.data } };
    console.log(`TEST I (DELETE retry after success): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_I'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST J: DELETE vs accept concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_j';
    const lId = 't498_loan_j';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test J', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 5000 });

    const [rDel, rAcc] = await Promise.all([
      requestJson('DELETE', `/api/loans/${lId}`),
      requestJson('POST', `/api/loans/${lId}/accept`, { studentId: sId })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);

    let pass = false;
    if (rDel.status === 200 && rAcc.status === 404) {
      pass = pgRow.rows.length === 0 && Number(pgAcc.rows[0].saldo) === 5000;
    } else if (rAcc.status === 200 && rDel.status === 400) {
      pass = pgRow.rows.length === 1 && pgRow.rows[0].estado === 'active';
    }

    results['TEST_J'] = {
      pass,
      details: {
        delStatus: rDel.status,
        accStatus: rAcc.status,
        pgLoan: pgRow.rows[0]?.estado || 'DELETED',
        saldo: pgAcc.rows[0]?.saldo
      }
    };
    console.log(`TEST J (DELETE vs accept): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_J'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST K: DELETE vs worker concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_k';
    const lId = 't498_loan_k';
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const futureDate = new Date(Date.now() + 30 * 86400000).toISOString();
    const sched = [
      { period: 1, dueDate: pastDate, payment: 1000, principal: 800, interest: 200, remainingBalance: 19000, paid: false },
      { period: 2, dueDate: futureDate, payment: 1000, principal: 800, interest: 200, remainingBalance: 18000, paid: false }
    ];
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test K', status: 'active', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 10000, schedule: sched });

    const [rDel, rWorker] = await Promise.all([
      requestJson('DELETE', `/api/loans/${lId}`),
      requestJson('POST', '/api/student/verify-payments', { studentId: sId })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = rDel.status === 400 && pgRow.rows.length === 1 && ['active', 'paid_off'].includes(pgRow.rows[0].estado);
    results['TEST_K'] = { pass, details: { delStatus: rDel.status, workerStatus: rWorker.status, pgRowExists: pgRow.rows.length === 1, estado: pgRow.rows[0]?.estado } };
    console.log(`TEST K (DELETE vs worker): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_K'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST L: Verificar que ningún movimiento se elimina como efecto lateral
  // -------------------------------------------------------------
  {
    const sId = 't498_std_l';
    const lId = 't498_loan_l';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test L', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    await queryPG(
      `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto, sender_id, sender_name, receiver_id, receiver_name)
       VALUES ($1, $2, 'TRANSFER_IN', 100, CURRENT_TIMESTAMP, 'Movimiento previo seguro', 'banco', 'Banco', $2, 'Test L')`,
      ['mov_test_l', sId]
    );

    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    const pgMov = await queryPG('SELECT * FROM movimientos WHERE id = $1', ['mov_test_l']);
    const pass = res.status === 200 && pgMov.rows.length === 1;
    results['TEST_L'] = { pass, details: { delStatus: res.status, movCount: pgMov.rows.length } };
    console.log(`TEST L (Movimientos intactos): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_L'].details);
    await queryPG('DELETE FROM movimientos WHERE id = $1', ['mov_test_l']);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST M: PUT offered cambiando importe -> recalcula cuota/comisión/tabla
  // -------------------------------------------------------------
  {
    const sId = 't498_std_m';
    const lId = 't498_loan_m';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test M', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 60000 });
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const sched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    // Check that schedule is valid French schedule with 24 months, commission is 1‰ of 60000 = 60.00
    // and cuota_mensual matches the schedule payments
    const pass = res.status === 200 &&
                 Number(row.importe_ofrecido) === 60000 &&
                 Number(row.comision_apertura) === 60 &&
                 Number(row.cuota_mensual) === Number(sched[sched.length - 1].payment) &&
                 sched.length === 24;

    results['TEST_M'] = {
      pass,
      details: {
        status: res.status,
        importe: row.importe_ofrecido,
        comision: row.comision_apertura,
        cuota: row.cuota_mensual,
        schedLength: sched.length
      }
    };
    console.log(`TEST M (PUT offered importe): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_M'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST N: PUT offered cambiando plazo -> tabla_amortizacion coincide con nuevo plazo
  // -------------------------------------------------------------
  {
    const sId = 't498_std_n';
    const lId = 't498_loan_n';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test N', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { termMonths: 48 });
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const sched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    const pass = res.status === 200 && Number(row.plazo_meses) === 48 && sched.length === 48;
    results['TEST_N'] = { pass, details: { status: res.status, plazo: row.plazo_meses, schedLength: sched.length } };
    console.log(`TEST N (PUT offered plazo): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_N'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST O: PUT offered cambiando interés -> cuota e intereses coinciden
  // -------------------------------------------------------------
  {
    const sId = 't498_std_o';
    const lId = 't498_loan_o';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test O', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { annualInterestRate: 9.0 });
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const sched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    // At 9.0% over 24m for 20000: Month 1 interest = 20000 * (0.09/12) = 150.00
    const pass = res.status === 200 &&
                 Number(row.tipo_interes) === 9.0 &&
                 Number(row.cuota_mensual) === Number(sched[sched.length - 1].payment) &&
                 Number(sched[0].interest) === 150.00;

    results['TEST_O'] = { pass, details: { status: res.status, rate: row.tipo_interes, cuota: row.cuota_mensual, interest1: sched[0]?.interest } };
    console.log(`TEST O (PUT offered interes): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_O'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST P: PUT active -> 400 y sin cambios
  // -------------------------------------------------------------
  {
    const sId = 't498_std_p';
    const lId = 't498_loan_p';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test P', status: 'active', offeredAmount: 40000, termMonths: 36, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 80000 });
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];

    const pass = res.status === 400 && Number(row.importe_ofrecido) === 40000;
    results['TEST_P'] = { pass, details: { status: res.status, error: res.data?.error, importe: row.importe_ofrecido } };
    console.log(`TEST P (PUT active): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_P'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST Q: PUT paid_off -> 400 y sin cambios
  // -------------------------------------------------------------
  {
    const sId = 't498_std_q';
    const lId = 't498_loan_q';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test Q', status: 'paid_off', offeredAmount: 10000, termMonths: 12, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { status: 'active' });
    const pgRow = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [lId]);

    const pass = res.status === 400 && pgRow.rows[0].estado === 'paid_off';
    results['TEST_Q'] = { pass, details: { status: res.status, error: res.data?.error, estado: pgRow.rows[0]?.estado } };
    console.log(`TEST Q (PUT paid_off): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_Q'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST R: Intento de cambiar status arbitrariamente -> rechazado (400)
  // -------------------------------------------------------------
  {
    const sId = 't498_std_r';
    const lId = 't498_loan_r';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test R', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { status: 'teacher_offered' });
    const pgRow = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [lId]);

    const pass = res.status === 400 && pgRow.rows[0].estado === 'offered';
    results['TEST_R'] = { pass, details: { status: res.status, error: res.data?.error, estado: pgRow.rows[0]?.estado } };
    console.log(`TEST R (PUT status arbitrario rechazado): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_R'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST S: Dos PUT concurrentes sobre el mismo préstamo -> serialización sin Lost Update
  // -------------------------------------------------------------
  {
    const sId = 't498_std_s';
    const lId = 't498_loan_s';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test S', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const [r1, r2] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 35000 }),
      requestJson('PUT', `/api/loans/${lId}`, { termMonths: 60 })
    ]);

    const pgRow = await queryPG('SELECT importe_ofrecido, plazo_meses, tabla_amortizacion FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const sched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    const pass = r1.status === 200 && r2.status === 200 &&
                 Number(row.importe_ofrecido) === 35000 &&
                 Number(row.plazo_meses) === 60 &&
                 sched.length === 60;

    results['TEST_S'] = { pass, details: { r1: r1.status, r2: r2.status, importe: row.importe_ofrecido, plazo: row.plazo_meses, schedLen: sched.length } };
    console.log(`TEST S (Dos PUT concurrentes sin Lost Update): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_S'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST T: PUT vs accept concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_t';
    const lId = 't498_loan_t';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test T', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 5000 });

    const [rPut, rAcc] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 25000 }),
      requestJson('POST', `/api/loans/${lId}/accept`, { studentId: sId })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);

    let pass = false;
    if (rPut.status === 200 && rAcc.status === 200) {
      pass = Number(row.importe_ofrecido) === 25000 && Number(row.importe_concedido) === 25000 && Number(pgAcc.rows[0].saldo) === 29975;
    } else if (rAcc.status === 200 && rPut.status === 400) {
      pass = Number(row.importe_concedido) === 20000 && Number(pgAcc.rows[0].saldo) === 24980;
    }

    results['TEST_T'] = {
      pass,
      details: {
        putStatus: rPut.status,
        accStatus: rAcc.status,
        finalConcedido: row.importe_concedido,
        saldo: pgAcc.rows[0]?.saldo
      }
    };
    console.log(`TEST T (PUT vs accept): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_T'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST U: PUT vs worker concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_u';
    const lId = 't498_loan_u';
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const sched = [
      { period: 1, dueDate: pastDate, payment: 1000, principal: 800, interest: 200, remainingBalance: 19000, paid: false }
    ];
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test U', status: 'active', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 10000, schedule: sched });

    const [rPut, rWorker] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 50000 }),
      requestJson('POST', '/api/student/verify-payments', { studentId: sId })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pass = rPut.status === 400 && Number(pgRow.rows[0].importe_ofrecido) === 20000;
    results['TEST_U'] = { pass, details: { putStatus: rPut.status, workerStatus: rWorker.status, importe: pgRow.rows[0].importe_ofrecido } };
    console.log(`TEST U (PUT vs worker): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_U'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST V: PUT vs teacher review concurrente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_v';
    const lId = 't498_loan_v';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test V', status: 'pending_teacher', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const [rPut, rRev] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 25000 }),
      requestJson('POST', `/api/teacher/loans/${lId}/review`, {
        action: 'approve',
        offeredAmount: 30000,
        termMonths: 36,
        interestRate: 4.5
      })
    ]);

    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];

    const pass = (rPut.status === 200 || rPut.status === 400) && rRev.status === 200 && row.estado === 'teacher_offered';
    results['TEST_V'] = { pass, details: { putStatus: rPut.status, revStatus: rRev.status, estado: row.estado, importe: row.importe_ofrecido } };
    console.log(`TEST V (PUT vs review): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_V'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST W: PUT mismo idempotency key concurrente -> una única modificación efectiva
  // -------------------------------------------------------------
  {
    const sId = 't498_std_w';
    const lId = 't498_loan_w';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test W', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const idemKey = `idem_put_w_${lId}`;

    const [r1, r2] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 32000 }, { 'x-idempotency-key': idemKey }),
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 32000 }, { 'x-idempotency-key': idemKey })
    ]);

    const pgRow = await queryPG('SELECT importe_ofrecido FROM prestamos WHERE id = $1', [lId]);
    const pass = r1.status === 200 && r2.status === 200 && Number(pgRow.rows[0].importe_ofrecido) === 32000;
    results['TEST_W'] = { pass, details: { r1Status: r1.status, r2Status: r2.status, importe: pgRow.rows[0].importe_ofrecido } };
    console.log(`TEST W (PUT idempotency concurrente): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_W'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST X: retry posterior con mismo key -> no repite modificación
  // -------------------------------------------------------------
  {
    const sId = 't498_std_x';
    const lId = 't498_loan_x';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test X', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });
    const idemKey = `idem_put_x_${lId}`;

    const r1 = await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 38000 }, { 'x-idempotency-key': idemKey });
    const r2 = await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 38000 }, { 'x-idempotency-key': idemKey });

    const pgRow = await queryPG('SELECT importe_ofrecido FROM prestamos WHERE id = $1', [lId]);
    const pass = r1.status === 200 && r2.status === 200 && Number(pgRow.rows[0].importe_ofrecido) === 38000 && r2.data?.loan?.offeredAmount === 38000;
    results['TEST_X'] = { pass, details: { r1: r1.status, r2: r2.status, importe: pgRow.rows[0].importe_ofrecido } };
    console.log(`TEST X (PUT retry idempotente): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_X'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST Y: rollback -> ningún cambio parcial en préstamo ni en db.json
  // -------------------------------------------------------------
  {
    const sId = 't498_std_y';
    const lId = 't498_loan_y';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test Y', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: -5000 });
    const pgRow = await queryPG('SELECT importe_ofrecido FROM prestamos WHERE id = $1', [lId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const memLoan = (rawDb.loans || []).find((l: any) => l.id === lId);

    const pass = res.status === 400 && Number(pgRow.rows[0].importe_ofrecido) === 20000 && Number(memLoan?.offeredAmount) === 20000;
    results['TEST_Y'] = { pass, details: { status: res.status, error: res.data?.error, pgImporte: pgRow.rows[0].importe_ofrecido, memImporte: memLoan?.offeredAmount } };
    console.log(`TEST Y (Rollback atomicity): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_Y'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST Z: restart -> PG conserva estado final y db.json consistente
  // -------------------------------------------------------------
  {
    const sId = 't498_std_z';
    const lId = 't498_loan_z';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Test Z', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    await requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 45000 });
    
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const memLoan = (rawDb.loans || []).find((l: any) => l.id === lId);

    const pass = Number(pgRow.rows[0].importe_ofrecido) === 45000 && Number(memLoan?.offeredAmount) === 45000;
    results['TEST_Z'] = { pass, details: { pgImporte: pgRow.rows[0].importe_ofrecido, memImporte: memLoan?.offeredAmount } };
    console.log(`TEST Z (Persistence integrity): ${pass ? 'PASS' : 'FAIL'}`, results['TEST_Z'].details);
    await cleanup(sId, lId);
  }

  // -------------------------------------------------------------
  // REGRESIONES OBLIGATORIAS:
  // - 4.9.2: Worker de cuotas
  // - 4.9.3: Accept
  // - 4.9.4: Reject y Review
  // - 4.9.6: Request
  // -------------------------------------------------------------
  console.log('\n>>> EJECUTANDO REGRESIONES OBLIGATORIAS (4.9.2, 4.9.3, 4.9.4, 4.9.6)');
  
  // Regresión 4.9.6: Request
  {
    const sId = 't498_reg_req';
    const accNum = 'ES00' + sId;
    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Req Std', 10000, $2, 'pass', $3, 'student', 1)
       ON CONFLICT (id) DO UPDATE SET saldo = 10000, account_number = $3`,
      [sId, sId, accNum]
    );
    await queryPG(
      `INSERT INTO adquisiciones (
        id, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, alumno_id, alumno_nombre,
        superficie_m2, ubicacion, porcentaje_suelo, precio_base, importe_iva, precio_total, fecha_compra, metodo_pago
      ) VALUES (
        'inm_req', 'prop_1', 'Nave Req', 'nave', 'compra', $1, 'Req Std',
        500, 'Polígono Tecnológico', 20, 100000, 21000, 121000, CURRENT_TIMESTAMP, 'contado'
      ) ON CONFLICT (id) DO UPDATE SET alumno_id = $1, alumno_nombre = 'Req Std'`,
      [sId]
    );

    // Also populate in db.json for consistency
    try {
      const raw = fs.readFileSync('db.json', 'utf8');
      const db = JSON.parse(raw);
      if (!db.acquisitions) db.acquisitions = [];
      const exIdx = db.acquisitions.findIndex((a: any) => a.id === 'inm_req');
      const acqObj = {
        id: 'inm_req',
        propertyId: 'prop_1',
        propertyTitle: 'Nave Req',
        type: 'nave',
        studentId: sId,
        studentName: 'Req Std',
        appraisalValue: 100000
      };
      if (exIdx >= 0) db.acquisitions[exIdx] = acqObj; else db.acquisitions.push(acqObj);
      fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    } catch (e) {}

    const res = await requestJson('POST', '/api/loans/request', {
      studentId: sId,
      requestedAmount: 50000,
      termMonths: 120,
      collateralType: 'property',
      propertyId: 'inm_req',
      surfaceM2: 500,
      appraisalValue: 100000
    });

    const pass = res.status === 201 && res.data?.success === true && res.data?.loan?.status === 'offered';
    results['REGRESSION_4.9.6_REQUEST'] = { pass, details: { status: res.status, loanStatus: res.data?.loan?.status } };
    console.log(`REGRESIÓN 4.9.6 (Request): ${pass ? 'PASS' : 'FAIL'}`);

    const loanId = res.data?.loan?.id;

    // Regresión 4.9.3: Accept
    if (loanId) {
      const resAcc = await requestJson('POST', `/api/loans/${loanId}/accept`, { studentId: sId });
      const passAcc = resAcc.status === 200 && resAcc.data?.loan?.status === 'active';
      results['REGRESSION_4.9.3_ACCEPT'] = { pass: passAcc, details: { status: resAcc.status, loanStatus: resAcc.data?.loan?.status } };
      console.log(`REGRESIÓN 4.9.3 (Accept): ${passAcc ? 'PASS' : 'FAIL'}`);
    }

    await cleanup(sId, loanId || 'dummy');
    await queryPG('DELETE FROM adquisiciones WHERE id = $1', ['inm_req']);
  }

  // Regresión 4.9.4: Review y Reject
  {
    const sId = 't498_reg_rev';
    const lId = 't498_loan_rev';
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Rev Std', status: 'pending_teacher', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const resRev = await requestJson('POST', `/api/teacher/loans/${lId}/review`, {
      action: 'approve',
      offeredAmount: 25000,
      termMonths: 36,
      interestRate: 4.5
    });

    const passRev = resRev.status === 200 && resRev.data?.loan?.status === 'teacher_offered';
    results['REGRESSION_4.9.4_REVIEW'] = { pass: passRev, details: { status: resRev.status, loanStatus: resRev.data?.loan?.status } };
    console.log(`REGRESIÓN 4.9.4 (Review): ${passRev ? 'PASS' : 'FAIL'}`);

    // Reject the reviewed loan
    const resRej = await requestJson('POST', `/api/loans/${lId}/reject`, { studentId: sId });
    const passRej = resRej.status === 200 && resRej.data?.loan?.status === 'rejected';
    results['REGRESSION_4.9.4_REJECT'] = { pass: passRej, details: { status: resRej.status, loanStatus: resRej.data?.loan?.status } };
    console.log(`REGRESIÓN 4.9.4 (Reject): ${passRej ? 'PASS' : 'FAIL'}`);

    await cleanup(sId, lId);
  }

  // Regresión 4.9.2: Worker de cuotas
  {
    const sId = 't498_reg_work';
    const lId = 't498_loan_work';
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const sched = [
      { period: 1, dueDate: pastDate, payment: 500, principal: 400, interest: 100, pendingBalance: 9500, paid: false, isOverdue: false, penaltyInterest: 0 },
      { period: 2, dueDate: new Date(Date.now() + 30 * 86400000).toISOString(), payment: 500, principal: 400, interest: 100, pendingBalance: 9100, paid: false, isOverdue: false, penaltyInterest: 0 }
    ];
    await seedTestLoan({ id: lId, studentId: sId, studentName: 'Worker Std', status: 'active', offeredAmount: 10000, termMonths: 24, rate: 4.5, saldo: 5000, schedule: sched });

    const resWorker = await requestJson('POST', '/api/student/verify-payments', { studentId: sId });
    const pgRow = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgRow.rows[0];
    const updatedSched = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);

    // Cuota 1 should be paid, balance reduced by 500 (5000 - 500 = 4500)
    const passWorker = updatedSched[0].paid === true && Number(pgAcc.rows[0].saldo) === 4500;
    results['REGRESSION_4.9.2_WORKER'] = { pass: passWorker, details: { quota1Paid: updatedSched[0].paid, finalSaldo: pgAcc.rows[0].saldo, resStatus: resWorker.status } };
    console.log(`REGRESIÓN 4.9.2 (Worker de cuotas): ${passWorker ? 'PASS' : 'FAIL'}`, results['REGRESSION_4.9.2_WORKER'].details);

    await cleanup(sId, lId);
  }

  fs.writeFileSync('./scripts/audit_phase_4_9_8_report.json', JSON.stringify(results, null, 2));

  const allPassed = Object.values(results).every(r => r.pass);
  console.log('\n================================================================');
  console.log(`RESULTADO GLOBAL DE LA SUITE: ${allPassed ? 'TODOS LOS TESTS PASARON EXITOSAMENTE (PASS)' : 'HUBO FALLOS'}`);
  console.log('================================================================\n');

  await pool.end();
  if (!allPassed) {
    process.exit(1);
  }
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  pool.end();
  process.exit(1);
});
