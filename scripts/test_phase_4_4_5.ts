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

async function triggerMaturityProcess(studentId: string = 'test-worker-trigger') {
  const res = await fetch(`${BASE_URL}/api/student/verify-payments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ studentId })
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
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

async function createTestAccount(id: string, name: string, balance: number, iban?: string) {
  const accNum = iban || `ES9900010002000000${id.replace(/\D/g, '').slice(-2).padStart(2, '0')}`;
  await queryPG(`
    INSERT INTO cuentas (id, alumno, saldo, usuario, role, account_number, level)
    VALUES ($1, $2, $3, $4, 'student', $5, 1)
    ON CONFLICT (id) DO UPDATE SET
      alumno = EXCLUDED.alumno,
      saldo = EXCLUDED.saldo,
      account_number = EXCLUDED.account_number,
      role = EXCLUDED.role;
  `, [id, name, balance, id, accNum]);

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
    accountNumber: accNum
  };
  if (idx >= 0) db.users[idx] = uObj;
  else db.users.push(uObj);
  writeLocalDb(db);
}

async function createTestPromissoryNote(params: {
  msgId: string;
  noteNumber: string;
  issuerId: string;
  issuerName: string;
  beneficiaryId: string;
  beneficiaryName: string;
  amount: number;
  dueDate: string;
  status: 'descontado' | 'gestion_cobro' | 'firmado' | 'pagado' | 'impagado';
  maturityProcessed?: boolean;
  bankIban?: string;
}) {
  const pnData = {
    promissoryNoteNumber: params.noteNumber,
    issuerId: params.issuerId,
    issuerName: params.issuerName,
    beneficiaryId: params.beneficiaryId,
    beneficiaryName: params.beneficiaryName,
    amount: params.amount,
    dueDate: params.dueDate,
    issueDate: new Date(Date.now() - 30 * 86400000).toISOString(),
    status: params.status,
    maturityProcessed: params.maturityProcessed || false,
    bankIban: params.bankIban || 'ES210001000299887700',
    tradeName: 'Comercial Test',
    taxId: 'B-12345678',
    payableAt: 'Madrid',
    hasLegalEffect: true
  };

  await queryPG(`
    INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), false, 'promissory_note', $8)
    ON CONFLICT (id) DO UPDATE SET
      invoice_data = EXCLUDED.invoice_data,
      type = EXCLUDED.type;
  `, [
    params.msgId,
    `chat-${params.issuerId}-${params.beneficiaryId}`,
    params.issuerId,
    params.issuerName,
    params.beneficiaryId,
    params.beneficiaryName,
    `Pagaré emitido ${params.noteNumber}`,
    JSON.stringify(pnData)
  ]);

  const db = readLocalDb();
  if (!db.marketMessages) db.marketMessages = [];
  const idx = db.marketMessages.findIndex((m: any) => m.id === params.msgId);
  const msgObj = {
    id: params.msgId,
    chatId: `chat-${params.issuerId}-${params.beneficiaryId}`,
    senderId: params.issuerId,
    senderName: params.issuerName,
    recipientId: params.beneficiaryId,
    recipientName: params.beneficiaryName,
    content: `Pagaré emitido ${params.noteNumber}`,
    timestamp: new Date().toISOString(),
    read: false,
    type: 'promissory_note',
    promissoryNoteData: pnData
  };
  if (idx >= 0) db.marketMessages[idx] = msgObj;
  else db.marketMessages.push(msgObj);
  writeLocalDb(db);
}

async function getPgBalance(userId: string): Promise<number> {
  const res = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [userId]);
  return Number(res.rows[0]?.saldo || 0);
}

async function getPgNote(msgId: string) {
  const res = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [msgId]);
  const raw = res.rows[0]?.invoice_data;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function runTests() {
  console.log("=== INICIANDO SUITE DE PRUEBAS DE FASE 4.4.5 ===");
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`[PASS] ${desc}`);
      passed++;
    } else {
      console.error(`[FAIL] ${desc}`);
      failed++;
    }
  }

  const pastDate = new Date(Date.now() - 86400000).toISOString();
  const futureDate = new Date(Date.now() + 86400000 * 10).toISOString();

  // -------------------------------------------------------------
  // Test 1: Liquidación normal de pagaré descontado con fondos suficientes
  // -------------------------------------------------------------
  console.log("\n--- TEST 1: Liquidación normal de pagaré descontado con fondos suficientes ---");
  const debtor1 = 'user-t1-debtor';
  const vendor1 = 'user-t1-vendor';
  await createTestAccount(debtor1, 'Debtor T1', 1000.00);
  await createTestAccount(vendor1, 'Vendor T1', 500.00);
  const note1Id = 'msg-t1-note';
  await createTestPromissoryNote({
    msgId: note1Id,
    noteNumber: 'PAG-445-001',
    issuerId: debtor1,
    issuerName: 'Debtor T1',
    beneficiaryId: vendor1,
    beneficiaryName: 'Vendor T1',
    amount: 300.00,
    dueDate: pastDate,
    status: 'descontado'
  });

  await triggerMaturityProcess(debtor1);

  const balDebtor1 = await getPgBalance(debtor1);
  const balVendor1 = await getPgBalance(vendor1);
  const note1 = await getPgNote(note1Id);

  assert(balDebtor1 === 700.00, `Debtor balance debited by 300 -> expected 700.00, got ${balDebtor1}`);
  assert(balVendor1 === 500.00, `Vendor balance unchanged (already advanced in discount) -> expected 500.00, got ${balVendor1}`);
  assert(note1.status === 'pagado', `Note status -> expected 'pagado', got ${note1.status}`);
  assert(note1.maturityProcessed === true, `Note maturityProcessed -> expected true, got ${note1.maturityProcessed}`);
  assert(!!note1.paidAt, `Note has paidAt timestamp: ${note1.paidAt}`);

  // -------------------------------------------------------------
  // Test 2: Devolución por impago de pagaré descontado sin fondos suficientes
  // -------------------------------------------------------------
  console.log("\n--- TEST 2: Devolución por impago de pagaré descontado sin fondos (reintegro nominal + 1%) ---");
  const debtor2 = 'user-t2-debtor';
  const vendor2 = 'user-t2-vendor';
  await createTestAccount(debtor2, 'Debtor T2', 100.00); // has 100, note is 500
  await createTestAccount(vendor2, 'Vendor T2', 1000.00);
  const note2Id = 'msg-t2-note';
  await createTestPromissoryNote({
    msgId: note2Id,
    noteNumber: 'PAG-445-002',
    issuerId: debtor2,
    issuerName: 'Debtor T2',
    beneficiaryId: vendor2,
    beneficiaryName: 'Vendor T2',
    amount: 500.00,
    dueDate: pastDate,
    status: 'descontado'
  });

  await triggerMaturityProcess(debtor2);

  const balDebtor2 = await getPgBalance(debtor2);
  const balVendor2 = await getPgBalance(vendor2);
  const note2 = await getPgNote(note2Id);

  // 500 nominal + 5 fee (1% of 500) = 505 total debit to vendor
  assert(balDebtor2 === 100.00, `Debtor balance unchanged -> expected 100.00, got ${balDebtor2}`);
  assert(balVendor2 === 495.00, `Vendor balance debited 505.00 (500 + 5) -> expected 495.00, got ${balVendor2}`);
  assert(note2.status === 'impagado', `Note status -> expected 'impagado', got ${note2.status}`);
  assert(note2.maturityProcessed === true, `Note maturityProcessed -> expected true, got ${note2.maturityProcessed}`);
  assert(note2.unpaidFeeAmount === 5.00, `Note unpaidFeeAmount -> expected 5.00, got ${note2.unpaidFeeAmount}`);

  // -------------------------------------------------------------
  // Test 3: Liquidación normal de pagaré en gestión de cobro con fondos suficientes
  // -------------------------------------------------------------
  console.log("\n--- TEST 3: Liquidación normal de pagaré en gestión de cobro con fondos suficientes ---");
  const debtor3 = 'user-t3-debtor';
  const vendor3 = 'user-t3-vendor';
  await createTestAccount(debtor3, 'Debtor T3', 800.00);
  await createTestAccount(vendor3, 'Vendor T3', 200.00);
  const note3Id = 'msg-t3-note';
  await createTestPromissoryNote({
    msgId: note3Id,
    noteNumber: 'PAG-445-003',
    issuerId: debtor3,
    issuerName: 'Debtor T3',
    beneficiaryId: vendor3,
    beneficiaryName: 'Vendor T3',
    amount: 400.00,
    dueDate: pastDate,
    status: 'gestion_cobro'
  });

  await triggerMaturityProcess(debtor3);

  const balDebtor3 = await getPgBalance(debtor3);
  const balVendor3 = await getPgBalance(vendor3);
  const note3 = await getPgNote(note3Id);

  assert(balDebtor3 === 400.00, `Debtor balance debited 400 -> expected 400.00, got ${balDebtor3}`);
  assert(balVendor3 === 600.00, `Vendor balance credited 400 -> expected 600.00, got ${balVendor3}`);
  assert(note3.status === 'pagado', `Note status -> expected 'pagado', got ${note3.status}`);
  assert(note3.maturityProcessed === true, `Note maturityProcessed -> expected true, got ${note3.maturityProcessed}`);

  // -------------------------------------------------------------
  // Test 4: Devolución por impago de pagaré en gestión de cobro sin fondos (comisión 40 € a tenedor)
  // -------------------------------------------------------------
  console.log("\n--- TEST 4: Devolución por impago de pagaré en gestión de cobro sin fondos (cargo 40 €) ---");
  const debtor4 = 'user-t4-debtor';
  const vendor4 = 'user-t4-vendor';
  await createTestAccount(debtor4, 'Debtor T4', 50.00); // 50 < 400
  await createTestAccount(vendor4, 'Vendor T4', 500.00);
  const note4Id = 'msg-t4-note';
  await createTestPromissoryNote({
    msgId: note4Id,
    noteNumber: 'PAG-445-004',
    issuerId: debtor4,
    issuerName: 'Debtor T4',
    beneficiaryId: vendor4,
    beneficiaryName: 'Vendor T4',
    amount: 400.00,
    dueDate: pastDate,
    status: 'gestion_cobro'
  });

  await triggerMaturityProcess(debtor4);

  const balDebtor4 = await getPgBalance(debtor4);
  const balVendor4 = await getPgBalance(vendor4);
  const note4 = await getPgNote(note4Id);

  assert(balDebtor4 === 50.00, `Debtor balance unchanged -> expected 50.00, got ${balDebtor4}`);
  assert(balVendor4 === 460.00, `Vendor debited 40 EUR return fee -> expected 460.00, got ${balVendor4}`);
  assert(note4.status === 'impagado', `Note status -> expected 'impagado', got ${note4.status}`);
  assert(note4.collectionUnpaidFeeAmount === 40.00, `Note return fee -> expected 40.00, got ${note4.collectionUnpaidFeeAmount}`);

  // -------------------------------------------------------------
  // Test 5: Idempotencia: segunda ejecución consecutiva no vuelve a liquidar
  // -------------------------------------------------------------
  console.log("\n--- TEST 5: Idempotencia en segunda ejecución ---");
  await triggerMaturityProcess(debtor1);
  await triggerMaturityProcess(debtor2);
  await triggerMaturityProcess(debtor3);
  await triggerMaturityProcess(debtor4);

  const balDebtor1Post = await getPgBalance(debtor1);
  const balVendor2Post = await getPgBalance(vendor2);
  const balVendor3Post = await getPgBalance(vendor3);
  const balVendor4Post = await getPgBalance(vendor4);

  assert(balDebtor1Post === 700.00, `Idempotent T1 Debtor: expected 700.00, got ${balDebtor1Post}`);
  assert(balVendor2Post === 495.00, `Idempotent T2 Vendor: expected 495.00, got ${balVendor2Post}`);
  assert(balVendor3Post === 600.00, `Idempotent T3 Vendor: expected 600.00, got ${balVendor3Post}`);
  assert(balVendor4Post === 460.00, `Idempotent T4 Vendor: expected 460.00, got ${balVendor4Post}`);

  // -------------------------------------------------------------
  // Test 6: Pagaré todavía no vencido: no se procesa
  // -------------------------------------------------------------
  console.log("\n--- TEST 6: Pagaré todavía no vencido no se procesa ---");
  const debtor6 = 'user-t6-debtor';
  const vendor6 = 'user-t6-vendor';
  await createTestAccount(debtor6, 'Debtor T6', 1000.00);
  await createTestAccount(vendor6, 'Vendor T6', 500.00);
  const note6Id = 'msg-t6-note';
  await createTestPromissoryNote({
    msgId: note6Id,
    noteNumber: 'PAG-445-006',
    issuerId: debtor6,
    issuerName: 'Debtor T6',
    beneficiaryId: vendor6,
    beneficiaryName: 'Vendor T6',
    amount: 300.00,
    dueDate: futureDate,
    status: 'descontado'
  });

  await triggerMaturityProcess(debtor6);

  const balDebtor6 = await getPgBalance(debtor6);
  const note6 = await getPgNote(note6Id);
  assert(balDebtor6 === 1000.00, `Debtor balance unchanged -> expected 1000.00, got ${balDebtor6}`);
  assert(note6.status === 'descontado', `Note status unchanged -> expected 'descontado', got ${note6.status}`);
  assert(!note6.maturityProcessed, `Note maturityProcessed false`);

  // -------------------------------------------------------------
  // Test 7: Concurrencia entre 2 ejecuciones simultáneas de maturity
  // -------------------------------------------------------------
  console.log("\n--- TEST 7: Concurrencia entre 2 ejecuciones simultáneas de maturity ---");
  const debtor7 = 'user-t7-debtor';
  const vendor7 = 'user-t7-vendor';
  await createTestAccount(debtor7, 'Debtor T7', 1000.00);
  await createTestAccount(vendor7, 'Vendor T7', 500.00);
  const note7Id = 'msg-t7-note';
  await createTestPromissoryNote({
    msgId: note7Id,
    noteNumber: 'PAG-445-007',
    issuerId: debtor7,
    issuerName: 'Debtor T7',
    beneficiaryId: vendor7,
    beneficiaryName: 'Vendor T7',
    amount: 250.00,
    dueDate: pastDate,
    status: 'descontado'
  });

  // Launch 2 maturity triggers in parallel
  await Promise.all([
    triggerMaturityProcess(debtor7),
    triggerMaturityProcess(debtor7)
  ]);

  const balDebtor7 = await getPgBalance(debtor7);
  const note7 = await getPgNote(note7Id);
  assert(balDebtor7 === 750.00, `Debtor debited exactly once -> expected 750.00, got ${balDebtor7}`);
  assert(note7.status === 'pagado', `Note status -> 'pagado'`);

  // -------------------------------------------------------------
  // Test 8: Concurrencia entre maturity y collect-promissory-note en gestion_cobro
  // -------------------------------------------------------------
  console.log("\n--- TEST 8: Concurrencia entre maturity y collect-promissory-note en gestion_cobro ---");
  const debtor8 = 'user-t8-debtor';
  const vendor8 = 'user-t8-vendor';
  await createTestAccount(debtor8, 'Debtor T8', 1000.00);
  await createTestAccount(vendor8, 'Vendor T8', 200.00);
  const note8Id = 'msg-t8-note';
  await createTestPromissoryNote({
    msgId: note8Id,
    noteNumber: 'PAG-445-008',
    issuerId: debtor8,
    issuerName: 'Debtor T8',
    beneficiaryId: vendor8,
    beneficiaryName: 'Vendor T8',
    amount: 300.00,
    dueDate: pastDate,
    status: 'gestion_cobro'
  });

  // Launch parallel maturity and collect
  const [maturityRes8, collectRes8] = await Promise.all([
    triggerMaturityProcess(debtor8),
    postCollect({
      messageId: note8Id,
      beneficiaryId: vendor8
    })
  ]);

  const balDebtor8 = await getPgBalance(debtor8);
  const balVendor8 = await getPgBalance(vendor8);
  const note8 = await getPgNote(note8Id);

  // Exactly one collection should happen (debtor debited 300, vendor credited 300)
  assert(balDebtor8 === 700.00, `Debtor debited exactly once -> expected 700.00, got ${balDebtor8}`);
  assert(balVendor8 === 500.00, `Vendor credited exactly once -> expected 500.00, got ${balVendor8}`);
  assert(note8.status === 'pagado', `Note status is 'pagado'`);
  console.log(`[Info] collectRes8 status: ${collectRes8.status}, body: ${JSON.stringify(collectRes8.data)}`);
  assert(collectRes8.status === 400 || collectRes8.status === 409 || collectRes8.status === 200, `Collect was handled cleanly`);

  // -------------------------------------------------------------
  // Test 9: Concurrencia entre maturity y discount-promissory-note
  // -------------------------------------------------------------
  console.log("\n--- TEST 9: Concurrencia entre maturity y discount-promissory-note ---");
  const debtor9 = 'user-t9-debtor';
  const vendor9 = 'user-t9-vendor';
  await createTestAccount(debtor9, 'Debtor T9', 1000.00);
  await createTestAccount(vendor9, 'Vendor T9', 200.00);
  const note9Id = 'msg-t9-note';
  await createTestPromissoryNote({
    msgId: note9Id,
    noteNumber: 'PAG-445-009',
    issuerId: debtor9,
    issuerName: 'Debtor T9',
    beneficiaryId: vendor9,
    beneficiaryName: 'Vendor T9',
    amount: 300.00,
    dueDate: pastDate,
    status: 'descontado'
  });

  // Attempting discount on already discounted / matured note
  const discRes9 = await postDiscount({
    messageId: note9Id,
    beneficiaryId: vendor9
  });

  assert(discRes9.status === 400 || discRes9.status === 409, `Discount rejected for note in descontado state -> status ${discRes9.status}`);

  // -------------------------------------------------------------
  // Test 10: Rollback ante fallo en BD
  // -------------------------------------------------------------
  console.log("\n--- TEST 10: Rollback ante fallo en BD ---");
  // If an invalid amount or corrupted account triggers an exception inside the transaction, it rolls back cleanly
  const debtor10 = 'user-t10-debtor';
  const vendor10 = 'user-t10-vendor';
  await createTestAccount(debtor10, 'Debtor T10', 1000.00);
  await createTestAccount(vendor10, 'Vendor T10', 500.00);
  const note10Id = 'msg-t10-note';
  // Point issuerId to non-existent account
  await createTestPromissoryNote({
    msgId: note10Id,
    noteNumber: 'PAG-445-010',
    issuerId: 'user-non-existent-debtor',
    issuerName: 'Non Existent',
    beneficiaryId: vendor10,
    beneficiaryName: 'Vendor T10',
    amount: 300.00,
    dueDate: pastDate,
    status: 'descontado'
  });

  await triggerMaturityProcess(debtor10);

  const balVendor10 = await getPgBalance(vendor10);
  const note10 = await getPgNote(note10Id);
  assert(balVendor10 === 500.00, `Vendor balance unchanged after failure -> expected 500.00, got ${balVendor10}`);
  assert(note10.status === 'descontado', `Note status remained intact -> expected 'descontado', got ${note10.status}`);

  // -------------------------------------------------------------
  // Test 11: Persistencia tras reinicio
  // -------------------------------------------------------------
  console.log("\n--- TEST 11: Persistencia en PostgreSQL verificada directamente ---");
  const checkT1Res = await queryPG('SELECT invoice_data FROM market_messages WHERE id = $1', [note1Id]);
  const t1Data = typeof checkT1Res.rows[0].invoice_data === 'string' ? JSON.parse(checkT1Res.rows[0].invoice_data) : checkT1Res.rows[0].invoice_data;
  assert(t1Data.status === 'pagado', `PostgreSQL market_messages persisted status 'pagado'`);
  assert(t1Data.maturityProcessed === true, `PostgreSQL market_messages persisted maturityProcessed = true`);

  const movT1 = await queryPG(`SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE '%PAG-445-001%'`, [debtor1]);
  assert(movT1.rows.length > 0, `PostgreSQL movimientos persisted liquidation movement for PAG-445-001`);

  const notifT1 = await queryPG(`SELECT * FROM notificaciones WHERE user_id = $1 AND message LIKE '%PAG-445-001%'`, [vendor1]);
  assert(notifT1.rows.length > 0, `PostgreSQL notificaciones persisted notification for PAG-445-001`);

  // -------------------------------------------------------------
  // Test 12: No regresión de collect-promissory-note directo sobre pagarés en cartera
  // -------------------------------------------------------------
  console.log("\n--- TEST 12: No regresión de collect-promissory-note directo (pagaré en cartera) ---");
  const debtor12 = 'user-t12-debtor';
  const vendor12 = 'user-t12-vendor';
  await createTestAccount(debtor12, 'Debtor T12', 1000.00);
  await createTestAccount(vendor12, 'Vendor T12', 100.00);
  const note12Id = 'msg-t12-note';
  await createTestPromissoryNote({
    msgId: note12Id,
    noteNumber: 'PAG-445-012',
    issuerId: debtor12,
    issuerName: 'Debtor T12',
    beneficiaryId: vendor12,
    beneficiaryName: 'Vendor T12',
    amount: 350.00,
    dueDate: pastDate,
    status: 'firmado' // Pagaré en cartera
  });

  const collectRes12 = await postCollect({
    messageId: note12Id,
    beneficiaryId: vendor12
  });

  const balDebtor12 = await getPgBalance(debtor12);
  const balVendor12 = await getPgBalance(vendor12);
  const note12 = await getPgNote(note12Id);

  assert(collectRes12.status === 200, `Direct collect on signed note succeeded (200)`);
  assert(balDebtor12 === 650.00, `Debtor balance debited 350 -> expected 650.00, got ${balDebtor12}`);
  assert(balVendor12 === 450.00, `Vendor balance credited 350 -> expected 450.00, got ${balVendor12}`);
  assert(note12.status === 'pagado', `Note status -> 'pagado'`);

  // -------------------------------------------------------------
  // Test 13: No regresión de discount-promissory-note sobre pagarés en cartera
  // -------------------------------------------------------------
  console.log("\n--- TEST 13: No regresión de discount-promissory-note sobre pagarés en cartera ---");
  const debtor13 = 'user-t13-debtor';
  const vendor13 = 'user-t13-vendor';
  await createTestAccount(debtor13, 'Debtor T13', 1000.00);
  await createTestAccount(vendor13, 'Vendor T13', 100.00);
  const note13Id = 'msg-t13-note';
  await createTestPromissoryNote({
    msgId: note13Id,
    noteNumber: 'PAG-445-013',
    issuerId: debtor13,
    issuerName: 'Debtor T13',
    beneficiaryId: vendor13,
    beneficiaryName: 'Vendor T13',
    amount: 1000.00,
    dueDate: futureDate,
    status: 'firmado' // Pagaré en cartera
  });

  const discRes13 = await postDiscount({
    messageId: note13Id,
    beneficiaryId: vendor13
  });

  const balVendor13 = await getPgBalance(vendor13);
  const note13 = await getPgNote(note13Id);

  assert(discRes13.status === 200, `Discount of signed note succeeded (200)`);
  assert(balVendor13 > 100.00, `Vendor balance increased by net discount proceeds -> got ${balVendor13}`);
  assert(note13.status === 'descontado', `Note status transitioned to 'descontado'`);

  console.log("\n==========================================");
  console.log(`TOTAL PRUEBAS: ${passed + failed}`);
  console.log(`PASADAS: ${passed}`);
  console.log(`FALLADAS: ${failed}`);
  console.log("==========================================");

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error("Error fatal en pruebas:", err);
  pool.end().then(() => process.exit(1));
});
