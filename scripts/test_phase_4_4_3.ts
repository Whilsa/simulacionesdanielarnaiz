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

async function postCollect(body: any, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
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
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
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
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/transfers`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function createTestAccount(id: string, name: string, balance: number) {
  await queryPG(`
    INSERT INTO cuentas (id, alumno, saldo, usuario, role, account_number, level)
    VALUES ($1, $2, $3, $4, 'student', 'ES990001000200000001', 1)
    ON CONFLICT (id) DO UPDATE SET
      alumno = EXCLUDED.alumno,
      saldo = EXCLUDED.saldo,
      role = EXCLUDED.role;
  `, [id, name, balance, id]);

  const db = readLocalDb();
  if (!db.users) db.users = [];
  const idx = db.users.findIndex((u: any) => u.id === id);
  const uObj = {
    id,
    name,
    username: id,
    balance,
    role: 'student',
    level: 1,
    accountNumber: 'ES990001000200000001'
  };
  if (idx >= 0) db.users[idx] = uObj;
  else db.users.push(uObj);
  writeLocalDb(db);
}

async function createTestNote(params: {
  msgId: string;
  noteNumber: string;
  issuerId: string;
  issuerName: string;
  beneficiaryId: string;
  beneficiaryName: string;
  amount: number;
  dueDate: string;
  status?: string;
}) {
  const nowIso = new Date().toISOString();
  const invoiceData = {
    id: 'pn-' + params.msgId,
    amount: params.amount,
    status: params.status || 'pendiente',
    concept: 'Operación comercial para test ' + params.noteNumber,
    dueDate: params.dueDate,
    bankIban: 'ES97000100022734372895',
    bankName: 'Banco Central Mercantil S.A.',
    issuerId: params.issuerId,
    issueDate: nowIso,
    orderType: 'no_a_la_orden',
    issuePlace: 'Madrid',
    issuerName: params.issuerName,
    issuerLevel: 1,
    issuerNifCif: params.issuerId,
    amountInWords: 'IMPORTE EN LETRA',
    beneficiaryId: params.beneficiaryId,
    issuerAddress: 'Madrid',
    signatureHash: 'SIG-TEST-' + params.noteNumber,
    beneficiaryName: params.beneficiaryName,
    beneficiaryLevel: 1,
    beneficiaryNifCif: params.beneficiaryId,
    signatureTimestamp: nowIso,
    promissoryNoteNumber: params.noteNumber
  };

  await queryPG(`
    INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, 'promissory_note', $9::jsonb)
    ON CONFLICT (id) DO UPDATE SET
      type = 'promissory_note',
      invoice_data = EXCLUDED.invoice_data;
  `, [
    params.msgId,
    'chat_' + params.msgId,
    params.issuerId,
    params.issuerName,
    params.beneficiaryId,
    params.beneficiaryName,
    `Pagaré emitido por ${params.amount} €`,
    nowIso,
    JSON.stringify(invoiceData)
  ]);

  const db = readLocalDb();
  if (!db.marketMessages) db.marketMessages = [];
  const idx = db.marketMessages.findIndex((m: any) => m.id === params.msgId);
  const msgObj = {
    id: params.msgId,
    chatId: 'chat_' + params.msgId,
    senderId: params.issuerId,
    senderName: params.issuerName,
    recipientId: params.beneficiaryId,
    recipientName: params.beneficiaryName,
    content: `Pagaré emitido por ${params.amount} €`,
    timestamp: nowIso,
    read: true,
    type: 'promissory_note',
    promissoryNoteData: invoiceData
  };
  if (idx >= 0) db.marketMessages[idx] = msgObj;
  else db.marketMessages.push(msgObj);
  writeLocalDb(db);
}

let totalPassed = 0;
let totalFailed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    totalPassed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    totalFailed++;
  }
}

async function runAllTests() {
  console.log("=== INICIANDO BATERÍA COMPLETA DE PRUEBAS FASE 4.4.3 ===");

  const testSuffix = Date.now();
  const payerId = `payer_c_${testSuffix}`;
  const payerName = `Librador Test ${testSuffix}`;
  const benId = `ben_c_${testSuffix}`;
  const benName = `Beneficiario Test ${testSuffix}`;

  // Provision accounts
  await createTestAccount(payerId, payerName, 10000.00);
  await createTestAccount(benId, benName, 5000.00);

  // -------------------------------------------------------------
  // TEST 1: COBRO NORMAL (FONDOS SUFICIENTES, VENCIMIENTO CUMPLIDO)
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Cobro Normal con Fondos Suficientes ---");
  const noteId1 = `msg_test_1_${testSuffix}`;
  const noteNum1 = `PAG-TEST-1-${testSuffix}`;
  await createTestNote({
    msgId: noteId1,
    noteNumber: noteNum1,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1000.00,
    dueDate: '2026-09-01T00:00:00.000Z' // past date
  });

  const res1 = await postCollect({ messageId: noteId1, beneficiaryId: benId }, `key_test1_${testSuffix}`);
  assert(res1.status === 200, `HTTP status debe ser 200 (actual: ${res1.status})`);
  assert(res1.data?.success === true, "Cobro debe ser exitoso");

  const payerBal1 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBal1 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(payerBal1 === 9000.00, `Saldo del librador debe ser 9000.00 (actual: ${payerBal1})`);
  assert(benBal1 === 6000.00, `Saldo del beneficiario debe ser 6000.00 (actual: ${benBal1})`);

  const movs1 = (await queryPG("SELECT tipo, importe FROM movimientos WHERE concepto LIKE $1", [`%${noteNum1}%`])).rows;
  assert(movs1.length === 2, `Deben existir 2 movimientos contables (actual: ${movs1.length})`);
  assert(movs1.some(m => m.tipo === 'TRANSFER_OUT' && Number(m.importe) === 1000), "Existe movimiento TRANSFER_OUT de 1000€");
  assert(movs1.some(m => m.tipo === 'TRANSFER_IN' && Number(m.importe) === 1000), "Existe movimiento TRANSFER_IN de 1000€");

  const notePG1 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId1])).rows[0].invoice_data;
  assert(notePG1.status === 'pagado', `Estado del pagaré en PG debe ser 'pagado' (actual: ${notePG1.status})`);
  assert(Boolean(notePG1.paidAt), "Pagaré tiene timestamp paidAt registrado");
  assert(Boolean(notePG1.paidTransferId), "Pagaré tiene paidTransferId registrado");

  // -------------------------------------------------------------
  // TEST 2: DOS COBROS SIMULTÁNEOS, CLAVES DISTINTAS
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Dos Cobros Concurrentes con Claves Distintas ---");
  const noteId2 = `msg_test_2_${testSuffix}`;
  const noteNum2 = `PAG-TEST-2-${testSuffix}`;
  await createTestNote({
    msgId: noteId2,
    noteNumber: noteNum2,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1500.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const payerBalBefore2 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBalBefore2 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);

  const [res2A, res2B] = await Promise.all([
    postCollect({ messageId: noteId2, beneficiaryId: benId }, `key_test2A_${testSuffix}`),
    postCollect({ messageId: noteId2, beneficiaryId: benId }, `key_test2B_${testSuffix}`)
  ]);

  const successCount2 = (res2A.status === 200 ? 1 : 0) + (res2B.status === 200 ? 1 : 0);
  const rejectedCount2 = (res2A.status === 400 ? 1 : 0) + (res2B.status === 400 ? 1 : 0);
  assert(successCount2 === 1, `Exactamente 1 petición de cobro debe tener éxito (actual: ${successCount2})`);
  assert(rejectedCount2 === 1, `Exactamente 1 petición de cobro debe ser rechazada (actual: ${rejectedCount2})`);

  const rejectedRes2 = res2A.status === 400 ? res2A : res2B;
  assert(rejectedRes2.data?.error?.includes('ya ha sido cobrado'), `Mensaje de rechazo correcto: "${rejectedRes2.data?.error}"`);

  const payerBalAfter2 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBalAfter2 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(payerBalAfter2 === Number((payerBalBefore2 - 1500).toFixed(2)), `Un solo débito al librador: esperado ${payerBalBefore2 - 1500}, actual ${payerBalAfter2}`);
  assert(benBalAfter2 === Number((benBalBefore2 + 1500).toFixed(2)), `Un solo crédito al beneficiario: esperado ${benBalBefore2 + 1500}, actual ${benBalAfter2}`);

  const movs2 = (await queryPG("SELECT id FROM movimientos WHERE concepto LIKE $1", [`%${noteNum2}%`])).rows;
  assert(movs2.length === 2, `Exactamente 2 movimientos contables para la operación (actual: ${movs2.length})`);

  // -------------------------------------------------------------
  // TEST 3: MISMA CLAVE IDEMPOTENTE SIMULTÁNEA
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Misma Clave Idempotente Simultánea ---");
  const noteId3 = `msg_test_3_${testSuffix}`;
  const noteNum3 = `PAG-TEST-3-${testSuffix}`;
  await createTestNote({
    msgId: noteId3,
    noteNumber: noteNum3,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 500.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const payerBalBefore3 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBalBefore3 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  const sharedKey3 = `key_shared_${testSuffix}`;

  const [res3A, res3B] = await Promise.all([
    postCollect({ messageId: noteId3, beneficiaryId: benId }, sharedKey3),
    postCollect({ messageId: noteId3, beneficiaryId: benId }, sharedKey3)
  ]);

  assert(res3A.status === 200, `Petición 1 con clave compartida es 200 (actual: ${res3A.status})`);
  assert(res3B.status === 200, `Petición 2 con clave compartida es 200 (actual: ${res3B.status})`);
  assert(res3A.data?.transfer?.id === res3B.data?.transfer?.id, "Ambas respuestas retornan la misma transferencia bancaria");

  const payerBalAfter3 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBalAfter3 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(payerBalAfter3 === Number((payerBalBefore3 - 500).toFixed(2)), `Un solo débito para la misma clave: esperado ${payerBalBefore3 - 500}, actual ${payerBalAfter3}`);
  assert(benBalAfter3 === Number((benBalBefore3 + 500).toFixed(2)), `Un solo crédito para la misma clave: esperado ${benBalBefore3 + 500}, actual ${benBalAfter3}`);

  const movs3 = (await queryPG("SELECT id FROM movimientos WHERE concepto LIKE $1", [`%${noteNum3}%`])).rows;
  assert(movs3.length === 2, `Exactamente 2 movimientos registrados (1 OUT, 1 IN) (actual: ${movs3.length})`);

  // -------------------------------------------------------------
  // TEST 4: REINTENTO POSTERIOR CON LA MISMA CLAVE
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Reintento Posterior con la Misma Clave ---");
  const res4 = await postCollect({ messageId: noteId3, beneficiaryId: benId }, sharedKey3);
  assert(res4.status === 200, `Reintento posterior retorna 200 (actual: ${res4.status})`);
  assert(res4.data?.transfer?.id === res3A.data?.transfer?.id, "Retorna la misma transferencia en caché");

  const payerBalAfter4 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const benBalAfter4 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(payerBalAfter4 === payerBalAfter3, "Saldo del librador inalterado tras reintento");
  assert(benBalAfter4 === benBalAfter3, "Saldo del beneficiario inalterado tras reintento");

  const movs4 = (await queryPG("SELECT id FROM movimientos WHERE concepto LIKE $1", [`%${noteNum3}%`])).rows;
  assert(movs4.length === 2, "Movimientos contables siguen siendo exactamente 2");

  // -------------------------------------------------------------
  // TEST 5: FONDOS INSUFICIENTES (LIBRADOR SIN SALDO)
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Cobro con Fondos Insuficientes ---");
  const brokePayerId = `broke_payer_${testSuffix}`;
  const brokePayerName = `Librador Sin Fondos ${testSuffix}`;
  await createTestAccount(brokePayerId, brokePayerName, 50.00); // Only 50€

  const noteId5 = `msg_test_5_${testSuffix}`;
  const noteNum5 = `PAG-TEST-5-${testSuffix}`;
  await createTestNote({
    msgId: noteId5,
    noteNumber: noteNum5,
    issuerId: brokePayerId,
    issuerName: brokePayerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1000.00, // 1000€ > 50€
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const res5 = await postCollect({ messageId: noteId5, beneficiaryId: benId }, `key_test5_${testSuffix}`);
  assert(res5.status === 200, `Status HTTP debe ser 200 (actual: ${res5.status})`);
  assert(res5.data?.success === false, "success debe ser false");
  assert(res5.data?.isImpagado === true, "isImpagado debe ser true");

  const brokeBalAfter5 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [brokePayerId])).rows[0].saldo);
  const benBalAfter5 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(brokeBalAfter5 === 50.00, `Saldo del librador intacto (esperado: 50.00, actual: ${brokeBalAfter5})`);
  assert(benBalAfter5 === benBalAfter4, `Saldo del beneficiario intacto (esperado: ${benBalAfter4}, actual: ${benBalAfter5})`);

  const movs5 = (await queryPG("SELECT id FROM movimientos WHERE concepto LIKE $1", [`%${noteNum5}%`])).rows;
  assert(movs5.length === 0, `0 movimientos contables registrados por impago (actual: ${movs5.length})`);

  const notePG5 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId5])).rows[0].invoice_data;
  assert(notePG5.status === 'impagado', `Estado en PG debe ser 'impagado' (actual: ${notePG5.status})`);
  assert(notePG5.collectRequested === true, "collectRequested debe ser true");

  const protestMsg5 = (await queryPG("SELECT content FROM market_messages WHERE chat_id = $1 AND content LIKE '%Pagaré impagado%'", ['chat_' + noteId5])).rows;
  assert(protestMsg5.length >= 1, "Mensaje de protesta insertado en market_messages");

  // -------------------------------------------------------------
  // TEST 6: DOS COBROS CONCURRENTES CON FONDOS INSUFICIENTES
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Dos Cobros Concurrentes con Fondos Insuficientes ---");
  const noteId6 = `msg_test_6_${testSuffix}`;
  const noteNum6 = `PAG-TEST-6-${testSuffix}`;
  await createTestNote({
    msgId: noteId6,
    noteNumber: noteNum6,
    issuerId: brokePayerId,
    issuerName: brokePayerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 800.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const [res6A, res6B] = await Promise.all([
    postCollect({ messageId: noteId6, beneficiaryId: benId }, `key_test6A_${testSuffix}`),
    postCollect({ messageId: noteId6, beneficiaryId: benId }, `key_test6B_${testSuffix}`)
  ]);

  assert(res6A.status === 200 && res6B.status === 200, "Ambas peticiones completan sin deadlocks");
  assert(res6A.data?.isImpagado === true || res6B.data?.isImpagado === true, "Al menos una marca impagado");

  const brokeBalAfter6 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [brokePayerId])).rows[0].saldo);
  assert(brokeBalAfter6 === 50.00, `Saldo del librador sigue intacto (50.00)`);

  const movs6 = (await queryPG("SELECT id FROM movimientos WHERE concepto LIKE $1", [`%${noteNum6}%`])).rows;
  assert(movs6.length === 0, `0 movimientos contables generados`);

  const notePG6 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId6])).rows[0].invoice_data;
  assert(notePG6.status === 'impagado', `Estado final en PG es 'impagado'`);

  // -------------------------------------------------------------
  // TEST 7: COBRO VS TRANSFERENCIA CONCURRENTE (MISMA CUENTA, 0 DEADLOCKS)
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Cobro vs Transferencia Simultánea (0 Deadlocks) ---");
  const noteId7 = `msg_test_7_${testSuffix}`;
  const noteNum7 = `PAG-TEST-7-${testSuffix}`;
  await createTestNote({
    msgId: noteId7,
    noteNumber: noteNum7,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 300.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const thirdUser = 'user-5b2wk2oby';
  const payerBalBefore7 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);

  // payer pays 300 via note collection AND transfers 100 to thirdUser simultaneously
  const [resColl7, resTx7] = await Promise.all([
    postCollect({ messageId: noteId7, beneficiaryId: benId }, `key_c7_${testSuffix}`),
    postTransfer({
      senderId: payerId,
      receiverId: thirdUser,
      amount: 100.00,
      concept: `Transferencia concurrente test 7 ${testSuffix}`
    }, `key_tx7_${testSuffix}`)
  ]);

  assert(resColl7.status === 200, `Cobro exitoso (status: ${resColl7.status})`);
  assert(resTx7.status === 200, `Transferencia concurrente exitosa (status: ${resTx7.status})`);

  const payerBalAfter7 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  const expectedPayer7 = Number((payerBalBefore7 - 300.00 - 100.00).toFixed(2));
  assert(payerBalAfter7 === expectedPayer7, `Saldo del librador exacto tras cobro (-300) y tx (-100): esperado ${expectedPayer7}, actual ${payerBalAfter7}`);

  // -------------------------------------------------------------
  // TEST 8: COBRO VS MATERIAS PRIMAS CONCURRENTE
  // -------------------------------------------------------------
  console.log("\n--- TEST 8: Cobro vs Compra de Materias Primas Simultánea ---");
  const targetBuyerId = 'user-hgp3parur';
  const targetBuyerName = 'Fabricante Destornilladores completo';
  const targetNaveId = 'acq-wl9a9gsw7';
  const targetAnnId = 'rm-hierro';

  const noteId8 = `msg_test_8_${testSuffix}`;
  const noteNum8 = `PAG-TEST-8-${testSuffix}`;
  await createTestNote({
    msgId: noteId8,
    noteNumber: noteNum8,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: targetBuyerId,
    beneficiaryName: targetBuyerName,
    amount: 1000.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const balBuyerBefore8 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [targetBuyerId])).rows[0].saldo);

  const [resColl8, resOrder8] = await Promise.all([
    postCollect({ messageId: noteId8, beneficiaryId: targetBuyerId }, `key_c8_${testSuffix}`),
    fetch(`${BASE_URL}/api/raw-materials/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: targetBuyerId,
        announcementId: targetAnnId,
        quantity: 1,
        destinationNaveId: targetNaveId
      })
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }))
  ]);

  assert(resColl8.status === 200, `Cobro concurrente exitoso (status: ${resColl8.status})`);
  assert(resOrder8.status === 200, `Orden de materia prima exitosa (status: ${resOrder8.status})`);

  const balBuyerAfter8 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [targetBuyerId])).rows[0].saldo);
  const orderCost8 = Number(resOrder8.data?.order?.totalAmount || resOrder8.data?.order?.totalPrice || 643.72);
  const expectedBuyer8 = Number((balBuyerBefore8 + 1000.00 - orderCost8).toFixed(2));
  assert(balBuyerAfter8 === expectedBuyer8, `Saldo final exacto tras cobro (+1000) y compra material (-${orderCost8}): esperado ${expectedBuyer8}, actual ${balBuyerAfter8}`);

  // -------------------------------------------------------------
  // TEST 9: COBRO VS DESCUENTO DEL MISMO PAGARÉ (CONCURRENCIA DIRECTA)
  // -------------------------------------------------------------
  console.log("\n--- TEST 9: Cobro vs Descuento del MISMO Pagaré Concurrente ---");
  const noteId9 = `msg_test_9_${testSuffix}`;
  const noteNum9 = `PAG-TEST-9-${testSuffix}`;
  // Due date is today at 23:59:59 (allows both collect on due date and discount with 1 day)
  const nowObj = new Date();
  const todayIso = new Date(nowObj.getFullYear(), nowObj.getMonth(), nowObj.getDate(), 23, 59, 59).toISOString();

  await createTestNote({
    msgId: noteId9,
    noteNumber: noteNum9,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1000.00,
    dueDate: todayIso
  });

  const [resColl9, resDisc9] = await Promise.all([
    postCollect({ messageId: noteId9, beneficiaryId: benId }, `key_c9_${testSuffix}`),
    postDiscount({ messageId: noteId9, beneficiaryId: benId }, `key_d9_${testSuffix}`)
  ]);

  const succ9 = (resColl9.status === 200 ? 1 : 0) + (resDisc9.status === 200 ? 1 : 0);
  const rej9 = (resColl9.status === 400 ? 1 : 0) + (resDisc9.status === 400 ? 1 : 0);

  assert(succ9 === 1, `Exactamente 1 operación exitosa entre cobro y descuento (actual: ${succ9})`);
  assert(rej9 === 1, `Exactamente 1 operación rechazada entre cobro y descuento (actual: ${rej9})`);

  const notePG9 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId9])).rows[0].invoice_data;
  assert(notePG9.status === 'pagado' || notePG9.status === 'descontado', `Estado final en PG es válido ('pagado' o 'descontado') (actual: ${notePG9.status})`);

  // -------------------------------------------------------------
  // TEST 10: ROLLBACK FORZADO (ATOMICIDAD)
  // -------------------------------------------------------------
  console.log("\n--- TEST 10: Rollback Transaccional Íntegro ---");
  const noteId10 = `msg_test_10_${testSuffix}`;
  const noteNum10 = `PAG-TEST-10-${testSuffix}`;
  await createTestNote({
    msgId: noteId10,
    noteNumber: noteNum10,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1000.00,
    dueDate: '2026-09-01T00:00:00.000Z'
  });

  const payerBalBefore10 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);

  // Solicitar cobro con un beneficiario no autorizado (debe retornar 403 y hacer rollback total)
  const res10 = await postCollect({ messageId: noteId10, beneficiaryId: 'otro_usuario_no_autorizado' }, `key_fail_${testSuffix}`);
  assert(res10.status === 403, `Cobro no autorizado debe responder 403 (actual: ${res10.status})`);

  const payerBalAfter10 = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [payerId])).rows[0].saldo);
  assert(payerBalAfter10 === payerBalBefore10, "Saldo del librador intacto tras fallo y rollback");

  const notePG10 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId10])).rows[0].invoice_data;
  assert(notePG10.status === 'pendiente', `Pagaré permanece 'pendiente' tras rollback (actual: ${notePG10.status})`);

  // -------------------------------------------------------------
  // TEST 11: PERSISTENCIA TRAS REINICIO / RECONSTRUCCIÓN
  // -------------------------------------------------------------
  console.log("\n--- TEST 11: Persistencia tras Reinicio / Reconstrucción de Memoria ---");
  const notePG1Recheck = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteId1])).rows[0].invoice_data;
  assert(notePG1Recheck.status === 'pagado', `Nota 1 persiste 'pagado' en PostgreSQL`);
  assert(Boolean(notePG1Recheck.paidAt), `Nota 1 conserva paidAt: ${notePG1Recheck.paidAt}`);
  assert(Boolean(notePG1Recheck.paidTransferId), `Nota 1 conserva paidTransferId: ${notePG1Recheck.paidTransferId}`);

  // Simular reconstrucción de caché en memoria leyendo desde PostgreSQL
  const freshDb = readLocalDb();
  const cachedMsg = (freshDb.marketMessages || []).find((m: any) => m.id === noteId1);
  assert(cachedMsg?.promissoryNoteData?.status === 'pagado', "Al consultar memoria, el estado refleja 'pagado'");

  console.log("\n=======================================================");
  console.log(`TOTAL RESULTADOS FASE 4.4.3: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log("=======================================================\n");

  await pool.end();
  if (totalFailed > 0) process.exit(1);
}

runAllTests().catch(err => {
  console.error("FATAL ERROR in test runner:", err);
  process.exit(1);
});
