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

async function postDefendantAnswer(id: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/court/lawsuits/${id}/defendant-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

async function setupTestUser(id: string, name: string, balance: number, iban: string) {
  await queryPG(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, 'testpass', $5, 'student', 1)
     ON CONFLICT (id) DO UPDATE
     SET saldo = $3, alumno = $2, account_number = $5`,
    [id, name, balance, id, iban]
  );
  const db = readLocalDb();
  if (!db.users) db.users = [];
  const idx = db.users.findIndex((u: any) => u.id === id);
  const uObj = {
    id,
    name,
    username: id,
    password: 'testpass',
    balance,
    accountNumber: iban,
    role: 'student',
    level: 1
  };
  if (idx >= 0) db.users[idx] = uObj;
  else db.users.push(uObj);
  writeLocalDb(db);
}

async function setupTestLawsuit(data: any) {
  await queryPG(
    `INSERT INTO demandas_judiciales (
      id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre,
      demandante_iban, demandado_id, demandado_nombre, demandado_iban, cuantia_reclamada,
      intereses_costas, cuantia_total, descripcion_bienes, hechos, fundamentos_derecho,
      petitum, resumen_prueba, archivos_adjuntos, estado, contestacion_realizada,
      pagare_numero, pagare_id, embargo_fecha, embargo_importe, embargo_transfer_id, fecha_creacion, fecha_actualizacion
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, NOW(), NOW()
    ) ON CONFLICT (id) DO UPDATE SET
      numero_autos = $2, estado = $21, contestacion_realizada = $22, cuantia_reclamada = $12,
      embargo_transfer_id = $27, embargo_importe = $26, pagare_numero = $23, pagare_id = $24,
      contestacion_tipo = NULL, contestacion_fecha = NULL, contestacion_hechos = NULL,
      minuta_demandado_base = NULL, minuta_demandado_iva = NULL, minuta_demandado_total = NULL,
      minuta_demandado_factura_num = NULL, transferencia_ejecucion_id = NULL, fecha_actualizacion = NOW()`,
    [
      data.id,
      data.caseNumber || 'AUTOS-TEST/2026',
      data.courtName || 'Juzgado 1',
      data.type || 'ordinaria',
      data.subtype || null,
      data.plaintiffId,
      data.plaintiffName,
      data.plaintiffIban,
      data.defendantId,
      data.defendantName,
      data.defendantIban,
      data.claimedAmount,
      data.interestAndCostsAmount || 0,
      data.totalClaimAmount || data.claimedAmount,
      data.goodsDescription || '',
      data.facts || 'Hechos test',
      data.legalBasis || 'Fundamentos test',
      data.petitum || 'Petitum test',
      data.evidenceSummary || 'Pruebas test',
      JSON.stringify(data.attachments || []),
      data.status || 'admitida',
      data.defendantAnswered || false,
      data.promissoryNoteNumber || null,
      data.promissoryNoteId || null,
      data.embargoDate || null,
      data.embargoAmount || null,
      data.embargoTransferId || null
    ]
  );

  const db = readLocalDb();
  if (!db.courtLawsuits) db.courtLawsuits = [];
  const idx = db.courtLawsuits.findIndex((l: any) => l.id === data.id);
  const lObj = {
    id: data.id,
    caseNumber: data.caseNumber || 'AUTOS-TEST/2026',
    courtName: data.courtName || 'Juzgado 1',
    type: data.type || 'ordinaria',
    plaintiffId: data.plaintiffId,
    plaintiffName: data.plaintiffName,
    plaintiffIban: data.plaintiffIban,
    defendantId: data.defendantId,
    defendantName: data.defendantName,
    defendantIban: data.defendantIban,
    claimedAmount: data.claimedAmount,
    interestAndCostsAmount: data.interestAndCostsAmount || 0,
    totalClaimAmount: data.totalClaimAmount || data.claimedAmount,
    status: data.status || 'admitida',
    defendantAnswered: data.defendantAnswered || false,
    promissoryNoteNumber: data.promissoryNoteNumber || null,
    promissoryNoteId: data.promissoryNoteId || null,
    embargoTransferId: data.embargoTransferId || null,
    embargoAmount: data.embargoAmount || null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  if (idx >= 0) db.courtLawsuits[idx] = lObj;
  else db.courtLawsuits.push(lObj);
  writeLocalDb(db);
}

async function setupTestPromissoryNote(msgId: string, pnNumber: string, issuerId: string, beneficiaryId: string, amount: number) {
  const invoiceData = {
    id: msgId,
    promissoryNoteNumber: pnNumber,
    issuerId,
    issuerName: issuerId,
    beneficiaryId,
    beneficiaryName: beneficiaryId,
    amount,
    issueDate: new Date().toISOString(),
    dueDate: new Date(Date.now() + 86400000 * 30).toISOString(),
    status: 'emitido'
  };

  await queryPG(
    `INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
     VALUES ($1, $2, $3, $4, $5, $6, 'Pagaré', NOW(), false, 'promissory_note', $7::jsonb)
     ON CONFLICT (id) DO UPDATE SET invoice_data = $7::jsonb`,
    [msgId, `${issuerId}_${beneficiaryId}`, issuerId, issuerId, beneficiaryId, beneficiaryId, JSON.stringify(invoiceData)]
  );

  const db = readLocalDb();
  if (!db.marketMessages) db.marketMessages = [];
  const idx = db.marketMessages.findIndex((m: any) => m.id === msgId);
  const msgObj = {
    id: msgId,
    chatId: `${issuerId}_${beneficiaryId}`,
    senderId: issuerId,
    senderName: issuerId,
    recipientId: beneficiaryId,
    recipientName: beneficiaryId,
    content: 'Pagaré',
    timestamp: new Date().toISOString(),
    read: false,
    type: 'promissory_note',
    promissoryNoteData: invoiceData
  };
  if (idx >= 0) db.marketMessages[idx] = msgObj;
  else db.marketMessages.push(msgObj);
  writeLocalDb(db);
}

async function runAllTests() {
  console.log('================================================================');
  console.log('FASE 4.4.7.3 — SUITE DE PRUEBAS DE TRANSACCIONALIDAD DEFENDANT-ANSWER');
  console.log('================================================================\n');

  const runSuffix = Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 6);
  const plaintiffId = 'test_plain_' + runSuffix;
  const defendantId = 'test_def_' + runSuffix;

  // --------------------------------------------------------------------------
  // TEST 1: Contestación a demanda ordinaria con saldo suficiente (15% + 21% IVA)
  // --------------------------------------------------------------------------
  console.log('Test 1: Contestación a demanda ordinaria con saldo suficiente (15% + 21% IVA)');
  await setupTestUser(plaintiffId, 'Demandante Uno', 1000, 'ES0100010001');
  await setupTestUser(defendantId, 'Demandado Uno', 1000, 'ES0100010002');
  const lawsuitId1 = 'lawsuit_ord_1_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId1,
    caseNumber: 'AUTOS-ORD-01/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 2000,
    status: 'admitida'
  });

  const res1 = await postDefendantAnswer(lawsuitId1, {
    defendantId,
    answerType: 'ordinaria_contestacion',
    facts: 'Alegaciones formales de la defensa',
    attachments: [{ name: 'escrito_contestacion.pdf', dataUrl: 'data:application/pdf;base64,JVBERi0xLjc=' }]
  }, { 'x-idempotency-key': 'idem_ord_1_' + runSuffix });

  assert(res1.status === 200, `Respuesta HTTP 200 recibida (${res1.status})`);
  // 2000 * 0.15 = 300 base. 300 * 0.21 = 63 IVA. Total = 363.
  // Saldo inicial 1000 - 363 = 637.
  const defBal1 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(defBal1.rows[0].saldo) === 637, `Saldo en PG tras minuta abogado es 637 (obtenido: ${defBal1.rows[0].saldo})`);

  const law1 = await queryPG('SELECT contestacion_realizada, contestacion_tipo, minuta_demandado_base, minuta_demandado_iva, minuta_demandado_total FROM demandas_judiciales WHERE id = $1', [lawsuitId1]);
  assert(law1.rows[0].contestacion_realizada === true, 'contestacion_realizada es true en PG');
  assert(law1.rows[0].contestacion_tipo === 'ordinaria_contestacion', 'contestacion_tipo es ordinaria_contestacion en PG');
  assert(Number(law1.rows[0].minuta_demandado_total) === 363, `minuta_demandado_total es 363 en PG (obtenido: ${law1.rows[0].minuta_demandado_total})`);

  const movs1 = await queryPG('SELECT * FROM movimientos WHERE cuenta_id = $1 ORDER BY id DESC LIMIT 1', [defendantId]);
  assert(movs1.rows.length > 0 && Number(movs1.rows[0].importe) === 363, 'Movimiento TRANSFER_OUT de 363 registrado en PG');

  // --------------------------------------------------------------------------
  // TEST 2: Contestación a demanda ordinaria con saldo insuficiente
  // --------------------------------------------------------------------------
  console.log('\nTest 2: Contestación a demanda ordinaria con saldo insuficiente (Rollback completo)');
  await setupTestUser(defendantId, 'Demandado Uno', 50, 'ES0100010002'); // Solo 50€, necesita 363€
  const lawsuitId2 = 'lawsuit_ord_2_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId2,
    caseNumber: 'AUTOS-ORD-02/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 2000,
    status: 'admitida'
  });

  const res2 = await postDefendantAnswer(lawsuitId2, {
    defendantId,
    answerType: 'ordinaria_contestacion',
    facts: 'Alegaciones sin saldo'
  });

  assert(res2.status === 400, `Rechazo HTTP 400 por saldo insuficiente (${res2.status})`);
  const defBal2 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(defBal2.rows[0].saldo) === 50, `Saldo del demandado se mantiene intacto en 50€ (${defBal2.rows[0].saldo})`);
  const law2 = await queryPG('SELECT contestacion_realizada FROM demandas_judiciales WHERE id = $1', [lawsuitId2]);
  assert(law2.rows[0].contestacion_realizada === false, 'contestacion_realizada permanece false (Rollback)');

  // --------------------------------------------------------------------------
  // TEST 3: Oposición cambiaria (cambiaria_ya_pagado) con saldo suficiente
  // --------------------------------------------------------------------------
  console.log('\nTest 3: Oposición cambiaria (cambiaria_ya_pagado) con saldo suficiente');
  await setupTestUser(defendantId, 'Demandado Uno', 1000, 'ES0100010002');
  const lawsuitId3 = 'lawsuit_camb_3_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId3,
    caseNumber: 'AUTOS-CAMB-03/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  // 1000 * 0.15 = 150 base. 150 * 0.21 = 31.50 IVA. Total = 181.50.
  // Saldo 1000 - 181.50 = 818.50.
  const res3 = await postDefendantAnswer(lawsuitId3, {
    defendantId,
    answerType: 'cambiaria_ya_pagado',
    facts: 'Oposición: ya se pagó con transferencia previa'
  });

  assert(res3.status === 200, `Respuesta HTTP 200 recibida (${res3.status})`);
  const defBal3 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(defBal3.rows[0].saldo) === 818.5, `Saldo demandado actualizado a 818.50 en PG (${defBal3.rows[0].saldo})`);
  const law3 = await queryPG('SELECT contestacion_realizada, contestacion_tipo, minuta_demandado_total FROM demandas_judiciales WHERE id = $1', [lawsuitId3]);
  assert(law3.rows[0].contestacion_realizada === true && law3.rows[0].contestacion_tipo === 'cambiaria_ya_pagado', 'Oposición cambiaria registrada en PG');
  assert(Number(law3.rows[0].minuta_demandado_total) === 181.5, `Minuta letrado oposición es 181.50 en PG (${law3.rows[0].minuta_demandado_total})`);

  // --------------------------------------------------------------------------
  // TEST 4: Oposición cambiaria (cambiaria_ya_pagado) con saldo insuficiente
  // --------------------------------------------------------------------------
  console.log('\nTest 4: Oposición cambiaria (cambiaria_ya_pagado) con saldo insuficiente');
  await setupTestUser(defendantId, 'Demandado Uno', 10, 'ES0100010002');
  const lawsuitId4 = 'lawsuit_camb_4_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId4,
    caseNumber: 'AUTOS-CAMB-04/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const res4 = await postDefendantAnswer(lawsuitId4, {
    defendantId,
    answerType: 'cambiaria_ya_pagado',
    facts: 'Oposición sin saldo'
  });

  assert(res4.status === 400, `Rechazo HTTP 400 por saldo insuficiente (${res4.status})`);
  const defBal4 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(defBal4.rows[0].saldo) === 10, 'Saldo intacto tras fallo');

  // --------------------------------------------------------------------------
  // TEST 5: Allanamiento cambiario (cambiaria_paga_ahora) sin embargo preventivo
  // --------------------------------------------------------------------------
  console.log('\nTest 5: Allanamiento cambiario (cambiaria_paga_ahora) sin embargo preventivo y saldo suficiente');
  await setupTestUser(plaintiffId, 'Demandante Uno', 500, 'ES0100010001');
  await setupTestUser(defendantId, 'Demandado Uno', 2000, 'ES0100010002');
  const pnMsgId5 = 'msg_pn_5_' + runSuffix;
  const pnNum5 = 'PAG-' + runSuffix + '-0005';
  await setupTestPromissoryNote(pnMsgId5, pnNum5, defendantId, plaintiffId, 800);

  const lawsuitId5 = 'lawsuit_camb_5_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId5,
    caseNumber: 'AUTOS-CAMB-05/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 800,
    status: 'admitida',
    promissoryNoteNumber: pnNum5,
    promissoryNoteId: pnMsgId5
  });

  const res5 = await postDefendantAnswer(lawsuitId5, {
    defendantId,
    answerType: 'cambiaria_paga_ahora',
    facts: 'Allanamiento y pago voluntario del pagaré'
  });

  assert(res5.status === 200, `Respuesta HTTP 200 recibida (${res5.status})`);
  // Defendant: 2000 - 800 = 1200. Plaintiff: 500 + 800 = 1300.
  const defBal5 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  const plainBal5 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
  assert(Number(defBal5.rows[0].saldo) === 1200, `Saldo demandado es 1200 en PG (${defBal5.rows[0].saldo})`);
  assert(Number(plainBal5.rows[0].saldo) === 1300, `Saldo demandante es 1300 en PG (${plainBal5.rows[0].saldo})`);

  const law5 = await queryPG('SELECT estado, contestacion_realizada, contestacion_tipo, transferencia_ejecucion_id FROM demandas_judiciales WHERE id = $1', [lawsuitId5]);
  assert(law5.rows[0].estado === 'allanada_pagada', `Estado de demanda archivada por allanamiento ('allanada_pagada') en PG: ${law5.rows[0].estado}`);
  assert(law5.rows[0].contestacion_realizada === true && law5.rows[0].contestacion_tipo === 'cambiaria_paga_ahora', 'Contestación y allanamiento registrados');
  assert(Boolean(law5.rows[0].transferencia_ejecucion_id), 'transferencia_ejecucion_id generado');

  const pnRow5 = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [pnMsgId5]);
  const inv5 = typeof pnRow5.rows[0].invoice_data === 'string' ? JSON.parse(pnRow5.rows[0].invoice_data) : pnRow5.rows[0].invoice_data;
  assert(inv5.status === 'pagado', `Pagaré en market_messages actualizado a 'pagado' (obtenido: ${inv5.status})`);
  assert(Boolean(inv5.paidAt) && Boolean(inv5.paidTransferId), 'paidAt y paidTransferId persistidos en pagaré');

  // --------------------------------------------------------------------------
  // TEST 6: Allanamiento cambiario sin embargo preventivo y saldo insuficiente
  // --------------------------------------------------------------------------
  console.log('\nTest 6: Allanamiento cambiario sin embargo preventivo y saldo insuficiente');
  await setupTestUser(defendantId, 'Demandado Uno', 100, 'ES0100010002'); // Necesita 800
  const lawsuitId6 = 'lawsuit_camb_6_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId6,
    caseNumber: 'AUTOS-CAMB-06/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 800,
    status: 'admitida'
  });

  const res6 = await postDefendantAnswer(lawsuitId6, {
    defendantId,
    answerType: 'cambiaria_paga_ahora'
  });

  assert(res6.status === 400, `Rechazo HTTP 400 por saldo insuficiente (${res6.status})`);
  const defBal6 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(defBal6.rows[0].saldo) === 100, 'Saldo intacto tras error');
  const law6 = await queryPG('SELECT contestacion_realizada FROM demandas_judiciales WHERE id = $1', [lawsuitId6]);
  assert(law6.rows[0].contestacion_realizada === false, 'Demanda sin cambios');

  // --------------------------------------------------------------------------
  // TEST 7: Allanamiento cambiario CON embargo preventivo previo y devolución de exceso
  // --------------------------------------------------------------------------
  console.log('\nTest 7: Allanamiento cambiario CON embargo preventivo previo y devolución de exceso');
  await setupTestUser(plaintiffId, 'Demandante Uno', 1000, 'ES0100010001');
  await setupTestUser(defendantId, 'Demandado Uno', 500, 'ES0100010002');
  const pnMsgId7 = 'msg_pn_7_' + runSuffix;
  const pnNum7 = 'PAG-' + runSuffix + '-0007';
  await setupTestPromissoryNote(pnMsgId7, pnNum7, defendantId, plaintiffId, 600);

  const lawsuitId7 = 'lawsuit_camb_7_' + runSuffix;
  // Embargo previo de 780€ (600 principal + 180 intereses/costas)
  await setupTestLawsuit({
    id: lawsuitId7,
    caseNumber: 'AUTOS-CAMB-07/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 600,
    status: 'embargo_preventivo',
    embargoTransferId: 'tx_embargo_prev_7_' + runSuffix,
    embargoAmount: 780,
    promissoryNoteNumber: pnNum7,
    promissoryNoteId: pnMsgId7
  });

  const res7 = await postDefendantAnswer(lawsuitId7, {
    defendantId,
    answerType: 'cambiaria_paga_ahora',
    facts: 'Allanamiento y pago liberando depósito judicial'
  });

  assert(res7.status === 200, `Respuesta HTTP 200 recibida (${res7.status})`);
  // Plaintiff recibe los 600€ desde depósito judicial: 1000 + 600 = 1600.
  // Defendant recibe el exceso de retención (780 - 600 = 180€): 500 + 180 = 680.
  const plainBal7 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
  const defBal7 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(plainBal7.rows[0].saldo) === 1600, `Saldo demandante es 1600 en PG (recibió los 600€): ${plainBal7.rows[0].saldo}`);
  assert(Number(defBal7.rows[0].saldo) === 680, `Saldo demandado es 680 en PG (recibió los 180€ de exceso): ${defBal7.rows[0].saldo}`);

  const law7 = await queryPG('SELECT estado, contestacion_realizada FROM demandas_judiciales WHERE id = $1', [lawsuitId7]);
  assert(law7.rows[0].estado === 'allanada_pagada', 'Demanda allanada y pagada en PG');

  const pnRow7 = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [pnMsgId7]);
  const inv7 = typeof pnRow7.rows[0].invoice_data === 'string' ? JSON.parse(pnRow7.rows[0].invoice_data) : pnRow7.rows[0].invoice_data;
  assert(inv7.status === 'pagado', 'Pagaré marcado como pagado tras allanamiento con embargo');

  // --------------------------------------------------------------------------
  // TEST 8: Idempotencia con misma x-idempotency-key en ordinaria_contestacion
  // --------------------------------------------------------------------------
  console.log('\nTest 8: Idempotencia con misma x-idempotency-key en ordinaria_contestacion');
  await setupTestUser(defendantId, 'Demandado Uno', 1000, 'ES0100010002');
  const lawsuitId8 = 'lawsuit_ord_8_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId8,
    caseNumber: 'AUTOS-ORD-08/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const idemKey8 = 'idem_test_ord_8_' + runSuffix;
  const firstReq8 = await postDefendantAnswer(lawsuitId8, {
    defendantId,
    answerType: 'ordinaria_contestacion',
    facts: 'Contestación inicial'
  }, { 'x-idempotency-key': idemKey8 });

  assert(firstReq8.status === 200, `Primera llamada HTTP 200 (${firstReq8.status})`);
  // 1000 - 181.50 = 818.50
  const balAfterFirst8 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId])).rows[0].saldo;

  const secondReq8 = await postDefendantAnswer(lawsuitId8, {
    defendantId,
    answerType: 'ordinaria_contestacion',
    facts: 'Contestación repetida idéntica'
  }, { 'x-idempotency-key': idemKey8 });

  assert(secondReq8.status === 200, `Segunda llamada idempotente HTTP 200 (${secondReq8.status})`);
  const balAfterSecond8 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId])).rows[0].saldo;
  assert(Number(balAfterFirst8) === Number(balAfterSecond8), `Saldo no se cobra dos veces (${balAfterFirst8} === ${balAfterSecond8})`);

  const idemRecord8 = await queryPG('SELECT clave, respuesta FROM operaciones_idempotencia WHERE clave = $1', [idemKey8]);
  assert(idemRecord8.rows.length === 1 && Boolean(idemRecord8.rows[0].respuesta), 'Registro idempotente en PostgreSQL guardado con respuesta');

  // --------------------------------------------------------------------------
  // TEST 9: Idempotencia con misma x-idempotency-key en cambiaria_paga_ahora
  // --------------------------------------------------------------------------
  console.log('\nTest 9: Idempotencia con misma x-idempotency-key en cambiaria_paga_ahora');
  await setupTestUser(plaintiffId, 'Demandante Uno', 500, 'ES0100010001');
  await setupTestUser(defendantId, 'Demandado Uno', 1500, 'ES0100010002');
  const lawsuitId9 = 'lawsuit_camb_9_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId9,
    caseNumber: 'AUTOS-CAMB-09/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 500,
    status: 'admitida'
  });

  const idemKey9 = 'idem_test_camb_9_' + runSuffix;
  const firstReq9 = await postDefendantAnswer(lawsuitId9, {
    defendantId,
    answerType: 'cambiaria_paga_ahora'
  }, { 'x-idempotency-key': idemKey9 });
  assert(firstReq9.status === 200, `Primera llamada pago HTTP 200 (${firstReq9.status})`);

  const balPlainAfterFirst9 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId])).rows[0].saldo;
  const balDefAfterFirst9 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId])).rows[0].saldo;

  const secondReq9 = await postDefendantAnswer(lawsuitId9, {
    defendantId,
    answerType: 'cambiaria_paga_ahora'
  }, { 'x-idempotency-key': idemKey9 });
  assert(secondReq9.status === 200, `Segunda llamada pago idempotente HTTP 200 (${secondReq9.status})`);

  const balPlainAfterSecond9 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId])).rows[0].saldo;
  const balDefAfterSecond9 = (await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId])).rows[0].saldo;

  assert(Number(balPlainAfterFirst9) === Number(balPlainAfterSecond9), `Demandante no cobra dos veces (${balPlainAfterFirst9} === ${balPlainAfterSecond9})`);
  assert(Number(balDefAfterFirst9) === Number(balDefAfterSecond9), `Demandado no paga dos veces (${balDefAfterFirst9} === ${balDefAfterSecond9})`);

  // --------------------------------------------------------------------------
  // TEST 10: Concurrencia de 5 peticiones simultáneas sobre el mismo lawsuitId
  // --------------------------------------------------------------------------
  console.log('\nTest 10: Concurrencia de 5 peticiones simultáneas sobre el mismo lawsuitId');
  await setupTestUser(defendantId, 'Demandado Uno', 2000, 'ES0100010002');
  const lawsuitId10 = 'lawsuit_concurrent_10_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId10,
    caseNumber: 'AUTOS-CONC-10/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  // Lanzamos 5 peticiones concurrentes con claves de idempotencia diferentes para verificar exclusión mutua
  const promises10 = [1, 2, 3, 4, 5].map(i =>
    postDefendantAnswer(lawsuitId10, {
      defendantId,
      answerType: 'ordinaria_contestacion',
      facts: `Contestación concurrente ${i}`
    }, { 'x-idempotency-key': `idem_concurrent_${i}_${runSuffix}` })
  );

  const results10 = await Promise.all(promises10);
  const successCount10 = results10.filter(r => r.status === 200).length;
  const errorCount10 = results10.filter(r => r.status === 400).length;

  assert(successCount10 === 1, `Exactamente 1 petición concurrente tiene éxito (éxitos: ${successCount10})`);
  assert(errorCount10 === 4, `Las otras 4 peticiones son rechazadas (errores: ${errorCount10})`);

  // Verificamos que solo hubo 1 cobro: 2000 - 181.50 = 1818.50
  const bal10 = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
  assert(Number(bal10.rows[0].saldo) === 1818.5, `Saldo cobrado exactamente una sola vez (1818.50): obtenido ${bal10.rows[0].saldo}`);

  // --------------------------------------------------------------------------
  // TEST 11: Intentar contestar demanda en estado no admitido (pendiente_admision / inadmitida)
  // --------------------------------------------------------------------------
  console.log('\nTest 11: Intentar contestar demanda en estado no admitido');
  const lawsuitId11 = 'lawsuit_invalid_11_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId11,
    caseNumber: 'AUTOS-PEND-11/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'pendiente_admision'
  });

  const res11 = await postDefendantAnswer(lawsuitId11, {
    defendantId,
    answerType: 'ordinaria_contestacion'
  });

  assert(res11.status === 400, `Rechazo HTTP 400 por procedimiento no admitido a trámite (${res11.status})`);
  assert(res11.data?.error?.includes('admitido'), `Mensaje de error coherente: "${res11.data?.error}"`);

  // --------------------------------------------------------------------------
  // TEST 12: Intentar contestar con un usuario que no es el demandado (HTTP 403)
  // --------------------------------------------------------------------------
  console.log('\nTest 12: Intentar contestar con un usuario que no es el demandado (HTTP 403)');
  const lawsuitId12 = 'lawsuit_wrong_12_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId12,
    caseNumber: 'AUTOS-ORD-12/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const res12 = await postDefendantAnswer(lawsuitId12, {
    defendantId: 'intruder_user_xyz',
    answerType: 'ordinaria_contestacion'
  });

  assert(res12.status === 403, `Rechazo HTTP 403 al no ser la parte demandada (${res12.status})`);

  // --------------------------------------------------------------------------
  // TEST 13: Incompatibilidad entre tipo de demanda y tipo de contestación
  // --------------------------------------------------------------------------
  console.log('\nTest 13: Incompatibilidad entre tipo de demanda y tipo de contestación');
  // Demanda ordinaria con contestación cambiaria
  const lawsuitId13a = 'lawsuit_incomp_13a_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId13a,
    caseNumber: 'AUTOS-ORD-13A/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const res13a = await postDefendantAnswer(lawsuitId13a, {
    defendantId,
    answerType: 'cambiaria_ya_pagado'
  });
  assert(res13a.status === 400, `Rechazo HTTP 400 por ordinaria con contestación cambiaria (${res13a.status})`);

  // Demanda cambiaria con contestación ordinaria
  const lawsuitId13b = 'lawsuit_incomp_13b_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId13b,
    caseNumber: 'AUTOS-CAMB-13B/' + runSuffix,
    type: 'cambiaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const res13b = await postDefendantAnswer(lawsuitId13b, {
    defendantId,
    answerType: 'ordinaria_contestacion'
  });
  assert(res13b.status === 400, `Rechazo HTTP 400 por cambiaria con contestación ordinaria (${res13b.status})`);

  // --------------------------------------------------------------------------
  // TEST 14: Validación estricta de documentos adjuntos (Solo PDF permitido)
  // --------------------------------------------------------------------------
  console.log('\nTest 14: Validación estricta de documentos adjuntos (Solo PDF permitido)');
  const lawsuitId14 = 'lawsuit_pdf_14_' + runSuffix;
  await setupTestLawsuit({
    id: lawsuitId14,
    caseNumber: 'AUTOS-ORD-14/' + runSuffix,
    type: 'ordinaria',
    plaintiffId,
    plaintiffName: 'Demandante Uno',
    plaintiffIban: 'ES0100010001',
    defendantId,
    defendantName: 'Demandado Uno',
    defendantIban: 'ES0100010002',
    claimedAmount: 1000,
    status: 'admitida'
  });

  const res14 = await postDefendantAnswer(lawsuitId14, {
    defendantId,
    answerType: 'ordinaria_contestacion',
    attachments: [{ name: 'malicious_script.exe', dataUrl: 'data:application/octet-stream;base64,AAAA' }]
  });

  assert(res14.status === 400, `Rechazo HTTP 400 por adjunto no PDF (${res14.status})`);
  assert(res14.data?.error?.includes('PDF'), `Mensaje indica formato PDF requerido: "${res14.data?.error}"`);

  // --------------------------------------------------------------------------
  // TEST 15: Persistencia directa en PostgreSQL y coherencia global
  // --------------------------------------------------------------------------
  console.log('\nTest 15: Persistencia directa en PostgreSQL y coherencia global');
  const auditDb = await queryPG(`
    SELECT
      (SELECT COUNT(*) FROM demandas_judiciales WHERE contestacion_realizada = true AND id LIKE '%' || $1) as contestadas,
      (SELECT COUNT(*) FROM movimientos WHERE concepto LIKE '%Minuta Letrado%' AND concepto LIKE '%' || $1 || '%') as minutas_abogado,
      (SELECT COUNT(*) FROM operaciones_idempotencia WHERE clave LIKE '%' || $1) as idempotencias
  `, [runSuffix]);

  const stats = auditDb.rows[0];
  assert(Number(stats.contestadas) >= 4, `Al menos 4 demandas contestadas persistidas en PG (${stats.contestadas})`);
  assert(Number(stats.minutas_abogado) >= 2, `Movimientos de minuta de letrado auditados en PG (${stats.minutas_abogado})`);
  assert(Number(stats.idempotencias) >= 2, `Operaciones de idempotencia auditadas en PG (${stats.idempotencias})`);

  console.log('\n================================================================');
  console.log(`RESULTADOS: ${passed} PASADAS | ${failed} FALLADAS`);
  console.log('================================================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Unhandled test suite error:', err);
  pool.end();
  process.exit(1);
});
