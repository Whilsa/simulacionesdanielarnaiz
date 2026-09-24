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

async function setupTestUserAndAcquisition(studentId: string, studentName: string, propId: string) {
  const accNum = 'ES00' + studentId;
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, 10000, $3, 'testpass', $4, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET alumno = $2, saldo = 10000`,
    [studentId, studentName, studentId, accNum]
  );

  await queryPG(
    `INSERT INTO adquisiciones (
      id, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, alumno_id, alumno_nombre,
      superficie_m2, ubicacion, porcentaje_suelo, precio_base, importe_iva, precio_total, fecha_compra, metodo_pago
    ) VALUES (
      $1, $2, 'Nave Test Auditoria', 'nave', 'compra', $3, $4,
      400, 'Polígono Industrial', 20, 100000, 21000, 121000, CURRENT_TIMESTAMP, 'contado'
    ) ON CONFLICT (id) DO NOTHING`,
    [propId, propId, studentId, studentName]
  );

  // Sync to db.json as well
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    if (!db.acquisitions) db.acquisitions = [];
    if (!db.loans) db.loans = [];

    const existingU = db.users.find((u: any) => u.id === studentId);
    if (existingU) {
      existingU.name = studentName;
      existingU.accountNumber = 'ES00' + studentId;
    } else {
      db.users.push({ id: studentId, name: studentName, balance: 10000, accountNumber: 'ES00' + studentId, role: 'student', level: 1 });
    }

    const existingA = db.acquisitions.find((a: any) => a.id === propId);
    if (!existingA) {
      db.acquisitions.push({
        id: propId,
        propertyId: propId,
        propertyTitle: 'Nave Test Auditoria',
        propertyType: 'nave',
        operation: 'compra',
        studentId,
        studentName,
        surfaceM2: 400,
        basePrice: 100000,
        totalPrice: 121000
      });
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}
}

async function runAudit() {
  console.log('===============================================================');
  console.log('FASE 4.9.5 — SUITE DE AUDITORÍA CONCURRENTE DE /api/loans/request');
  console.log('===============================================================');

  // Clean test tables
  await queryPG("DELETE FROM prestamos WHERE alumno_id LIKE 'audit_std_%'");
  await queryPG("DELETE FROM adquisiciones WHERE alumno_id LIKE 'audit_std_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'audit_std_%'");
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.loans) db.loans = db.loans.filter((l: any) => !String(l.studentId).startsWith('audit_std_'));
    if (db.users) db.users = db.users.filter((u: any) => !String(u.id).startsWith('audit_std_'));
    if (db.acquisitions) db.acquisitions = db.acquisitions.filter((a: any) => !String(a.studentId).startsWith('audit_std_'));
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  // -------------------------------------------------------------
  // TEST A: Dos solicitudes simultáneas del mismo alumno
  // -------------------------------------------------------------
  console.log('\n--- TEST A: Dos solicitudes simultáneas del mismo alumno ---');
  const stdA = 'audit_std_A';
  const propA = 'audit_prop_A';
  await setupTestUserAndAcquisition(stdA, 'Alumno Test A', propA);

  const reqBodyA = {
    studentId: stdA,
    requestedAmount: 30000,
    termMonths: 12,
    collateralType: 'property',
    propertyId: propA,
    surfaceM2: 400,
    appraisalValue: 100000
  };

  const [resA1, resA2] = await Promise.all([
    postJson('/api/loans/request', reqBodyA),
    postJson('/api/loans/request', reqBodyA)
  ]);

  const pgLoansA = await queryPG('SELECT id, estado, requiere_profesor FROM prestamos WHERE alumno_id = $1 ORDER BY fecha_creacion ASC', [stdA]);
  console.log(`HTTP Status: Solicitud 1 = ${resA1.status}, Solicitud 2 = ${resA2.status}`);
  console.log(`Préstamos creados en PostgreSQL: ${pgLoansA.rows.length}`);
  console.log('Detalle préstamos PG:', pgLoansA.rows);
  const raceDetectedA = pgLoansA.rows.length === 2 &&
                        pgLoansA.rows[0].estado === 'offered' &&
                        pgLoansA.rows[1].estado === 'offered';
  console.log(`Resultado TEST A: ¿Se produjo carrera y ambos obtuvieron 'offered'? -> ${raceDetectedA ? 'SÍ (CARRERA CONFIRMADA)' : 'NO'}`);

  // -------------------------------------------------------------
  // TEST B: Tres solicitudes simultáneas del mismo alumno
  // -------------------------------------------------------------
  console.log('\n--- TEST B: Tres solicitudes simultáneas del mismo alumno ---');
  const stdB = 'audit_std_B';
  const propB = 'audit_prop_B';
  await setupTestUserAndAcquisition(stdB, 'Alumno Test B', propB);

  const reqBodyB = {
    studentId: stdB,
    requestedAmount: 20000,
    termMonths: 12,
    collateralType: 'property',
    propertyId: propB,
    surfaceM2: 400,
    appraisalValue: 80000
  };

  const [resB1, resB2, resB3] = await Promise.all([
    postJson('/api/loans/request', reqBodyB),
    postJson('/api/loans/request', reqBodyB),
    postJson('/api/loans/request', reqBodyB)
  ]);

  const pgLoansB = await queryPG('SELECT id, estado, requiere_profesor FROM prestamos WHERE alumno_id = $1 ORDER BY fecha_creacion ASC', [stdB]);
  console.log(`HTTP Status: B1 = ${resB1.status}, B2 = ${resB2.status}, B3 = ${resB3.status}`);
  console.log(`Préstamos creados en PostgreSQL: ${pgLoansB.rows.length}`);
  console.log('Detalle préstamos PG:', pgLoansB.rows);
  const offeredCountB = pgLoansB.rows.filter(r => r.estado === 'offered').length;
  console.log(`Resultado TEST B: Préstamos con estado 'offered' = ${offeredCountB} de ${pgLoansB.rows.length}`);

  // -------------------------------------------------------------
  // TEST C: Solicitud concurrente con un préstamo ya active
  // -------------------------------------------------------------
  console.log('\n--- TEST C: Solicitud concurrente con un préstamo ya active ---');
  const stdC = 'audit_std_C';
  const propC = 'audit_prop_C';
  await setupTestUserAndAcquisition(stdC, 'Alumno Test C', propC);

  // Pre-seed an active loan in DB & db.json
  const activeLoanId = 'audit_loan_C_active';
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido, importe_concedido,
      plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
      garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
      estado, requiere_profesor, tabla_amortizacion, fecha_creacion
    ) VALUES (
      $1, $2, 'Alumno Test C', 'ES00audit_std_C', 50000, 50000, 50000,
      12, 4.5, 3.5, 1.0, 50, 4268.22,
      'property', $3, 'Nave Test Auditoria', 400, 100000,
      'active', false, '[]', CURRENT_TIMESTAMP
    )`,
    [activeLoanId, stdC, propC]
  );

  // Sync to db.json
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    db.loans.push({
      id: activeLoanId,
      studentId: stdC,
      studentName: 'Alumno Test C',
      studentAccount: 'ES00audit_std_C',
      requestedAmount: 50000,
      offeredAmount: 50000,
      approvedAmount: 50000,
      termMonths: 12,
      annualInterestRate: 4.5,
      euriborRate: 3.5,
      spread: 1.0,
      openingFee: 50,
      monthlyPayment: 4268.22,
      collateral: { type: 'property', propertyId: propC, propertyTitle: 'Nave Test Auditoria', surfaceM2: 400, appraisalValue: 100000 },
      status: 'active',
      requiresTeacherApproval: false,
      createdAt: new Date().toISOString(),
      schedule: []
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  const resC = await postJson('/api/loans/request', {
    studentId: stdC,
    requestedAmount: 25000,
    termMonths: 12,
    collateralType: 'property',
    propertyId: propC,
    surfaceM2: 400,
    appraisalValue: 100000
  });

  const pgLoanC = await queryPG('SELECT id, estado, requiere_profesor FROM prestamos WHERE id = $1', [resC.data?.loan?.id]);
  console.log(`HTTP Status: ${resC.status}`);
  console.log('Detalle nuevo préstamo con activo previo:', pgLoanC.rows[0]);
  console.log(`Resultado TEST C: Estado = ${pgLoanC.rows[0]?.estado}, Requiere profesor = ${pgLoanC.rows[0]?.requiere_profesor}`);

  // -------------------------------------------------------------
  // TEST D: Solicitud concurrente con un préstamo offered
  // -------------------------------------------------------------
  console.log('\n--- TEST D: Solicitud concurrente con un préstamo offered ---');
  const stdD = 'audit_std_D';
  const propD = 'audit_prop_D';
  await setupTestUserAndAcquisition(stdD, 'Alumno Test D', propD);

  const offeredLoanId = 'audit_loan_D_offered';
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
      plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
      garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
      estado, requiere_profesor, tabla_amortizacion, fecha_creacion
    ) VALUES (
      $1, $2, 'Alumno Test D', 'ES00audit_std_D', 40000, 40000,
      12, 4.5, 3.5, 1.0, 40, 3414.58,
      'property', $3, 'Nave Test Auditoria', 400, 100000,
      'offered', false, '[]', CURRENT_TIMESTAMP
    )`,
    [offeredLoanId, stdD, propD]
  );
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    db.loans.push({
      id: offeredLoanId,
      studentId: stdD,
      studentName: 'Alumno Test D',
      studentAccount: 'ES00audit_std_D',
      requestedAmount: 40000,
      offeredAmount: 40000,
      termMonths: 12,
      annualInterestRate: 4.5,
      euriborRate: 3.5,
      spread: 1.0,
      openingFee: 40,
      monthlyPayment: 3414.58,
      collateral: { type: 'property', propertyId: propD, propertyTitle: 'Nave Test Auditoria', surfaceM2: 400, appraisalValue: 100000 },
      status: 'offered',
      requiresTeacherApproval: false,
      createdAt: new Date().toISOString(),
      schedule: []
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  const resD = await postJson('/api/loans/request', {
    studentId: stdD,
    requestedAmount: 15000,
    termMonths: 6,
    collateralType: 'property',
    propertyId: propD,
    surfaceM2: 400,
    appraisalValue: 100000
  });

  const pgLoanD = await queryPG('SELECT id, estado, requiere_profesor FROM prestamos WHERE id = $1', [resD.data?.loan?.id]);
  console.log(`HTTP Status: ${resD.status}`);
  console.log('Detalle nuevo préstamo con offered previo:', pgLoanD.rows[0]);
  console.log(`Resultado TEST D: Estado = ${pgLoanD.rows[0]?.estado}, Requiere profesor = ${pgLoanD.rows[0]?.requiere_profesor}`);

  // -------------------------------------------------------------
  // TEST E: Solicitud concurrente con teacher_offered
  // -------------------------------------------------------------
  console.log('\n--- TEST E: Solicitud concurrente con teacher_offered ---');
  const stdE = 'audit_std_E';
  const propE = 'audit_prop_E';
  await setupTestUserAndAcquisition(stdE, 'Alumno Test E', propE);

  const teacherOfferedLoanId = 'audit_loan_E_teach_off';
  await queryPG(
    `INSERT INTO prestamos (
      id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
      plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
      garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
      estado, requiere_profesor, tabla_amortizacion, fecha_creacion
    ) VALUES (
      $1, $2, 'Alumno Test E', 'ES00audit_std_E', 40000, 35000,
      12, 4.0, 3.5, 1.0, 35, 2987.75,
      'property', $3, 'Nave Test Auditoria', 400, 100000,
      'teacher_offered', true, '[]', CURRENT_TIMESTAMP
    )`,
    [teacherOfferedLoanId, stdE, propE]
  );
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    db.loans.push({
      id: teacherOfferedLoanId,
      studentId: stdE,
      studentName: 'Alumno Test E',
      studentAccount: 'ES00audit_std_E',
      requestedAmount: 40000,
      offeredAmount: 35000,
      termMonths: 12,
      annualInterestRate: 4.0,
      euriborRate: 3.5,
      spread: 1.0,
      openingFee: 35,
      monthlyPayment: 2987.75,
      collateral: { type: 'property', propertyId: propE, propertyTitle: 'Nave Test Auditoria', surfaceM2: 400, appraisalValue: 100000 },
      status: 'teacher_offered',
      requiresTeacherApproval: true,
      createdAt: new Date().toISOString(),
      schedule: []
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  const resE = await postJson('/api/loans/request', {
    studentId: stdE,
    requestedAmount: 10000,
    termMonths: 6,
    collateralType: 'property',
    propertyId: propE,
    surfaceM2: 400,
    appraisalValue: 100000
  });

  const pgLoanE = await queryPG('SELECT id, estado, requiere_profesor FROM prestamos WHERE id = $1', [resE.data?.loan?.id]);
  console.log(`HTTP Status: ${resE.status}`);
  console.log('Detalle nuevo préstamo con teacher_offered previo:', pgLoanE.rows[0]);
  console.log(`Resultado TEST E: Estado = ${pgLoanE.rows[0]?.estado}, Requiere profesor = ${pgLoanE.rows[0]?.requiere_profesor}`);

  // -------------------------------------------------------------
  // TEST F: Dos alumnos diferentes solicitando simultáneamente
  // -------------------------------------------------------------
  console.log('\n--- TEST F: Dos alumnos diferentes solicitando simultáneamente ---');
  const stdF1 = 'audit_std_F1';
  const propF1 = 'audit_prop_F1';
  const stdF2 = 'audit_std_F2';
  const propF2 = 'audit_prop_F2';
  await setupTestUserAndAcquisition(stdF1, 'Alumno F1', propF1);
  await setupTestUserAndAcquisition(stdF2, 'Alumno F2', propF2);

  const [resF1, resF2] = await Promise.all([
    postJson('/api/loans/request', {
      studentId: stdF1,
      requestedAmount: 20000,
      termMonths: 12,
      collateralType: 'property',
      propertyId: propF1,
      surfaceM2: 400,
      appraisalValue: 100000
    }),
    postJson('/api/loans/request', {
      studentId: stdF2,
      requestedAmount: 30000,
      termMonths: 24,
      collateralType: 'property',
      propertyId: propF2,
      surfaceM2: 400,
      appraisalValue: 100000
    })
  ]);

  const pgLoansF1 = await queryPG('SELECT id, estado FROM prestamos WHERE alumno_id = $1', [stdF1]);
  const pgLoansF2 = await queryPG('SELECT id, estado FROM prestamos WHERE alumno_id = $1', [stdF2]);
  console.log(`HTTP Status: F1 = ${resF1.status}, F2 = ${resF2.status}`);
  console.log(`F1 loans en PG: ${pgLoansF1.rows.length}, estado: ${pgLoansF1.rows[0]?.estado}`);
  console.log(`F2 loans en PG: ${pgLoansF2.rows.length}, estado: ${pgLoansF2.rows[0]?.estado}`);

  // -------------------------------------------------------------
  // TEST G: Dos solicitudes con LA MISMA GARANTÍA (Mismo inmueble)
  // -------------------------------------------------------------
  console.log('\n--- TEST G: Dos solicitudes con LA MISMA GARANTÍA ---');
  const stdG = 'audit_std_G';
  const propG = 'audit_prop_G';
  await setupTestUserAndAcquisition(stdG, 'Alumno Test G', propG);

  const resG1 = await postJson('/api/loans/request', {
    studentId: stdG,
    requestedAmount: 50000,
    termMonths: 12,
    collateralType: 'property',
    propertyId: propG,
    surfaceM2: 400,
    appraisalValue: 100000
  });

  const resG2 = await postJson('/api/loans/request', {
    studentId: stdG,
    requestedAmount: 50000,
    termMonths: 12,
    collateralType: 'property',
    propertyId: propG,
    surfaceM2: 400,
    appraisalValue: 100000
  });

  console.log(`HTTP Status: G1 = ${resG1.status}, G2 = ${resG2.status}`);
  const pgLoansG = await queryPG('SELECT id, estado, garantia_inmueble_id FROM prestamos WHERE alumno_id = $1', [stdG]);
  console.log(`Préstamos creados usando el MISMO inmueble: ${pgLoansG.rows.length}`);
  console.log('Detalle préstamos G:', pgLoansG.rows);

  // Clean test tables
  await queryPG("DELETE FROM prestamos WHERE alumno_id LIKE 'audit_std_%'");
  await queryPG("DELETE FROM adquisiciones WHERE alumno_id LIKE 'audit_std_%'");
  await queryPG("DELETE FROM cuentas WHERE id LIKE 'audit_std_%'");
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.loans) db.loans = db.loans.filter((l: any) => !String(l.studentId).startsWith('audit_std_'));
    if (db.users) db.users = db.users.filter((u: any) => !String(u.id).startsWith('audit_std_'));
    if (db.acquisitions) db.acquisitions = db.acquisitions.filter((a: any) => !String(a.studentId).startsWith('audit_std_'));
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {}

  await pool.end();
}

runAudit().catch(err => {
  console.error('Audit fatal error:', err);
  process.exit(1);
});
