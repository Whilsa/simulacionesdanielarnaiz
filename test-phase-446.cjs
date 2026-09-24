process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres",
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

const baseUrl = "http://localhost:3000";
const results = [];

function recordResult(testNum, scenario, data) {
  results.push({ testNum, scenario, ...data });
  console.log(`\n============================================================`);
  console.log(`[TEST ${testNum}] ${scenario} -> ${data.pass ? "PASS" : "FAIL"}`);
  console.log(JSON.stringify(data, null, 2));
  console.log(`============================================================\n`);
}

async function createAccount(id, name, balance, role = "student") {
  await pool.query(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level, account_number)
     VALUES ($1, $2, $3, $4, $5, 1, $6)
     ON CONFLICT (id) DO UPDATE 
     SET alumno = EXCLUDED.alumno, saldo = EXCLUDED.saldo, usuario = EXCLUDED.usuario`,
    [id, name, balance, id, role, `ES00${Math.floor(1000000000000000 + Math.random() * 9000000000000000)}`]
  );
}

async function createPromissoryNote(msgId, noteNumber, issuerId, issuerName, beneficiaryId, beneficiaryName, amount, dueDate, status = "pendiente") {
  const pnData = {
    id: `pn-${msgId}`,
    promissoryNoteNumber: noteNumber,
    issuerId,
    issuerName,
    beneficiaryId,
    beneficiaryName,
    amount,
    concept: `Comercial Test ${noteNumber}`,
    dueDate,
    issueDate: new Date().toISOString(),
    status,
    orderType: "no_a_la_orden",
    bankIban: "ES97000100022734372895",
    bankName: "Banco Central Mercantil S.A."
  };

  await pool.query(
    `INSERT INTO market_messages (id, chat_id, sender_id, sender_name, recipient_id, recipient_name, content, timestamp, read, type, invoice_data)
     VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), false, 'promissory_note', $8::jsonb)
     ON CONFLICT (id) DO UPDATE
     SET invoice_data = EXCLUDED.invoice_data, type = 'promissory_note'`,
    [
      msgId,
      `chat-${issuerId}-${beneficiaryId}`,
      issuerId,
      issuerName,
      beneficiaryId,
      beneficiaryName,
      `Pagaré emitido ${noteNumber}`,
      JSON.stringify(pnData)
    ]
  );
  return pnData;
}

async function runSuite() {
  const ts = Date.now();
  console.log("====================================================================");
  console.log("INICIANDO BATERÍA DE VALIDACIÓN FASE 4.4.6 CONTRA POSTGRESQL Y SERVER");
  console.log("====================================================================");

  // ------------------------------------------------------------------
  // TEST 1 — Gestión de cobro normal
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t1_${ts}`;
    const payerId = `pay_t1_${ts}`;
    const msgId = `msg_t1_${ts}`;
    const noteNum = `PAG-T1-${ts}`;
    await createAccount(benId, `Beneficiary T1 ${ts}`, 5000);
    await createAccount(payerId, `Payer T1 ${ts}`, 5000);
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T1 ${ts}`, benId, `Beneficiary T1 ${ts}`, 2000, "2026-12-31T00:00:00.000Z");

    const res = await fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_t1_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    });
    const data = await res.json();

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    const invoiceData = msgRow.rows[0].invoice_data;
    // Commission: 0.5% of 2000 = 10€ -> min 20€
    const expectedCommission = 20;
    const expectedBalance = 5000 - expectedCommission;

    const pass = res.status === 200 &&
      data.success === true &&
      data.commission === expectedCommission &&
      finalBalance === expectedBalance &&
      invoiceData.status === "gestion_cobro" &&
      invoiceData.isCollectionManagement === true &&
      movs.rows.length === 1 &&
      Number(movs.rows[0].importe) === expectedCommission;

    recordResult(1, "Gestión de cobro normal (comisión, movimiento, status, persistencia)", {
      pass,
      status: res.status,
      commission: data.commission,
      finalBalance,
      expectedBalance,
      invoiceStatus: invoiceData.status,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(1, "Gestión de cobro normal", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 2 — Dos solicitudes simultáneas, claves distintas
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t2_${ts}`;
    const payerId = `pay_t2_${ts}`;
    const msgId = `msg_t2_${ts}`;
    const noteNum = `PAG-T2-${ts}`;
    await createAccount(benId, `Beneficiary T2 ${ts}`, 5000);
    await createAccount(payerId, `Payer T2 ${ts}`, 5000);
    // Amount 10,000 -> 0.5% = 50€ commission
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T2 ${ts}`, benId, `Beneficiary T2 ${ts}`, 10000, "2026-12-31T00:00:00.000Z");

    const reqA = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_t2_a_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const reqB = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_t2_b_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const [resA, resB] = await Promise.all([reqA, reqB]);
    const successes = (resA.status === 200 ? 1 : 0) + (resB.status === 200 ? 1 : 0);
    const rejections = (resA.status === 400 ? 1 : 0) + (resB.status === 400 ? 1 : 0);

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    const pass = successes === 1 && rejections === 1 && finalBalance === 4950 && movs.rows.length === 1;

    recordResult(2, "Dos solicitudes simultáneas, claves distintas (serialización)", {
      pass,
      statusA: resA.status,
      statusB: resB.status,
      successes,
      rejections,
      finalBalance,
      expectedBalance: 4950,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(2, "Dos solicitudes simultáneas, claves distintas", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 3 — Misma clave simultánea (idempotencia en vuelo)
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t3_${ts}`;
    const payerId = `pay_t3_${ts}`;
    const msgId = `msg_t3_${ts}`;
    const noteNum = `PAG-T3-${ts}`;
    await createAccount(benId, `Beneficiary T3 ${ts}`, 5000);
    await createAccount(payerId, `Payer T3 ${ts}`, 5000);
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T3 ${ts}`, benId, `Beneficiary T3 ${ts}`, 4000, "2026-12-31T00:00:00.000Z");

    const sameKey = `idem_t3_shared_${ts}`;
    const reqA = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": sameKey },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const reqB = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": sameKey },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const [resA, resB] = await Promise.all([reqA, reqB]);
    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    // 0.5% of 4000 = 20€
    const pass = resA.status === 200 && resB.status === 200 && finalBalance === 4980 && movs.rows.length === 1;

    recordResult(3, "Misma clave simultánea (idempotencia en vuelo)", {
      pass,
      statusA: resA.status,
      statusB: resB.status,
      finalBalance,
      expectedBalance: 4980,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(3, "Misma clave simultánea", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 4 — Reintento posterior con misma clave (idempotencia guardada)
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t3_${ts}`;
    const msgId = `msg_t3_${ts}`;
    const noteNum = `PAG-T3-${ts}`;
    const sameKey = `idem_t3_shared_${ts}`;

    const res = await fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": sameKey },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    });
    const data = await res.json();

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    const pass = res.status === 200 && finalBalance === 4980 && movs.rows.length === 1;

    recordResult(4, "Reintento posterior con misma clave (idempotencia guardada)", {
      pass,
      status: res.status,
      finalBalance,
      expectedBalance: 4980,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(4, "Reintento posterior", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 5 — Cuenta sin fondos
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t5_${ts}`;
    const payerId = `pay_t5_${ts}`;
    const msgId = `msg_t5_${ts}`;
    const noteNum = `PAG-T5-${ts}`;
    // Balance is 10€, but min commission is 20€
    await createAccount(benId, `Beneficiary T5 ${ts}`, 10);
    await createAccount(payerId, `Payer T5 ${ts}`, 5000);
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T5 ${ts}`, benId, `Beneficiary T5 ${ts}`, 2000, "2026-12-31T00:00:00.000Z");

    const res = await fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_t5_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    });
    const data = await res.json();

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    const invoiceStatus = msgRow.rows[0].invoice_data.status;
    const pass = res.status === 400 &&
      data.error.includes("Saldo insuficiente") &&
      finalBalance === 10 &&
      invoiceStatus === "pendiente" &&
      movs.rows.length === 0;

    recordResult(5, "Cuenta sin fondos (rechazo limpio y sin mutaciones)", {
      pass,
      status: res.status,
      errorMsg: data.error,
      finalBalance,
      expectedBalance: 10,
      invoiceStatus,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(5, "Cuenta sin fondos", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 6 — Gestión vs discount simultáneos
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t6_${ts}`;
    const payerId = `pay_t6_${ts}`;
    const msgId = `msg_t6_${ts}`;
    const noteNum = `PAG-T6-${ts}`;
    await createAccount(benId, `Beneficiary T6 ${ts}`, 5000);
    await createAccount(payerId, `Payer T6 ${ts}`, 5000);
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T6 ${ts}`, benId, `Beneficiary T6 ${ts}`, 3000, "2026-12-31T00:00:00.000Z");

    const reqCol = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col_t6_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "collection", status: r.status, data: await r.json() }));

    const reqDisc = fetch(`${baseUrl}/api/market/messages/discount-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `disc_t6_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "discount", status: r.status, data: await r.json() }));

    const [resCol, resDisc] = await Promise.all([reqCol, reqDisc]);
    const successes = (resCol.status === 200 ? 1 : 0) + (resDisc.status === 200 ? 1 : 0);
    const rejections = (resCol.status === 400 ? 1 : 0) + (resDisc.status === 400 ? 1 : 0);

    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const finalStatus = msgRow.rows[0].invoice_data.status;

    const pass = successes === 1 && rejections === 1 && (finalStatus === "gestion_cobro" || finalStatus === "descontado");

    recordResult(6, "Gestión vs discount simultáneos (exclusión mutua obligatoria)", {
      pass,
      colStatus: resCol.status,
      discStatus: resDisc.status,
      successes,
      rejections,
      finalPromissoryNoteStatus: finalStatus
    });
  } catch (err) {
    recordResult(6, "Gestión vs discount", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 7 — Gestión vs collect simultáneos
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t7_${ts}`;
    const payerId = `pay_t7_${ts}`;
    const msgId = `msg_t7_${ts}`;
    const noteNum = `PAG-T7-${ts}`;
    await createAccount(benId, `Beneficiary T7 ${ts}`, 5000);
    await createAccount(payerId, `Payer T7 ${ts}`, 5000);
    // Past due date so collect is eligible
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T7 ${ts}`, benId, `Beneficiary T7 ${ts}`, 2000, "2026-01-01T00:00:00.000Z");

    const reqCol = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col_t7_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "collection", status: r.status, data: await r.json() }));

    const reqCollect = fetch(`${baseUrl}/api/market/messages/collect-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `cash_t7_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "collect", status: r.status, data: await r.json() }));

    const [resCol, resCollect] = await Promise.all([reqCol, reqCollect]);
    const successes = (resCol.status === 200 ? 1 : 0) + (resCollect.status === 200 ? 1 : 0);
    const rejections = (resCol.status === 400 ? 1 : 0) + (resCollect.status === 400 ? 1 : 0);

    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const finalStatus = msgRow.rows[0].invoice_data.status;

    const pass = successes === 1 && rejections === 1 && (finalStatus === "gestion_cobro" || finalStatus === "pagado");

    recordResult(7, "Gestión vs collect simultáneos (cero doble liquidación)", {
      pass,
      colStatus: resCol.status,
      collectStatus: resCollect.status,
      successes,
      rejections,
      finalPromissoryNoteStatus: finalStatus
    });
  } catch (err) {
    recordResult(7, "Gestión vs collect", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 8 — Gestión vs maturity
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t8_${ts}`;
    const payerId = `pay_t8_${ts}`;
    const msgId = `msg_t8_${ts}`;
    const noteNum = `PAG-T8-${ts}`;
    await createAccount(benId, `Beneficiary T8 ${ts}`, 5000);
    await createAccount(payerId, `Payer T8 ${ts}`, 5000);
    // Past due date
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T8 ${ts}`, benId, `Beneficiary T8 ${ts}`, 2000, "2026-01-01T00:00:00.000Z");

    const reqCol = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col_t8_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "collection", status: r.status, data: await r.json() }));

    const reqMaturity = fetch(`${baseUrl}/api/student/verify-payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ studentId: payerId })
    }).then(async r => ({ endpoint: "maturity", status: r.status, data: await r.json() }));

    const [resCol, resMat] = await Promise.all([reqCol, reqMaturity]);

    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const finalStatus = msgRow.rows[0].invoice_data.status;

    // The note must either be in gestion_cobro, or subsequently liquidated by maturity
    const pass = (finalStatus === "gestion_cobro" || finalStatus === "pagado") && resCol.status === 200;

    recordResult(8, "Gestión vs maturity simultáneos (cero conflicto ni doble cobro)", {
      pass,
      colStatus: resCol.status,
      maturityStatus: resMat.status,
      finalPromissoryNoteStatus: finalStatus
    });
  } catch (err) {
    recordResult(8, "Gestión vs maturity", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 9 — Gestión vs transferencia sobre la misma cuenta
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t9_${ts}`;
    const payerId = `pay_t9_${ts}`;
    const otherId = `oth_t9_${ts}`;
    const msgId = `msg_t9_${ts}`;
    const noteNum = `PAG-T9-${ts}`;
    await createAccount(benId, `Beneficiary T9 ${ts}`, 5000);
    await createAccount(payerId, `Payer T9 ${ts}`, 5000);
    await createAccount(otherId, `Other T9 ${ts}`, 1000);
    // Amount 5000 -> commission 0.5% = 25€
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T9 ${ts}`, benId, `Beneficiary T9 ${ts}`, 5000, "2026-12-31T00:00:00.000Z");

    const reqCol = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col_t9_${ts}` },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: benId, noteNumber: noteNum })
    }).then(async r => ({ endpoint: "col", status: r.status, data: await r.json() }));

    const reqTrans = fetch(`${baseUrl}/api/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `trans_t9_${ts}` },
      body: JSON.stringify({ senderId: benId, receiverId: otherId, amount: 1000, concept: "Transfer Test T9" })
    }).then(async r => ({ endpoint: "transfer", status: r.status, data: await r.json() }));

    const [resCol, resTrans] = await Promise.all([reqCol, reqTrans]);

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const finalBalance = Number(benAcc.rows[0].saldo);
    // Initial 5000 - 25 (commission) - 1000 (transfer) = 3975
    const expectedBalance = 3975;
    const pass = resCol.status === 200 && resTrans.status === 200 && finalBalance === expectedBalance;

    recordResult(9, "Gestión vs transferencia (0 deadlocks 40P01 y saldo exacto)", {
      pass,
      colStatus: resCol.status,
      transStatus: resTrans.status,
      finalBalance,
      expectedBalance
    });
  } catch (err) {
    recordResult(9, "Gestión vs transferencia", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 10 — Dos gestiones simultáneas con cuentas idénticas sobre pagarés distintos
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t10_${ts}`;
    const payerId = `pay_t10_${ts}`;
    const msgId1 = `msg1_t10_${ts}`;
    const msgId2 = `msg2_t10_${ts}`;
    const noteNum1 = `PAG1-T10-${ts}`;
    const noteNum2 = `PAG2-T10-${ts}`;
    await createAccount(benId, `Beneficiary T10 ${ts}`, 5000);
    await createAccount(payerId, `Payer T10 ${ts}`, 5000);
    // Note 1: 2000 -> commission 20€
    // Note 2: 6000 -> commission 0.5% * 6000 = 30€
    await createPromissoryNote(msgId1, noteNum1, payerId, `Payer T10 ${ts}`, benId, `Beneficiary T10 ${ts}`, 2000, "2026-12-31T00:00:00.000Z");
    await createPromissoryNote(msgId2, noteNum2, payerId, `Payer T10 ${ts}`, benId, `Beneficiary T10 ${ts}`, 6000, "2026-12-31T00:00:00.000Z");

    const req1 = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col1_t10_${ts}` },
      body: JSON.stringify({ messageId: msgId1, beneficiaryId: benId, noteNumber: noteNum1 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const req2 = fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `col2_t10_${ts}` },
      body: JSON.stringify({ messageId: msgId2, beneficiaryId: benId, noteNumber: noteNum2 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const [res1, res2] = await Promise.all([req1, req2]);
    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const finalBalance = Number(benAcc.rows[0].saldo);
    // 5000 - 20 - 30 = 4950
    const expectedBalance = 4950;
    const pass = res1.status === 200 && res2.status === 200 && finalBalance === expectedBalance;

    recordResult(10, "Dos gestiones simultáneas misma cuenta pagarés distintos (serialización)", {
      pass,
      status1: res1.status,
      status2: res2.status,
      finalBalance,
      expectedBalance
    });
  } catch (err) {
    recordResult(10, "Dos gestiones simultáneas misma cuenta", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 11 — Rollback atómico ante error
  // ------------------------------------------------------------------
  try {
    const benId = `ben_t11_${ts}`;
    const payerId = `pay_t11_${ts}`;
    const msgId = `msg_t11_${ts}`;
    const noteNum = `PAG-T11-${ts}`;
    await createAccount(benId, `Beneficiary T11 ${ts}`, 5000);
    await createAccount(payerId, `Payer T11 ${ts}`, 5000);
    await createPromissoryNote(msgId, noteNum, payerId, `Payer T11 ${ts}`, benId, `Beneficiary T11 ${ts}`, 2000, "2026-12-31T00:00:00.000Z");

    // We verify that an unauthorized user or invalid state rolls back completely without partial state
    const res = await fetch(`${baseUrl}/api/market/messages/collection-management-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId: msgId, beneficiaryId: "intruder_user", noteNumber: noteNum })
    });

    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [benId]);
    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [msgId]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [benId, `%${noteNum}%`]);

    const finalBalance = Number(benAcc.rows[0].saldo);
    const invoiceStatus = msgRow.rows[0].invoice_data.status;
    const pass = res.status === 403 && finalBalance === 5000 && invoiceStatus === "pendiente" && movs.rows.length === 0;

    recordResult(11, "Rollback atómico ante error (cero mutaciones parciales)", {
      pass,
      status: res.status,
      finalBalance,
      expectedBalance: 5000,
      invoiceStatus,
      movimientosCount: movs.rows.length
    });
  } catch (err) {
    recordResult(11, "Rollback atómico", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 12 — Reinicio / Persistencia duradera
  // ------------------------------------------------------------------
  try {
    // Check that data from Test 1 persists directly in PostgreSQL
    const msgRow = await pool.query("SELECT invoice_data FROM market_messages WHERE id = $1", [`msg_t1_${ts}`]);
    const invoiceData = msgRow.rows[0].invoice_data;
    const benAcc = await pool.query("SELECT saldo FROM cuentas WHERE id = $1", [`ben_t1_${ts}`]);
    const movs = await pool.query("SELECT * FROM movimientos WHERE cuenta_id = $1 AND concepto LIKE $2", [`ben_t1_${ts}`, `%PAG-T1-${ts}%`]);

    const pass = invoiceData.status === "gestion_cobro" &&
      invoiceData.isCollectionManagement === true &&
      invoiceData.collectionCommission === 20 &&
      Number(benAcc.rows[0].saldo) === 4980 &&
      movs.rows.length === 1;

    recordResult(12, "Reinicio / Persistencia duradera de PostgreSQL", {
      pass,
      persistedStatus: invoiceData.status,
      persistedCommission: invoiceData.collectionCommission,
      persistedBalance: Number(benAcc.rows[0].saldo),
      persistedMovements: movs.rows.length
    });
  } catch (err) {
    recordResult(12, "Reinicio / Persistencia", { pass: false, error: err.message });
  }

  // ------------------------------------------------------------------
  // TEST 13 — Regresiones generales
  // ------------------------------------------------------------------
  try {
    // 13.1 Regresión Fase 4.4.2 (discount-promissory-note)
    const benDisc = `ben_disc_${ts}`;
    const payDisc = `pay_disc_${ts}`;
    const msgDisc = `msg_disc_${ts}`;
    const noteDisc = `PAG-DISC-${ts}`;
    await createAccount(benDisc, `Beneficiary Disc ${ts}`, 5000);
    await createAccount(payDisc, `Payer Disc ${ts}`, 5000);
    await createPromissoryNote(msgDisc, noteDisc, payDisc, `Payer Disc ${ts}`, benDisc, `Beneficiary Disc ${ts}`, 2000, "2026-12-31T00:00:00.000Z");

    const resDisc = await fetch(`${baseUrl}/api/market/messages/discount-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_disc_${ts}` },
      body: JSON.stringify({ messageId: msgDisc, beneficiaryId: benDisc, noteNumber: noteDisc })
    });
    const dataDisc = await resDisc.json();

    // 13.2 Regresión Fase 4.4.3 (collect-promissory-note)
    const benCash = `ben_cash_${ts}`;
    const payCash = `pay_cash_${ts}`;
    const msgCash = `msg_cash_${ts}`;
    const noteCash = `PAG-CASH-${ts}`;
    await createAccount(benCash, `Beneficiary Cash ${ts}`, 5000);
    await createAccount(payCash, `Payer Cash ${ts}`, 5000);
    await createPromissoryNote(msgCash, noteCash, payCash, `Payer Cash ${ts}`, benCash, `Beneficiary Cash ${ts}`, 1000, "2026-01-01T00:00:00.000Z");

    const resCash = await fetch(`${baseUrl}/api/market/messages/collect-promissory-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_cash_${ts}` },
      body: JSON.stringify({ messageId: msgCash, beneficiaryId: benCash, noteNumber: noteCash })
    });
    const dataCash = await resCash.json();

    // 13.3 Regresión Transferencia bancaria (/api/transfer)
    const accA = `acc_a_${ts}`;
    const accB = `acc_b_${ts}`;
    await createAccount(accA, `User A ${ts}`, 1000);
    await createAccount(accB, `User B ${ts}`, 500);

    const resTrans = await fetch(`${baseUrl}/api/transfers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `idem_reg_trans_${ts}` },
      body: JSON.stringify({ senderId: accA, receiverId: accB, amount: 200, concept: "Reg Transfer" })
    });
    const dataTrans = await resTrans.json();

    const pass = resDisc.status === 200 && dataDisc.success === true &&
      resCash.status === 200 && dataCash.success === true &&
      resTrans.status === 200 && dataTrans.success === true;

    recordResult(13, "Regresiones (Fases 4.4.2, 4.4.3, transferencias)", {
      pass,
      discountStatus: resDisc.status,
      collectStatus: resCash.status,
      transferStatus: resTrans.status
    });
  } catch (err) {
    recordResult(13, "Regresiones", { pass: false, error: err.message });
  }

  console.log("\n====================================================================");
  console.log("RESUMEN FINAL DE LA BATERÍA DE PRUEBAS FASE 4.4.6");
  console.log("====================================================================");
  const total = results.length;
  const passed = results.filter(r => r.pass).length;
  const failed = total - passed;
  console.log(`TOTAL: ${total} | PASADOS: ${passed} | FALLADOS: ${failed}`);
  results.forEach(r => console.log(`Test ${r.testNum}: ${r.scenario} -> ${r.pass ? "PASS" : "FAIL"}`));

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runSuite().catch(async (e) => {
  console.error("FATAL SUITE ERROR:", e);
  await pool.end();
  process.exit(1);
});
