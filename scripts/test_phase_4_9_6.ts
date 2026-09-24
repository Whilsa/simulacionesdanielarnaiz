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
      $1, $2, 'Nave Industrial Phase 4.9.6', 'nave', 'compra', $3, $4,
      500, 'Polígono Tecnológico', 20, 100000, 21000, 121000, CURRENT_TIMESTAMP, 'contado'
    ) ON CONFLICT (id) DO UPDATE SET alumno_id = $3, alumno_nombre = $4`,
    [propId, propId, studentId, studentName]
  );

  // Synchronize to db.json for consistency
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    if (!db.acquisitions) db.acquisitions = [];
    if (!db.loans) db.loans = [];
    const existingU = db.users.find((u: any) => u.id === studentId);
    if (!existingU) {
      db.users.push({
        id: studentId,
        username: studentId,
        name: studentName,
        accountNumber: accNum,
        balance: 10000,
        role: 'student',
        level: 1
      });
    }
    const existingAcq = db.acquisitions.find((a: any) => a.id === propId);
    if (!existingAcq) {
      db.acquisitions.push({
        id: propId,
        propertyId: propId,
        propertyTitle: 'Nave Industrial Phase 4.9.6',
        propertyType: 'nave',
        operation: 'compra',
        studentId,
        studentName,
        surfaceM2: 500,
        totalPrice: 121000
      });
    }
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
  } catch (e) {
    // Non-fatal
  }
}

async function cleanupUserLoans(studentId: string) {
  await queryPG('DELETE FROM prestamos WHERE alumno_id = $1', [studentId]);
  try {
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    if (db.loans) {
      db.loans = db.loans.filter((l: any) => l.studentId !== studentId);
      fs.writeFileSync('db.json', JSON.stringify(db, null, 2));
    }
  } catch (e) {}
}

async function runTestSuite() {
  console.log('================================================================');
  console.log('    FASE 4.9.6 — SUITE DE VALIDACIÓN TRANSACCIONAL /LOANS/REQUEST');
  console.log('================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(testNum: number, name: string, condition: boolean, details?: string) {
    total++;
    if (condition) {
      passed++;
      console.log(`[PASS] TEST ${testNum} — ${name}`);
      if (details) console.log(`       -> ${details}`);
    } else {
      console.error(`[FAIL] TEST ${testNum} — ${name}`);
      if (details) console.error(`       -> DETALLE: ${details}`);
    }
  }

  // TEST 1 — Solicitud sin préstamos previos
  {
    const sId = 't496_s1';
    const propId = 'prop_t496_s1';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 1', propId);
    await cleanupUserLoans(sId);

    const res = await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 50000,
      termMonths: 120,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 100000
    });

    const is201 = res.status === 201;
    const loan = res.data?.loan;
    const isOffered = loan?.status === 'offered';
    const noReqTeacher = loan?.requiresTeacherApproval === false;
    const ltvCorrect = loan?.offeredAmount === 50000; // min(50000, 0.8 * 100000)
    const hasSchedule = Array.isArray(loan?.schedule) && loan?.schedule.length === 120;

    // Check PostgreSQL
    const pgRes = await queryPG('SELECT * FROM prestamos WHERE id = $1', [loan?.id]);
    const inPg = pgRes.rows.length === 1 && pgRes.rows[0].estado === 'offered';

    assert(
      1,
      'Solicitud sin préstamos previos (auto-aprobación LTV 80%)',
      is201 && isOffered && noReqTeacher && ltvCorrect && hasSchedule && inPg,
      `Status: ${loan?.status}, requiresTeacher: ${loan?.requiresTeacherApproval}, offeredAmount: ${loan?.offeredAmount}, PG status: ${pgRes.rows[0]?.estado}`
    );
  }

  // TEST 2 — Solicitud con préstamo previo active/offered/pending_teacher
  {
    const sId = 't496_s2';
    const propId = 'prop_t496_s2';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 2', propId);
    await cleanupUserLoans(sId);

    // Create first loan (offered)
    await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 20000,
      termMonths: 60,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 50000
    });

    // Create second loan request
    const res2 = await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 30000,
      termMonths: 60,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 50000
    });

    const loan2 = res2.data?.loan;
    const isPending = loan2?.status === 'pending_teacher';
    const reqTeacher = loan2?.requiresTeacherApproval === true;

    // Check in PostgreSQL
    const pgRes = await queryPG('SELECT * FROM prestamos WHERE id = $1', [loan2?.id]);
    const inPgPending = pgRes.rows.length === 1 && pgRes.rows[0].estado === 'pending_teacher' && pgRes.rows[0].requiere_profesor === true;

    assert(
      2,
      'Solicitud con préstamo previo activo/ofertado (requiere profesor)',
      res2.status === 201 && isPending && reqTeacher && inPgPending,
      `Second loan status: ${loan2?.status}, requiresTeacher: ${loan2?.requiresTeacherApproval}, PG estado: ${pgRes.rows[0]?.estado}`
    );
  }

  // TEST 3 — Dos solicitudes simultáneas mismo alumno
  {
    const sId = 't496_s3';
    const propId = 'prop_t496_s3';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 3', propId);
    await cleanupUserLoans(sId);

    // Launch 2 distinct simultaneous requests for the same student
    const [reqA, reqB] = await Promise.all([
      postJson('/api/loans/request', {
        studentId: sId,
        requestedAmount: 25000,
        termMonths: 60,
        collateralType: 'property',
        propertyId: propId,
        surfaceM2: 500,
        appraisalValue: 60000
      }),
      postJson('/api/loans/request', {
        studentId: sId,
        requestedAmount: 30000,
        termMonths: 60,
        collateralType: 'property',
        propertyId: propId,
        surfaceM2: 500,
        appraisalValue: 60000
      })
    ]);

    const statuses = [reqA.data?.loan?.status, reqB.data?.loan?.status].sort();
    const exactlyOneOfferedOnePending = statuses[0] === 'offered' && statuses[1] === 'pending_teacher';

    const pgLoans = await queryPG('SELECT estado FROM prestamos WHERE alumno_id = $1 ORDER BY fecha_creacion ASC', [sId]);
    const pgStatuses = pgLoans.rows.map(r => r.estado).sort();
    const pgMatch = pgStatuses[0] === 'offered' && pgStatuses[1] === 'pending_teacher';

    assert(
      3,
      'Dos solicitudes simultáneas mismo alumno (exactamente 1 offered y 1 pending_teacher)',
      reqA.status === 201 && reqB.status === 201 && exactlyOneOfferedOnePending && pgMatch,
      `API results: [${statuses.join(', ')}], PG results: [${pgStatuses.join(', ')}]`
    );
  }

  // TEST 4 — Dos solicitudes simultáneas alumnos diferentes
  {
    const sA = 't496_s4a';
    const propA = 'prop_t496_s4a';
    const sB = 't496_s4b';
    const propB = 'prop_t496_s4b';

    await setupTestUserAndAcquisition(sA, 'Alumno Test 4A', propA);
    await setupTestUserAndAcquisition(sB, 'Alumno Test 4B', propB);
    await cleanupUserLoans(sA);
    await cleanupUserLoans(sB);

    const [resA, resB] = await Promise.all([
      postJson('/api/loans/request', {
        studentId: sA,
        requestedAmount: 20000,
        termMonths: 48,
        collateralType: 'property',
        propertyId: propA,
        surfaceM2: 500,
        appraisalValue: 50000
      }),
      postJson('/api/loans/request', {
        studentId: sB,
        requestedAmount: 35000,
        termMonths: 72,
        collateralType: 'property',
        propertyId: propB,
        surfaceM2: 500,
        appraisalValue: 70000
      })
    ]);

    const aOffered = resA.data?.loan?.status === 'offered';
    const bOffered = resB.data?.loan?.status === 'offered';

    assert(
      4,
      'Dos solicitudes simultáneas alumnos diferentes (procesamiento paralelo no bloqueante)',
      resA.status === 201 && resB.status === 201 && aOffered && bOffered,
      `Alumno A status: ${resA.data?.loan?.status}, Alumno B status: ${resB.data?.loan?.status}`
    );
  }

  // TEST 5 — Rollback de solicitud si falla la validación/transacción
  {
    const sId = 't496_s5';
    await cleanupUserLoans(sId);

    // Call request with nonexistent student in DB
    const res = await postJson('/api/loans/request', {
      studentId: 'nonexistent_student_xyz_9999',
      requestedAmount: 20000,
      termMonths: 48,
      collateralType: 'private_residence',
      surfaceM2: 120,
      appraisalValue: 100000
    });

    const is404 = res.status === 404;
    const pgCheck = await queryPG("SELECT * FROM prestamos WHERE alumno_id = 'nonexistent_student_xyz_9999'");
    const noPg = pgCheck.rows.length === 0;

    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    const noDbJson = !(db.loans || []).some((l: any) => l.studentId === 'nonexistent_student_xyz_9999');

    assert(
      5,
      'Rollback de solicitud si falla (nada insertado en PG ni en db.json)',
      is404 && noPg && noDbJson,
      `HTTP status: ${res.status}, PG rows: ${pgCheck.rows.length}, db.json rows: ${noDbJson ? 0 : 'found'}`
    );
  }

  // TEST 6 — Idempotencia misma clave (2 requests simultáneos)
  {
    const sId = 't496_s6';
    const propId = 'prop_t496_s6';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 6', propId);
    await cleanupUserLoans(sId);

    const sharedKey = `idem_test6_${Date.now()}`;
    const payload = {
      studentId: sId,
      requestedAmount: 40000,
      termMonths: 84,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 80000
    };

    const [res1, res2] = await Promise.all([
      postJson('/api/loans/request', payload, { 'x-idempotency-key': sharedKey }),
      postJson('/api/loans/request', payload, { 'x-idempotency-key': sharedKey })
    ]);

    const loan1 = res1.data?.loan;
    const loan2 = res2.data?.loan;
    const sameId = loan1?.id && loan1.id === loan2?.id;

    const pgLoans = await queryPG('SELECT id FROM prestamos WHERE alumno_id = $1', [sId]);
    const singleLoanInPg = pgLoans.rows.length === 1;

    assert(
      6,
      'Idempotencia misma clave con concurrencia (1 solo préstamo registrado)',
      sameId && singleLoanInPg,
      `res1 id: ${loan1?.id}, res2 id: ${loan2?.id}, total in PG: ${pgLoans.rows.length}`
    );
  }

  // TEST 7 — Idempotencia retry post-commit
  {
    const sId = 't496_s7';
    const propId = 'prop_t496_s7';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 7', propId);
    await cleanupUserLoans(sId);

    const sharedKey = `idem_test7_${Date.now()}`;
    const payload = {
      studentId: sId,
      requestedAmount: 30000,
      termMonths: 60,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 70000
    };

    // First request
    const firstRes = await postJson('/api/loans/request', payload, { 'x-idempotency-key': sharedKey });
    const firstLoanId = firstRes.data?.loan?.id;

    // Retry with the exact same key after commit
    const retryRes = await postJson('/api/loans/request', payload, { 'x-idempotency-key': sharedKey });
    const retryLoanId = retryRes.data?.loan?.id;

    const pgLoans = await queryPG('SELECT id FROM prestamos WHERE alumno_id = $1', [sId]);
    const singleLoan = pgLoans.rows.length === 1;
    const matchesOriginal = firstLoanId === retryLoanId;

    assert(
      7,
      'Idempotencia retry post-commit (retorna misma respuesta, sin duplicación)',
      singleLoan && matchesOriginal,
      `Original ID: ${firstLoanId}, Retry ID: ${retryLoanId}, Total PG count: ${pgLoans.rows.length}`
    );
  }

  // TEST 8 — Solicitudes diferentes, misma garantía (regla real del simulador)
  {
    const sId = 't496_s8';
    const propId = 'prop_t496_s8';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 8', propId);
    await cleanupUserLoans(sId);

    // Loan 1 with propId
    const res1 = await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 20000,
      termMonths: 36,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 60000
    });

    // Loan 2 with SAME propId
    const res2 = await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 25000,
      termMonths: 48,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 60000
    });

    // According to audit 4.9.5 and simulator rules, the codebase allows collateral reuse;
    // however, the second request is subordinated to the First Loan Rule, so loan 1 is offered and loan 2 is pending_teacher.
    const loan1 = res1.data?.loan;
    const loan2 = res2.data?.loan;
    const l1Offered = loan1?.status === 'offered';
    const l2Pending = loan2?.status === 'pending_teacher';

    const pgLoans = await queryPG('SELECT id, garantia_inmueble_id, estado FROM prestamos WHERE alumno_id = $1', [sId]);
    const twoLoansExist = pgLoans.rows.length === 2;

    assert(
      8,
      'Solicitudes diferentes con misma garantía (regla real permite reutilización subordinada a aprobación)',
      res1.status === 201 && res2.status === 201 && l1Offered && l2Pending && twoLoansExist,
      `Loan 1: ${loan1?.status}, Loan 2: ${loan2?.status}, Total loans in PG: ${pgLoans.rows.length}`
    );
  }

  // TEST 9 — Garantía de otro alumno (debe rechazarse)
  {
    const sOwner = 't496_s9_owner';
    const sAttacker = 't496_s9_attacker';
    const propOwner = 'prop_t496_s9_owner';

    await setupTestUserAndAcquisition(sOwner, 'Alumno Propietario', propOwner);
    await setupTestUserAndAcquisition(sAttacker, 'Alumno No Propietario', 'prop_dummy_s9');
    await cleanupUserLoans(sAttacker);

    // sAttacker attempts to request a loan using sOwner's property
    const res = await postJson('/api/loans/request', {
      studentId: sAttacker,
      requestedAmount: 30000,
      termMonths: 60,
      collateralType: 'property',
      propertyId: propOwner,
      surfaceM2: 500,
      appraisalValue: 80000
    });

    const isRejected = res.status === 400;
    const errorMsg = res.data?.error || '';
    const errorMentionsOwnership = errorMsg.toLowerCase().includes('pertenece') || errorMsg.toLowerCase().includes('garantía');

    const pgCheck = await queryPG('SELECT id FROM prestamos WHERE alumno_id = $1', [sAttacker]);
    const nothingInPg = pgCheck.rows.length === 0;

    assert(
      9,
      'Garantía de otro alumno (rechazada con 400 por falta de titularidad)',
      isRejected && nothingInPg,
      `HTTP status: ${res.status}, Error message: "${errorMsg}", Rows in PG: ${pgCheck.rows.length}`
    );
  }

  // TEST 10 — Consistencia post-commit (PostgreSQL es fuente de verdad y db.json sincronizado)
  {
    const sId = 't496_s10';
    const propId = 'prop_t496_s10';
    await setupTestUserAndAcquisition(sId, 'Alumno Test 10', propId);
    await cleanupUserLoans(sId);

    const res = await postJson('/api/loans/request', {
      studentId: sId,
      requestedAmount: 45000,
      termMonths: 96,
      collateralType: 'property',
      propertyId: propId,
      surfaceM2: 500,
      appraisalValue: 90000
    });

    const loanId = res.data?.loan?.id;
    const pgRes = await queryPG('SELECT * FROM prestamos WHERE id = $1', [loanId]);
    const foundInPg = pgRes.rows.length === 1;

    // Check db.json
    const raw = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(raw);
    const foundInDb = (db.loans || []).some((l: any) => l.id === loanId);

    assert(
      10,
      'Consistencia post-commit (PostgreSQL contiene el registro y db.json sincronizado)',
      res.status === 201 && foundInPg && foundInDb,
      `Loan ID: ${loanId}, Found in PG: ${foundInPg}, Found in db.json: ${foundInDb}`
    );
  }

  console.log('\n================================================================');
  console.log(`    RESULTADO FINAL: ${passed}/${total} PRUEBAS SUPERADAS`);
  console.log('================================================================\n');

  await pool.end();
  process.exit(passed === total ? 0 : 1);
}

runTestSuite().catch(err => {
  console.error('Fatal test error:', err);
  pool.end();
  process.exit(1);
});
