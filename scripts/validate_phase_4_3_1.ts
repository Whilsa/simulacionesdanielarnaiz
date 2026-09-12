import pg from 'pg';
import fs from 'fs';
import path from 'path';

const DB_URL = "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const BASE_URL = "http://localhost:3000";
const DB_FILE = path.join(process.cwd(), 'db.json');

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

function readLocalDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeLocalDb(db: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Synchronizes both PostgreSQL and db.json to guarantee identical baseline state
async function resetUserState(studentId: string, balance: number, stockKg: number, naveStocks: Record<string, number>) {
  // 1. PostgreSQL updates
  await pool.query(`UPDATE cuentas SET saldo = $1 WHERE id = $2`, [balance, studentId]);
  await pool.query(`
    INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, pellets_plastico_kg, desglose_almacenes)
    VALUES ($1, $2, $3, $4::jsonb)
    ON CONFLICT (alumno_id) DO UPDATE SET pellets_plastico_kg = $3, desglose_almacenes = $4::jsonb
  `, [studentId, studentId, stockKg, JSON.stringify(Object.fromEntries(Object.entries(naveStocks).map(([k, v]) => [k, { plasticKg: v }])))]);

  // 2. db.json updates (keeps cache consistent)
  const db = readLocalDb();
  let user = (db.users || []).find((u: any) => u.id === studentId);
  if (user) user.balance = balance;

  if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
  let inv = db.rawMaterialInventories.find((i: any) => i.studentId === studentId);
  const navesObj: Record<string, any> = {};
  for (const [nId, q] of Object.entries(naveStocks)) {
    navesObj[nId] = { plasticKg: q };
  }
  if (!inv) {
    db.rawMaterialInventories.push({
      studentId,
      plasticKg: stockKg,
      ironKg: 0,
      metalKg: 0,
      epoxiKg: 0,
      naveInventories: navesObj
    });
  } else {
    inv.plasticKg = stockKg;
    inv.naveInventories = navesObj;
  }
  writeLocalDb(db);
}

async function setupTestData() {
  console.log('--- Configurando usuarios y almacenes de prueba aislados ---');
  
  // Clean previous test records from PostgreSQL
  await pool.query(`DELETE FROM materias_primas_pedidos WHERE alumno_id LIKE 'test_user_%' OR seller_id LIKE 'test_user_%'`);
  await pool.query(`DELETE FROM movimientos WHERE sender_id LIKE 'test_user_%' OR receiver_id LIKE 'test_user_%' OR cuenta_id LIKE 'test_user_%'`);
  await pool.query(`DELETE FROM materias_primas_inventario WHERE alumno_id LIKE 'test_user_%'`);
  await pool.query(`DELETE FROM vehiculos_comprados WHERE alumno_id LIKE 'test_user_%'`);
  await pool.query(`DELETE FROM operaciones_idempotencia WHERE clave LIKE 'test_%' OR clave LIKE 'transfer_%' OR clave LIKE 'p%_%' OR clave LIKE 'idem_%' OR clave LIKE 'cross_%'`);
  await pool.query(`DELETE FROM cuentas WHERE id LIKE 'test_user_%'`);

  const users = [
    { id: 'test_user_a', name: 'Estudiante Test A', balance: 5000, iban: 'ES990001000100010001' },
    { id: 'test_user_b', name: 'Estudiante Test B', balance: 5000, iban: 'ES990002000200020002' },
    { id: 'test_user_c', name: 'Estudiante Test C', balance: 5000, iban: 'ES990003000300030003' },
    { id: 'test_user_d', name: 'Estudiante Test D', balance: 5000, iban: 'ES990004000400040004' }
  ];

  for (const u of users) {
    await pool.query(`
      INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
      VALUES ($1, $2, $3, $4, '1234', $5, 'student', 1)
      ON CONFLICT (id) DO UPDATE SET saldo = EXCLUDED.saldo, alumno = EXCLUDED.alumno
    `, [u.id, u.name, u.balance, u.id, u.iban]);
  }

  const naves = ['test_nave_a1', 'test_nave_a2', 'test_nave_a3', 'test_nave_b1', 'test_nave_c1', 'test_nave_d1'];
  for (const n of naves) {
    const studentId = n.startsWith('test_nave_a') ? 'test_user_a' : n.startsWith('test_nave_b') ? 'test_user_b' : n.startsWith('test_nave_c') ? 'test_user_c' : 'test_user_d';
    await pool.query(`
      INSERT INTO vehiculos_comprados (id, alumno_id, alumno_nombre, vehiculo_tipo, titulo, precio_base, importe_iva, precio_total, metodo_pago, propiedad_asignada_id, propiedad_asignada_titulo, estado)
      VALUES ($1, $2, $3, 'carretilla_elevadora', 'Carretilla Elevadora', 12000, 2520, 14520, 'contado', $4, 'Nave Test', 'activo')
      ON CONFLICT (id) DO NOTHING
    `, [`veh_fork_${n}`, studentId, 'Estudiante Test', n]);
  }

  const db = readLocalDb();
  if (!db.users) db.users = [];
  users.forEach(u => {
    let ex = db.users.find((x: any) => x.id === u.id);
    if (!ex) {
      db.users.push({ id: u.id, name: u.name, username: u.id, balance: u.balance, accountNumber: u.iban, role: 'student', level: 1 });
    } else {
      ex.balance = u.balance;
    }
  });

  if (!db.acquisitions) db.acquisitions = [];
  naves.forEach(n => {
    const studentId = n.startsWith('test_nave_a') ? 'test_user_a' : n.startsWith('test_nave_b') ? 'test_user_b' : n.startsWith('test_nave_c') ? 'test_user_c' : 'test_user_d';
    if (!db.acquisitions.some((a: any) => a.id === n)) {
      db.acquisitions.push({
        id: n,
        studentId,
        propertyTitle: `Nave Industrial ${n}`,
        propertyType: 'almacen',
        location: 'Polígono Industrial San Fernando, Madrid',
        address: 'Polígono Industrial San Fernando, Madrid'
      });
    }
  });

  if (!db.purchasedVehicles) db.purchasedVehicles = [];
  naves.forEach(n => {
    const studentId = n.startsWith('test_nave_a') ? 'test_user_a' : n.startsWith('test_nave_b') ? 'test_user_b' : n.startsWith('test_nave_c') ? 'test_user_c' : 'test_user_d';
    if (!db.purchasedVehicles.some((v: any) => v.id === `veh_fork_${n}`)) {
      db.purchasedVehicles.push({
        id: `veh_fork_${n}`,
        studentId,
        vehicleType: 'carretilla_elevadora',
        assignedPropertyId: n,
        title: 'Carretilla Elevadora',
        status: 'activo'
      });
    }
  });

  writeLocalDb(db);
  console.log('--- Entorno de prueba aislado listo ---');
}

async function runAllValidationTests() {
  await setupTestData();

  console.log("\n================================================================================");
  console.log("EJECUTANDO VALIDACIÓN DE LA FASE 4.3.1 (INVENTARIO Y TRASLADOS EN POSTGRESQL)");
  console.log("================================================================================\n");

  const report: Record<string, any> = {};

  // ===========================================================================
  // 1. PRUEBA CRÍTICA — DUPE GLITCH (10 peticiones concurrentes de 100 u.)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 1: DUPE GLITCH (10 peticiones concurrentes de 100 u. c/u sobre 100 u. disponibles) <<<");
  await resetUserState('test_user_a', 5000, 100, { test_nave_a1: 100 });
  await resetUserState('test_user_b', 5000, 0, { test_nave_b1: 0 });

  const p1BeforeSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p1BeforeRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);

  const reqs1 = Array.from({ length: 10 }, (_, i) => {
    const key = `test_dupe_${Date.now()}_${i}_${Math.random()}`;
    return fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': key },
      body: JSON.stringify({
        senderId: 'test_user_a',
        recipientId: 'test_user_b',
        itemKey: 'plasticKg',
        quantity: 100,
        fromNaveId: 'test_nave_a1',
        destinationNaveId: 'test_nave_b1',
        transportMethod: 'exterior'
      })
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  });

  const responses1 = await Promise.all(reqs1);
  const p1SuccessCount = responses1.filter(r => r.status === 200).length;
  const p1FailCount = responses1.filter(r => r.status !== 200).length;

  const p1AfterSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p1AfterRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);

  const p1SenderUnits = Number(p1AfterSender.rows[0].pellets_plastico_kg);
  const p1RecipUnits = Number(p1AfterRecip.rows[0].pellets_plastico_kg);
  const p1Passed = p1SuccessCount === 1 && p1FailCount === 9 && p1SenderUnits === 0 && p1RecipUnits === 100;

  console.log(`[P1] Exitosas: ${p1SuccessCount}, Fallidas: ${p1FailCount}`);
  console.log(`[P1 PG] Remitente antes: ${p1BeforeSender.rows[0].pellets_plastico_kg}, después: ${p1SenderUnits}`);
  console.log(`[P1 PG] Destinatario antes: ${p1BeforeRecip.rows[0].pellets_plastico_kg}, después: ${p1RecipUnits}`);
  console.log(`[P1] Resultado: ${p1Passed ? 'SUPERADA (0 DUPLICACIONES)' : 'FALLIDA'}\n`);

  report.p1 = {
    pass: p1Passed,
    successCount: p1SuccessCount,
    failCount: p1FailCount,
    senderBefore: Number(p1BeforeSender.rows[0].pellets_plastico_kg),
    senderAfter: p1SenderUnits,
    recipBefore: Number(p1BeforeRecip.rows[0].pellets_plastico_kg),
    recipAfter: p1RecipUnits
  };

  // ===========================================================================
  // 2. PRUEBA — DOS TRANSFERENCIAS PARCIALES CONCURRENTES (60 a B y 60 a C sobre 100)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 2: DOS TRANSFERENCIAS PARCIALES CONCURRENTES (60+60 sobre 100 u.) <<<");
  await resetUserState('test_user_a', 5000, 100, { test_nave_a1: 100 });
  await resetUserState('test_user_b', 5000, 0, { test_nave_b1: 0 });
  await resetUserState('test_user_c', 5000, 0, { test_nave_c1: 0 });

  const p2Req1 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p2_b_${Date.now()}` },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 60,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const p2Req2 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p2_c_${Date.now()}` },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_c',
      itemKey: 'plasticKg',
      quantity: 60,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_c1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const responses2 = await Promise.all([p2Req1, p2Req2]);
  const p2SuccessCount = responses2.filter(r => r.status === 200).length;
  const p2FailCount = responses2.filter(r => r.status !== 200).length;

  const p2AfterSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p2AfterB = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);
  const p2AfterC = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_c'`);

  const p2SenderUnits = Number(p2AfterSender.rows[0].pellets_plastico_kg);
  const p2BUnits = Number(p2AfterB.rows[0].pellets_plastico_kg);
  const p2CUnits = Number(p2AfterC.rows[0].pellets_plastico_kg);
  const p2TotalTransferred = p2BUnits + p2CUnits;
  const p2Passed = p2SuccessCount === 1 && p2FailCount === 1 && p2SenderUnits === 40 && p2TotalTransferred === 60;

  console.log(`[P2] Exitosas: ${p2SuccessCount}, Fallidas: ${p2FailCount}`);
  console.log(`[P2 PG] Origen A: ${p2SenderUnits}, Destino B: ${p2BUnits}, Destino C: ${p2CUnits}, Total transferido: ${p2TotalTransferred}`);
  console.log(`[P2] Resultado: ${p2Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p2 = {
    pass: p2Passed,
    successCount: p2SuccessCount,
    failCount: p2FailCount,
    senderAfter: p2SenderUnits,
    bAfter: p2BUnits,
    cAfter: p2CUnits,
    totalTransferred: p2TotalTransferred
  };

  // ===========================================================================
  // 3. PRUEBA — TRASLADO ENTRE NAVES (100 u. -> trasladar 50 u.)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 3: TRASLADO ENTRE NAVES (Nave 1=100, Nave 2=0 -> Trasladar 50 u.) <<<");
  await resetUserState('test_user_a', 5000, 100, { test_nave_a1: 100, test_nave_a2: 0 });

  const p3BeforeRow = await pool.query(`SELECT pellets_plastico_kg, desglose_almacenes FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);

  const p3Res = await fetch(`${BASE_URL}/api/inventory/transfer-nave-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p3_nave_${Date.now()}` },
    body: JSON.stringify({
      studentId: 'test_user_a',
      fromNaveId: 'test_nave_a1',
      toNaveId: 'test_nave_a2',
      itemKey: 'plasticKg',
      quantity: 50,
      transportMethod: 'exterior'
    })
  });
  const p3Data = await p3Res.json();
  const p3AfterRow = await pool.query(`SELECT pellets_plastico_kg, desglose_almacenes FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);

  const p3Desglose = p3AfterRow.rows[0].desglose_almacenes;
  const p3Nave1 = Number(p3Desglose.test_nave_a1.plasticKg);
  const p3Nave2 = Number(p3Desglose.test_nave_a2.plasticKg);
  const p3TotalStudent = Number(p3AfterRow.rows[0].pellets_plastico_kg);

  const p3Passed = p3Res.status === 200 && p3Nave1 === 50 && p3Nave2 === 50 && p3TotalStudent === 100;

  console.log(`[P3] HTTP Status: ${p3Res.status}`);
  console.log(`[P3 PG] Nave 1: ${p3Nave1}, Nave 2: ${p3Nave2}, Total alumno: ${p3TotalStudent}`);
  console.log(`[P3 PG] desglose_almacenes después: ${JSON.stringify(p3Desglose)}`);
  console.log(`[P3] Resultado: ${p3Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p3 = {
    pass: p3Passed,
    beforeJsonb: p3BeforeRow.rows[0].desglose_almacenes,
    afterJsonb: p3Desglose,
    nave1: p3Nave1,
    nave2: p3Nave2,
    total: p3TotalStudent
  };

  // ===========================================================================
  // 4. PRUEBA — CONCURRENCIA ENTRE NAVES (Nave 1=50, Nave 2=0, Nave 3=0 -> 2 de 50 u.)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 4: CONCURRENCIA ENTRE NAVES (50 u. competidas hacia Nave 2 y Nave 3) <<<");
  await resetUserState('test_user_a', 5000, 50, { test_nave_a1: 50, test_nave_a2: 0, test_nave_a3: 0 });

  const p4Req1 = fetch(`${BASE_URL}/api/inventory/transfer-nave-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p4_req1_${Date.now()}` },
    body: JSON.stringify({
      studentId: 'test_user_a',
      fromNaveId: 'test_nave_a1',
      toNaveId: 'test_nave_a2',
      itemKey: 'plasticKg',
      quantity: 50,
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const p4Req2 = fetch(`${BASE_URL}/api/inventory/transfer-nave-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p4_req2_${Date.now()}` },
    body: JSON.stringify({
      studentId: 'test_user_a',
      fromNaveId: 'test_nave_a1',
      toNaveId: 'test_nave_a3',
      itemKey: 'plasticKg',
      quantity: 50,
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const responses4 = await Promise.all([p4Req1, p4Req2]);
  const p4SuccessCount = responses4.filter(r => r.status === 200).length;
  const p4FailCount = responses4.filter(r => r.status !== 200).length;

  const p4AfterRow = await pool.query(`SELECT pellets_plastico_kg, desglose_almacenes FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p4Desglose = p4AfterRow.rows[0].desglose_almacenes;
  const p4Nave1 = Number(p4Desglose.test_nave_a1.plasticKg);
  const p4Nave2 = Number(p4Desglose.test_nave_a2?.plasticKg || 0);
  const p4Nave3 = Number(p4Desglose.test_nave_a3?.plasticKg || 0);
  const p4Total = Number(p4AfterRow.rows[0].pellets_plastico_kg);

  const p4Passed = p4SuccessCount === 1 && p4FailCount === 1 && p4Nave1 === 0 && (p4Nave2 === 50 || p4Nave3 === 50) && p4Total === 50;

  console.log(`[P4] Exitosas: ${p4SuccessCount}, Fallidas: ${p4FailCount}`);
  console.log(`[P4 PG] Nave 1: ${p4Nave1}, Nave 2: ${p4Nave2}, Nave 3: ${p4Nave3}, Total: ${p4Total}`);
  console.log(`[P4] Resultado: ${p4Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p4 = {
    pass: p4Passed,
    successCount: p4SuccessCount,
    failCount: p4FailCount,
    nave1: p4Nave1,
    nave2: p4Nave2,
    nave3: p4Nave3,
    total: p4Total
  };

  // ===========================================================================
  // 5. PRUEBA — IDEMPOTENCIA CON LA MISMA CLAVE
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 5: IDEMPOTENCIA CON LA MISMA CLAVE <<<");
  await resetUserState('test_user_a', 5000, 100, { test_nave_a1: 100 });
  await resetUserState('test_user_b', 5000, 0, { test_nave_b1: 0 });

  const sameIdemKey = `idem_same_${Date.now()}_${Math.random()}`;

  const p5Req1 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': sameIdemKey },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 25,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const p5Req2 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': sameIdemKey },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 25,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const responses5 = await Promise.all([p5Req1, p5Req2]);
  const p5Responses200 = responses5.filter(r => r.status === 200).length;

  const p5IdemRows = await pool.query(`SELECT * FROM operaciones_idempotencia WHERE clave = $1`, [sameIdemKey]);
  const p5AfterSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p5AfterRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);
  const p5SenderStock = Number(p5AfterSender.rows[0].pellets_plastico_kg);
  const p5RecipStock = Number(p5AfterRecip.rows[0].pellets_plastico_kg);

  // Exactly 1 effective operation in PG: stock goes 100 -> 75 and recipient 0 -> 25
  const p5Passed = p5Responses200 === 2 && p5IdemRows.rows.length === 1 && p5SenderStock === 75 && p5RecipStock === 25;

  console.log(`[P5] Respuestas HTTP 200 recibidas: ${p5Responses200}/2`);
  console.log(`[P5 PG] Registro en operaciones_idempotencia: ${p5IdemRows.rows.length} fila`);
  console.log(`[P5 PG] Stock remitente: ${p5SenderStock}, destinatario: ${p5RecipStock}`);
  console.log(`[P5] Resultado: ${p5Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p5 = {
    pass: p5Passed,
    http200Count: p5Responses200,
    idemRowCount: p5IdemRows.rows.length,
    senderStock: p5SenderStock,
    recipStock: p5RecipStock
  };

  // ===========================================================================
  // 6. PRUEBA — CLAVES DIFERENTES SIMULTÁNEAS (Operaciones legítimas)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 6: CLAVES DIFERENTES SIMULTÁNEAS (20 u. y 20 u. sobre 75 u.) <<<");
  const p6Key1 = `p6_diff_1_${Date.now()}`;
  const p6Key2 = `p6_diff_2_${Date.now()}`;

  const p6Req1 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': p6Key1 },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 20,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const p6Req2 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': p6Key2 },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 20,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));

  const responses6 = await Promise.all([p6Req1, p6Req2]);
  const p6SuccessCount = responses6.filter(r => r.status === 200).length;

  const p6AfterSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p6AfterRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);
  const p6SenderStock = Number(p6AfterSender.rows[0].pellets_plastico_kg);
  const p6RecipStock = Number(p6AfterRecip.rows[0].pellets_plastico_kg);

  // Both should succeed: 75 - 20 - 20 = 35; recipient: 25 + 20 + 20 = 65
  const p6Passed = p6SuccessCount === 2 && p6SenderStock === 35 && p6RecipStock === 65;

  console.log(`[P6] Exitosas: ${p6SuccessCount}/2`);
  console.log(`[P6 PG] Stock remitente: ${p6SenderStock}, destinatario: ${p6RecipStock}`);
  console.log(`[P6] Resultado: ${p6Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p6 = {
    pass: p6Passed,
    successCount: p6SuccessCount,
    senderStock: p6SenderStock,
    recipStock: p6RecipStock
  };

  // ===========================================================================
  // 7. PRUEBA — SALDO INSUFICIENTE (Rollback financiero y de inventario)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 7: SALDO INSUFICIENTE (Rollback total) <<<");
  await resetUserState('test_user_a', 0.00, 35, { test_nave_a1: 35 });
  await resetUserState('test_user_b', 5000, 65, { test_nave_b1: 65 });

  const p7BeforeSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p7BeforeRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);
  const p7BeforeBalance = await pool.query(`SELECT saldo FROM cuentas WHERE id = 'test_user_a'`);
  const p7BeforeMovs = await pool.query(`SELECT COUNT(*) FROM movimientos WHERE sender_id = 'test_user_a'`);
  const p7BeforeOrders = await pool.query(`SELECT COUNT(*) FROM materias_primas_pedidos WHERE alumno_id = 'test_user_a'`);

  const p7Res = await fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p7_insuf_${Date.now()}` },
    body: JSON.stringify({
      senderId: 'test_user_a',
      recipientId: 'test_user_b',
      itemKey: 'plasticKg',
      quantity: 10,
      fromNaveId: 'test_nave_a1',
      destinationNaveId: 'test_nave_b1',
      transportMethod: 'exterior'
    })
  });
  const p7Data = await p7Res.json();

  const p7AfterSender = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p7AfterRecip = await pool.query(`SELECT pellets_plastico_kg FROM materias_primas_inventario WHERE alumno_id = 'test_user_b'`);
  const p7AfterBalance = await pool.query(`SELECT saldo FROM cuentas WHERE id = 'test_user_a'`);
  const p7AfterMovs = await pool.query(`SELECT COUNT(*) FROM movimientos WHERE sender_id = 'test_user_a'`);
  const p7AfterOrders = await pool.query(`SELECT COUNT(*) FROM materias_primas_pedidos WHERE alumno_id = 'test_user_a'`);

  const p7Passed = p7Res.status === 400 &&
    Number(p7AfterSender.rows[0].pellets_plastico_kg) === Number(p7BeforeSender.rows[0].pellets_plastico_kg) &&
    Number(p7AfterRecip.rows[0].pellets_plastico_kg) === Number(p7BeforeRecip.rows[0].pellets_plastico_kg) &&
    Number(p7AfterBalance.rows[0].saldo) === 0.00 &&
    Number(p7AfterMovs.rows[0].count) === Number(p7BeforeMovs.rows[0].count) &&
    Number(p7AfterOrders.rows[0].count) === Number(p7BeforeOrders.rows[0].count);

  console.log(`[P7] HTTP Status: ${p7Res.status}, Error recibido: ${p7Data.error}`);
  console.log(`[P7 PG] Saldo antes: ${p7BeforeBalance.rows[0].saldo}, después: ${p7AfterBalance.rows[0].saldo}`);
  console.log(`[P7 PG] Stock remitente intacto: ${p7AfterSender.rows[0].pellets_plastico_kg}`);
  console.log(`[P7 PG] Movimientos creados: ${Number(p7AfterMovs.rows[0].count) - Number(p7BeforeMovs.rows[0].count)}`);
  console.log(`[P7 PG] Pedidos/documentos creados: ${Number(p7AfterOrders.rows[0].count) - Number(p7BeforeOrders.rows[0].count)}`);
  console.log(`[P7] Resultado: ${p7Passed ? 'SUPERADA (ROLLBACK TOTAL VERIFICADO)' : 'FALLIDA'}\n`);

  report.p7 = {
    pass: p7Passed,
    httpStatus: p7Res.status,
    errorMessage: p7Data.error,
    balanceBefore: Number(p7BeforeBalance.rows[0].saldo),
    balanceAfter: Number(p7AfterBalance.rows[0].saldo),
    stockSender: Number(p7AfterSender.rows[0].pellets_plastico_kg),
    stockRecip: Number(p7AfterRecip.rows[0].pellets_plastico_kg),
    movsDelta: Number(p7AfterMovs.rows[0].count) - Number(p7BeforeMovs.rows[0].count),
    ordersDelta: Number(p7AfterOrders.rows[0].count) - Number(p7BeforeOrders.rows[0].count)
  };

  // ===========================================================================
  // 8. PRUEBA — ROLLBACK ANTE ERROR EN LÓGICA DE NEGOCIO DENTRO DE LA TX
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 8: ROLLBACK ANTE ERROR DENTRO DE TRANSACCIÓN <<<");
  await resetUserState('test_user_a', 5000, 50, { test_nave_a1: 50, test_nave_a2: 0 });

  const p8BeforeInv = await pool.query(`SELECT pellets_plastico_kg, desglose_almacenes FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p8BeforeBal = await pool.query(`SELECT saldo FROM cuentas WHERE id = 'test_user_a'`);
  const p8BeforeMovs = await pool.query(`SELECT COUNT(*) FROM movimientos WHERE sender_id = 'test_user_a'`);
  const p8BeforeOrders = await pool.query(`SELECT COUNT(*) FROM materias_primas_pedidos WHERE alumno_id = 'test_user_a'`);

  // Try to transfer 99999 kg between naves (exceeds available 50 kg)
  const p8Res = await fetch(`${BASE_URL}/api/inventory/transfer-nave-stock`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `p8_rb_${Date.now()}` },
    body: JSON.stringify({
      studentId: 'test_user_a',
      fromNaveId: 'test_nave_a1',
      toNaveId: 'test_nave_a2',
      itemKey: 'plasticKg',
      quantity: 99999,
      transportMethod: 'exterior'
    })
  });
  const p8Data = await p8Res.json();

  const p8AfterInv = await pool.query(`SELECT pellets_plastico_kg, desglose_almacenes FROM materias_primas_inventario WHERE alumno_id = 'test_user_a'`);
  const p8AfterBal = await pool.query(`SELECT saldo FROM cuentas WHERE id = 'test_user_a'`);
  const p8AfterMovs = await pool.query(`SELECT COUNT(*) FROM movimientos WHERE sender_id = 'test_user_a'`);
  const p8AfterOrders = await pool.query(`SELECT COUNT(*) FROM materias_primas_pedidos WHERE alumno_id = 'test_user_a'`);

  const p8Passed = p8Res.status === 400 &&
    Number(p8AfterBal.rows[0].saldo) === Number(p8BeforeBal.rows[0].saldo) &&
    Number(p8AfterInv.rows[0].pellets_plastico_kg) === Number(p8BeforeInv.rows[0].pellets_plastico_kg) &&
    Number(p8AfterMovs.rows[0].count) === Number(p8BeforeMovs.rows[0].count) &&
    Number(p8AfterOrders.rows[0].count) === Number(p8BeforeOrders.rows[0].count);

  console.log(`[P8] HTTP Status: ${p8Res.status}, Error: ${p8Data.error}`);
  console.log(`[P8 PG] Saldo intacto: ${p8AfterBal.rows[0].saldo} €`);
  console.log(`[P8 PG] Stock intacto: ${p8AfterInv.rows[0].pellets_plastico_kg} kg`);
  console.log(`[P8 PG] Movimientos creados: ${Number(p8AfterMovs.rows[0].count) - Number(p8BeforeMovs.rows[0].count)}`);
  console.log(`[P8 PG] Pedidos/documentos creados: ${Number(p8AfterOrders.rows[0].count) - Number(p8BeforeOrders.rows[0].count)}`);
  console.log(`[P8] Resultado: ${p8Passed ? 'SUPERADA (ROLLBACK TOTAL VERIFICADO)' : 'FALLIDA'}\n`);

  report.p8 = {
    pass: p8Passed,
    httpStatus: p8Res.status,
    balancePreserved: Number(p8AfterBal.rows[0].saldo),
    stockPreserved: Number(p8AfterInv.rows[0].pellets_plastico_kg),
    movsPreserved: Number(p8AfterMovs.rows[0].count)
  };

  // ===========================================================================
  // 9. PRUEBA — PREVENCIÓN DE DEADLOCKS (Transferencias cruzadas A->B, B->A, A->C, C->A)
  // ===========================================================================
  console.log(">>> INICIANDO PRUEBA 9: PREVENCIÓN DE DEADLOCKS EN TRANSFERENCIAS CRUZADAS <<<");
  for (const uid of ['test_user_a', 'test_user_b', 'test_user_c', 'test_user_d']) {
    const nave = `test_nave_${uid.slice(-1)}1`;
    await resetUserState(uid, 5000, 100, { [nave]: 100 });
  }

  // 6 simultaneous cross transfers between students
  const crossTransfers = [
    { s: 'test_user_a', r: 'test_user_b', sn: 'test_nave_a1', rn: 'test_nave_b1', q: 10 },
    { s: 'test_user_b', r: 'test_user_a', sn: 'test_nave_b1', rn: 'test_nave_a1', q: 10 },
    { s: 'test_user_a', r: 'test_user_c', sn: 'test_nave_a1', rn: 'test_nave_c1', q: 10 },
    { s: 'test_user_c', r: 'test_user_a', sn: 'test_nave_c1', rn: 'test_nave_a1', q: 10 },
    { s: 'test_user_b', r: 'test_user_c', sn: 'test_nave_b1', rn: 'test_nave_c1', q: 10 },
    { s: 'test_user_c', r: 'test_user_b', sn: 'test_nave_c1', rn: 'test_nave_b1', q: 10 }
  ];

  const crossReqs = crossTransfers.map((t, idx) => {
    return fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `cross_${idx}_${Date.now()}` },
      body: JSON.stringify({
        senderId: t.s,
        recipientId: t.r,
        itemKey: 'plasticKg',
        quantity: t.q,
        fromNaveId: t.sn,
        destinationNaveId: t.rn,
        transportMethod: 'exterior'
      })
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => ({})) }));
  });

  const crossResponses = await Promise.all(crossReqs);
  const deadlockDetected = crossResponses.some(r => JSON.stringify(r.data).includes('40P01') || JSON.stringify(r.data).toLowerCase().includes('deadlock'));
  const crossSuccessCount = crossResponses.filter(r => r.status === 200).length;

  const finalTotalStockRes = await pool.query(`
    SELECT SUM(pellets_plastico_kg) as total FROM materias_primas_inventario WHERE alumno_id IN ('test_user_a', 'test_user_b', 'test_user_c', 'test_user_d')
  `);
  const finalTotalStock = Number(finalTotalStockRes.rows[0].total);

  // Initial sum was 4 * 100 = 400. Conservation of mass mandates final total = 400!
  const p9Passed = !deadlockDetected && crossSuccessCount === 6 && finalTotalStock === 400;

  console.log(`[P9] Transferencias exitosas: ${crossSuccessCount}/6`);
  console.log(`[P9] Deadlock 40P01 detectado: ${deadlockDetected ? 'SÍ (ERROR)' : 'NO'}`);
  console.log(`[P9 PG] Stock total del sistema (conservación de masa): ${finalTotalStock} (esperado: 400)`);
  console.log(`[P9] Resultado: ${p9Passed ? 'SUPERADA' : 'FALLIDA'}\n`);

  report.p9 = {
    pass: p9Passed,
    crossSuccessCount,
    deadlockDetected,
    initialStock: 400,
    finalTotalStock
  };

  // ===========================================================================
  // 10. COMPROBACIÓN DEL JSONB EN POSTGRESQL
  // ===========================================================================
  const jsonbCheck = await pool.query(`
    SELECT alumno_id, desglose_almacenes 
    FROM materias_primas_inventario 
    WHERE alumno_id = 'test_user_a'
  `);
  report.p10_jsonb = {
    table: 'materias_primas_inventario',
    column: 'desglose_almacenes',
    type: 'JSONB',
    sample: jsonbCheck.rows[0]?.desglose_almacenes
  };

  // Save report
  fs.writeFileSync('scripts/validation_phase_4_3_1_report.json', JSON.stringify(report, null, 2));

  console.log("================================================================================");
  console.log("RESUMEN GENERAL DE TODAS LAS PRUEBAS:");
  console.log("P1 (Dupe Glitch):", report.p1.pass ? "APROBADO" : "FALLIDO");
  console.log("P2 (Transferencias parciales 60+60):", report.p2.pass ? "APROBADO" : "FALLIDO");
  console.log("P3 (Traslado entre naves 50 u.):", report.p3.pass ? "APROBADO" : "FALLIDO");
  console.log("P4 (Concurrencia entre naves):", report.p4.pass ? "APROBADO" : "FALLIDO");
  console.log("P5 (Idempotencia misma clave):", report.p5.pass ? "APROBADO" : "FALLIDO");
  console.log("P6 (Claves diferentes legítimas):", report.p6.pass ? "APROBADO" : "FALLIDO");
  console.log("P7 (Saldo insuficiente + Rollback):", report.p7.pass ? "APROBADO" : "FALLIDO");
  console.log("P8 (Rollback tras modificaciones):", report.p8.pass ? "APROBADO" : "FALLIDO");
  console.log("P9 (Prevención de Deadlocks):", report.p9.pass ? "APROBADO" : "FALLIDO");
  console.log("================================================================================");

  await pool.end();
}

runAllValidationTests().catch(err => {
  console.error("Error ejecutando tests:", err);
  process.exit(1);
});
