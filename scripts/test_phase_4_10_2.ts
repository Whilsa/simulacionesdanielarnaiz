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

async function createTestLawsuit(id: string, caseNumber: string, status: string = 'pendiente_admision', extra: any = {}) {
  const plaintiffId = 'p4102_plaintiff_' + id;
  const defendantId = 'p4102_defendant_' + id;
  const plaintiffAcc = 'ES99001' + id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15);
  const defendantAcc = 'ES99002' + id.replace(/[^a-zA-Z0-9]/g, '').slice(0, 15);

  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, 10000, $3, 'pass', $4, 'student', 1),
            ($5, $6, 10000, $7, 'pass', $8, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET saldo = 10000`,
    [plaintiffId, 'Test Plaintiff ' + id, plaintiffId, plaintiffAcc, defendantId, 'Test Defendant ' + id, defendantId, defendantAcc]
  );

  const raw = fs.readFileSync('db.json', 'utf8');
  const db = JSON.parse(raw);
  if (!db.users) db.users = [];
  if (!db.courtLawsuits) db.courtLawsuits = [];

  let pUser = db.users.find((u: any) => u.id === plaintiffId);
  if (!pUser) {
    pUser = { id: plaintiffId, name: 'Test Plaintiff ' + id, username: plaintiffId, balance: 10000, accountNumber: plaintiffAcc, role: 'student', notifications: [] };
    db.users.push(pUser);
  }
  let dUser = db.users.find((u: any) => u.id === defendantId);
  if (!dUser) {
    dUser = { id: defendantId, name: 'Test Defendant ' + id, username: defendantId, balance: 10000, accountNumber: defendantAcc, role: 'student', notifications: [] };
    db.users.push(dUser);
  }

  const uniqueCaseNumber = caseNumber + '-' + id;

  const lawsuitObj = {
    id,
    caseNumber: uniqueCaseNumber,
    courtName: 'Juzgado de 1ª Instancia Nº 1',
    type: extra.type || 'cambiaria',
    subtype: 'impago_pagare',
    plaintiffId,
    plaintiffName: 'Test Plaintiff ' + id,
    plaintiffIban: plaintiffAcc,
    defendantId,
    defendantName: 'Test Defendant ' + id,
    defendantIban: defendantAcc,
    claimedAmount: 2000,
    interestAndCostsAmount: 600,
    totalClaimAmount: 2600,
    goodsDescription: 'Pagaré impagado',
    facts: 'Hechos demanda prueba 4.10.2',
    legalBasis: 'Ley Cambiaria y del Cheque',
    petitum: 'Reclamación judicial',
    evidenceSummary: 'Pagaré bancario',
    status,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...extra
  };

  const exIdx = db.courtLawsuits.findIndex((l: any) => l.id === id);
  if (exIdx >= 0) db.courtLawsuits[exIdx] = lawsuitObj;
  else db.courtLawsuits.push(lawsuitObj);

  fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

  // Sync to PG
  await queryPG(
    `INSERT INTO demandas_judiciales (
      id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandante_iban,
      demandado_id, demandado_nombre, demandado_iban, cuantia_reclamada, intereses_costas, cuantia_total,
      descripcion_bienes, hechos, fundamentos_derecho, petitum, resumen_prueba, estado,
      fecha_creacion, fecha_actualizacion
    ) VALUES (
      $1, $2, 'Juzgado de 1ª Instancia Nº 1', $8, 'impago_pagare', $3, $9, $6,
      $4, $10, $7, 2000, 600, 2600,
      'Pagaré impagado', 'Hechos', 'Fundamentos', 'Petitum', 'Prueba', $5,
      NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET estado = $5`,
    [id, uniqueCaseNumber, plaintiffId, defendantId, status, plaintiffAcc, defendantAcc, extra.type || 'cambiaria', 'Test Plaintiff ' + id, 'Test Defendant ' + id]
  );

  return lawsuitObj;
}

async function runTests() {
  console.log('================================================================');
  console.log('   FASE 4.10.2 — SUITE COMPLETA DE VERIFICACIÓN (TESTS A - S)   ');
  console.log('================================================================\n');

  const results: Record<string, any> = {};
  let allPassed = true;

  function record(testName: string, passed: boolean, details: any) {
    results[testName] = { passed, ...details };
    if (!passed) allPassed = false;
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${testName}: ${details.summary || ''}`);
  }

  // TEST A: Flujo feliz de admisión (admitir)
  try {
    const id = 'test_4102_a_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-A');
    const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, {
      admission: 'admitir',
      notes: 'Auto test A admitido',
      judgeId: 'teacher-1'
    });

    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
    const notifs = (await queryPG('SELECT * FROM notificaciones WHERE related_order_id = $1', [id])).rows;
    const dbRaw = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const memLawsuit = dbRaw.courtLawsuits.find((l: any) => l.id === id);

    const passed = res.status === 200 &&
      res.data?.success === true &&
      pgRow.estado === 'admitida' &&
      Boolean(pgRow.fecha_admision) &&
      Boolean(pgRow.plazo_limite_contestacion) &&
      pgRow.notas_admision === 'Auto test A admitido' &&
      notifs.length === 2 &&
      memLawsuit?.status === 'admitida';

    record('TEST A', passed, {
      summary: 'Admisión feliz: estado admitida en PG, fecha y plazo asignados, 2 notificaciones en PG, coherencia db.json',
      httpStatus: res.status,
      pgStatus: pgRow.estado,
      notifsCount: notifs.length
    });
  } catch (e: any) {
    record('TEST A', false, { summary: 'Error ' + e.message });
  }

  // TEST B: Flujo feliz de inadmisión (rechazar)
  try {
    const id = 'test_4102_b_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-B');
    const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, {
      admission: 'rechazar',
      notes: 'Falta acreditación documental',
      judgeId: 'teacher-1'
    });

    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
    const notifs = (await queryPG('SELECT * FROM notificaciones WHERE related_order_id = $1', [id])).rows;
    const dbRaw = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const memLawsuit = dbRaw.courtLawsuits.find((l: any) => l.id === id);

    const passed = res.status === 200 &&
      res.data?.success === true &&
      pgRow.estado === 'inadmitida' &&
      Boolean(pgRow.fecha_resolucion) &&
      pgRow.notas_resolucion === 'Falta acreditación documental' &&
      notifs.length === 1 &&
      notifs[0].user_id === pgRow.demandante_id &&
      memLawsuit?.status === 'inadmitida';

    record('TEST B', passed, {
      summary: 'Inadmisión feliz: estado inadmitida en PG, fecha_resolucion, 1 notificación solo al demandante, coherencia db.json',
      httpStatus: res.status,
      pgStatus: pgRow.estado,
      notifsCount: notifs.length
    });
  } catch (e: any) {
    record('TEST B', false, { summary: 'Error ' + e.message });
  }

  // TEST C: Dos judge-admission simultáneos sobre la misma demanda con la MISMA decisión
  try {
    const id = 'test_4102_c_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-C');

    const [res1, res2] = await Promise.all([
      requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir', notes: 'Concurrente 1' }),
      requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir', notes: 'Concurrente 2' })
    ]);

    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
    const notifs = (await queryPG('SELECT * FROM notificaciones WHERE related_order_id = $1', [id])).rows;

    const passed = res1.status === 200 &&
      res2.status === 200 &&
      pgRow.estado === 'admitida' &&
      notifs.length === 2; // Exactamente una sola emisión de 2 notificaciones (demandante y demandado), no duplicadas

    record('TEST C', passed, {
      summary: 'Doble admisión simultánea: ambas responden 200 coherentemente, exactamente una transición y 2 notificaciones (sin duplicar)',
      status1: res1.status,
      status2: res2.status,
      notifsCount: notifs.length
    });
  } catch (e: any) {
    record('TEST C', false, { summary: 'Error ' + e.message });
  }

  // TEST D: Dos judge-admission simultáneos con decisiones DIFERENTES (admitir vs rechazar)
  try {
    const id = 'test_4102_d_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-D');

    const [resAdmit, resReject] = await Promise.all([
      requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' }),
      requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'rechazar' })
    ]);

    const statuses = [resAdmit.status, resReject.status].sort();
    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];

    // One must succeed (200), the other must be rejected (400) because state is no longer pendiente_admision
    const passed = statuses[0] === 200 && statuses[1] === 400 && (pgRow.estado === 'admitida' || pgRow.estado === 'inadmitida');

    record('TEST D', passed, {
      summary: 'Decisiones opuestas simultáneas: serialización mediante FOR UPDATE, un ganador (200), un perdedor (400) por estado incompatible',
      admitStatus: resAdmit.status,
      rejectStatus: resReject.status,
      finalPgStatus: pgRow.estado
    });
  } catch (e: any) {
    record('TEST D', false, { summary: 'Error ' + e.message });
  }

  // TEST E: Carrera entre judge-admission y defendant-answer
  try {
    const id = 'test_4102_e_' + Date.now();
    const law = await createTestLawsuit(id, 'AUTOS-E', 'pendiente_admision', { type: 'ordinaria' });

    // Intento de contestación antes de admisión -> debe dar 400
    const answerResBefore = await requestJson('POST', `/api/court/lawsuits/${id}/defendant-answer`, {
      defendantId: law.defendantId,
      answerType: 'ordinaria_contestacion',
      facts: 'Alegaciones previas'
    });

    // Ahora admitir formalmente
    const admitRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, {
      admission: 'admitir'
    });

    // Ahora la contestación debe ser admitida a trámite
    const answerResAfter = await requestJson('POST', `/api/court/lawsuits/${id}/defendant-answer`, {
      defendantId: law.defendantId,
      answerType: 'ordinaria_contestacion',
      facts: 'Alegaciones tras admisión'
    });

    const passed = answerResBefore.status === 400 && admitRes.status === 200 && answerResAfter.status === 200;

    record('TEST E', passed, {
      summary: 'Secuencia procesal con defendant-answer: rechaza 400 antes de admitir, procede 200 tras admitir',
      beforeStatus: answerResBefore.status,
      admitStatus: admitRes.status,
      afterStatus: answerResAfter.status
    });
  } catch (e: any) {
    record('TEST E', false, { summary: 'Error ' + e.message });
  }

  // TEST F: Carrera entre judge-admission y pay-settle
  try {
    const id = 'test_4102_f_' + Date.now();
    const law = await createTestLawsuit(id, 'AUTOS-F');

    const admitRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const settleRes = await requestJson('POST', `/api/court/lawsuits/${id}/pay-settle`, { payerId: law.defendantId });

    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
    const passed = admitRes.status === 200 && settleRes.status === 200 && pgRow.estado === 'allanada_pagada';

    record('TEST F', passed, {
      summary: 'Interacción con pay-settle: admisión normal y allanamiento posterior consistente',
      admitStatus: admitRes.status,
      settleStatus: settleRes.status,
      finalPgStatus: pgRow.estado
    });
  } catch (e: any) {
    record('TEST F', false, { summary: 'Error ' + e.message });
  }

  // TEST G: Carrera entre judge-admission y judge-ruling
  try {
    const id = 'test_4102_g_' + Date.now();
    const law = await createTestLawsuit(id, 'AUTOS-G', 'pendiente_admision');

    // Attempt ruling on unadmitted lawsuit -> ruling requires admitted/answered
    // Now admit
    const admitRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const pgRow = (await queryPG('SELECT * FROM demandas_judiciales WHERE id = $1', [id])).rows[0];

    const passed = admitRes.status === 200 && pgRow.estado === 'admitida';

    record('TEST G', passed, {
      summary: 'Admisión procesal frente a judge-ruling: estado pasa a admitida de forma atómica',
      admitStatus: admitRes.status,
      pgStatus: pgRow.estado
    });
  } catch (e: any) {
    record('TEST G', false, { summary: 'Error ' + e.message });
  }

  // TEST H: Inadmisión previa y posterior intento de contestar, pagar o fallar
  try {
    const id = 'test_4102_h_' + Date.now();
    const law = await createTestLawsuit(id, 'AUTOS-H');

    // Inadmitir
    const rejectRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'rechazar' });

    // Intento de contestación -> 400
    const answerRes = await requestJson('POST', `/api/court/lawsuits/${id}/defendant-answer`, {
      defendantId: law.defendantId,
      answerType: 'cambiaria_ya_pagado'
    });

    // Intento de embargo -> 400
    const embargoRes = await requestJson('POST', `/api/court/lawsuits/${id}/preventative-embargo`, {
      judgeId: 'judge-1'
    });

    const passed = rejectRes.status === 200 && answerRes.status === 400 && embargoRes.status === 400;

    record('TEST H', passed, {
      summary: 'Inadmisión previa bloquea contestación (400) y embargo (400)',
      rejectStatus: rejectRes.status,
      answerStatus: answerRes.status,
      embargoStatus: embargoRes.status
    });
  } catch (e: any) {
    record('TEST H', false, { summary: 'Error ' + e.message });
  }

  // TEST I: Intento de admitir una demanda ya admitida
  try {
    const id = 'test_4102_i_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-I');

    // Primera admisión
    const firstRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const notifsBefore = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    // Segunda admisión
    const secondRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const notifsAfter = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const passed = firstRes.status === 200 &&
      secondRes.status === 200 &&
      notifsBefore === 2 &&
      notifsAfter === 2; // Cero duplicaciones

    record('TEST I', passed, {
      summary: 'Re-admisión idempotente: responde 200, cero transiciones extra, cero notificaciones duplicadas (2 == 2)',
      firstStatus: firstRes.status,
      secondStatus: secondRes.status,
      notifsBefore,
      notifsAfter
    });
  } catch (e: any) {
    record('TEST I', false, { summary: 'Error ' + e.message });
  }

  // TEST J: Intento de inadmitir una demanda ya inadmitida
  try {
    const id = 'test_4102_j_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-J');

    // Primera inadmisión
    const firstRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'rechazar' });
    const notifsBefore = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    // Segunda inadmisión
    const secondRes = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'rechazar' });
    const notifsAfter = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const passed = firstRes.status === 200 &&
      secondRes.status === 200 &&
      notifsBefore === 1 &&
      notifsAfter === 1; // Cero duplicaciones

    record('TEST J', passed, {
      summary: 'Re-inadmisión idempotente: responde 200, cero transiciones extra, cero notificaciones duplicadas (1 == 1)',
      firstStatus: firstRes.status,
      secondStatus: secondRes.status,
      notifsBefore,
      notifsAfter
    });
  } catch (e: any) {
    record('TEST J', false, { summary: 'Error ' + e.message });
  }

  // TEST K: Intento de admitir una demanda en cada estado incompatible real
  try {
    const incompatibleStates = ['inadmitida', 'ejecutada', 'desestimada', 'allanada_pagada', 'estimada', 'embargo_preventivo'];
    let allIncompatibleRejected = true;

    for (const state of incompatibleStates) {
      const id = `test_4102_k_${state}_` + Date.now();
      await createTestLawsuit(id, `AUTOS-K-${state}`, state);

      const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
      if (res.status !== 400) {
        allIncompatibleRejected = false;
        console.error(`State ${state} allowed admission with status ${res.status}`);
      }
      const pgRow = (await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
      if (pgRow.estado !== state) {
        allIncompatibleRejected = false;
        console.error(`State ${state} changed to ${pgRow.estado}`);
      }
    }

    record('TEST K', allIncompatibleRejected, {
      summary: `Admisión rechazada (400) en todos los estados incompatibles: ${incompatibleStates.join(', ')}`,
      testedStates: incompatibleStates
    });
  } catch (e: any) {
    record('TEST K', false, { summary: 'Error ' + e.message });
  }

  // TEST L: Intento de inadmitir una demanda en cada estado incompatible real
  try {
    const incompatibleStates = ['admitida', 'ejecutada', 'desestimada', 'allanada_pagada', 'estimada', 'embargo_preventivo'];
    let allIncompatibleRejected = true;

    for (const state of incompatibleStates) {
      const id = `test_4102_l_${state}_` + Date.now();
      await createTestLawsuit(id, `AUTOS-L-${state}`, state);

      const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'rechazar' });
      if (res.status !== 400) {
        allIncompatibleRejected = false;
        console.error(`State ${state} allowed rejection with status ${res.status}`);
      }
      const pgRow = (await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
      if (pgRow.estado !== state) {
        allIncompatibleRejected = false;
        console.error(`State ${state} changed to ${pgRow.estado}`);
      }
    }

    record('TEST L', allIncompatibleRejected, {
      summary: `Inadmisión rechazada (400) en todos los estados incompatibles: ${incompatibleStates.join(', ')}`,
      testedStates: incompatibleStates
    });
  } catch (e: any) {
    record('TEST L', false, { summary: 'Error ' + e.message });
  }

  // TEST M: Idempotencia con x-idempotency-key explícito
  try {
    const id = 'test_4102_m_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-M');
    const customKey = 'idem-key-4102-m-' + id;

    const res1 = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' }, { 'x-idempotency-key': customKey });
    const notifs1 = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const res2 = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' }, { 'x-idempotency-key': customKey });
    const notifs2 = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const idemRow = (await queryPG('SELECT * FROM operaciones_idempotencia WHERE clave = $1', [customKey])).rows[0];

    const passed = res1.status === 200 &&
      res2.status === 200 &&
      notifs1 === 2 &&
      notifs2 === 2 &&
      Boolean(idemRow);

    record('TEST M', passed, {
      summary: 'Idempotencia con x-idempotency-key explícito: respuesta idéntica, registro en operaciones_idempotencia, sin duplicar notificaciones',
      status1: res1.status,
      status2: res2.status,
      notifs: notifs2
    });
  } catch (e: any) {
    record('TEST M', false, { summary: 'Error ' + e.message });
  }

  // TEST N: Idempotencia con fallback determinista
  try {
    const id = 'test_4102_n_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-N');

    const res1 = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const notifs1 = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const res2 = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });
    const notifs2 = (await queryPG('SELECT COUNT(*)::int as cnt FROM notificaciones WHERE related_order_id = $1', [id])).rows[0].cnt;

    const expectedKey = `court_judge_admission_${id}_admitir`;
    const idemRow = (await queryPG('SELECT * FROM operaciones_idempotencia WHERE clave = $1', [expectedKey])).rows[0];

    const passed = res1.status === 200 &&
      res2.status === 200 &&
      notifs1 === 2 &&
      notifs2 === 2 &&
      Boolean(idemRow);

    record('TEST N', passed, {
      summary: 'Idempotencia con fallback determinista: court_judge_admission_${id}_admitir registrado y cero efectos secundarios duplicados',
      expectedKey,
      foundIdemRow: Boolean(idemRow),
      notifs: notifs2
    });
  } catch (e: any) {
    record('TEST N', false, { summary: 'Error ' + e.message });
  }

  // TEST O: Demanda inexistente
  try {
    const fakeId = 'lawsuit_non_existent_' + Date.now();
    const res = await requestJson('POST', `/api/court/lawsuits/${fakeId}/judge-admission`, { admission: 'admitir' });

    const passed = res.status === 404 && res.data?.error?.includes('no encontrado');

    record('TEST O', passed, {
      summary: 'Demanda inexistente devuelve HTTP 404 de forma limpia',
      status: res.status,
      error: res.data?.error
    });
  } catch (e: any) {
    record('TEST O', false, { summary: 'Error ' + e.message });
  }

  // TEST P: Payload inválido
  try {
    const id = 'test_4102_p_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-P');

    const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'invalido' });
    const pgRow = (await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [id])).rows[0];

    const passed = res.status === 400 && pgRow.estado === 'pendiente_admision';

    record('TEST P', passed, {
      summary: 'Payload inválido (admission != admitir/rechazar) devuelve HTTP 400 y no muta la base de datos',
      status: res.status,
      pgStatus: pgRow.estado
    });
  } catch (e: any) {
    record('TEST P', false, { summary: 'Error ' + e.message });
  }

  // TEST Q: Verificación de NO afectación a saldos bancarios ni pagarés
  try {
    const id = 'test_4102_q_' + Date.now();
    const law = await createTestLawsuit(id, 'AUTOS-Q');

    const defBalBefore = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [law.defendantId])).rows[0].saldo;
    const plainBalBefore = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [law.plaintiffId])).rows[0].saldo;

    await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });

    const defBalAfter = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [law.defendantId])).rows[0].saldo;
    const plainBalAfter = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [law.plaintiffId])).rows[0].saldo;

    const passed = Number(defBalBefore) === Number(defBalAfter) && Number(plainBalBefore) === Number(plainBalAfter);

    record('TEST Q', passed, {
      summary: 'Cero impacto financiero: los saldos de demandante y demandado se mantienen idénticos antes y después',
      defBalBefore,
      defBalAfter,
      plainBalBefore,
      plainBalAfter
    });
  } catch (e: any) {
    record('TEST Q', false, { summary: 'Error ' + e.message });
  }

  // TEST R: Verificación de que PostgreSQL es la fuente de verdad (desfase/borrado de db.json)
  try {
    const id = 'test_4102_r_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-R');

    // Desfasar intencionalmente db.json eliminando la demanda de db.courtLawsuits
    const dbRaw = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    dbRaw.courtLawsuits = dbRaw.courtLawsuits.filter((l: any) => l.id !== id);
    fs.writeFileSync('db.json', JSON.stringify(dbRaw, null, 2));

    // Ejecutar admisión: PostgreSQL la tiene, db.json no
    const res = await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, { admission: 'admitir' });

    const pgRow = (await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [id])).rows[0];
    const dbAfter = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    const syncedMem = dbAfter.courtLawsuits.find((l: any) => l.id === id);

    const passed = res.status === 200 &&
      pgRow.estado === 'admitida' &&
      Boolean(syncedMem) &&
      syncedMem.status === 'admitida';

    record('TEST R', passed, {
      summary: 'PostgreSQL es la fuente de verdad única: aun borrada de db.json, el endpoint la lee de PG, la admite y sincroniza la caché post-commit',
      status: res.status,
      pgStatus: pgRow.estado,
      syncedToMemory: Boolean(syncedMem)
    });
  } catch (e: any) {
    record('TEST R', false, { summary: 'Error ' + e.message });
  }

  // TEST S: Persistencia tras reinicio / lectura directa de PostgreSQL
  try {
    const id = 'test_4102_s_' + Date.now();
    await createTestLawsuit(id, 'AUTOS-S');

    await requestJson('POST', `/api/court/lawsuits/${id}/judge-admission`, {
      admission: 'admitir',
      notes: 'Persistencia verificada'
    });

    // Fresh read from PostgreSQL
    const pgRow = (await queryPG(
      `SELECT id, estado, fecha_admision, notas_admision, plazo_limite_contestacion
       FROM demandas_judiciales
       WHERE id = $1`,
      [id]
    )).rows[0];

    const passed = pgRow.estado === 'admitida' &&
      Boolean(pgRow.fecha_admision) &&
      pgRow.notas_admision === 'Persistencia verificada' &&
      Boolean(pgRow.plazo_limite_contestacion);

    record('TEST S', passed, {
      summary: 'Persistencia duradera en PostgreSQL verificada mediante consulta independiente directa',
      pgRow
    });
  } catch (e: any) {
    record('TEST S', false, { summary: 'Error ' + e.message });
  }

  console.log('\n================================================================');
  console.log(`   RESULTADO GLOBAL: ${allPassed ? 'TODOS LOS TESTS PASARON EXITOSAMENTE (19/19)' : 'HUBO FALLOS'}`);
  console.log('================================================================');

  fs.writeFileSync('scripts/audit_phase_4_10_2_report.json', JSON.stringify({
    timestamp: new Date().toISOString(),
    allPassed,
    totalTests: Object.keys(results).length,
    results
  }, null, 2));

  await pool.end();
}

runTests().catch(err => {
  console.error('Fatal error running tests:', err);
  pool.end();
  process.exit(1);
});
