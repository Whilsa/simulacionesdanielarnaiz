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

async function postReject(orderId: string, options: {
  userId?: string;
  rejectionReason?: string;
  idempotencyKey?: string;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }
  const body: any = {
    userId: options.userId,
    rejectionReason: options.rejectionReason
  };
  if (options.idempotencyKey) {
    body.idempotencyKey = options.idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/reject`, {
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

async function createOrderInPostgres(order: {
  id: string;
  studentId: string;
  studentName: string;
  sellerId?: string;
  sellerName?: string;
  materialType?: string;
  materialTitle?: string;
  quantity: number;
  basePrice: number;
  totalAmount: number;
  status: string;
  rejectionReason?: string;
  negotiationHistory?: any[];
  lastTurnUserId?: string;
}) {
  await pool.query(
    `INSERT INTO materias_primas_pedidos (
      id, alumno_id, alumno_nombre, announcement_id, materia_tipo, materia_titulo,
      cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_iva, coste_transporte,
      importe_total, necesita_transporte, estado, fecha_pedido, seller_id, seller_name,
      rejection_reason, negotiation_history, last_turn_user_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, 1, $7, $8, 0, 0, $9, true, $10, NOW(), $11, $12, $13, $14, $15
    )
    ON CONFLICT (id) DO UPDATE SET
      estado = EXCLUDED.estado,
      rejection_reason = EXCLUDED.rejection_reason,
      negotiation_history = EXCLUDED.negotiation_history,
      last_turn_user_id = EXCLUDED.last_turn_user_id`,
    [
      order.id,
      order.studentId,
      order.studentName,
      `ann_${order.id}`,
      order.materialType || 'hierro',
      order.materialTitle || 'Material de prueba',
      order.quantity,
      order.basePrice,
      order.totalAmount,
      order.status,
      order.sellerId || null,
      order.sellerName || null,
      order.rejectionReason || null,
      order.negotiationHistory ? JSON.stringify(order.negotiationHistory) : null,
      order.lastTurnUserId || null
    ]
  );
}

async function getOrderFromPostgres(orderId: string) {
  const res = await pool.query(`SELECT * FROM materias_primas_pedidos WHERE id = $1`, [orderId]);
  return res.rows[0] || null;
}

async function cleanupOrder(orderId: string) {
  await pool.query(`DELETE FROM materias_primas_pedidos WHERE id = $1`, [orderId]);
  await pool.query(`DELETE FROM operaciones_idempotencia WHERE clave LIKE $1`, [`%${orderId}%`]);
  const db = readLocalDb();
  if (db.rawMaterialOrders) {
    db.rawMaterialOrders = db.rawMaterialOrders.filter((o: any) => o.id !== orderId);
    writeLocalDb(db);
  }
}

async function runTests() {
  console.log("=== INICIANDO SUITE DE PRUEBAS FASE 4.3.8: POST /api/raw-materials/orders/:id/reject ===");
  let passed = 0;
  let failed = 0;

  // Setup test users in db.json if needed
  const db = readLocalDb();
  if (!db.users) db.users = [];
  if (!db.users.find((u: any) => u.id === 'buyer_test_438')) {
    db.users.push({ id: 'buyer_test_438', name: 'Comprador Test 438', role: 'student', level: 1 });
  }
  if (!db.users.find((u: any) => u.id === 'seller_test_438')) {
    db.users.push({ id: 'seller_test_438', name: 'Vendedor Test 438', role: 'student', level: 2 });
  }
  if (!db.users.find((u: any) => u.id === 'unauth_test_438')) {
    db.users.push({ id: 'unauth_test_438', name: 'Intruso Test 438', role: 'student', level: 1 });
  }
  writeLocalDb(db);

  // TEST 1: Rechazo básico por el vendedor
  try {
    const orderId = `test_ord_rej_basic_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const res = await postReject(orderId, {
      userId: 'seller_test_438',
      rejectionReason: 'Stock insuficiente para atender el pedido'
    });

    if (res.status !== 200 || !res.data?.success) {
      throw new Error(`Esperado 200 success, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'rechazado') {
      throw new Error(`Estado en PG debe ser 'rechazado', es '${pgOrder.estado}'`);
    }
    if (pgOrder.rejection_reason !== 'Stock insuficiente para atender el pedido') {
      throw new Error(`rejection_reason en PG incorrecto: '${pgOrder.rejection_reason}'`);
    }

    const history = typeof pgOrder.negotiation_history === 'string'
      ? JSON.parse(pgOrder.negotiation_history)
      : pgOrder.negotiation_history;
    if (!Array.isArray(history) || history.length === 0 || history[history.length - 1].action !== 'rechazado') {
      throw new Error(`negotiation_history debe contener acción 'rechazado'`);
    }

    // Check db.json cache update
    const memDb = readLocalDb();
    const memOrd = (memDb.rawMaterialOrders || []).find((o: any) => o.id === orderId);
    if (!memOrd || memOrd.status !== 'rechazado') {
      throw new Error(`db.json debe estar actualizado a 'rechazado'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 1: Rechazo básico por el vendedor verificado correctamente");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 1 falló:", err.message);
    failed++;
  }

  // TEST 2: Concurrencia de rechazos simultáneos sobre el mismo pedido
  try {
    const orderId = `test_ord_rej_race_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const [resA, resB] = await Promise.all([
      postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Motivo A', idempotencyKey: `rej_race_a_${Date.now()}` }),
      postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Motivo B', idempotencyKey: `rej_race_b_${Date.now()}` })
    ]);

    const statuses = [resA.status, resB.status];
    const successes = statuses.filter(s => s === 200).length;
    const clientErrors = statuses.filter(s => s === 400).length;

    if (successes !== 1 || clientErrors !== 1) {
      throw new Error(`Esperado exactamente 1 éxito (200) y 1 error (400), obtenido: ${statuses.join(', ')}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'rechazado') {
      throw new Error(`El pedido en PG debe estar en estado 'rechazado'`);
    }

    const history = typeof pgOrder.negotiation_history === 'string'
      ? JSON.parse(pgOrder.negotiation_history)
      : pgOrder.negotiation_history;
    if (history.length !== 1) {
      throw new Error(`negotiation_history no debe tener entradas duplicadas por carrera, tiene ${history.length}`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 2: Concurrencia de rechazos simultáneos resuelta atómicamente (1 éxito, 1 rechazado por estado)");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 2 falló:", err.message);
    failed++;
  }

  // TEST 3: Idempotencia con misma clave
  try {
    const orderId = `test_ord_rej_idem_${Date.now()}`;
    const idemKey = `idem_rej_key_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const res1 = await postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Rechazo idempotente', idempotencyKey: idemKey });
    const res2 = await postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Rechazo idempotente', idempotencyKey: idemKey });

    if (res1.status !== 200 || res2.status !== 200) {
      throw new Error(`Ambas respuestas con la misma clave deben ser 200, obtenido ${res1.status} y ${res2.status}`);
    }

    if (res1.data.order.id !== res2.data.order.id || res1.data.order.status !== res2.data.order.status) {
      throw new Error(`Las respuestas deben ser idénticas`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    const history = typeof pgOrder.negotiation_history === 'string'
      ? JSON.parse(pgOrder.negotiation_history)
      : pgOrder.negotiation_history;
    if (history.length !== 1) {
      throw new Error(`No deben crearse múltiples entradas en negotiation_history por peticiones idempotentes, tiene ${history.length}`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 3: Idempotencia estricta con misma clave verificada correctamente");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 3 falló:", err.message);
    failed++;
  }

  // TEST 4: Concurrencia rechazo vs aprobación (/reject vs /approve)
  try {
    const orderId = `test_ord_rej_vs_app_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const [resReject, resApprove] = await Promise.all([
      postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Rechazando en carrera' }),
      postApprove(orderId, 'seller_test_438')
    ]);

    const statuses = [resReject.status, resApprove.status];
    const successes = statuses.filter(s => s === 200).length;
    const failures = statuses.filter(s => s === 400).length;

    if (successes !== 1 || failures !== 1) {
      throw new Error(`Esperado 1 200 y 1 400, obtenido: Reject=${resReject.status}, Approve=${resApprove.status}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'aprobado' && pgOrder.estado !== 'rechazado') {
      throw new Error(`El pedido en PG debe haber quedado en 'aprobado' o 'rechazado', quedó en '${pgOrder.estado}'`);
    }

    await cleanupOrder(orderId);
    console.log(`✔ Test 4: Concurrencia /reject vs /approve resuelta de forma atómica (Ganador: ${pgOrder.estado})`);
    passed++;
  } catch (err: any) {
    console.error("✖ Test 4 falló:", err.message);
    failed++;
  }

  // TEST 5: Concurrencia rechazo vs negociación (/reject vs /negotiate)
  try {
    const orderId = `test_ord_rej_vs_neg_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'en_negociacion',
      lastTurnUserId: 'buyer_test_438' // Seller's turn
    });

    const [resReject, resNegotiate] = await Promise.all([
      postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'No acepto la contraoferta' }),
      postNegotiate(orderId, { userId: 'seller_test_438', pricePerUnit: 15, quantity: 10, note: 'Nueva contraoferta' })
    ]);

    const statuses = [resReject.status, resNegotiate.status];
    const successes = statuses.filter(s => s === 200).length;
    const failures = statuses.filter(s => s === 400).length;

    if (successes !== 1 || failures !== 1) {
      throw new Error(`Esperado 1 200 y 1 400, obtenido: Reject=${resReject.status}, Negotiate=${resNegotiate.status}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'en_negociacion' && pgOrder.estado !== 'rechazado') {
      throw new Error(`El pedido en PG debe haber quedado en 'en_negociacion' o 'rechazado', quedó en '${pgOrder.estado}'`);
    }

    await cleanupOrder(orderId);
    console.log(`✔ Test 5: Concurrencia /reject vs /negotiate resuelta de forma atómica (Ganador: ${pgOrder.estado})`);
    passed++;
  } catch (err: any) {
    console.error("✖ Test 5 falló:", err.message);
    failed++;
  }

  // TEST 6: Intento de rechazo sobre estados no permitidos (aprobado, en_transito, entregado, rechazado)
  const invalidStates = ['aprobado', 'en_transito', 'entregado', 'rechazado'];
  for (const state of invalidStates) {
    try {
      const orderId = `test_ord_rej_inv_${state}_${Date.now()}`;
      await createOrderInPostgres({
        id: orderId,
        studentId: 'buyer_test_438',
        studentName: 'Comprador Test 438',
        sellerId: 'seller_test_438',
        sellerName: 'Vendedor Test 438',
        quantity: 10,
        basePrice: 100,
        totalAmount: 121,
        status: state
      });

      const res = await postReject(orderId, { userId: 'seller_test_438', rejectionReason: 'Intento ilegal' });

      if (res.status !== 400) {
        throw new Error(`Esperado 400 para estado '${state}', obtenido ${res.status}: ${JSON.stringify(res.data)}`);
      }

      const pgOrder = await getOrderFromPostgres(orderId);
      if (pgOrder.estado !== state) {
        throw new Error(`El estado del pedido fue alterado de '${state}' a '${pgOrder.estado}'`);
      }

      await cleanupOrder(orderId);
      console.log(`✔ Test 6 (${state}): Rechazo bloqueado correctamente para estado no permitido '${state}'`);
      passed++;
    } catch (err: any) {
      console.error(`✖ Test 6 (${state}) falló:`, err.message);
      failed++;
    }
  }

  // TEST 7: Intento de rechazo por usuario no autorizado (ni comprador, ni vendedor, ni profesor)
  try {
    const orderId = `test_ord_rej_unauth_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const res = await postReject(orderId, {
      userId: 'unauth_test_438',
      rejectionReason: 'Soy un intruso'
    });

    if (res.status !== 403) {
      throw new Error(`Esperado 403 para usuario no autorizado, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'pendiente') {
      throw new Error(`El pedido en PG fue alterado por usuario no autorizado: '${pgOrder.estado}'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 7: Rechazo por usuario no autorizado bloqueado con 403");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 7 falló:", err.message);
    failed++;
  }

  // TEST 8: Obsolescencia de db.json
  // Caso A: db.json tiene 'aprobado' (desactualizado), pero PostgreSQL tiene 'pendiente' -> debe permitir /reject basado en PG
  try {
    const orderId = `test_ord_rej_obs_a_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    // Ensuciar db.json con copia desactualizada 'aprobado'
    const dbOld = readLocalDb();
    if (!dbOld.rawMaterialOrders) dbOld.rawMaterialOrders = [];
    dbOld.rawMaterialOrders.push({
      id: orderId,
      studentId: 'buyer_test_438',
      sellerId: 'seller_test_438',
      status: 'aprobado',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121
    });
    writeLocalDb(dbOld);

    const res = await postReject(orderId, {
      userId: 'seller_test_438',
      rejectionReason: 'Rechazo basado en verdad de PG'
    });

    if (res.status !== 200 || !res.data?.success) {
      throw new Error(`Esperado 200, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'rechazado') {
      throw new Error(`PG debe mandar y tener estado 'rechazado', tiene '${pgOrder.estado}'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 8A: Obsolescencia db.json ('aprobado' en caché pero 'pendiente' en PG) -> PG manda y /reject tiene éxito");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 8A falló:", err.message);
    failed++;
  }

  // Caso B: db.json tiene 'pendiente' (desactualizado), pero PostgreSQL tiene 'aprobado' -> debe fallar con 400
  try {
    const orderId = `test_ord_rej_obs_b_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'aprobado'
    });

    // Ensuciar db.json con 'pendiente'
    const dbOld = readLocalDb();
    if (!dbOld.rawMaterialOrders) dbOld.rawMaterialOrders = [];
    dbOld.rawMaterialOrders.push({
      id: orderId,
      studentId: 'buyer_test_438',
      sellerId: 'seller_test_438',
      status: 'pendiente',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121
    });
    writeLocalDb(dbOld);

    const res = await postReject(orderId, {
      userId: 'seller_test_438',
      rejectionReason: 'Intentando rechazar con caché caducada'
    });

    if (res.status !== 400) {
      throw new Error(`Esperado 400 ya que PG es 'aprobado', obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'aprobado') {
      throw new Error(`PG debe mantenerse intacto en 'aprobado', está en '${pgOrder.estado}'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 8B: Obsolescencia db.json ('pendiente' en caché pero 'aprobado' en PG) -> PG manda y /reject es denegado");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 8B falló:", err.message);
    failed++;
  }

  // TEST 9: Pedido inexistente en PostgreSQL -> 404 (sin consultar db.json)
  try {
    const orderId = `test_ord_rej_nonexist_${Date.now()}`;
    // Poner en db.json pero NO en PostgreSQL
    const dbMem = readLocalDb();
    if (!dbMem.rawMaterialOrders) dbMem.rawMaterialOrders = [];
    dbMem.rawMaterialOrders.push({
      id: orderId,
      studentId: 'buyer_test_438',
      sellerId: 'seller_test_438',
      status: 'pendiente',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121
    });
    writeLocalDb(dbMem);

    const res = await postReject(orderId, {
      userId: 'seller_test_438',
      rejectionReason: 'No estoy en PG'
    });

    if (res.status !== 404) {
      throw new Error(`Esperado 404 ya que no existe en PostgreSQL, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 9: Pedido inexistente en PostgreSQL devuelve 404 sin consultar db.json como fuente");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 9 falló:", err.message);
    failed++;
  }

  // TEST 10: Rechazo por el comprador (en estado en_negociacion o pendiente)
  try {
    const orderId = `test_ord_rej_buyer_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'seller_test_438',
      sellerName: 'Vendedor Test 438',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'en_negociacion'
    });

    const res = await postReject(orderId, {
      userId: 'buyer_test_438',
      rejectionReason: 'El comprador desiste de la negociación'
    });

    if (res.status !== 200 || !res.data?.success) {
      throw new Error(`Esperado 200, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'rechazado') {
      throw new Error(`El pedido debe estar en 'rechazado'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 10: Rechazo por el comprador participante permitido y persistido");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 10 falló:", err.message);
    failed++;
  }

  // TEST 11: Rechazo por el profesor (oficial o mediación)
  try {
    const orderId = `test_ord_rej_prof_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      studentId: 'buyer_test_438',
      studentName: 'Comprador Test 438',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'BricoMaster Distribuciones',
      quantity: 10,
      basePrice: 100,
      totalAmount: 121,
      status: 'pendiente'
    });

    const res = await postReject(orderId, {
      userId: 'profesor-1',
      rejectionReason: 'Rechazado por distribuidor oficial'
    });

    if (res.status !== 200 || !res.data?.success) {
      throw new Error(`Esperado 200 para profesor, obtenido ${res.status}: ${JSON.stringify(res.data)}`);
    }

    const pgOrder = await getOrderFromPostgres(orderId);
    if (pgOrder.estado !== 'rechazado') {
      throw new Error(`El pedido debe estar en 'rechazado'`);
    }

    await cleanupOrder(orderId);
    console.log("✔ Test 11: Rechazo por el profesor/distribuidor oficial permitido y persistido");
    passed++;
  } catch (err: any) {
    console.error("✖ Test 11 falló:", err.message);
    failed++;
  }

  console.log(`\n======================================================`);
  console.log(`RESULTADOS DE PRUEBAS FASE 4.3.8:`);
  console.log(`PASADAS: ${passed}`);
  console.log(`FALLIDAS: ${failed}`);
  console.log(`TOTAL: ${passed + failed}`);
  console.log(`======================================================\n`);

  await pool.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(async (e) => {
  console.error("Error fatal en la ejecución de pruebas:", e);
  await pool.end();
  process.exit(1);
});
