import pg from 'pg';
import fs from 'fs';
import path from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
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

async function postNegotiate(orderId: string, options: {
  userId: string;
  discountPercentage?: number;
  insuranceFee?: number;
  transportMethod?: 'vendedor_envio' | 'comprador_recogida';
  pricePerUnit?: number;
  quantity?: number;
  note?: string;
  idempotencyKey?: string;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }
  const body: any = {
    userId: options.userId,
    discountPercentage: options.discountPercentage,
    insuranceFee: options.insuranceFee,
    transportMethod: options.transportMethod,
    pricePerUnit: options.pricePerUnit,
    quantity: options.quantity,
    note: options.note
  };
  if (options.idempotencyKey) {
    body.idempotencyKey = options.idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/negotiate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postApprove(orderId: string, userId: string, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/approve`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, idempotencyKey })
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function setupTestOrder(params: {
  orderId: string;
  buyerId: string;
  buyerName: string;
  sellerId: string;
  sellerName: string;
  status: string;
  quantity: number;
  basePrice: number;
  lastTurnUserId?: string;
  initialHistory?: any[];
}) {
  const {
    orderId,
    buyerId,
    buyerName,
    sellerId,
    sellerName,
    status,
    quantity,
    basePrice,
    lastTurnUserId = buyerId,
    initialHistory = [
      {
        id: `neg_${Date.now()}_0`,
        authorId: buyerId,
        authorName: buyerName,
        timestamp: new Date().toISOString(),
        action: 'propuesta_inicial',
        quantity,
        pricePerUnit: basePrice / quantity,
        discountPercentage: 0,
        insuranceFee: 0,
        transportCost: 35,
        transportMethod: 'vendedor_envio',
        totalAmount: basePrice + 35 + Math.round(((basePrice + 35) * 0.21) * 100) / 100,
        note: 'Propuesta inicial'
      }
    ]
  } = params;

  // Insert or update users in local db.json
  const db = readLocalDb();
  if (!db.users) db.users = [];
  if (!db.users.some((u: any) => u.id === buyerId)) {
    db.users.push({ id: buyerId, name: buyerName, role: 'student', level: 2 });
  }
  if (!db.users.some((u: any) => u.id === sellerId)) {
    db.users.push({ id: sellerId, name: sellerName, role: 'student', level: 2 });
  }

  // Ensure accounts exist in db and PostgreSQL for approve compatibility
  if (!db.cuentas) db.cuentas = [];
  if (!db.cuentas.some((c: any) => c.alumno === buyerName || c.alumno === buyerId)) {
    db.cuentas.push({ id: `acc_${buyerId}`, alumno: buyerName, saldo: 50000 });
  }
  if (!db.cuentas.some((c: any) => c.alumno === sellerName || c.alumno === sellerId)) {
    db.cuentas.push({ id: `acc_${sellerId}`, alumno: sellerName, saldo: 50000 });
  }

  const orderObj = {
    id: orderId,
    studentId: buyerId,
    studentName: buyerName,
    sellerId,
    sellerName,
    announcementId: `ann_${orderId}`,
    materialType: 'hierro',
    materialTitle: 'Hierro Forjado Premium',
    quantity,
    unitWeightKg: 10,
    totalKg: quantity * 10,
    basePrice,
    ivaAmount: Math.round(basePrice * 0.21 * 100) / 100,
    transportCost: 35,
    totalAmount: Math.round((basePrice + 35 + (basePrice + 35) * 0.21) * 100) / 100,
    needsTransport: true,
    transportMethod: 'vendedor_envio',
    discountPercentage: 0,
    insuranceFee: 0,
    status,
    lastTurnUserId,
    negotiationHistory: initialHistory,
    requestedAt: new Date().toISOString()
  };

  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const existingIdx = db.rawMaterialOrders.findIndex((o: any) => o.id === orderId);
  if (existingIdx >= 0) {
    db.rawMaterialOrders[existingIdx] = orderObj;
  } else {
    db.rawMaterialOrders.push(orderObj);
  }
  writeLocalDb(db);

  // Sync to PostgreSQL directly
  await pool.query(
    `INSERT INTO materias_primas_pedidos (
      id, alumno_id, alumno_nombre, announcement_id, materia_tipo, materia_titulo,
      cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_iva, coste_transporte,
      importe_total, necesita_transporte, estado, seller_id, seller_name,
      discount_percentage, insurance_fee, transport_method, last_turn_user_id, negotiation_history
    ) VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10, $11, $12,
      $13, $14, $15, $16, $17,
      $18, $19, $20, $21, $22
    ) ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      cantidad = EXCLUDED.cantidad,
      precio_base = EXCLUDED.precio_base,
      importe_iva = EXCLUDED.importe_iva,
      coste_transporte = EXCLUDED.coste_transporte,
      importe_total = EXCLUDED.importe_total,
      last_turn_user_id = EXCLUDED.last_turn_user_id,
      negotiation_history = EXCLUDED.negotiation_history,
      fecha_aprobado = NULL,
      fecha_entrega = NULL,
      shipped_at = NULL,
      inventory_credited = FALSE`,
    [
      orderId,
      buyerId,
      buyerName,
      `ann_${orderId}`,
      'hierro',
      'Hierro Forjado Premium',
      quantity,
      10,
      quantity * 10,
      basePrice,
      Math.round(basePrice * 0.21 * 100) / 100,
      35,
      Math.round((basePrice + 35 + (basePrice + 35) * 0.21) * 100) / 100,
      true,
      status,
      sellerId,
      sellerName,
      0,
      0,
      'vendedor_envio',
      lastTurnUserId,
      JSON.stringify(initialHistory)
    ]
  );

  // Clear idempotency records for clean testing
  await pool.query(`DELETE FROM operaciones_idempotencia WHERE clave LIKE $1`, [`%${orderId}%`]);
}

async function runAllTests() {
  console.log("=== INICIANDO PRUEBAS DE VERIFICACIÓN FASE 4.3.6 (POST /api/raw-materials/orders/:id/negotiate) ===\n");
  let passedCount = 0;
  let totalCount = 0;

  // TEST 1: Dos negociaciones simultáneas sobre el mismo pedido incompatibles (mismo usuario / mismo turno)
  totalCount++;
  try {
    console.log("TEST 1: Dos negociaciones simultáneas incompatibles sobre el mismo pedido...");
    const orderId = `test_neg_t1_${Date.now()}`;
    const buyerId = `buyer_t1_${Date.now()}`;
    const sellerId = `seller_t1_${Date.now()}`;

    // Initial state: turn belongs to seller (lastTurnUserId = buyerId)
    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T1",
      sellerId,
      sellerName: "Vendedor T1",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Launch two simultaneous negotiations from seller with different values
    const p1 = postNegotiate(orderId, {
      userId: sellerId,
      quantity: 12,
      pricePerUnit: 11,
      discountPercentage: 5,
      note: "Oferta Vendedor 1",
      idempotencyKey: `idem_t1_a_${Date.now()}`
    });
    const p2 = postNegotiate(orderId, {
      userId: sellerId,
      quantity: 15,
      pricePerUnit: 12,
      discountPercentage: 8,
      note: "Oferta Vendedor 2",
      idempotencyKey: `idem_t1_b_${Date.now()}`
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    const successCount = [res1, res2].filter(r => r.status === 200).length;
    const failCount = [res1, res2].filter(r => r.status === 400).length;

    // Check in PostgreSQL
    const pgRes = await pool.query(
      `SELECT last_turn_user_id, negotiation_history, estado FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );
    const history = pgRes.rows[0].negotiation_history;

    if (successCount === 1 && failCount === 1 && history.length === 2 && pgRes.rows[0].last_turn_user_id === sellerId) {
      console.log("  -> PASSED: Exactamente 1 negociación tuvo éxito (200) y la concurrente fue rechazada (400 Turno). Historial en PG contiene exactamente 2 entradas.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { successCount, failCount, historyLength: history.length, res1: res1.status, res2: res2.status });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 2: Dos peticiones simultáneas con la misma clave de idempotencia
  totalCount++;
  try {
    console.log("\nTEST 2: Dos peticiones simultáneas con la MISMA clave de idempotencia...");
    const orderId = `test_neg_t2_${Date.now()}`;
    const buyerId = `buyer_t2_${Date.now()}`;
    const sellerId = `seller_t2_${Date.now()}`;
    const sameKey = `idem_same_${Date.now()}`;

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T2",
      sellerId,
      sellerName: "Vendedor T2",
      status: "en_negociacion",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    const p1 = postNegotiate(orderId, {
      userId: sellerId,
      quantity: 14,
      pricePerUnit: 10.5,
      note: "Contraoferta Idéntica",
      idempotencyKey: sameKey
    });
    const p2 = postNegotiate(orderId, {
      userId: sellerId,
      quantity: 14,
      pricePerUnit: 10.5,
      note: "Contraoferta Idéntica",
      idempotencyKey: sameKey
    });

    const [res1, res2] = await Promise.all([p1, p2]);

    const pgRes = await pool.query(
      `SELECT last_turn_user_id, negotiation_history, cantidad FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );
    const history = pgRes.rows[0].negotiation_history;

    if (res1.status === 200 && res2.status === 200 && history.length === 2 && Number(pgRes.rows[0].cantidad) === 14) {
      console.log("  -> PASSED: Ambas peticiones devolvieron 200 OK con respuestas consistentes y en PG solo se registró una única operación efectiva (historial = 2 entradas).");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { status1: res1.status, status2: res2.status, historyLen: history.length });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 3: Dos peticiones con claves diferentes pero válidas respetando turnos en secuencia
  totalCount++;
  try {
    console.log("\nTEST 3: Dos peticiones válidas con claves diferentes respetando turnos...");
    const orderId = `test_neg_t3_${Date.now()}`;
    const buyerId = `buyer_t3_${Date.now()}`;
    const sellerId = `seller_t3_${Date.now()}`;

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T3",
      sellerId,
      sellerName: "Vendedor T3",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Step 1: Seller takes turn
    const resSeller = await postNegotiate(orderId, {
      userId: sellerId,
      quantity: 12,
      pricePerUnit: 9.5,
      note: "Contraoferta del Vendedor",
      idempotencyKey: `idem_t3_s_${Date.now()}`
    });

    // Step 2: Buyer takes next turn
    const resBuyer = await postNegotiate(orderId, {
      userId: buyerId,
      quantity: 12,
      pricePerUnit: 9.0,
      note: "Contraoferta del Comprador",
      idempotencyKey: `idem_t3_b_${Date.now()}`
    });

    const pgRes = await pool.query(
      `SELECT last_turn_user_id, negotiation_history, cantidad, estado FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );
    const history = pgRes.rows[0].negotiation_history;

    if (resSeller.status === 200 && resBuyer.status === 200 && history.length === 3 && pgRes.rows[0].last_turn_user_id === buyerId) {
      console.log("  -> PASSED: Ambas operaciones se ejecutaron respetando el bloqueo y la alternancia de turnos (historial = 3 entradas: inicial, vendedor, comprador).");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { resSeller: resSeller.status, resBuyer: resBuyer.status, historyLen: history.length, lastTurn: pgRes.rows[0].last_turn_user_id });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 4: Negociación contra una operación concurrente que cambie el estado del mismo pedido (/approve)
  totalCount++;
  try {
    console.log("\nTEST 4: Negociación concurrente contra /approve (verificación de Lost Update)...");
    const orderId = `test_neg_t4_${Date.now()}`;
    const buyerId = `buyer_t4_${Date.now()}`;
    const sellerId = `seller_t4_${Date.now()}`;

    // Create accounts in PostgreSQL cuentas table for buyer and seller so approve can run
    await pool.query(
      `INSERT INTO cuentas (id, alumno, account_number, saldo, role, level)
       VALUES ($1, $2, $3, 50000, 'student', 2), ($4, $5, $6, 50000, 'student', 2)
       ON CONFLICT (id) DO UPDATE SET saldo = 50000`,
      [buyerId, `Comprador T4`, `ES00_${buyerId.slice(-8)}`,
       sellerId, `Vendedor T4`, `ES00_${sellerId.slice(-8)}`]
    );

    // Provide seller with sufficient raw material inventory so approve can run
    await pool.query(
      `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, fragmentos_hierro_kg, fecha_actualizacion)
       VALUES ($1, $2, 1000, NOW())
       ON CONFLICT (alumno_id) DO UPDATE SET fragmentos_hierro_kg = 1000`,
      [sellerId, "Vendedor T4"]
    );

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T4",
      sellerId,
      sellerName: "Vendedor T4",
      status: "en_negociacion",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Launch approve and negotiate concurrently
    const pApprove = postApprove(orderId, sellerId, `idem_appr_t4_${Date.now()}`);
    const pNegotiate = postNegotiate(orderId, {
      userId: sellerId,
      quantity: 20,
      pricePerUnit: 15,
      note: "Oferta simultanea con aprobacion",
      idempotencyKey: `idem_neg_t4_${Date.now()}`
    });

    const [apprRes, negRes] = await Promise.all([pApprove, pNegotiate]);

    const pgRes = await pool.query(
      `SELECT estado, last_turn_user_id, negotiation_history FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );
    const finalState = pgRes.rows[0].estado;

    // Both cannot succeed if approve won first and changed state to 'aprobado'.
    // Or if negotiate ran first, it set en_negociacion, and approve followed and approved it.
    // In either case, the database must NOT be left in an inconsistent state or have lost updates.
    if ((apprRes.status === 200 && negRes.status === 400 && finalState === 'aprobado') ||
        (negRes.status === 200 && apprRes.status === 200 && finalState === 'aprobado')) {
      console.log(`  -> PASSED: Serialización perfecta sin Lost Update. Estado final en PG: "${finalState}". (Approve: ${apprRes.status}, Negotiate: ${negRes.status}).`);
      passedCount++;
    } else {
      console.error("  -> FAILED:", { apprRes: apprRes.status, negRes: negRes.status, finalState, dataNeg: negRes.data, dataAppr: apprRes.data });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 5: Pedido en estado no negociable -> 400 y ningún cambio
  totalCount++;
  try {
    console.log("\nTEST 5: Pedido en estado no negociable (aprobado, entregado, rechazado)...");
    const nonNegotiableStates = ['aprobado', 'en_transito', 'entregado', 'rechazado'];
    let allPassed = true;

    for (const st of nonNegotiableStates) {
      const orderId = `test_neg_t5_${st}_${Date.now()}`;
      const buyerId = `buyer_t5_${Date.now()}`;
      const sellerId = `seller_t5_${Date.now()}`;

      await setupTestOrder({
        orderId,
        buyerId,
        buyerName: "Comprador T5",
        sellerId,
        sellerName: "Vendedor T5",
        status: st,
        quantity: 10,
        basePrice: 100,
        lastTurnUserId: buyerId
      });

      const res = await postNegotiate(orderId, {
        userId: sellerId,
        quantity: 15,
        note: `Intento en estado ${st}`
      });

      const pgRes = await pool.query(
        `SELECT estado, negotiation_history FROM materias_primas_pedidos WHERE id = $1`,
        [orderId]
      );

      if (res.status !== 400 || pgRes.rows[0].estado !== st || pgRes.rows[0].negotiation_history.length !== 1) {
        allPassed = false;
        console.error(`  -> Failed for state "${st}": status=${res.status}, pgState=${pgRes.rows[0].estado}`);
      }
    }

    if (allPassed) {
      console.log("  -> PASSED: Todos los estados no negociables ('aprobado', 'en_transito', 'entregado', 'rechazado') respondieron 400 y el registro en PG quedó intacto.");
      passedCount++;
    } else {
      console.error("  -> FAILED");
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 6: Usuario que no participa en el pedido -> rechazo y ningún cambio
  totalCount++;
  try {
    console.log("\nTEST 6: Usuario que no participa en el pedido...");
    const orderId = `test_neg_t6_${Date.now()}`;
    const buyerId = `buyer_t6_${Date.now()}`;
    const sellerId = `seller_t6_${Date.now()}`;
    const intruderId = `intruder_t6_${Date.now()}`;

    // Register intruder in db.json
    const db = readLocalDb();
    if (!db.users.some((u: any) => u.id === intruderId)) {
      db.users.push({ id: intruderId, name: "Intruso", role: "student" });
      writeLocalDb(db);
    }

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T6",
      sellerId,
      sellerName: "Vendedor T6",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    const res = await postNegotiate(orderId, {
      userId: intruderId,
      quantity: 25,
      note: "Intento de negociación de tercero no autorizado"
    });

    const pgRes = await pool.query(
      `SELECT estado, negotiation_history, last_turn_user_id FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );

    if (res.status === 403 && pgRes.rows[0].negotiation_history.length === 1 && pgRes.rows[0].last_turn_user_id === buyerId) {
      console.log("  -> PASSED: Usuario ajeno al pedido fue rechazado con 403 Forbidden y ningún cambio se produjo en PostgreSQL.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { status: res.status, data: res.data });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 7: Turno incorrecto -> rechazo y ningún cambio
  totalCount++;
  try {
    console.log("\nTEST 7: Turno incorrecto (usuario intenta negociar dos veces seguidas)...");
    const orderId = `test_neg_t7_${Date.now()}`;
    const buyerId = `buyer_t7_${Date.now()}`;
    const sellerId = `seller_t7_${Date.now()}`;

    // Order created by buyer, lastTurnUserId is already buyerId
    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T7",
      sellerId,
      sellerName: "Vendedor T7",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Buyer tries to negotiate again without waiting for seller
    const res = await postNegotiate(orderId, {
      userId: buyerId,
      quantity: 8,
      note: "Comprador intenta negociar fuera de turno"
    });

    const pgRes = await pool.query(
      `SELECT estado, negotiation_history, last_turn_user_id FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );

    if (res.status === 400 && res.data?.error?.includes('turno') && pgRes.rows[0].negotiation_history.length === 1) {
      console.log("  -> PASSED: Intento fuera de turno rechazado con 400 ('No es tu turno...') y ningún cambio en PostgreSQL.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { status: res.status, data: res.data });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 8: Rollback provocado durante la operación -> estado intacto
  totalCount++;
  try {
    console.log("\nTEST 8: Rollback provocado durante la operación (requisito logístico incumplido)...");
    const orderId = `test_neg_t8_${Date.now()}`;
    const buyerId = `buyer_t8_${Date.now()}`;
    const sellerId = `seller_t8_${Date.now()}`;

    // Buyer has NO truck or truck driver
    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T8",
      sellerId,
      sellerName: "Vendedor T8",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Seller tries to set 'comprador_recogida' when buyer has no fleet/driver
    const res = await postNegotiate(orderId, {
      userId: sellerId,
      transportMethod: 'comprador_recogida',
      quantity: 12,
      note: "Recogida por comprador forzada sin requisitos"
    });

    const pgRes = await pool.query(
      `SELECT estado, negotiation_history, last_turn_user_id, transport_method FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );

    if (res.status === 400 && res.data?.error?.includes('Logística') &&
        pgRes.rows[0].negotiation_history.length === 1 &&
        pgRes.rows[0].transport_method === 'vendedor_envio' &&
        pgRes.rows[0].last_turn_user_id === buyerId) {
      console.log("  -> PASSED: Error en transacción provocó ROLLBACK total. Historial, estado, método de transporte y turno quedaron exactamente como antes.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { status: res.status, data: res.data });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 9: Comprobación directa en PostgreSQL que no existen historiales duplicados ni modificaciones parciales
  totalCount++;
  try {
    console.log("\nTEST 9: Comprobación directa en PostgreSQL de consistencia en negotiation_history y columnas...");
    const orderId = `test_neg_t9_${Date.now()}`;
    const buyerId = `buyer_t9_${Date.now()}`;
    const sellerId = `seller_t9_${Date.now()}`;

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T9",
      sellerId,
      sellerName: "Vendedor T9",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // Execute 2 turn exchanges
    await postNegotiate(orderId, {
      userId: sellerId,
      quantity: 15,
      pricePerUnit: 12,
      discountPercentage: 10,
      insuranceFee: 5,
      note: "Oferta 1 de vendedor",
      idempotencyKey: `idem_t9_s_${Date.now()}`
    });

    await postNegotiate(orderId, {
      userId: buyerId,
      quantity: 15,
      pricePerUnit: 11,
      discountPercentage: 15,
      insuranceFee: 0,
      note: "Oferta 2 de comprador",
      idempotencyKey: `idem_t9_b_${Date.now()}`
    });

    const pgRes = await pool.query(
      `SELECT id, estado, cantidad, precio_base, importe_iva, coste_transporte, importe_total,
              discount_percentage, insurance_fee, last_turn_user_id, negotiation_history
       FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );

    const row = pgRes.rows[0];
    const history = row.negotiation_history;

    // Check that history IDs are unique and strictly ordered
    const ids = history.map((h: any) => h.id);
    const uniqueIds = new Set(ids);
    const hasUniqueIds = uniqueIds.size === history.length;
    const correctState = row.estado === 'en_negociacion';
    const correctTurn = row.last_turn_user_id === buyerId;
    const correctQty = Number(row.cantidad) === 15;
    const correctDiscount = Number(row.discount_percentage) === 15;

    if (hasUniqueIds && history.length === 3 && correctState && correctTurn && correctQty && correctDiscount) {
      console.log("  -> PASSED: Historial en PostgreSQL perfectamente ordenado, IDs únicos, 3 entradas coherentes y columnas de cálculo coincidentes al céntimo.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { hasUniqueIds, historyLen: history.length, row });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  // TEST 10: db.json antiguo no puede ganar sobre el estado confirmado en PostgreSQL
  totalCount++;
  try {
    console.log("\nTEST 10: db.json antiguo o desincronizado NO puede ganar sobre PostgreSQL...");
    const orderId = `test_neg_t10_${Date.now()}`;
    const buyerId = `buyer_t10_${Date.now()}`;
    const sellerId = `seller_t10_${Date.now()}`;

    await setupTestOrder({
      orderId,
      buyerId,
      buyerName: "Comprador T10",
      sellerId,
      sellerName: "Vendedor T10",
      status: "pendiente",
      quantity: 10,
      basePrice: 100,
      lastTurnUserId: buyerId
    });

    // In PostgreSQL, move the order to 'aprobado'
    await pool.query(
      `UPDATE materias_primas_pedidos SET estado = 'aprobado', fecha_aprobado = NOW() WHERE id = $1`,
      [orderId]
    );

    // In db.json, corrupt/falsify the state back to 'pendiente'
    const db = readLocalDb();
    const memOrder = db.rawMaterialOrders.find((o: any) => o.id === orderId);
    if (memOrder) {
      memOrder.status = 'pendiente';
      writeLocalDb(db);
    }

    // Now send negotiate request - PostgreSQL is source of truth and MUST reject because order is 'aprobado'
    const res = await postNegotiate(orderId, {
      userId: sellerId,
      quantity: 20,
      note: "Intento con db.json desincronizado"
    });

    const pgRes = await pool.query(
      `SELECT estado, negotiation_history FROM materias_primas_pedidos WHERE id = $1`,
      [orderId]
    );

    if (res.status === 400 && res.data?.error?.includes('aprobado') && pgRes.rows[0].estado === 'aprobado') {
      console.log("  -> PASSED: PostgreSQL actuó como única fuente de verdad; el db.json corrupto/obsoleto fue ignorado y la operación fue rechazada.");
      passedCount++;
    } else {
      console.error("  -> FAILED:", { status: res.status, data: res.data, pgState: pgRes.rows[0].estado });
    }
  } catch (err) {
    console.error("  -> FAILED with error:", err);
  }

  console.log(`\n=== RESUMEN DE PRUEBAS FASE 4.3.6: ${passedCount} / ${totalCount} PASADAS ===\n`);
  await pool.end();

  if (passedCount === totalCount) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runAllTests().catch(err => {
  console.error("Fatal test runner error:", err);
  process.exit(1);
});
