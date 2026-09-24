import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DB_URL = "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const BASE_URL = "http://localhost:3000";
const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

const DB_FILE = path.join(process.cwd(), 'db.json');
function readLocalDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}
function writeLocalDb(db: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

async function queryPG(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function postJudgeRuling(id: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/court/lawsuits/${id}/judge-ruling`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postCollect(body: any, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/market/messages/collect-promissory-note`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postDiscount(body: any, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/market/messages/discount-promissory-note`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postTransfer(body: any, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/transfers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function triggerMaturityProcess(studentId: string = 'test-worker-trigger') {
  const res = await fetch(`${BASE_URL}/api/student/verify-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function setupAccount(id: string, name: string, balance: number, accountNumber: string) {
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, '1234', $5, 'student', 1)
     ON CONFLICT (id) DO UPDATE
     SET saldo = $3, alumno = $2, account_number = $5`,
    [id, name, balance, id, accountNumber]
  );
  const db = readLocalDb();
  if (!db.users) db.users = [];
  let user = db.users.find((u: any) => u.id === id);
  if (!user) {
    user = { id, name, username: id, balance, accountNumber, role: 'student' };
    db.users.push(user);
  } else {
    user.balance = balance;
    user.accountNumber = accountNumber;
    user.name = name;
  }
  writeLocalDb(db);
}

async function setupLawsuit(lawsuit: any) {
  lawsuit.type = lawsuit.type || 'juicio_cambiario';
  // Sync to PG
  await queryPG(
    `INSERT INTO demandas_judiciales (
      id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre,
      demandante_nif, demandante_iban, demandado_id, demandado_nombre, demandado_nif,
      demandado_iban, cuantia_reclamada, intereses_costas, cuantia_total, descripcion_bienes,
      hechos, fundamentos_derecho, petitum, resumen_prueba, archivos_adjuntos, pedido_relacionado_id,
      pagare_numero, pagare_id, pagare_vencimiento, pagare_datos, estado, fecha_creacion,
      fecha_actualizacion, fecha_admision, notas_admision, fecha_resolucion, notas_resolucion,
      comentarios_juez, transferencia_ejecucion_id, minuta_abogado, minuta_iva, minuta_total,
      minuta_factura_num, embargo_fecha, embargo_importe, embargo_transfer_id, embargo_notas,
      contestacion_realizada, contestacion_fecha, contestacion_tipo, contestacion_hechos,
      plazo_limite_contestacion, minuta_demandado_base, minuta_demandado_iva,
      minuta_demandado_total, minuta_demandado_factura_num
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34, $35, $36, $37, $38,
      $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50, $51, $52, $53
    )
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      cuantia_reclamada = EXCLUDED.cuantia_reclamada,
      intereses_costas = EXCLUDED.intereses_costas,
      cuantia_total = EXCLUDED.cuantia_total,
      embargo_transfer_id = EXCLUDED.embargo_transfer_id,
      embargo_importe = EXCLUDED.embargo_importe,
      pagare_numero = EXCLUDED.pagare_numero,
      pagare_id = EXCLUDED.pagare_id,
      fecha_actualizacion = EXCLUDED.fecha_actualizacion`,
    [
      lawsuit.id,
      lawsuit.caseNumber,
      lawsuit.courtName || 'Juzgado de 1ª Instancia Nº 1',
      lawsuit.type || 'juicio_cambiario',
      lawsuit.subtype || null,
      lawsuit.plaintiffId,
      lawsuit.plaintiffName,
      lawsuit.plaintiffNif || null,
      lawsuit.plaintiffIban || null,
      lawsuit.defendantId,
      lawsuit.defendantName,
      lawsuit.defendantNif || null,
      lawsuit.defendantIban || null,
      lawsuit.claimedAmount,
      lawsuit.interestAndCostsAmount || 0,
      lawsuit.totalClaimAmount || lawsuit.claimedAmount,
      lawsuit.goodsDescription || '',
      lawsuit.facts || '',
      lawsuit.legalBasis || '',
      lawsuit.petitum || '',
      lawsuit.evidenceSummary || '',
      JSON.stringify(lawsuit.attachments || []),
      lawsuit.relatedOrderId || null,
      lawsuit.promissoryNoteNumber || null,
      lawsuit.promissoryNoteId || null,
      lawsuit.promissoryNoteDueDate ? new Date(lawsuit.promissoryNoteDueDate) : null,
      lawsuit.promissoryNoteData ? JSON.stringify(lawsuit.promissoryNoteData) : null,
      lawsuit.status || 'admitida_a_tramite',
      new Date(),
      new Date(),
      new Date(),
      lawsuit.admissionNotes || null,
      lawsuit.resolutionDate ? new Date(lawsuit.resolutionDate) : null,
      lawsuit.resolutionNotes || null,
      lawsuit.judgeComments || null,
      lawsuit.executionTransferId || null,
      lawsuit.lawyerFeeAmount || null,
      lawsuit.lawyerFeeIva || null,
      lawsuit.lawyerFeeTotal || null,
      lawsuit.lawyerFeeInvoiceNumber || null,
      lawsuit.embargoDate ? new Date(lawsuit.embargoDate) : null,
      lawsuit.embargoAmount || null,
      lawsuit.embargoTransferId || null,
      lawsuit.embargoNotes || null,
      lawsuit.defendantAnswered || false,
      lawsuit.defendantAnswerDate ? new Date(lawsuit.defendantAnswerDate) : null,
      lawsuit.defendantAnswerType || null,
      lawsuit.defendantAnswerFacts || null,
      lawsuit.defendantDeadlineDate ? new Date(lawsuit.defendantDeadlineDate) : null,
      lawsuit.defendantLawyerFeeAmount || null,
      lawsuit.defendantLawyerFeeIva || null,
      lawsuit.defendantLawyerFeeTotal || null,
      lawsuit.defendantLawyerFeeInvoiceNumber || null
    ]
  );

  const db = readLocalDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];
  const idx = db.courtLawsuits.findIndex((l: any) => l.id === lawsuit.id);
  if (idx >= 0) db.courtLawsuits[idx] = lawsuit;
  else db.courtLawsuits.push(lawsuit);
  writeLocalDb(db);
}

async function setupPromissoryNote(msg: any) {
  await queryPG(
    `INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (id) DO UPDATE SET
       invoice_data = EXCLUDED.invoice_data`,
    [
      msg.id,
      msg.chatId || 'chat-test',
      msg.senderId,
      msg.senderName,
      msg.recipientId,
      msg.recipientName,
      msg.content || 'Pagaré',
      new Date().toISOString(),
      false,
      'promissory_note',
      JSON.stringify(msg.invoice_data)
    ]
  );
  const db = readLocalDb();
  if (!db.marketMessages) db.marketMessages = [];
  const idx = db.marketMessages.findIndex((m: any) => m.id === msg.id);
  const localMsg = {
    ...msg,
    promissoryNoteData: msg.invoice_data
  };
  if (idx >= 0) db.marketMessages[idx] = localMsg;
  else db.marketMessages.push(localMsg);
  writeLocalDb(db);
}

async function runTests() {
  console.log('================================================================');
  console.log('FASE 4.4.7.2: SUITE DE VERIFICACIÓN TRANSACCIONAL JUDGE-RULING');
  console.log('================================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // Common test users
  const defId = 'student-test-def-ruling';
  const defName = 'Empresa Demandada SL';
  const defAcc = 'ES990001002222222201';

  const plainId = 'student-test-plain-ruling';
  const plainName = 'Empresa Demandante SA';
  const plainAcc = 'ES990001002222222202';

  // -------------------------------------------------------------
  // TEST 1: Estimatoria sin embargo
  // -------------------------------------------------------------
  console.log('\n--- TEST 1: Estimatoria sin embargo ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const noteId1 = 'msg-note-test-1';
  const noteNum1 = 'PAG-RULING-001';
  await setupPromissoryNote({
    id: noteId1,
    senderId: defId,
    senderName: defName,
    recipientId: plainId,
    recipientName: plainName,
    invoice_data: {
      id: noteId1,
      promissoryNoteNumber: noteNum1,
      amount: 3000,
      issuerId: defId,
      issuerName: defName,
      recipientId: plainId,
      recipientName: plainName,
      status: 'emitido',
      issueDate: '2026-08-01',
      dueDate: '2026-09-01'
    }
  });

  const lawsuitId1 = 'lawsuit-test-1';
  await setupLawsuit({
    id: lawsuitId1,
    caseNumber: 'CAMB-101/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 3000,
    interestAndCostsAmount: 900,
    totalClaimAmount: 3900,
    promissoryNoteId: noteId1,
    promissoryNoteNumber: noteNum1,
    status: 'admitida_a_tramite'
  });

  const res1 = await postJudgeRuling(lawsuitId1, { ruling: 'estimatoria', comments: 'Sentencia estimatoria firme' });
  assert(res1.status === 200, `Respuesta 200 recibida (${res1.status})`);
  assert(res1.data?.lawsuit?.status === 'ejecutada', `Estado de demanda en respuesta es ejecutada (${res1.data?.lawsuit?.status})`);

  // Verify DB
  const pgDef1 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain1 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgDef1.rows[0].saldo) === 6100, `Saldo demandado debitado 3900: esperado 6100, obtenido ${pgDef1.rows[0].saldo}`);
  assert(Number(pgPlain1.rows[0].saldo) === 8900, `Saldo demandante abonado 3900: esperado 8900, obtenido ${pgPlain1.rows[0].saldo}`);

  const pgLawsuit1 = await queryPG('SELECT estado, transferencia_ejecucion_id FROM demandas_judiciales WHERE id = $1', [lawsuitId1]);
  assert(pgLawsuit1.rows[0].estado === 'ejecutada', `Estado en PG es ejecutada (${pgLawsuit1.rows[0].estado})`);
  assert(Boolean(pgLawsuit1.rows[0].transferencia_ejecucion_id), `Transferencia de ejecución registrada (${pgLawsuit1.rows[0].transferencia_ejecucion_id})`);

  const pgNote1 = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [noteId1]);
  const pnData1 = typeof pgNote1.rows[0].invoice_data === 'string' ? JSON.parse(pgNote1.rows[0].invoice_data) : pgNote1.rows[0].invoice_data;
  assert(pnData1.status === 'pagado', `Pagaré vinculado marcado como pagado en PG (${pnData1.status})`);
  assert(Boolean(pnData1.paidTransferId), `Pagaré contiene paidTransferId (${pnData1.paidTransferId})`);

  const txOut1 = await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1 AND tipo = \'TRANSFER_OUT\' ORDER BY fecha DESC LIMIT 1', [defId]);
  assert(Number(txOut1.rows[0].importe) === 3900, `Movimiento out registrado para demandado (${txOut1.rows[0].importe})`);

  // -------------------------------------------------------------
  // TEST 2: Estimatoria con embargo
  // -------------------------------------------------------------
  console.log('\n--- TEST 2: Estimatoria con embargo ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId2 = 'lawsuit-test-2';
  await setupLawsuit({
    id: lawsuitId2,
    caseNumber: 'CAMB-102/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 3000,
    interestAndCostsAmount: 900,
    totalClaimAmount: 3900,
    embargoAmount: 3900,
    embargoTransferId: 'tx-embargo-previo-2',
    status: 'admitida_a_tramite'
  });

  const res2 = await postJudgeRuling(lawsuitId2, { ruling: 'estimatoria', comments: 'Sentencia con fondos embargados' });
  assert(res2.status === 200, `Respuesta 200 recibida (${res2.status})`);

  const pgDef2 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain2 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgDef2.rows[0].saldo) === 10000, `Saldo demandado NO debitado nuevamente con embargo previo: esperado 10000, obtenido ${pgDef2.rows[0].saldo}`);
  assert(Number(pgPlain2.rows[0].saldo) === 8900, `Saldo demandante abonado 3900 desde depósito judicial: esperado 8900, obtenido ${pgPlain2.rows[0].saldo}`);

  const txIn2 = await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1 AND tipo = \'TRANSFER_IN\' ORDER BY fecha DESC LIMIT 1', [plainId]);
  assert(txIn2.rows[0].sender_id === 'corp-deposito-judicial', `Emisor del movimiento es depósito judicial (${txIn2.rows[0].sender_id})`);

  // -------------------------------------------------------------
  // TEST 3: Desestimatoria sin embargo
  // -------------------------------------------------------------
  console.log('\n--- TEST 3: Desestimatoria sin embargo ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId3 = 'lawsuit-test-3';
  await setupLawsuit({
    id: lawsuitId3,
    caseNumber: 'CAMB-103/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 2000,
    status: 'contestada'
  });

  // Costas: 2000 * 0.15 = 300; IVA: 300 * 0.21 = 63; Total: 363.00
  const res3 = await postJudgeRuling(lawsuitId3, { ruling: 'desestimatoria', comments: 'Desestimación íntegra' });
  assert(res3.status === 200, `Respuesta 200 recibida (${res3.status})`);
  assert(res3.data?.lawsuit?.status === 'desestimada', `Estado de demanda es desestimada (${res3.data?.lawsuit?.status})`);

  const pgDef3 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain3 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgPlain3.rows[0].saldo) === 4637, `Demandante debitado 363 de costas: esperado 4637, obtenido ${pgPlain3.rows[0].saldo}`);
  assert(Number(pgDef3.rows[0].saldo) === 10363, `Demandado abonado 363 de costas: esperado 10363, obtenido ${pgDef3.rows[0].saldo}`);

  const pgLawsuit3 = await queryPG('SELECT estado, minuta_demandado_total FROM demandas_judiciales WHERE id = $1', [lawsuitId3]);
  assert(pgLawsuit3.rows[0].estado === 'desestimada', `Estado en PG es desestimada (${pgLawsuit3.rows[0].estado})`);

  // -------------------------------------------------------------
  // TEST 4: Desestimatoria con embargo
  // -------------------------------------------------------------
  console.log('\n--- TEST 4: Desestimatoria con embargo ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId4 = 'lawsuit-test-4';
  await setupLawsuit({
    id: lawsuitId4,
    caseNumber: 'CAMB-104/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 2000,
    embargoAmount: 2600,
    embargoTransferId: 'tx-embargo-previo-4',
    status: 'contestada'
  });

  const res4 = await postJudgeRuling(lawsuitId4, { ruling: 'desestimatoria', comments: 'Desestimación con devolución embargo' });
  assert(res4.status === 200, `Respuesta 200 recibida (${res4.status})`);

  const pgDef4 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain4 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  // Plain: 5000 - 363 = 4637
  // Def: 10000 + 363 (costas) + 2600 (devolución embargo) = 12963
  assert(Number(pgPlain4.rows[0].saldo) === 4637, `Demandante debitado 363 costas: esperado 4637, obtenido ${pgPlain4.rows[0].saldo}`);
  assert(Number(pgDef4.rows[0].saldo) === 12963, `Demandado abonado costas + devolución embargo: esperado 12963, obtenido ${pgDef4.rows[0].saldo}`);

  // -------------------------------------------------------------
  // TEST 5: Dos judge-ruling simultáneos, mismas claves
  // -------------------------------------------------------------
  console.log('\n--- TEST 5: Dos judge-ruling simultáneos, mismas claves ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId5 = 'lawsuit-test-5';
  await setupLawsuit({
    id: lawsuitId5,
    caseNumber: 'CAMB-105/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 1000,
    totalClaimAmount: 1300,
    status: 'admitida_a_tramite'
  });

  const runSuffix = Date.now().toString();
  const sameKey = 'idempotency-key-test-5-' + runSuffix;
  const [p5_1, p5_2] = await Promise.all([
    postJudgeRuling(lawsuitId5, { ruling: 'estimatoria' }, { 'x-idempotency-key': sameKey }),
    postJudgeRuling(lawsuitId5, { ruling: 'estimatoria' }, { 'x-idempotency-key': sameKey })
  ]);

  assert(p5_1.status === 200 && p5_2.status === 200, `Ambas peticiones retornaron 200 (idempotencia)`);
  const pgDef5 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain5 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgDef5.rows[0].saldo) === 8700, `Demandado debitado EXACTAMENTE una vez (10000 - 1300 = 8700): ${pgDef5.rows[0].saldo}`);
  assert(Number(pgPlain5.rows[0].saldo) === 6300, `Demandante abonado EXACTAMENTE una vez (5000 + 1300 = 6300): ${pgPlain5.rows[0].saldo}`);

  // -------------------------------------------------------------
  // TEST 6: Dos judge-ruling simultáneos, claves diferentes
  // -------------------------------------------------------------
  console.log('\n--- TEST 6: Dos judge-ruling simultáneos, claves diferentes ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId6 = 'lawsuit-test-6';
  await setupLawsuit({
    id: lawsuitId6,
    caseNumber: 'CAMB-106/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 1000,
    totalClaimAmount: 1300,
    status: 'admitida_a_tramite'
  });

  const key6A = 'key-6-A-' + runSuffix;
  const key6B = 'key-6-B-' + runSuffix;
  const [p6_1, p6_2] = await Promise.all([
    postJudgeRuling(lawsuitId6, { ruling: 'estimatoria' }, { 'x-idempotency-key': key6A }),
    postJudgeRuling(lawsuitId6, { ruling: 'estimatoria' }, { 'x-idempotency-key': key6B })
  ]);

  const statuses6 = [p6_1.status, p6_2.status].sort();
  assert(statuses6[0] === 200 && statuses6[1] === 400, `Una petición tuvo éxito (200) y la otra fue rechazada con 400 (${statuses6.join(', ')})`);

  const pgDef6 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain6 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgDef6.rows[0].saldo) === 8700, `Demandado debitado una sola vez: ${pgDef6.rows[0].saldo}`);
  assert(Number(pgPlain6.rows[0].saldo) === 6300, `Demandante abonado una sola vez: ${pgPlain6.rows[0].saldo}`);

  // -------------------------------------------------------------
  // TEST 7: Reintento posterior
  // -------------------------------------------------------------
  console.log('\n--- TEST 7: Reintento posterior ---');
  const retryRes = await postJudgeRuling(lawsuitId6, { ruling: 'estimatoria' }, { 'x-idempotency-key': 'new-key-after-completion-' + runSuffix });
  assert(retryRes.status === 400, `Reintento sobre demanda resuelta rechazado con 400 (${retryRes.status})`);
  assert(retryRes.data?.error?.includes('previamente'), `Mensaje descriptivo de rechazo (${retryRes.data?.error})`);

  const pgDef7 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  assert(Number(pgDef7.rows[0].saldo) === 8700, `Saldos inalterados tras reintento (${pgDef7.rows[0].saldo})`);

  // -------------------------------------------------------------
  // TEST 8: judge-ruling vs collect
  // -------------------------------------------------------------
  console.log('\n--- TEST 8: judge-ruling vs collect ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const noteId8 = 'msg-note-test-8';
  const noteNum8 = 'PAG-RULING-008';
  await setupPromissoryNote({
    id: noteId8,
    senderId: defId,
    senderName: defName,
    recipientId: plainId,
    recipientName: plainName,
    invoice_data: {
      id: noteId8,
      promissoryNoteNumber: noteNum8,
      amount: 2000,
      issuerId: defId,
      issuerName: defName,
      recipientId: plainId,
      recipientName: plainName,
      beneficiaryId: plainId,
      beneficiaryName: plainName,
      status: 'emitido',
      issueDate: '2026-08-01',
      dueDate: '2026-09-01'
    }
  });

  const lawsuitId8 = 'lawsuit-test-8';
  await setupLawsuit({
    id: lawsuitId8,
    caseNumber: 'CAMB-108/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 2000,
    totalClaimAmount: 2600,
    promissoryNoteId: noteId8,
    promissoryNoteNumber: noteNum8,
    status: 'admitida_a_tramite'
  });

  // Race between judge-ruling (estimatoria) and collect
  const [r8_ruling, r8_collect] = await Promise.all([
    postJudgeRuling(lawsuitId8, { ruling: 'estimatoria' }),
    postCollect({ messageId: noteId8, studentId: plainId })
  ]);

  console.log(`  Judge-ruling status: ${r8_ruling.status}, Collect status: ${r8_collect.status}`);
  // Either ruling won or collect won. Crucially: no double debit or corrupted note state!
  const pgNote8 = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [noteId8]);
  const pnData8 = typeof pgNote8.rows[0].invoice_data === 'string' ? JSON.parse(pgNote8.rows[0].invoice_data) : pgNote8.rows[0].invoice_data;
  assert(pnData8.status === 'pagado', `Pagaré en estado final pagado (${pnData8.status})`);

  const pgDef8 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  // If ruling won: 10000 - 2600 = 7400. If collect won: 10000 - 2000 = 8000.
  const defBal8 = Number(pgDef8.rows[0].saldo);
  assert(defBal8 === 7400 || defBal8 === 8000, `Saldo demandado consistente (7400 o 8000, nunca doble cargo 5400): obtenido ${defBal8}`);

  // -------------------------------------------------------------
  // TEST 9: judge-ruling vs maturity
  // -------------------------------------------------------------
  console.log('\n--- TEST 9: judge-ruling vs maturity ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const noteId9 = 'msg-note-test-9';
  const noteNum9 = 'PAG-RULING-009';
  await setupPromissoryNote({
    id: noteId9,
    senderId: defId,
    senderName: defName,
    recipientId: plainId,
    recipientName: plainName,
    invoice_data: {
      id: noteId9,
      promissoryNoteNumber: noteNum9,
      amount: 1500,
      issuerId: defId,
      issuerName: defName,
      recipientId: plainId,
      recipientName: plainName,
      status: 'descontado',
      discountDate: '2026-08-10',
      dueDate: '2026-08-20', // already overdue
      maturityProcessed: false
    }
  });

  const lawsuitId9 = 'lawsuit-test-9';
  await setupLawsuit({
    id: lawsuitId9,
    caseNumber: 'CAMB-109/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 1500,
    totalClaimAmount: 1950,
    promissoryNoteId: noteId9,
    promissoryNoteNumber: noteNum9,
    status: 'admitida_a_tramite'
  });

  const [r9_ruling, r9_maturity] = await Promise.all([
    postJudgeRuling(lawsuitId9, { ruling: 'estimatoria' }),
    triggerMaturityProcess()
  ]);

  const pgDef9 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const defBal9 = Number(pgDef9.rows[0].saldo);
  assert(defBal9 === 8050 || defBal9 === 8500, `Saldo demandado consistente sin doble cargo (obtenido ${defBal9})`);

  // -------------------------------------------------------------
  // TEST 10: judge-ruling vs discount
  // -------------------------------------------------------------
  console.log('\n--- TEST 10: judge-ruling vs discount ---');
  await setupAccount(defId, defName, 10000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const noteId10 = 'msg-note-test-10';
  const noteNum10 = 'PAG-RULING-010';
  await setupPromissoryNote({
    id: noteId10,
    senderId: defId,
    senderName: defName,
    recipientId: plainId,
    recipientName: plainName,
    invoice_data: {
      id: noteId10,
      promissoryNoteNumber: noteNum10,
      amount: 2000,
      issuerId: defId,
      issuerName: defName,
      recipientId: plainId,
      recipientName: plainName,
      beneficiaryId: plainId,
      beneficiaryName: plainName,
      status: 'emitido',
      issueDate: '2026-08-01',
      dueDate: '2026-10-01'
    }
  });

  const lawsuitId10 = 'lawsuit-test-10';
  await setupLawsuit({
    id: lawsuitId10,
    caseNumber: 'CAMB-110/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 2000,
    totalClaimAmount: 2600,
    promissoryNoteId: noteId10,
    promissoryNoteNumber: noteNum10,
    status: 'admitida_a_tramite'
  });

  const [r10_ruling, r10_discount] = await Promise.all([
    postJudgeRuling(lawsuitId10, { ruling: 'estimatoria' }),
    postDiscount({ messageId: noteId10, beneficiaryId: plainId })
  ]);

  const pgNote10 = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [noteId10]);
  const pnData10 = typeof pgNote10.rows[0].invoice_data === 'string' ? JSON.parse(pgNote10.rows[0].invoice_data) : pgNote10.rows[0].invoice_data;
  assert(pnData10.status === 'pagado' || pnData10.status === 'descontado', `Estado coherente del pagaré (${pnData10.status})`);

  // -------------------------------------------------------------
  // TEST 11: judge-ruling vs transfer
  // -------------------------------------------------------------
  console.log('\n--- TEST 11: judge-ruling vs transfer ---');
  await setupAccount(defId, defName, 5000, defAcc);
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId11 = 'lawsuit-test-11';
  await setupLawsuit({
    id: lawsuitId11,
    caseNumber: 'CAMB-111/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 4000,
    totalClaimAmount: 4000,
    status: 'admitida_a_tramite'
  });

  // Transfer trying to spend 4000 from defendant while ruling tries to debit 4000 (total needed 8000, but def only has 5000)
  const [r11_ruling, r11_tx] = await Promise.all([
    postJudgeRuling(lawsuitId11, { ruling: 'estimatoria' }),
    postTransfer({
      senderId: defId,
      senderAccount: defAcc,
      receiverId: plainId,
      receiverAccount: plainAcc,
      receiverName: plainName,
      amount: 4000,
      concept: 'Transferencia competidora'
    })
  ]);

  const pgDef11 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const defBal11 = Number(pgDef11.rows[0].saldo);
  assert(defBal11 >= 0, `Saldo del demandado nunca queda en negativo irregular: ${defBal11} €`);
  assert(defBal11 === 1000, `Exactamente una de las dos operaciones de 4000 € se completó (5000 - 4000 = 1000): ${defBal11} €`);

  // -------------------------------------------------------------
  // TEST 12: Rollback forzado
  // -------------------------------------------------------------
  console.log('\n--- TEST 12: Rollback forzado por saldo insuficiente ---');
  await setupAccount(defId, defName, 500, defAcc); // Only 500 €
  await setupAccount(plainId, plainName, 5000, plainAcc);

  const lawsuitId12 = 'lawsuit-test-12';
  await setupLawsuit({
    id: lawsuitId12,
    caseNumber: 'CAMB-112/2026',
    plaintiffId: plainId,
    plaintiffName: plainName,
    defendantId: defId,
    defendantName: defName,
    claimedAmount: 4000,
    totalClaimAmount: 5200,
    status: 'admitida_a_tramite'
  });

  const res12 = await postJudgeRuling(lawsuitId12, { ruling: 'estimatoria' });
  assert(res12.status === 400, `Petición rechazada con 400 por fondos insuficientes (${res12.status})`);
  assert(res12.data?.error?.includes('Saldo bancario insuficiente'), `Error descriptivo de fondos insuficientes: "${res12.data?.error}"`);

  const pgDef12 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defId]);
  const pgPlain12 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plainId]);
  assert(Number(pgDef12.rows[0].saldo) === 500, `Saldo demandado inalterado tras rollback (500): ${pgDef12.rows[0].saldo}`);
  assert(Number(pgPlain12.rows[0].saldo) === 5000, `Saldo demandante inalterado tras rollback (5000): ${pgPlain12.rows[0].saldo}`);

  const pgLawsuit12 = await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [lawsuitId12]);
  assert(pgLawsuit12.rows[0].estado === 'admitida_a_tramite', `Estado de demanda permanece admitida_a_tramite (${pgLawsuit12.rows[0].estado})`);

  // -------------------------------------------------------------
  // TEST 13: Reinicio y consistencia
  // -------------------------------------------------------------
  console.log('\n--- TEST 13: Reinicio y consistencia ---');
  // Check state of Lawsuit 1, 3 in PostgreSQL
  const checkL1 = await queryPG('SELECT estado, cuantia_total FROM demandas_judiciales WHERE id = $1', [lawsuitId1]);
  const checkL3 = await queryPG('SELECT estado FROM demandas_judiciales WHERE id = $1', [lawsuitId3]);
  assert(checkL1.rows[0].estado === 'ejecutada', `L1 persiste ejecutada en PG`);
  assert(checkL3.rows[0].estado === 'desestimada', `L3 persiste desestimada en PG`);

  // -------------------------------------------------------------
  // TEST 14: Repetición después de reinicio
  // -------------------------------------------------------------
  console.log('\n--- TEST 14: Repetición después de reinicio ---');
  const res14 = await postJudgeRuling(lawsuitId1, { ruling: 'estimatoria' });
  assert(res14.status === 400, `Demanda resuelta rechaza nueva resolución (${res14.status})`);
  assert(res14.data?.error?.includes('previamente'), `Error adecuado recibido (${res14.data?.error})`);

  // -------------------------------------------------------------
  // TEST 15: Regresiones
  // -------------------------------------------------------------
  console.log('\n--- TEST 15: Regresiones (discount, collect, transfer) ---');
  const noteId15 = 'msg-note-test-15';
  await setupPromissoryNote({
    id: noteId15,
    senderId: defId,
    senderName: defName,
    recipientId: plainId,
    recipientName: plainName,
    invoice_data: {
      id: noteId15,
      promissoryNoteNumber: 'PAG-REG-15',
      amount: 1000,
      issuerId: defId,
      issuerName: defName,
      recipientId: plainId,
      recipientName: plainName,
      beneficiaryId: plainId,
      beneficiaryName: plainName,
      status: 'emitido',
      issueDate: '2026-08-01',
      dueDate: '2026-10-01'
    }
  });

  const discRes = await postDiscount({ messageId: noteId15, beneficiaryId: plainId });
  assert(discRes.status === 200, `Descuento transaccional funciona correctamente (${discRes.status})`);

  console.log('\n================================================================');
  console.log(`RESULTADOS: ${passed} PASADOS, ${failed} FALLADOS`);
  console.log('================================================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  pool.end();
  process.exit(1);
});
