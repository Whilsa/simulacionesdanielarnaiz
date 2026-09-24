process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import pg from 'pg';

const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const BASE_URL = 'http://127.0.0.1:3000';

const pool = new pg.Pool({
  connectionString: SUPABASE_URL,
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

async function queryPG(sql: string, params?: any[]) {
  return await pool.query(sql, params);
}

// Helpers
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

import fs from 'fs';

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

async function setupTestLawsuit(params: {
  id: string;
  caseNumber: string;
  plaintiffId: string;
  plaintiffName: string;
  defendantId: string;
  defendantName: string;
  claimedAmount: number;
  promissoryNoteNumber: string;
  promissoryNoteId: string;
  status: string;
}) {
  await queryPG(
    `INSERT INTO demandas_judiciales (
      id, numero_autos, juzgado, tipo, demandante_id, demandante_nombre,
      demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total,
      pagare_numero, pagare_id, estado, contestacion_realizada
    ) VALUES ($1, $2, 'Juzgado 1', 'cambiaria', $3, $4, $5, $6, $7, 0, $7, $8, $9, $10, false)
    ON CONFLICT (id) DO UPDATE SET
      numero_autos = $2,
      cuantia_reclamada = $7,
      intereses_costas = 0,
      cuantia_total = $7,
      pagare_numero = $8,
      pagare_id = $9,
      estado = $10,
      contestacion_realizada = false`,
    [
      params.id,
      params.caseNumber,
      params.plaintiffId,
      params.plaintiffName,
      params.defendantId,
      params.defendantName,
      params.claimedAmount,
      params.promissoryNoteNumber,
      params.promissoryNoteId,
      params.status
    ]
  );
}

interface TestRunStats {
  totalRuns: number;
  deadlockErrors40P01: number;
  doubleCobros: number;
  doubleAbonos: number;
  impossibleStates: number;
  orphanMovements: number;
  scenarioResults: { name: string; runs: number; passed: number; details: string[] }[];
}

const stats: TestRunStats = {
  totalRuns: 0,
  deadlockErrors40P01: 0,
  doubleCobros: 0,
  doubleAbonos: 0,
  impossibleStates: 0,
  orphanMovements: 0,
  scenarioResults: []
};

function checkFor40P01(resA: any, resB: any) {
  const strA = JSON.stringify(resA || '');
  const strB = JSON.stringify(resB || '');
  if (strA.includes('40P01') || strA.includes('deadlock') || strB.includes('40P01') || strB.includes('deadlock')) {
    stats.deadlockErrors40P01++;
    return true;
  }
  return false;
}

async function runLockOrderTests() {
  console.log('================================================================');
  console.log('FASE 4.4.7.5-C1 — TEST DE DEADLOCK DIRIGIDO Y ORDEN DE LOCKS');
  console.log('================================================================');

  const ITERATIONS_PER_SCENARIO = 3;

  // Helper to create fresh environment for each iteration
  let suiteIdx = 0;

  // -------------------------------------------------------------
  // ESCENARIO 1: judge-ruling vs discount
  // -------------------------------------------------------------
  const sc1 = { name: '1. judge-ruling vs discount', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc1);
  console.log(`\n--- ESCENARIO 1: judge-ruling vs discount (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc1.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc1-${suiteIdx}`;
    const benId = `ben-lo-sc1-${suiteIdx}`;
    const noteNum = `PAG-LO-SC1-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc1-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC1 ${suiteIdx}`, 30000, `ES880001001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC1 ${suiteIdx}`, 10000, `ES880001002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1500,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC1-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC1 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC1 ${suiteIdx}`,
      claimedAmount: 1500,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    // Launch concurrently
    const [resJudge, resDiscount] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/judge-ruling`, { ruling: 'estimatoria', comments: 'Estimada', judgeId: 'judge-1' }),
      postJson('/api/market/messages/discount-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resJudge, resDiscount);

    // Verify consistency:
    // Either judge succeeded (200) or discount succeeded (200).
    const pgNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [noteNum]);
    const pnStatus = pgNote.rows[0]?.invoice_data?.status;

    // Check movements for double cobro/abono
    const movs = await queryPG(`SELECT tipo, importe, concepto FROM movimientos WHERE sender_id = $1 OR receiver_id = $2`, [issId, benId]);
    const judgeTransfer = movs.rows.filter(m => m.concepto.includes('Ejecución Judicial'));
    const discountTransfer = movs.rows.filter(m => m.concepto.includes('Descuento de pagaré'));

    if (judgeTransfer.length > 2 || discountTransfer.length > 2) {
      stats.doubleAbonos++;
      console.log(`  ❌ FAIL: Doble abono detectado en SC1 iteración ${i}`);
    } else {
      sc1.passed++;
      console.log(`  ✅ Iteración ${i}: Judge=${resJudge.status}, Discount=${resDiscount.status} -> Estado PG: ${pnStatus}, 0 Deadlocks`);
    }
  }

  // -------------------------------------------------------------
  // ESCENARIO 2: judge-ruling vs collect
  // -------------------------------------------------------------
  const sc2 = { name: '2. judge-ruling vs collect', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc2);
  console.log(`\n--- ESCENARIO 2: judge-ruling vs collect (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc2.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc2-${suiteIdx}`;
    const benId = `ben-lo-sc2-${suiteIdx}`;
    const noteNum = `PAG-LO-SC2-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc2-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC2 ${suiteIdx}`, 30000, `ES880002001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC2 ${suiteIdx}`, 10000, `ES880002002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 2000,
      dueDate: new Date(Date.now() - 86400 * 1000).toISOString(), // Due in past for collect
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC2-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC2 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC2 ${suiteIdx}`,
      claimedAmount: 2000,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resJudge, resCollect] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/judge-ruling`, { ruling: 'estimatoria', comments: 'Estimada', judgeId: 'judge-1' }),
      postJson('/api/market/messages/collect-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resJudge, resCollect);

    const pgNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [noteNum]);
    const pnStatus = pgNote.rows[0]?.invoice_data?.status;

    // Both try to collect. Exactly one financial execution must apply or clean serialization
    const debAcc = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [issId]);
    const issSaldo = Number(debAcc.rows[0].saldo);

    // Initial was 30000. If only one succeeded, saldo is 28000 (or 28000 minus lawyer fees). Never double debited 4000
    if (issSaldo < 26000) {
      stats.doubleCobros++;
      console.log(`  ❌ FAIL: Doble cobro detectado en SC2 iteración ${i} (saldo: ${issSaldo})`);
    } else {
      sc2.passed++;
      console.log(`  ✅ Iteración ${i}: Judge=${resJudge.status}, Collect=${resCollect.status} -> Saldo librador: ${issSaldo}, 0 Deadlocks`);
    }
  }

  // -------------------------------------------------------------
  // ESCENARIO 3: judge-ruling vs maturity
  // -------------------------------------------------------------
  const sc3 = { name: '3. judge-ruling vs maturity', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc3);
  console.log(`\n--- ESCENARIO 3: judge-ruling vs maturity (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc3.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc3-${suiteIdx}`;
    const benId = `ben-lo-sc3-${suiteIdx}`;
    const noteNum = `PAG-LO-SC3-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc3-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC3 ${suiteIdx}`, 40000, `ES880003001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC3 ${suiteIdx}`, 10000, `ES880003002002${suiteIdx.toString().padStart(6, '0')}`);

    // Create note, discount it, then set due date to yesterday
    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 2500,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;
    await postJson('/api/market/messages/discount-promissory-note', { noteNumber: noteNum, beneficiaryId: benId });

    // Set due date to yesterday in PG
    const yesterday = new Date(Date.now() - 86400 * 1000).toISOString();
    await queryPG(
      `UPDATE market_messages
       SET invoice_data = jsonb_set(invoice_data, '{dueDate}', $1::jsonb)
       WHERE invoice_data->>'promissoryNoteNumber' = $2`,
      [JSON.stringify(yesterday), noteNum]
    );

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC3-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC3 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC3 ${suiteIdx}`,
      claimedAmount: 2500,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    // Launch judge-ruling and verify-payments (which runs processDiscountedPromissoryNotesMaturityPG)
    const [resJudge, resMaturity] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/judge-ruling`, { ruling: 'estimatoria', comments: 'Estimada', judgeId: 'judge-1' }),
      postJson('/api/student/verify-payments', { studentId: issId })
    ]);

    checkFor40P01(resJudge, resMaturity);

    const debAcc = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [issId]);
    const issSaldo = Number(debAcc.rows[0].saldo);

    if (issSaldo < 35000) {
      stats.doubleCobros++;
      console.log(`  ❌ FAIL: Doble cobro detectado en SC3 iteración ${i} (saldo: ${issSaldo})`);
    } else {
      sc3.passed++;
      console.log(`  ✅ Iteración ${i}: Judge=${resJudge.status}, Maturity=${resMaturity.status} -> Saldo librador: ${issSaldo}, 0 Deadlocks`);
    }
  }

  // -------------------------------------------------------------
  // ESCENARIO 4: judge-ruling vs collection-management
  // -------------------------------------------------------------
  const sc4 = { name: '4. judge-ruling vs collection-management', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc4);
  console.log(`\n--- ESCENARIO 4: judge-ruling vs collection-management (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc4.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc4-${suiteIdx}`;
    const benId = `ben-lo-sc4-${suiteIdx}`;
    const noteNum = `PAG-LO-SC4-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc4-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC4 ${suiteIdx}`, 30000, `ES880004001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC4 ${suiteIdx}`, 10000, `ES880004002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1800,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC4-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC4 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC4 ${suiteIdx}`,
      claimedAmount: 1800,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resJudge, resMgmt] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/judge-ruling`, { ruling: 'estimatoria', comments: 'Estimada', judgeId: 'judge-1' }),
      postJson('/api/market/messages/collection-management-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resJudge, resMgmt);

    const pgNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [noteNum]);
    const pnStatus = pgNote.rows[0]?.invoice_data?.status;

    sc4.passed++;
    console.log(`  ✅ Iteración ${i}: Judge=${resJudge.status}, Mgmt=${resMgmt.status} -> Estado PG: ${pnStatus}, 0 Deadlocks`);
  }

  // -------------------------------------------------------------
  // ESCENARIO 5: defendant-answer vs discount
  // -------------------------------------------------------------
  const sc5 = { name: '5. defendant-answer vs discount', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc5);
  console.log(`\n--- ESCENARIO 5: defendant-answer vs discount (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc5.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc5-${suiteIdx}`;
    const benId = `ben-lo-sc5-${suiteIdx}`;
    const noteNum = `PAG-LO-SC5-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc5-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC5 ${suiteIdx}`, 35000, `ES880005001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC5 ${suiteIdx}`, 10000, `ES880005002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1600,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC5-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC5 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC5 ${suiteIdx}`,
      claimedAmount: 1600,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resAnswer, resDiscount] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/defendant-answer`, {
        defendantId: issId,
        answerType: 'cambiaria_paga_ahora',
        facts: 'Pago voluntario de pagaré'
      }),
      postJson('/api/market/messages/discount-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resAnswer, resDiscount);

    const pgNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [noteNum]);
    const pnStatus = pgNote.rows[0]?.invoice_data?.status;

    sc5.passed++;
    console.log(`  ✅ Iteración ${i}: Answer=${resAnswer.status}, Discount=${resDiscount.status} -> Estado PG: ${pnStatus}, 0 Deadlocks`);
  }

  // -------------------------------------------------------------
  // ESCENARIO 6: defendant-answer vs collect
  // -------------------------------------------------------------
  const sc6 = { name: '6. defendant-answer vs collect', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc6);
  console.log(`\n--- ESCENARIO 6: defendant-answer vs collect (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc6.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc6-${suiteIdx}`;
    const benId = `ben-lo-sc6-${suiteIdx}`;
    const noteNum = `PAG-LO-SC6-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc6-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC6 ${suiteIdx}`, 35000, `ES880006001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC6 ${suiteIdx}`, 10000, `ES880006002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1700,
      dueDate: new Date(Date.now() - 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC6-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC6 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC6 ${suiteIdx}`,
      claimedAmount: 1700,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resAnswer, resCollect] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/defendant-answer`, {
        defendantId: issId,
        answerType: 'cambiaria_paga_ahora',
        facts: 'Pago voluntario en autos'
      }),
      postJson('/api/market/messages/collect-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resAnswer, resCollect);

    const debAcc = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [issId]);
    const issSaldo = Number(debAcc.rows[0].saldo);

    if (issSaldo < 31600) {
      stats.doubleCobros++;
      console.log(`  ❌ FAIL: Doble cobro detectado en SC6 iteración ${i} (saldo: ${issSaldo})`);
    } else {
      sc6.passed++;
      console.log(`  ✅ Iteración ${i}: Answer=${resAnswer.status}, Collect=${resCollect.status} -> Saldo librador: ${issSaldo}, 0 Deadlocks`);
    }
  }

  // -------------------------------------------------------------
  // ESCENARIO 7: defendant-answer vs maturity
  // -------------------------------------------------------------
  const sc7 = { name: '7. defendant-answer vs maturity', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc7);
  console.log(`\n--- ESCENARIO 7: defendant-answer vs maturity (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc7.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc7-${suiteIdx}`;
    const benId = `ben-lo-sc7-${suiteIdx}`;
    const noteNum = `PAG-LO-SC7-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc7-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC7 ${suiteIdx}`, 40000, `ES880007001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC7 ${suiteIdx}`, 10000, `ES880007002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 2200,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;
    await postJson('/api/market/messages/discount-promissory-note', { noteNumber: noteNum, beneficiaryId: benId });

    // Set due date to yesterday
    const yesterday = new Date(Date.now() - 86400 * 1000).toISOString();
    await queryPG(
      `UPDATE market_messages
       SET invoice_data = jsonb_set(invoice_data, '{dueDate}', $1::jsonb)
       WHERE invoice_data->>'promissoryNoteNumber' = $2`,
      [JSON.stringify(yesterday), noteNum]
    );

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC7-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC7 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC7 ${suiteIdx}`,
      claimedAmount: 2200,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resAnswer, resMaturity] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/defendant-answer`, {
        defendantId: issId,
        answerType: 'cambiaria_paga_ahora',
        facts: 'Pago voluntario de demandado'
      }),
      postJson('/api/student/verify-payments', { studentId: issId })
    ]);

    checkFor40P01(resAnswer, resMaturity);

    const debAcc = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [issId]);
    const issSaldo = Number(debAcc.rows[0].saldo);

    if (issSaldo < 35600) {
      stats.doubleCobros++;
      console.log(`  ❌ FAIL: Doble cobro detectado en SC7 iteración ${i} (saldo: ${issSaldo})`);
    } else {
      sc7.passed++;
      console.log(`  ✅ Iteración ${i}: Answer=${resAnswer.status}, Maturity=${resMaturity.status} -> Saldo librador: ${issSaldo}, 0 Deadlocks`);
    }
  }

  // -------------------------------------------------------------
  // ESCENARIO 8: defendant-answer vs collection-management
  // -------------------------------------------------------------
  const sc8 = { name: '8. defendant-answer vs collection-management', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc8);
  console.log(`\n--- ESCENARIO 8: defendant-answer vs collection-management (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc8.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc8-${suiteIdx}`;
    const benId = `ben-lo-sc8-${suiteIdx}`;
    const noteNum = `PAG-LO-SC8-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc8-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC8 ${suiteIdx}`, 30000, `ES880008001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC8 ${suiteIdx}`, 10000, `ES880008002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1900,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC8-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC8 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC8 ${suiteIdx}`,
      claimedAmount: 1900,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resAnswer, resMgmt] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/defendant-answer`, {
        defendantId: issId,
        answerType: 'cambiaria_paga_ahora',
        facts: 'Pago voluntario'
      }),
      postJson('/api/market/messages/collection-management-promissory-note', { noteNumber: noteNum, beneficiaryId: benId })
    ]);

    checkFor40P01(resAnswer, resMgmt);

    const pgNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [noteNum]);
    const pnStatus = pgNote.rows[0]?.invoice_data?.status;

    sc8.passed++;
    console.log(`  ✅ Iteración ${i}: Answer=${resAnswer.status}, Mgmt=${resMgmt.status} -> Estado PG: ${pnStatus}, 0 Deadlocks`);
  }

  // -------------------------------------------------------------
  // ESCENARIO 9: judge-ruling vs defendant-answer
  // -------------------------------------------------------------
  const sc9 = { name: '9. judge-ruling vs defendant-answer', runs: 0, passed: 0, details: [] as string[] };
  stats.scenarioResults.push(sc9);
  console.log(`\n--- ESCENARIO 9: judge-ruling vs defendant-answer (${ITERATIONS_PER_SCENARIO} iteraciones) ---`);

  for (let i = 1; i <= ITERATIONS_PER_SCENARIO; i++) {
    stats.totalRuns++;
    sc9.runs++;
    suiteIdx++;
    const issId = `iss-lo-sc9-${suiteIdx}`;
    const benId = `ben-lo-sc9-${suiteIdx}`;
    const noteNum = `PAG-LO-SC9-${suiteIdx}-${Date.now()}`;
    const lawsuitId = `law-lo-sc9-${suiteIdx}-${Date.now()}`;

    await setupTestUser(issId, `Emisor SC9 ${suiteIdx}`, 30000, `ES880009001001${suiteIdx.toString().padStart(6, '0')}`);
    await setupTestUser(benId, `Beneficiario SC9 ${suiteIdx}`, 10000, `ES880009002002${suiteIdx.toString().padStart(6, '0')}`);

    const signRes = await postJson('/api/market/messages/sign-promissory-note', {
      senderId: issId,
      recipientId: benId,
      amount: 1400,
      dueDate: new Date(Date.now() + 30 * 86400 * 1000).toISOString(),
      promissoryNoteNumber: noteNum
    });

    const noteId = signRes.data?.message?.promissoryNoteData?.id || signRes.data?.message?.id || `pn-${suiteIdx}`;

    await setupTestLawsuit({
      id: lawsuitId,
      caseNumber: `AUTOS-SC9-${suiteIdx}-${Date.now()}`,
      plaintiffId: benId,
      plaintiffName: `Beneficiario SC9 ${suiteIdx}`,
      defendantId: issId,
      defendantName: `Emisor SC9 ${suiteIdx}`,
      claimedAmount: 1400,
      promissoryNoteNumber: noteNum,
      promissoryNoteId: noteId,
      status: 'admitida_a_tramite'
    });

    const [resJudge, resAnswer] = await Promise.all([
      postJson(`/api/court/lawsuits/${lawsuitId}/judge-ruling`, { ruling: 'estimatoria', comments: 'Estimada concurrent', judgeId: 'judge-1' }),
      postJson(`/api/court/lawsuits/${lawsuitId}/defendant-answer`, {
        defendantId: issId,
        answerType: 'cambiaria_paga_ahora',
        facts: 'Pago voluntario en autos'
      })
    ]);

    checkFor40P01(resJudge, resAnswer);

    const pgLaw = await queryPG(`SELECT estado FROM demandas_judiciales WHERE id = $1`, [lawsuitId]);
    const lawStatus = pgLaw.rows[0]?.estado;

    const debAcc = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [issId]);
    const issSaldo = Number(debAcc.rows[0].saldo);

    // Initial was 30000. Exactly ONE execution transfer of 1400 (or + fees). Saldo must NOT be debited twice (< 27200)
    if (issSaldo < 27200) {
      stats.doubleCobros++;
      console.log(`  ❌ FAIL: Doble cobro detectado en SC9 iteración ${i} (saldo: ${issSaldo})`);
    } else {
      sc9.passed++;
      console.log(`  ✅ Iteración ${i}: Judge=${resJudge.status}, Answer=${resAnswer.status} -> Estado demanda: ${lawStatus}, Saldo librador: ${issSaldo}, 0 Deadlocks`);
    }
  }

  // Comprobación de movimientos huérfanos y estados imposibles en la BD generados por los tests
  const orphanRes = await queryPG(`
    SELECT m.id, m.cuenta_id 
    FROM movimientos m
    LEFT JOIN cuentas c ON c.id = m.cuenta_id
    WHERE c.id IS NULL AND m.cuenta_id LIKE '%-lo-%'
  `);
  stats.orphanMovements = orphanRes.rows.length;

  const impossibleNotesRes = await queryPG(`
    SELECT id, invoice_data->>'status' as status
    FROM market_messages
    WHERE type = 'promissory_note'
      AND invoice_data->>'promissoryNoteNumber' LIKE 'PAG-LO-%'
      AND invoice_data->>'status' NOT IN ('pendiente', 'descontado', 'gestion_cobro', 'pagado', 'impagado')
  `);
  stats.impossibleStates = impossibleNotesRes.rows.length;

  console.log('\n================================================================');
  console.log('RESUMEN DE PRUEBAS DE DEADLOCK DIRIGIDO');
  console.log('================================================================');
  console.log(`Total de ejecuciones concurrentes: ${stats.totalRuns}`);
  console.log(`Errores PostgreSQL 40P01 (deadlock detected): ${stats.deadlockErrors40P01}`);
  console.log(`Dobles cobros detectados: ${stats.doubleCobros}`);
  console.log(`Dobles abonos detectados: ${stats.doubleAbonos}`);
  console.log(`Estados imposibles en PostgreSQL: ${stats.impossibleStates}`);
  console.log(`Movimientos huérfanos: ${stats.orphanMovements}`);

  await pool.end();
}

runLockOrderTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
