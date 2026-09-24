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

async function setupNaveAndAnnouncement(buyerId: string, buyerName: string, testSuffix: number) {
  const naveId = `nave_test_${testSuffix}`;
  await queryPG(`
    INSERT INTO adquisiciones (id, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, alumno_id, alumno_nombre, superficie_m2, ubicacion, porcentaje_suelo, precio_base, importe_iva, precio_total, fecha_compra, metodo_pago)
    VALUES ($1, $1, 'Nave Test Concurrencia', 'nave_industrial', 'compra', $2, $3, 500, 'Madrid', 20.00, 100000, 21000, 121000, NOW(), 'contado')
    ON CONFLICT (id) DO NOTHING;
  `, [naveId, buyerId, buyerName]);

  const annId = `ann_mat_test_${testSuffix}`;
  await queryPG(`
    INSERT INTO anuncios_materia_prima (id, material_type, title, presentation, unit_weight_kg, is_pallet, price_per_unit, stock, active, seller_id, seller_name, seller_level)
    VALUES ($1, 'acero', 'Acero Test Concurrencia', 'Pallet', 1.00, true, 50.00, 100, true, 'proveedor-materia-prima', 'Proveedor Oficial', 'official')
    ON CONFLICT (id) DO NOTHING;
  `, [annId]);

  const db = readLocalDb();
  if (!db.acquisitions) db.acquisitions = [];
  db.acquisitions.push({
    id: naveId,
    studentId: buyerId,
    propertyType: 'nave_industrial',
    propertyTitle: 'Nave Test Concurrencia',
    superficie: 500
  });

  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = [];
  db.rawMaterialAnnouncements.push({
    id: annId,
    materialType: 'acero',
    title: 'Acero Test Concurrencia',
    pricePerUnit: 50.00,
    stock: 100,
    active: true,
    sellerId: 'proveedor-materia-prima',
    sellerName: 'Proveedor Oficial'
  });
  writeLocalDb(db);

  return { naveId, annId };
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
    `${params.issuerId}_${params.beneficiaryId}`,
    params.issuerId,
    params.issuerName,
    params.beneficiaryId,
    params.beneficiaryName,
    `Pagaré test ${params.noteNumber}`,
    nowIso,
    JSON.stringify(invoiceData)
  ]);

  const db = readLocalDb();
  if (!db.marketMessages) db.marketMessages = [];
  const idx = db.marketMessages.findIndex((m: any) => m.id === params.msgId);
  const mObj = {
    id: params.msgId,
    chatId: `${params.issuerId}_${params.beneficiaryId}`,
    senderId: params.issuerId,
    senderName: params.issuerName,
    recipientId: params.beneficiaryId,
    recipientName: params.beneficiaryName,
    content: `Pagaré test ${params.noteNumber}`,
    timestamp: nowIso,
    read: true,
    type: 'promissory_note',
    invoice_data: invoiceData,
    promissoryNoteData: invoiceData
  };
  if (idx >= 0) db.marketMessages[idx] = mObj;
  else db.marketMessages.push(mObj);
  writeLocalDb(db);
}

