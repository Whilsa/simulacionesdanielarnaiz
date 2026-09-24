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

async function postSignPromissoryNote(body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/market/messages/sign-promissory-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postDiscountNote(body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/market/messages/discount-promissory-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postCollectNote(body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/market/messages/collect-promissory-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postCollectionManagementNote(body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/market/messages/collection-management-promissory-note`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
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

async function postDefendantAnswer(id: string, body: any, headers: Record<string, string> = {}) {
  const res = await fetch(`${BASE_URL}/api/court/lawsuits/${id}/defendant-answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
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
      data.claimedInterestCosts || 0,
      data.totalClaimedAmount || data.claimedAmount,
      data.goodsDescription || 'Bienes',
      data.facts || 'Hechos',
      data.legalBasis || 'Fundamentos',
      data.petitum || 'Petitum',
      data.evidenceSummary || 'Pruebas',
      '[]',
      data.status || 'admitida_a_tramite',
      data.answered || false,
      data.promissoryNoteNumber || null,
      data.promissoryNoteId || null,
      data.embargoDate || null,
      data.embargoAmount || null,
      data.embargoTransferId || null
    ]
  );
}

async function runAllTests() {
  console.log('================================================================');
  console.log('FASE 4.4.7.4 — SUITE DE PRUEBAS TRANSACCIONALES SIGN-PROMISSORY-NOTE');
  console.log('================================================================\n');

  // Initial accounts setup
  const userIssuer = 'user-t4-issuer';
  const userBeneficiary = 'user-t4-beneficiary';
  await setupTestUser(userIssuer, 'Empresa Emisora S.L.', 50000.00, 'ES99 0001 0002 0003 0004');
  await setupTestUser(userBeneficiary, 'Proveedor Beneficiario S.A.', 10000.00, 'ES99 0005 0006 0007 0008');

  // =================================================================
  // TEST 1: Firma normal y verificación directa en PostgreSQL
  // =================================================================
  console.log('--- TEST 1: Firma normal y verificación en PostgreSQL ---');
  const futureDueDate = new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString();
  const signRes1 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 3500.00,
    dueDate: futureDueDate,
    concept: 'Suministro industrial Factura F-2026-101',
    orderType: 'a_la_orden',
    issuePlace: 'Valencia',
    bankName: 'Banco Central Mercantil S.A.',
    bankIban: 'ES99 0001 0002 0003 0004'
  });

  assert(signRes1.status === 200, `Respuesta 200 en firma normal (${signRes1.status})`);
  assert(signRes1.data?.success === true, 'Respuesta indica success: true');
  assert(!!signRes1.data?.promissoryNoteNumber, `Número de pagaré generado: ${signRes1.data?.promissoryNoteNumber}`);

  const pnNum1 = signRes1.data?.promissoryNoteNumber;
  const msgId1 = signRes1.data?.message?.id;
  const pnId1 = signRes1.data?.message?.promissoryNoteData?.id;

  // Verificación directa en PostgreSQL
  const pgMsg1 = await queryPG(
    `SELECT id, chat_id, sender_id, recipient_id, content, type, invoice_data
     FROM market_messages
     WHERE id = $1`,
    [msgId1]
  );
  assert(pgMsg1.rows.length === 1, 'Registro persistido en tabla market_messages');
  const row1 = pgMsg1.rows[0];
  assert(row1.type === 'promissory_note', 'Tipo en market_messages es promissory_note');
  assert(row1.sender_id === userIssuer, 'sender_id coincide con el emisor');
  assert(row1.recipient_id === userBeneficiary, 'recipient_id coincide con el beneficiario');

  const pnData1 = row1.invoice_data;
  assert(pnData1?.status === 'pendiente', `Estado inicial es pendiente (${pnData1?.status})`);
  assert(Number(pnData1?.amount) === 3500.00, `Importe nominal en PG es 3500.00 (${pnData1?.amount})`);
  assert(pnData1?.promissoryNoteNumber === pnNum1, `Número en invoice_data coincide (${pnData1?.promissoryNoteNumber})`);
  assert(pnData1?.issuerId === userIssuer, 'issuerId en invoice_data coincide');
  assert(pnData1?.beneficiaryId === userBeneficiary, 'beneficiaryId en invoice_data coincide');
  assert(pnData1?.orderType === 'a_la_orden', 'orderType a_la_orden en invoice_data');

  // Verificación de notificación atómica
  const pgNotif1 = await queryPG(
    `SELECT id, user_id, title, message, type, related_order_id
     FROM notificaciones
     WHERE related_order_id = $1`,
    [pnId1]
  );
  assert(pgNotif1.rows.length === 1, `Notificación generada atómicamente en PostgreSQL para el beneficiario`);
  assert(pgNotif1.rows[0].user_id === userBeneficiary, 'Notificación dirigida al beneficiario');
  assert(pgNotif1.rows[0].title === 'Nuevo pagaré cambiario recibido', 'Título correcto de notificación');

  // =================================================================
  // TEST 2: Misma Idempotency Key Simultánea
  // =================================================================
  console.log('\n--- TEST 2: Misma Idempotency Key Simultánea ---');
  const idemKeyT2 = `idem-sign-${Date.now()}-T2`;
  const [idemResA, idemResB] = await Promise.all([
    postSignPromissoryNote(
      {
        senderId: userIssuer,
        recipientId: userBeneficiary,
        amount: 1200.00,
        dueDate: futureDueDate,
        concept: 'Pedido simultáneo A'
      },
      { 'x-idempotency-key': idemKeyT2 }
    ),
    postSignPromissoryNote(
      {
        senderId: userIssuer,
        recipientId: userBeneficiary,
        amount: 1200.00,
        dueDate: futureDueDate,
        concept: 'Pedido simultáneo B'
      },
      { 'x-idempotency-key': idemKeyT2 }
    )
  ]);

  assert(idemResA.status === 200 && idemResB.status === 200, `Ambas peticiones concurrentes responden 200 (${idemResA.status}, ${idemResB.status})`);
  assert(idemResA.data?.promissoryNoteNumber === idemResB.data?.promissoryNoteNumber, `Mismo número de pagaré en ambas respuestas: ${idemResA.data?.promissoryNoteNumber}`);
  assert(idemResA.data?.message?.id === idemResB.data?.message?.id, `Mismo ID de mensaje: ${idemResA.data?.message?.id}`);

  const countT2 = await queryPG(
    `SELECT COUNT(*) as total FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`,
    [idemResA.data?.promissoryNoteNumber]
  );
  assert(Number(countT2.rows[0].total) === 1, `Exactamente UN solo pagaré persistido en PostgreSQL (${countT2.rows[0].total})`);

  const notifCountT2 = await queryPG(
    `SELECT COUNT(*) as total FROM notificaciones WHERE related_order_id = $1`,
    [idemResA.data?.message?.promissoryNoteData?.id]
  );
  assert(Number(notifCountT2.rows[0].total) === 1, `Exactamente UNA sola notificación generada (${notifCountT2.rows[0].total})`);

  // =================================================================
  // TEST 3: Reintento Posterior con Misma Clave
  // =================================================================
  console.log('\n--- TEST 3: Reintento Posterior con Misma Clave ---');
  const retryRes = await postSignPromissoryNote(
    {
      senderId: userIssuer,
      recipientId: userBeneficiary,
      amount: 1200.00,
      dueDate: futureDueDate,
      concept: 'Reintento posterior'
    },
    { 'x-idempotency-key': idemKeyT2 }
  );

  assert(retryRes.status === 200, `Reintento responde 200 (${retryRes.status})`);
  assert(retryRes.data?.promissoryNoteNumber === idemResA.data?.promissoryNoteNumber, 'Retorna el mismo número de pagaré');
  assert(retryRes.data?.message?.id === idemResA.data?.message?.id, 'Retorna el mismo mensaje');

  const countT3 = await queryPG(
    `SELECT COUNT(*) as total FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`,
    [idemResA.data?.promissoryNoteNumber]
  );
  assert(Number(countT3.rows[0].total) === 1, `Cero pagarés adicionales creados tras reintento (${countT3.rows[0].total})`);

  // =================================================================
  // TEST 4: Dos firmas simultáneas con claves diferentes
  // =================================================================
  console.log('\n--- TEST 4: Dos firmas simultáneas con claves diferentes ---');
  const keyT4A = `idem-t4-a-${Date.now()}`;
  const keyT4B = `idem-t4-b-${Date.now()}`;

  const [diffResA, diffResB] = await Promise.all([
    postSignPromissoryNote(
      {
        senderId: userIssuer,
        recipientId: userBeneficiary,
        amount: 2100.00,
        dueDate: futureDueDate,
        concept: 'Operación Diferente A'
      },
      { 'x-idempotency-key': keyT4A }
    ),
    postSignPromissoryNote(
      {
        senderId: userIssuer,
        recipientId: userBeneficiary,
        amount: 2200.00,
        dueDate: futureDueDate,
        concept: 'Operación Diferente B'
      },
      { 'x-idempotency-key': keyT4B }
    )
  ]);

  assert(diffResA.status === 200 && diffResB.status === 200, 'Ambas operaciones responden 200');
  assert(diffResA.data?.promissoryNoteNumber !== diffResB.data?.promissoryNoteNumber, `Números de pagaré distintos: ${diffResA.data?.promissoryNoteNumber} vs ${diffResB.data?.promissoryNoteNumber}`);
  assert(diffResA.data?.message?.id !== diffResB.data?.message?.id, 'IDs de mensajes distintos');

  const numA = diffResA.data?.promissoryNoteNumber;
  const numB = diffResB.data?.promissoryNoteNumber;
  const pgDiffA = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [numA]);
  const pgDiffB = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [numB]);
  assert(pgDiffA.rows.length === 1 && pgDiffB.rows.length === 1, 'Ambos pagarés existen independientemente en PG');
  assert(Number(pgDiffA.rows[0].invoice_data?.amount) === 2100.00, 'Importe A correcto');
  assert(Number(pgDiffB.rows[0].invoice_data?.amount) === 2200.00, 'Importe B correcto');

  // =================================================================
  // TEST 5: Concurrencia masiva de creación de pagarés
  // =================================================================
  console.log('\n--- TEST 5: Concurrencia masiva de creación de pagarés (8 concurrentes) ---');
  const massivePromises = [];
  for (let i = 1; i <= 8; i++) {
    massivePromises.push(
      postSignPromissoryNote(
        {
          senderId: userIssuer,
          recipientId: userBeneficiary,
          amount: 500.00 + i * 10,
          dueDate: futureDueDate,
          concept: `Lote masivo #${i}`
        },
        { 'x-idempotency-key': `idem-mass-${Date.now()}-${i}` }
      )
    );
  }

  const massiveResults = await Promise.all(massivePromises);
  const allSucceeded = massiveResults.every(r => r.status === 200);
  assert(allSucceeded, 'Todas las 8 peticiones masivas concurrentes devolvieron 200');

  const generatedNumbers = massiveResults.map(r => r.data?.promissoryNoteNumber);
  const uniqueNumbers = new Set(generatedNumbers);
  assert(uniqueNumbers.size === 8, `Cero números duplicados generados (${uniqueNumbers.size} únicos de 8)`);

  const massivePgCheck = await queryPG(
    `SELECT invoice_data->>'promissoryNoteNumber' as num, invoice_data->>'amount' as amt
     FROM market_messages
     WHERE invoice_data->>'promissoryNoteNumber' = ANY($1::text[])`,
    [Array.from(uniqueNumbers)]
  );
  assert(massivePgCheck.rows.length === 8, `Todos los 8 pagarés persistidos fielmente en PostgreSQL (${massivePgCheck.rows.length})`);

  // =================================================================
  // TEST 6: Creación simultánea mientras otro proceso consulta/usa el pagaré
  // =================================================================
  console.log('\n--- TEST 6: Disponibilidad inmediata en PostgreSQL sin ventana de invisibilidad ---');
  const signRes6 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 4000.00,
    dueDate: futureDueDate,
    concept: 'Prueba de visibilidad inmediata'
  });
  assert(signRes6.status === 200, 'Firma responde 200');
  const pnNum6 = signRes6.data?.promissoryNoteNumber;

  // Inmediatamente después del 200, la fila ya debe existir en PG
  const immediatePg = await queryPG(
    `SELECT id, invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`,
    [pnNum6]
  );
  assert(immediatePg.rows.length === 1, `Pagaré ${pnNum6} visible inmediatamente en PostgreSQL`);

  // =================================================================
  // TEST 7: Forzar un rollback durante la creación
  // =================================================================
  console.log('\n--- TEST 7: Forzar fallo y verificar rollback absoluto ---');
  const failRes7 = await postSignPromissoryNote({
    senderId: 'usuario-fantasma-inexistente',
    recipientId: userBeneficiary,
    amount: 1000.00,
    dueDate: futureDueDate
  });
  assert(failRes7.status === 404, `Petición con usuario inexistente rechazada con 404 (${failRes7.status})`);

  const phantomCheck = await queryPG(
    `SELECT COUNT(*) as total FROM market_messages WHERE sender_id = 'usuario-fantasma-inexistente'`
  );
  assert(Number(phantomCheck.rows[0].total) === 0, 'Cero registros creados en market_messages');

  const phantomNotif = await queryPG(
    `SELECT COUNT(*) as total FROM notificaciones WHERE message LIKE '%usuario-fantasma-inexistente%'`
  );
  assert(Number(phantomNotif.rows[0].total) === 0, 'Cero notificaciones huérfanas creadas');

  // =================================================================
  // TEST 8: Reinicio / Relectura y reconstrucción desde PostgreSQL
  // =================================================================
  console.log('\n--- TEST 8: Reinicio y reconstrucción de estado desde PostgreSQL ---');
  const recheckMsg = await queryPG(
    `SELECT id, chat_id, sender_id, recipient_id, content, timestamp, read, type, invoice_data
     FROM market_messages
     WHERE invoice_data->>'promissoryNoteNumber' = $1`,
    [pnNum1]
  );
  assert(recheckMsg.rows.length === 1, `Pagaré original ${pnNum1} recuperado exactamente de PostgreSQL`);
  const pn1Full = recheckMsg.rows[0].invoice_data;
  assert(pn1Full.amount === 3500.00, 'Importe nominal intacto');
  assert(pn1Full.bankName === 'Banco Central Mercantil S.A.', 'Nombre de banco intacto');
  assert(pn1Full.status === 'pendiente', 'Estado sigue siendo pendiente');

  // =================================================================
  // TEST 9: Crear pagaré y ejecutar inmediatamente discount-promissory-note
  // =================================================================
  console.log('\n--- TEST 9: Crear pagaré y ejecutar inmediatamente discount ---');
  const signRes9 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 1000.00,
    dueDate: futureDueDate,
    concept: 'Descuento inmediato test'
  });
  assert(signRes9.status === 200, 'Pagaré emitido con éxito');
  const pnNum9 = signRes9.data?.promissoryNoteNumber;
  const msgId9 = signRes9.data?.message?.id;

  const discountRes9 = await postDiscountNote({
    messageId: msgId9,
    beneficiaryId: userBeneficiary,
    noteNumber: pnNum9
  });
  assert(discountRes9.status === 200, `discount-promissory-note ejecutado con éxito (${discountRes9.status})`);
  assert(discountRes9.data?.success === true, 'Descuento completado');

  const pgDiscountCheck = await queryPG(
    `SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`,
    [pnNum9]
  );
  assert(pgDiscountCheck.rows[0].invoice_data?.status === 'descontado', `Estado actualizado en PG a 'descontado' (${pgDiscountCheck.rows[0].invoice_data?.status})`);
  assert(pgDiscountCheck.rows[0].invoice_data?.isDiscounted === true, 'isDiscounted marcado en invoice_data');

  // =================================================================
  // TEST 10: Crear pagaré y comprobar compatibilidad con judicial sin modificar endpoints
  // =================================================================
  console.log('\n--- TEST 10: Compatibilidad con demandas judiciales y defendant-answer ---');
  const userLawyer = 'user-t4-lawyer';
  await setupTestUser(userLawyer, 'Abogado Test', 1000.00, 'ES99 0009 0010 0011 0012');

  const signRes10 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 2000.00,
    dueDate: futureDueDate,
    concept: 'Pagaré litigioso'
  });
  assert(signRes10.status === 200, 'Pagaré litigioso emitido con éxito');
  const pnNum10 = signRes10.data?.promissoryNoteNumber;

  const lawsuitId10 = `lawsuit-t4-10-${Date.now()}`;
  await setupTestLawsuit({
    id: lawsuitId10,
    caseNumber: `AUTOS-T4-10-${Date.now()}`,
    type: 'cambiaria',
    plaintiffId: userBeneficiary,
    plaintiffName: 'Proveedor Beneficiario S.A.',
    plaintiffIban: 'ES99 0005 0006 0007 0008',
    defendantId: userIssuer,
    defendantName: 'Empresa Emisora S.L.',
    defendantIban: 'ES99 0001 0002 0003 0004',
    claimedAmount: 2000.00,
    promissoryNoteNumber: pnNum10,
    status: 'admitida_a_tramite',
    answered: false
  });

  const answerRes10 = await postDefendantAnswer(lawsuitId10, {
    action: 'contestar',
    answerType: 'cambiaria_paga_ahora',
    defendantId: userIssuer
  });
  assert(answerRes10.status === 200, `defendant-answer cambiaria_paga_ahora exitoso (${answerRes10.status})`);
  assert(answerRes10.data?.success === true, 'Contestación judicial tramitada con éxito');

  const pgLawsuit10 = await queryPG(`SELECT estado FROM demandas_judiciales WHERE id = $1`, [lawsuitId10]);
  assert(pgLawsuit10.rows[0].estado === 'allanada_pagada', `Demanda actualizada a allanada_pagada (${pgLawsuit10.rows[0].estado})`);

  const pgNote10 = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [pnNum10]);
  assert(pgNote10.rows[0].invoice_data?.status === 'pagado', `Pagaré actualizado a pagado tras allanamiento cambiario`);

  // =================================================================
  // TEST 11: Regresión de discount
  // =================================================================
  console.log('\n--- TEST 11: Regresión de discount-promissory-note ---');
  const signRes11 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 5000.00,
    dueDate: futureDueDate,
    concept: 'Regresión discount'
  });
  assert(signRes11.status === 200, 'Pagaré para regresión discount firmado');
  const pnNum11 = signRes11.data?.promissoryNoteNumber;
  const msgId11 = signRes11.data?.message?.id;

  const benBefore = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [userBeneficiary]);
  const balBefore = Number(benBefore.rows[0].saldo);

  const discountRes11 = await postDiscountNote({
    messageId: msgId11,
    beneficiaryId: userBeneficiary,
    noteNumber: pnNum11
  });
  assert(discountRes11.status === 200, 'Discount ejecutado');
  const netReceived = discountRes11.data?.calculation?.netAmount;
  assert(netReceived > 0 && netReceived < 5000.00, `Cálculo de líquido recibido correcto: ${netReceived} €`);

  const benAfter = await queryPG(`SELECT saldo FROM cuentas WHERE id = $1`, [userBeneficiary]);
  const balAfter = Number(benAfter.rows[0].saldo);
  assert(Math.abs((balAfter - balBefore) - netReceived) < 0.05, `Saldo del beneficiario acreditado con el líquido neto (+${netReceived} €)`);

  // =================================================================
  // TEST 12: Regresión de collect
  // =================================================================
  console.log('\n--- TEST 12: Regresión de collect-promissory-note ---');
  const collectDueDate = new Date(Date.now() - 1000).toISOString();
  const signRes12 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 1500.00,
    dueDate: collectDueDate,
    concept: 'Regresión collect'
  });
  assert(signRes12.status === 200, 'Pagaré para collect firmado');
  const pnNum12 = signRes12.data?.promissoryNoteNumber;
  const msgId12 = signRes12.data?.message?.id;

  const collectRes12 = await postCollectNote({
    messageId: msgId12,
    beneficiaryId: userBeneficiary,
    noteNumber: pnNum12
  });
  assert(collectRes12.status === 200, `collect-promissory-note ejecutado con éxito (${collectRes12.status})`);
  const pgCollectCheck = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [pnNum12]);
  assert(pgCollectCheck.rows[0].invoice_data?.status === 'pagado', `Pagaré marcado como pagado tras cobro manual`);

  // =================================================================
  // TEST 13: Regresión de maturity (processDiscountedPromissoryNotesMaturityPG)
  // =================================================================
  console.log('\n--- TEST 13: Regresión de maturity con fecha vencida ---');
  const pastDueDate = new Date(Date.now() - 5 * 24 * 3600 * 1000).toISOString();
  const signRes13 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 800.00,
    dueDate: pastDueDate,
    concept: 'Pagaré a vencimiento'
  });
  assert(signRes13.status === 200, 'Pagaré vencido emitido');
  const pnNum13 = signRes13.data?.promissoryNoteNumber;
  const msgId13 = signRes13.data?.message?.id;

  // Realizamos descuento para ponerlo en estado 'descontado'
  await postDiscountNote({
    messageId: msgId13,
    beneficiaryId: userBeneficiary,
    noteNumber: pnNum13
  });

  // Disparamos la liquidación al vencimiento
  const maturityRes = await triggerMaturityProcess(userIssuer);
  assert(maturityRes.status === 200, `Proceso de vencimientos automáticos disparado (${maturityRes.status})`);

  const pgMaturityNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [pnNum13]);
  assert(pgMaturityNote.rows[0].invoice_data?.status === 'pagado', `Pagaré descontado liquidado al vencimiento como 'pagado'`);
  assert(pgMaturityNote.rows[0].invoice_data?.maturityProcessed === true, 'maturityProcessed registrado como true');

  // =================================================================
  // TEST 14: Regresión de collection-management
  // =================================================================
  console.log('\n--- TEST 14: Regresión de collection-management-promissory-note ---');
  const signRes14 = await postSignPromissoryNote({
    senderId: userIssuer,
    recipientId: userBeneficiary,
    amount: 6000.00,
    dueDate: futureDueDate,
    concept: 'Regresión gestión de cobro'
  });
  assert(signRes14.status === 200, 'Pagaré para gestión de cobro firmado');
  const pnNum14 = signRes14.data?.promissoryNoteNumber;
  const msgId14 = signRes14.data?.message?.id;

  const collMgmtRes = await postCollectionManagementNote({
    messageId: msgId14,
    beneficiaryId: userBeneficiary,
    noteNumber: pnNum14
  });
  assert(collMgmtRes.status === 200, `collection-management ejecutado con éxito (${collMgmtRes.status})`);
  const pgCollNote = await queryPG(`SELECT invoice_data FROM market_messages WHERE invoice_data->>'promissoryNoteNumber' = $1`, [pnNum14]);
  assert(pgCollNote.rows[0].invoice_data?.status === 'gestion_cobro', `Estado actualizado a 'gestion_cobro' en PG`);
  assert(pgCollNote.rows[0].invoice_data?.isCollectionManagement === true, 'isCollectionManagement registrado');

  // =================================================================
  // TEST 15: Regresión de judge-ruling + defendant-answer
  // =================================================================
  console.log('\n--- TEST 15: Regresión de judge-ruling tras contestación ordinaria ---');
  const lawsuitId15 = `lawsuit-t4-ruling-${Date.now()}`;
  await setupTestLawsuit({
    id: lawsuitId15,
    caseNumber: `AUTOS-T4-15-${Date.now()}`,
    type: 'ordinaria',
    plaintiffId: userBeneficiary,
    plaintiffName: 'Proveedor Beneficiario S.A.',
    plaintiffIban: 'ES99 0005 0006 0007 0008',
    defendantId: userIssuer,
    defendantName: 'Empresa Emisora S.L.',
    defendantIban: 'ES99 0001 0002 0003 0004',
    claimedAmount: 3000.00,
    status: 'admitida_a_tramite',
    answered: false
  });

  // 1. Contestación con cobro de letrado
  const ansRes15 = await postDefendantAnswer(lawsuitId15, {
    action: 'contestar',
    answerType: 'ordinaria_contestacion',
    defendantId: userIssuer,
    facts: 'Oposición por defectos de cumplimiento'
  });
  assert(ansRes15.status === 200, `Contestación ordinaria admitida (${ansRes15.status})`);

  // 2. Sentencia judicial estimatoria
  const rulingRes15 = await postJudgeRuling(lawsuitId15, {
    ruling: 'estimatoria',
    notes: 'Sentencia judicial firme estimatoria'
  });
  assert(rulingRes15.status === 200, `judge-ruling estimatoria resuelta con éxito (${rulingRes15.status})`);

  const pgLawsuit15 = await queryPG(`SELECT estado FROM demandas_judiciales WHERE id = $1`, [lawsuitId15]);
  assert(pgLawsuit15.rows[0].estado === 'ejecutada', `Estado final de la demanda es 'ejecutada' tras sentencia estimatoria (${pgLawsuit15.rows[0].estado})`);

  console.log('\n================================================================');
  console.log(`RESULTADOS: ${passed} PASADAS | ${failed} FALLADAS`);
  console.log('================================================================\n');

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch((err) => {
  console.error('Error fatal ejecutando suite:', err);
  pool.end();
  process.exit(1);
});
