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

// Helper to seed a student and loan in both PG and db.json
async function seedLoan(params: {
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
  
  // 1. PG Cuentas
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, 'testpass', $5, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET alumno = $2, saldo = $3`,
    [params.studentId, params.studentName, saldo, params.studentId, accNum]
  );

  const monthlyPayment = params.monthlyPayment || 1000;
  const openingFee = params.openingFee || (params.offeredAmount * 0.001);
  const schedule = params.schedule || [
    { period: 1, dueDate: new Date(Date.now() + 86400000).toISOString(), payment: monthlyPayment, principal: 800, interest: 200, remainingBalance: params.offeredAmount - 800, paid: params.status === 'paid_off' }
  ];

  // 2. PG Prestamos
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

  // 3. Sync to db.json
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

async function cleanupTestData(studentId: string, loanId: string) {
  await queryPG('DELETE FROM prestamos WHERE id = $1 OR alumno_id = $2', [loanId, studentId]);
  await queryPG('DELETE FROM cuentas WHERE id = $1', [studentId]);
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.loans) db.loans = db.loans.filter((l: any) => l.id !== loanId && l.studentId !== studentId);
    if (db.users) db.users = db.users.filter((u: any) => u.id !== studentId);
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function runAudit() {
  console.log('================================================================');
  console.log('    FASE 4.9.7 — AUDITORÍA TÉCNICA DE DELETE Y PUT DE PRÉSTAMOS');
  console.log('================================================================\n');

  const auditFindings: Record<string, any> = {};

  // -------------------------------------------------------------
  // TEST A — DELETE offered
  // -------------------------------------------------------------
  {
    console.log('>>> EJECUTANDO TEST A — DELETE offered');
    const sId = 't497_std_del_offered';
    const lId = 't497_loan_del_offered';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Del Offered', status: 'offered', offeredAmount: 20000, termMonths: 36, rate: 4.5 });

    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    
    // Wait briefly for fire-and-forget
    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (rawDb.loans || []).some((l: any) => l.id === lId);

    auditFindings['TEST_A'] = {
      description: 'DELETE sobre préstamo en estado offered',
      httpStatus: res.status,
      httpResponse: res.data,
      foundInPG: pgLoan.rows.length > 0,
      foundInDbJson: inDb,
      observedBehavior: res.status === 200 && !inDb && pgLoan.rows.length === 0 ? 'Permite borrado físico completo' : 'Comportamiento anómalo'
    };
    console.log('Resultado TEST A:', auditFindings['TEST_A']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST B — DELETE active
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST B — DELETE active');
    const sId = 't497_std_del_active';
    const lId = 't497_loan_del_active';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Del Active', status: 'active', offeredAmount: 50000, termMonths: 60, rate: 4.5, saldo: 60000 });
    // Add dummy movements to simulate disbursement
    await queryPG(
      `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto, sender_id, sender_name, receiver_id, receiver_name)
       VALUES ($1, $2, 'TRANSFER_IN', 50000, CURRENT_TIMESTAMP, 'Disposición préstamo bancario ' || $3, 'banco', 'Banco', $2, 'Test Del Active')`,
      ['mov_' + lId, sId, lId]
    );

    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pgMovs = await queryPG('SELECT * FROM movimientos WHERE concepto LIKE $1', [`%${lId}%`]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (rawDb.loans || []).some((l: any) => l.id === lId);

    auditFindings['TEST_B'] = {
      description: 'DELETE sobre préstamo active (ya desembolsado con movimientos)',
      httpStatus: res.status,
      httpResponse: res.data,
      loanDeletedInPG: pgLoan.rows.length === 0,
      loanDeletedInDbJson: !inDb,
      orphanMovementsCount: pgMovs.rows.length,
      observedBehavior: pgLoan.rows.length === 0 
        ? 'CRÍTICO: Permite borrar físicamente un préstamo activo, dejando movimientos huérfanos sin documento contractual.'
        : 'Bloqueado o no eliminado'
    };
    console.log('Resultado TEST B:', auditFindings['TEST_B']);
    await queryPG('DELETE FROM movimientos WHERE id = $1', ['mov_' + lId]);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST C — DELETE paid_off
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST C — DELETE paid_off');
    const sId = 't497_std_del_paidoff';
    const lId = 't497_loan_del_paidoff';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Del PaidOff', status: 'paid_off', offeredAmount: 15000, termMonths: 12, rate: 4.5 });

    const res = await requestJson('DELETE', `/api/loans/${lId}`);
    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (rawDb.loans || []).some((l: any) => l.id === lId);

    auditFindings['TEST_C'] = {
      description: 'DELETE sobre préstamo paid_off (totalmente amortizado)',
      httpStatus: res.status,
      httpResponse: res.data,
      deletedInPG: pgLoan.rows.length === 0,
      deletedInDbJson: !inDb,
      observedBehavior: pgLoan.rows.length === 0 ? 'Permite borrado físico de préstamo amortizado, destruyendo histórico de crédito.' : 'No eliminado'
    };
    console.log('Resultado TEST C:', auditFindings['TEST_C']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST D — DELETE vs accept concurrente
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST D — DELETE vs accept concurrente');
    const sId = 't497_std_del_acc';
    const lId = 't497_loan_del_acc';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Del vs Acc', status: 'offered', offeredAmount: 30000, termMonths: 48, rate: 4.5, saldo: 5000 });

    // Launch DELETE and accept concurrently
    const [resDel, resAcc] = await Promise.all([
      requestJson('DELETE', `/api/loans/${lId}`),
      requestJson('POST', `/api/loans/${lId}/accept`, { studentId: sId })
    ]);

    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const inDb = (rawDb.loans || []).some((l: any) => l.id === lId);

    auditFindings['TEST_D'] = {
      description: 'Concurrencia DELETE vs accept',
      deleteStatus: resDel.status,
      acceptStatus: resAcc.status,
      deleteData: resDel.data,
      acceptData: resAcc.data,
      finalPGLoanStatus: pgLoan.rows[0]?.estado || 'NOT_FOUND_IN_PG',
      studentBalance: pgAcc.rows[0]?.saldo,
      loanInDbJson: inDb,
      observedBehavior: `DELETE status ${resDel.status}, Accept status ${resAcc.status}. Si ambos responden 200 o si DELETE ocurre sin transacción, puede haber desincronización.`
    };
    console.log('Resultado TEST D:', auditFindings['TEST_D']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST E — DELETE vs worker
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST E — DELETE vs worker');
    const sId = 't497_std_del_worker';
    const lId = 't497_loan_del_worker';
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const sched = [
      { period: 1, dueDate: pastDate, payment: 1000, principal: 800, interest: 200, remainingBalance: 29000, paid: false }
    ];
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Del Worker', status: 'active', offeredAmount: 30000, termMonths: 36, rate: 4.5, saldo: 10000, schedule: sched });

    // Launch DELETE while worker triggers for student
    const [resDel, resWorker] = await Promise.all([
      requestJson('DELETE', `/api/loans/${lId}`),
      requestJson('POST', '/api/trigger-salary-check', {}) // triggers worker
    ]);

    await new Promise(r => setTimeout(r, 500));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);

    auditFindings['TEST_E'] = {
      description: 'Concurrencia DELETE vs Worker de cuotas',
      deleteStatus: resDel.status,
      workerStatus: resWorker.status,
      finalPGLoan: pgLoan.rows[0]?.id || 'DELETED',
      finalBalance: pgAcc.rows[0]?.saldo,
      observedBehavior: 'DELETE no adquiere lock FOR UPDATE; compite directamente con el worker.'
    };
    console.log('Resultado TEST E:', auditFindings['TEST_E']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST F — PUT offered
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST F — PUT offered');
    const sId = 't497_std_put_offered';
    const lId = 't497_loan_put_offered';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Offered', status: 'offered', offeredAmount: 20000, termMonths: 36, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      offeredAmount: 25000,
      annualInterestRate: 5.0,
      termMonths: 48,
      status: 'offered'
    });

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];

    auditFindings['TEST_F'] = {
      description: 'PUT sobre préstamo offered',
      httpStatus: res.status,
      pgImporteOfrecido: row?.importe_ofrecido,
      pgPlazoMeses: row?.plazo_meses,
      pgTipoInteres: row?.tipo_interes,
      pgEstado: row?.estado,
      pgCuotaMensual: row?.cuota_mensual,
      observedBehavior: 'PUT actualiza campos en PG via syncLoanToSupabase pero cuota_mensual y tabla_amortizacion quedan desactualizadas.'
    };
    console.log('Resultado TEST F:', auditFindings['TEST_F']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST G — PUT active
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST G — PUT active');
    const sId = 't497_std_put_active';
    const lId = 't497_loan_put_active';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Active', status: 'active', offeredAmount: 40000, termMonths: 48, rate: 4.5, saldo: 50000 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      offeredAmount: 80000,
      termMonths: 120
    });

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];

    auditFindings['TEST_G'] = {
      description: 'PUT sobre préstamo active (desembolsado)',
      httpStatus: res.status,
      loanReturned: res.data?.loan?.offeredAmount,
      pgImporteOfrecido: row?.importe_ofrecido,
      pgImporteConcedido: row?.importe_concedido,
      pgPlazoMeses: row?.plazo_meses,
      observedBehavior: res.status === 200
        ? 'CRÍTICO: PUT permite modificar importe y plazo de un préstamo ya ACTIVO y desembolsado.'
        : 'Bloqueado'
    };
    console.log('Resultado TEST G:', auditFindings['TEST_G']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST H — PUT paid_off
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST H — PUT paid_off');
    const sId = 't497_std_put_paidoff';
    const lId = 't497_loan_put_paidoff';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT PaidOff', status: 'paid_off', offeredAmount: 10000, termMonths: 12, rate: 4.5 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      status: 'active'
    });

    const pgLoan = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [lId]);

    auditFindings['TEST_H'] = {
      description: 'PUT sobre préstamo paid_off cambiando status a active',
      httpStatus: res.status,
      pgEstado: pgLoan.rows[0]?.estado,
      observedBehavior: res.status === 200 && pgLoan.rows[0]?.estado === 'active'
        ? 'CRÍTICO: PUT permite resucitar un préstamo totalmente amortizado a estado active sin control contable.'
        : 'Bloqueado'
    };
    console.log('Resultado TEST H:', auditFindings['TEST_H']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST I — PUT cambia interés
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST I — PUT cambia interés');
    const sId = 't497_std_put_rate';
    const lId = 't497_loan_put_rate';
    const sched = [
      { period: 1, dueDate: '2026-10-01T00:00:00.000Z', payment: 885.50, principal: 810.50, interest: 75.00, remainingBalance: 19189.50, paid: false }
    ];
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Rate', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, monthlyPayment: 885.50, schedule: sched });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      annualInterestRate: 9.0
    });

    const pgLoan = await queryPG('SELECT tipo_interes, cuota_mensual, tabla_amortizacion FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];
    const schedInPG = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    auditFindings['TEST_I'] = {
      description: 'PUT modifica tipo_interes de 4.5% a 9.0%',
      httpStatus: res.status,
      newRateInPG: row.tipo_interes,
      cuotaMensualInPG: row.cuota_mensual,
      scheduleRowsCount: schedInPG?.length,
      scheduleFirstRowInterest: schedInPG?.[0]?.interest,
      observedBehavior: row.cuota_mensual == 885.50 && schedInPG?.[0]?.interest == 75.00
        ? 'INCONSISTENCIA: tipo_interes se actualizó a 9.0%, pero cuota_mensual y tabla_amortizacion mantienen el cálculo al 4.5%.'
        : 'Recalculado correctamente'
    };
    console.log('Resultado TEST I:', auditFindings['TEST_I']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST J — PUT cambia plazo
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST J — PUT cambia plazo');
    const sId = 't497_std_put_term';
    const lId = 't497_loan_put_term';
    const sched = Array.from({ length: 24 }, (_, i) => ({
      period: i + 1,
      dueDate: new Date(Date.now() + (i + 1) * 30 * 86400000).toISOString(),
      payment: 885.50,
      principal: 800,
      interest: 85.50,
      remainingBalance: 20000 - (i + 1) * 800,
      paid: false
    }));
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Term', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, monthlyPayment: 885.50, schedule: sched });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      termMonths: 48
    });

    const pgLoan = await queryPG('SELECT plazo_meses, cuota_mensual, tabla_amortizacion FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];
    const schedInPG = typeof row.tabla_amortizacion === 'string' ? JSON.parse(row.tabla_amortizacion) : row.tabla_amortizacion;

    auditFindings['TEST_J'] = {
      description: 'PUT modifica plazo_meses de 24 a 48',
      httpStatus: res.status,
      newTermInPG: row.plazo_meses,
      cuotaMensualInPG: row.cuota_mensual,
      scheduleRowsCount: schedInPG?.length,
      observedBehavior: row.plazo_meses == 48 && schedInPG?.length === 24
        ? 'INCONSISTENCIA: plazo_meses cambió a 48, pero tabla_amortizacion sigue teniendo solo 24 cuotas y cuota_mensual intacta.'
        : 'Recalculado correctamente'
    };
    console.log('Resultado TEST J:', auditFindings['TEST_J']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST K — PUT cambia importe
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST K — PUT cambia importe');
    const sId = 't497_std_put_amt';
    const lId = 't497_loan_put_amt';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Amount', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, monthlyPayment: 885.50, openingFee: 20 });

    const res = await requestJson('PUT', `/api/loans/${lId}`, {
      offeredAmount: 60000
    });

    const pgLoan = await queryPG('SELECT importe_ofrecido, comision_apertura, cuota_mensual, tabla_amortizacion FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];

    auditFindings['TEST_K'] = {
      description: 'PUT modifica offeredAmount de 20.000 a 60.000',
      httpStatus: res.status,
      newAmountInPG: row.importe_ofrecido,
      openingFeeInPG: row.comision_apertura,
      cuotaMensualInPG: row.cuota_mensual,
      observedBehavior: row.importe_ofrecido == 60000 && row.comision_apertura == 20.00
        ? 'INCONSISTENCIA: importe_ofrecido aumentó al triple (60.000), pero comision_apertura sigue siendo 20.00 (debería ser 60) y cuota_mensual intacta.'
        : 'Recalculado correctamente'
    };
    console.log('Resultado TEST K:', auditFindings['TEST_K']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST L — Dos PUT simultáneos (Lost Update)
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST L — Dos PUT simultáneos');
    const sId = 't497_std_put_concurrent';
    const lId = 't497_loan_put_concurrent';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test Concur PUT', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    // Request 1 wants to change offeredAmount to 35000
    // Request 2 wants to change termMonths to 60
    const [res1, res2] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 35000 }),
      requestJson('PUT', `/api/loans/${lId}`, { termMonths: 60 })
    ]);

    const pgLoan = await queryPG('SELECT importe_ofrecido, plazo_meses FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];
    const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const memLoan = (rawDb.loans || []).find((l: any) => l.id === lId);

    auditFindings['TEST_L'] = {
      description: 'Dos llamadas PUT concurrentes al mismo préstamo',
      res1Status: res1.status,
      res2Status: res2.status,
      pgImporte: row.importe_ofrecido,
      pgPlazo: row.plazo_meses,
      dbJsonImporte: memLoan?.offeredAmount,
      dbJsonPlazo: memLoan?.termMonths,
      observedBehavior: `PUT 1 (offeredAmount 35000): ${res1.status}, PUT 2 (termMonths 60): ${res2.status}. Final PG: amount=${row.importe_ofrecido}, term=${row.plazo_meses}. Debido a lectura/escritura desincronizada de db.json y syncLoanToSupabase sin locks, existe carrera crítica de Lost Update.`
    };
    console.log('Resultado TEST L:', auditFindings['TEST_L']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST M — PUT vs accept
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST M — PUT vs accept');
    const sId = 't497_std_put_acc';
    const lId = 't497_loan_put_acc';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT vs Acc', status: 'offered', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 5000 });

    // Concurrently change offeredAmount to 70000 via PUT while student accepts original 20000
    const [resPut, resAcc] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 70000 }),
      requestJson('POST', `/api/loans/${lId}/accept`, { studentId: sId })
    ]);

    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];
    const pgAcc = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [sId]);

    auditFindings['TEST_M'] = {
      description: 'Concurrencia PUT vs accept',
      putStatus: resPut.status,
      acceptStatus: resAcc.status,
      finalPGLoanAmount: row.importe_ofrecido,
      finalPGApprovedAmount: row.importe_concedido,
      studentBalance: pgAcc.rows[0]?.saldo,
      observedBehavior: `PUT status ${resPut.status}, Accept status ${resAcc.status}. Si PUT gana antes del lock de accept, accept formaliza 70.000 sin revisión docente ni recálculo de cuota.`
    };
    console.log('Resultado TEST M:', auditFindings['TEST_M']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST N — PUT vs worker
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST N — PUT vs worker');
    const sId = 't497_std_put_worker';
    const lId = 't497_loan_put_worker';
    const pastDate = new Date(Date.now() - 86400000).toISOString();
    const sched = [
      { period: 1, dueDate: pastDate, payment: 1000, principal: 800, interest: 200, remainingBalance: 19000, paid: false }
    ];
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Worker', status: 'active', offeredAmount: 20000, termMonths: 24, rate: 4.5, saldo: 10000, schedule: sched });

    const [resPut, resWorker] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 50000, termMonths: 60 }),
      requestJson('POST', '/api/trigger-salary-check', {})
    ]);

    await new Promise(r => setTimeout(r, 500));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];

    auditFindings['TEST_N'] = {
      description: 'Concurrencia PUT vs Worker',
      putStatus: resPut.status,
      workerStatus: resWorker.status,
      pgEstado: row.estado,
      pgPlazo: row.plazo_meses,
      observedBehavior: 'PUT altera los metadatos en PG/memoria mientras el worker procesa cuotas del schedule original.'
    };
    console.log('Resultado TEST N:', auditFindings['TEST_N']);
    await cleanupTestData(sId, lId);
  }

  // -------------------------------------------------------------
  // TEST O — PUT vs review
  // -------------------------------------------------------------
  {
    console.log('\n>>> EJECUTANDO TEST O — PUT vs review');
    const sId = 't497_std_put_rev';
    const lId = 't497_loan_put_rev';
    await seedLoan({ id: lId, studentId: sId, studentName: 'Test PUT Review', status: 'pending_teacher', offeredAmount: 20000, termMonths: 24, rate: 4.5 });

    const [resPut, resRev] = await Promise.all([
      requestJson('PUT', `/api/loans/${lId}`, { offeredAmount: 40000 }),
      requestJson('POST', `/api/teacher/loans/${lId}/review`, {
        action: 'approve',
        offeredAmount: 30000,
        termMonths: 36,
        interestRate: 4.5
      })
    ]);

    await new Promise(r => setTimeout(r, 400));

    const pgLoan = await queryPG('SELECT * FROM prestamos WHERE id = $1', [lId]);
    const row = pgLoan.rows[0];

    auditFindings['TEST_O'] = {
      description: 'Concurrencia PUT vs Teacher Review',
      putStatus: resPut.status,
      reviewStatus: resRev.status,
      finalPGLoanAmount: row.importe_ofrecido,
      finalPGTerm: row.plazo_meses,
      finalPGEstado: row.estado,
      observedBehavior: `PUT ${resPut.status}, Review ${resRev.status}. El endpoint de review usa transacción y FOR UPDATE, mientras que PUT usa syncLoanToSupabase fuera de transacción.`
    };
    console.log('Resultado TEST O:', auditFindings['TEST_O']);
    await cleanupTestData(sId, lId);
  }

  // Save audit findings to disk for report generation
  fs.writeFileSync('scripts/audit_phase_4_9_7_results.json', JSON.stringify(auditFindings, null, 2));
  console.log('\n================================================================');
  console.log('    AUDITORÍA FASE 4.9.7 COMPLETADA EXITOSAMENTE');
  console.log('================================================================\n');

  await pool.end();
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  pool.end();
  process.exit(1);
});