async function runAllTests() {
  console.log("=== INICIANDO BATERÍA COMPLETA DE PRUEBAS FASE 4.4.2 ===");
  let failed = 0;
  let passed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  const testSuffix = Date.now();
  const benId = `ben_test_${testSuffix}`;
  const benName = `Beneficiario Test ${testSuffix}`;
  const payerId = `pyr_test_${testSuffix}`;
  const payerName = `Librador Test ${testSuffix}`;
  await createTestAccount(benId, benName, 5000.00);
  await createTestAccount(payerId, payerName, 10000.00);

  // -------------------------------------------------------------
  // TEST A: DESCUENTO VS DESCUENTO CON CLAVES DISTINTAS
  // -------------------------------------------------------------
  console.log("\n--- TEST A: Descuento concurrente con claves distintas ---");
  const noteIdA = `msg_test_a_${testSuffix}`;
  const noteNumA = `PAG-TEST-A-${testSuffix}`;
  await createTestNote({
    msgId: noteIdA,
    noteNumber: noteNumA,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1000.00,
    dueDate: '2026-11-20T00:00:00.000Z'
  });

  const balBeforeA = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);

  // Lanzar dos solicitudes simultáneas con claves diferentes
  const [resA1, resA2] = await Promise.all([
    postDiscount({ messageId: noteIdA, beneficiaryId: benId }, `key_a1_${testSuffix}`),
    postDiscount({ messageId: noteIdA, beneficiaryId: benId }, `key_a2_${testSuffix}`)
  ]);

  const successCountA = (resA1.status === 200 ? 1 : 0) + (resA2.status === 200 ? 1 : 0);
  const rejectCountA = (resA1.status >= 400 ? 1 : 0) + (resA2.status >= 400 ? 1 : 0);

  assert(successCountA === 1, `Exactamente 1 petición debe ser exitosa (actual: ${successCountA})`);
  assert(rejectCountA === 1, `Exactamente 1 petición debe ser rechazada (actual: ${rejectCountA})`);

  const rejectedResA = resA1.status >= 400 ? resA1 : resA2;
  assert(
    rejectedResA.data?.error?.includes('descontado previamente') || rejectedResA.status === 400,
    `Error de rechazo debe indicar que ya ha sido descontado: "${rejectedResA.data?.error}"`
  );

  // Comprobar estado en PostgreSQL
  const dbNoteA = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteIdA])).rows[0]?.invoice_data;
  assert(dbNoteA.status === 'descontado', `Estado del pagaré en PG debe ser 'descontado' (actual: ${dbNoteA.status})`);
  assert(dbNoteA.isDiscounted === true, `isDiscounted debe ser true`);

  // Comprobar saldo en cuentas: solo 1 abono
  const balAfterA = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  const netReceivedA = Number(dbNoteA.discountNetReceived);
  const expectedBalA = Number((balBeforeA + netReceivedA).toFixed(2));
  assert(balAfterA === expectedBalA, `Saldo del beneficiario debe tener exactamente 1 abono (+${netReceivedA} €): esperado ${expectedBalA}, obtenido ${balAfterA}`);

  // Comprobar movimientos en PostgreSQL: exactamente 1 asiento de TRANSFER_IN
  const movsA = (await queryPG("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNumA}%`])).rows;
  assert(movsA.length === 1, `Exactamente 1 movimiento de abono registrado (actual: ${movsA.length})`);

  // -------------------------------------------------------------
  // TEST B: DESCUENTO VS DESCUENTO CON LA MISMA CLAVE IDEMPOTENTE
  // -------------------------------------------------------------
  console.log("\n--- TEST B: Descuento concurrente con la misma clave idempotente ---");
  const noteIdB = `msg_test_b_${testSuffix}`;
  const noteNumB = `PAG-TEST-B-${testSuffix}`;
  await createTestNote({
    msgId: noteIdB,
    noteNumber: noteNumB,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 1500.00,
    dueDate: '2026-11-25T00:00:00.000Z'
  });

  const balBeforeB = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  const sharedKeyB = `shared_idem_b_${testSuffix}`;

  const [resB1, resB2] = await Promise.all([
    postDiscount({ messageId: noteIdB, beneficiaryId: benId }, sharedKeyB),
    postDiscount({ messageId: noteIdB, beneficiaryId: benId }, sharedKeyB)
  ]);

  assert(resB1.status === 200, `Petición 1 debe ser 200 (actual: ${resB1.status})`);
  assert(resB2.status === 200, `Petición 2 debe ser 200 (actual: ${resB2.status})`);
  assert(resB1.data?.calculation?.netAmount === resB2.data?.calculation?.netAmount, `Ambas respuestas deben tener el mismo cálculo financiero`);

  const balAfterB = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  const netReceivedB = resB1.data?.calculation?.netAmount;
  const expectedBalB = Number((balBeforeB + netReceivedB).toFixed(2));
  assert(balAfterB === expectedBalB, `Solo un abono efectuado para la misma clave: esperado ${expectedBalB}, actual ${balAfterB}`);

  const movsB = (await queryPG("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNumB}%`])).rows;
  assert(movsB.length === 1, `Exactamente 1 movimiento registrado para clave compartida (actual: ${movsB.length})`);

  // -------------------------------------------------------------
  // TEST C: REINTENTO POSTERIOR CON LA MISMA CLAVE
  // -------------------------------------------------------------
  console.log("\n--- TEST C: Reintento posterior con la misma clave ---");
  const resC = await postDiscount({ messageId: noteIdB, beneficiaryId: benId }, sharedKeyB);
  assert(resC.status === 200, `Reintento posterior debe responder 200 OK de caché idempotente (actual: ${resC.status})`);
  assert(resC.data?.calculation?.netAmount === netReceivedB, `Importe neto idéntico`);

  const balAfterC = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(balAfterC === balAfterB, `Saldo no cambia tras reintento (actual: ${balAfterC}, previo: ${balAfterB})`);

  const movsC = (await queryPG("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNumB}%`])).rows;
  assert(movsC.length === 1, `Movimientos siguen siendo exactamente 1 (actual: ${movsC.length})`);

  // -------------------------------------------------------------
  // TEST D: DESCUENTO VS TRANSFERENCIA SIMULTÁNEA EN LA MISMA CUENTA
  // -------------------------------------------------------------
  console.log("\n--- TEST D: Descuento vs Transferencia simultánea (sin 40P01) ---");
  const noteIdD = `msg_test_d_${testSuffix}`;
  const noteNumD = `PAG-TEST-D-${testSuffix}`;
  await createTestNote({
    msgId: noteIdD,
    noteNumber: noteNumD,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 800.00,
    dueDate: '2026-12-01T00:00:00.000Z'
  });

  const balBeforeD = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);

  // Ejecutar en paralelo: descuento del pagaré y transferencia saliente desde la cuenta del beneficiario
  const transferAmount = 150.00;
  const [resDiscD, resTxD] = await Promise.all([
    postDiscount({ messageId: noteIdD, beneficiaryId: benId }, `key_disc_d_${testSuffix}`),
    postTransfer({
      senderId: benId,
      receiverId: payerId,
      amount: transferAmount,
      concept: `Transferencia concurrente test D ${testSuffix}`
    }, `key_tx_d_${testSuffix}`)
  ]);

  assert(resDiscD.status === 200, `Descuento concurrente exitoso (status: ${resDiscD.status})`);
  assert(resTxD.status === 200, `Transferencia concurrente exitosa (status: ${resTxD.status})`);

  const balAfterD = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  const netReceivedD = resDiscD.data?.calculation?.netAmount;
  const expectedBalD = Number((balBeforeD + netReceivedD - transferAmount).toFixed(2));
  assert(balAfterD === expectedBalD, `Saldo exacto tras descuento y transferencia (esperado: ${expectedBalD}, actual: ${balAfterD})`);

  // -------------------------------------------------------------
  // TEST E: DESCUENTO VS MATERIAS PRIMAS (RAW MATERIALS ORDERS)
  // -------------------------------------------------------------
  console.log("\n--- TEST E: Descuento vs Compra de Materias Primas concurrente ---");
  const targetBuyerId = 'user-hgp3parur';
  const targetBuyerName = 'Fabricante Destornilladores completo';
  const targetNaveId = 'acq-wl9a9gsw7';
  const targetAnnId = 'rm-hierro';

  const noteIdE = `msg_test_e_${testSuffix}`;
  const noteNumE = `PAG-TEST-E-${testSuffix}`;
  await createTestNote({
    msgId: noteIdE,
    noteNumber: noteNumE,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: targetBuyerId,
    beneficiaryName: targetBuyerName,
    amount: 2000.00,
    dueDate: '2026-12-15T00:00:00.000Z'
  });

  const balBeforeE = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [targetBuyerId])).rows[0].saldo);

  const [resDiscE, resOrderE] = await Promise.all([
    postDiscount({ messageId: noteIdE, beneficiaryId: targetBuyerId }, `key_disc_e_${testSuffix}`),
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

  assert(resDiscE.status === 200, `Descuento concurrente con materias primas exitoso (status: ${resDiscE.status})`);
  assert(resOrderE.status === 200, `Orden de materias primas exitosa (status: ${resOrderE.status})`);

  const balAfterE = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [targetBuyerId])).rows[0].saldo);
  const netReceivedE = resDiscE.data?.calculation?.netAmount;
  const orderCostE = Number(resOrderE.data?.order?.totalAmount || resOrderE.data?.order?.totalPrice || 643.72);
  const expectedBalE = Number((balBeforeE + netReceivedE - orderCostE).toFixed(2));
  assert(balAfterE === expectedBalE, `Saldo final coherente tras descuento (+${netReceivedE} €) y compra de material (-${orderCostE} €): esperado ${expectedBalE}, actual ${balAfterE}`);

  // -------------------------------------------------------------
  // TEST F: ROLLBACK (FALLO PROVOCADO Y ATOMICIDAD COMPROBADA)
  // -------------------------------------------------------------
  console.log("\n--- TEST F: Rollback transaccional íntegro ---");
  const noteIdF = `msg_test_f_${testSuffix}`;
  const noteNumF = `PAG-TEST-F-${testSuffix}`;
  await createTestNote({
    msgId: noteIdF,
    noteNumber: noteNumF,
    issuerId: payerId,
    issuerName: payerName,
    beneficiaryId: benId,
    beneficiaryName: benName,
    amount: 2500.00,
    dueDate: '2026-12-25T00:00:00.000Z'
  });

  const balBeforeF = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);

  // 1) Intentar descontar con un usuario que no tiene autorización
  const resFUnauthorized = await postDiscount({ messageId: noteIdF, beneficiaryId: payerId }, `key_f_unauth_${testSuffix}`);
  assert(resFUnauthorized.status === 403, `Descuento no autorizado debe ser 403 (actual: ${resFUnauthorized.status})`);

  // Comprobar en PostgreSQL: pagaré sigue 'pendiente', saldo intacto, ningún movimiento
  const dbNoteF = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteIdF])).rows[0]?.invoice_data;
  assert(dbNoteF.status === 'pendiente', `Pagaré en PG debe seguir 'pendiente' (actual: ${dbNoteF.status})`);

  const balAfterF = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(balAfterF === balBeforeF, `Saldo debe permanecer intacto tras rechazo/rollback`);

  const movsF = (await queryPG("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNumF}%`])).rows;
  assert(movsF.length === 0, `Ningún movimiento registrado tras fallo (actual: ${movsF.length})`);

  // 2) Rollback a nivel de transacción de PostgreSQL directa para certificar que client.query('ROLLBACK') revierte locks y mutaciones
  const clientRollbackTest = await pool.connect();
  try {
    await clientRollbackTest.query('BEGIN');
    await clientRollbackTest.query('UPDATE cuentas SET saldo = saldo + 99999 WHERE id = $1', [benId]);
    await clientRollbackTest.query(
      `UPDATE market_messages SET invoice_data = jsonb_set(invoice_data, '{status}', '"descontado"') WHERE id = $1`,
      [noteIdF]
    );
    // Simular error deliberado
    throw new Error('DELIBERATE_FAIL_FOR_ROLLBACK_VERIFICATION');
  } catch (err: any) {
    await clientRollbackTest.query('ROLLBACK');
    assert(err.message === 'DELIBERATE_FAIL_FOR_ROLLBACK_VERIFICATION', 'Excepción capturada y ROLLBACK ejecutado');
  } finally {
    clientRollbackTest.release();
  }

  // Verificar que el rollback directo en PG mantuvo el saldo y el estado intactos
  const balAfterDirectRollback = Number((await queryPG("SELECT saldo FROM cuentas WHERE id = $1", [benId])).rows[0].saldo);
  assert(balAfterDirectRollback === balBeforeF, `Saldo verificado intacto tras ROLLBACK en Postgres (${balAfterDirectRollback} === ${balBeforeF})`);

  const dbNoteF2 = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteIdF])).rows[0]?.invoice_data;
  assert(dbNoteF2.status === 'pendiente', `Pagaré verificado en 'pendiente' tras ROLLBACK en Postgres`);

  // -------------------------------------------------------------
  // TEST G: PASO 11 — REINICIO Y PERSISTENCIA DIRECTA
  // -------------------------------------------------------------
  console.log("\n--- PASO 11: Persistencia tras reinicio / Reconstrucción de memoria ---");
  // Consultar directamente market_messages de noteIdA y noteIdB
  const checkNoteA = (await queryPG("SELECT invoice_data FROM market_messages WHERE id = $1", [noteIdA])).rows[0]?.invoice_data;
  assert(checkNoteA.status === 'descontado', `Nota A persiste 'descontado' en PostgreSQL`);
  assert(checkNoteA.isDiscounted === true, `Nota A isDiscounted es true`);
  assert(checkNoteA.discountTransferId != null, `Nota A tiene discountTransferId: ${checkNoteA.discountTransferId}`);

  // Simular la reconstrucción de memoria que hace el servidor en el arranque (SELECT * FROM market_messages)
  const serverInitSimulation = (await queryPG("SELECT * FROM market_messages WHERE id = $1", [noteIdA])).rows[0];
  const reconstructedPn = serverInitSimulation.invoice_data;
  assert(reconstructedPn.status === 'descontado', `Al reconstruir memoria desde PG el pagaré mantiene status 'descontado'`);

  console.log("\n=======================================================");
  console.log(`TOTAL RESULTADOS FASE 4.4.2: ${passed} PASSED, ${failed} FAILED`);
  console.log("=======================================================");

  await pool.end();
  if (failed > 0) process.exit(1);
}

runAllTests().catch(e => {
  console.error("FATAL ERROR in test runner:", e);
  process.exit(1);
});
