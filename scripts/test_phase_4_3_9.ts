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

async function postSendInvoice(orderId: string, options: {
  userId?: string;
  idempotencyKey?: string;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }
  const body: any = {
    userId: options.userId
  };
  if (options.idempotencyKey) {
    body.idempotencyKey = options.idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/send-invoice`, {
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

async function postShip(orderId: string, userId: string, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/ship`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, idempotencyKey })
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postDeliver(orderId: string, options: {
  userId: string;
  deliveredAt?: string;
  idempotencyKey?: string;
}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }
  const body: any = {
    userId: options.userId,
    deliveredAt: options.deliveredAt
  };
  if (options.idempotencyKey) {
    body.idempotencyKey = options.idempotencyKey;
  }
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/deliver`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
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
  alumno_id: string;
  alumno_nombre: string;
  seller_id?: string;
  seller_name?: string;
  estado: string;
  cantidad: number;
  precio_base: number;
  importe_iva: number;
  coste_transporte: number;
  importe_total: number;
  materia_tipo: string;
  materia_titulo: string;
  shipped_at?: string;
  fecha_entrega?: string;
  inventory_credited?: boolean;
  invoice_number?: string;
  invoiced_at?: string;
  negotiation_history?: any[];
}) {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO materias_primas_pedidos (
        id, alumno_id, alumno_nombre, seller_id, seller_name,
        announcement_id, materia_tipo, materia_titulo,
        cantidad, peso_unitario_kg, peso_total_kg,
        precio_base, importe_iva, coste_transporte, importe_total,
        necesita_transporte, direccion_entrega, estado,
        shipped_at, fecha_entrega, inventory_credited,
        invoice_number, invoiced_at, negotiation_history
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18,
        $19, $20, $21,
        $22, $23, $24
      )
      ON CONFLICT (id) DO UPDATE SET
        estado = EXCLUDED.estado,
        seller_id = EXCLUDED.seller_id,
        seller_name = EXCLUDED.seller_name,
        shipped_at = EXCLUDED.shipped_at,
        fecha_entrega = EXCLUDED.fecha_entrega,
        inventory_credited = EXCLUDED.inventory_credited,
        invoice_number = EXCLUDED.invoice_number,
        invoiced_at = EXCLUDED.invoiced_at,
        negotiation_history = EXCLUDED.negotiation_history`,
      [
        order.id,
        order.alumno_id,
        order.alumno_nombre,
        order.seller_id || null,
        order.seller_name || null,
        'ann-test-inv',
        order.materia_tipo,
        order.materia_titulo,
        order.cantidad,
        1,
        order.cantidad,
        order.precio_base,
        order.importe_iva,
        order.coste_transporte,
        order.importe_total,
        true,
        'Calle Industria 45, Madrid',
        order.estado,
        order.shipped_at ? new Date(order.shipped_at) : null,
        order.fecha_entrega ? new Date(order.fecha_entrega) : null,
        order.inventory_credited ?? false,
        order.invoice_number || null,
        order.invoiced_at ? new Date(order.invoiced_at) : null,
        order.negotiation_history ? JSON.stringify(order.negotiation_history) : null
      ]
    );
  } finally {
    client.release();
  }
}

async function getOrderFromPostgres(orderId: string) {
  const client = await pool.connect();
  try {
    const res = await client.query(`SELECT * FROM materias_primas_pedidos WHERE id = $1`, [orderId]);
    return res.rows[0] || null;
  } finally {
    client.release();
  }
}

async function runTests() {
  console.log('--- STARTING FASE 4.3.9 TESTS: POST /api/raw-materials/orders/:id/send-invoice ---');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // Ensure test users exist in db.json and PostgreSQL cuentas & inventario
  const db = readLocalDb();
  if (!db.users) db.users = [];
  const ensureUser = (id: string, name: string, role: string) => {
    const existing = db.users.find((u: any) => u.id === id);
    if (!existing) {
      db.users.push({ id, name, role, balance: 50000, level: 2 });
    } else {
      existing.balance = 50000;
      existing.level = 2;
    }
  };
  ensureUser('profesor-1', 'Profesor Don Carlos', 'teacher');
  ensureUser('student-buyer-1', 'Alumno Comprador', 'student');
  ensureUser('student-seller-1', 'Alumno Vendedor', 'student');
  ensureUser('student-intruder-1', 'Alumno Intruso', 'student');
  writeLocalDb(db);

  // Seed PostgreSQL cuentas and materias_primas_inventario
  const setupClient = await pool.connect();
  try {
    const defaultNaves = JSON.stringify({
      nave_principal: {
        ironKg: 1000,
        metalKg: 1000,
        plasticKg: 1000,
        epoxiKg: 1000
      }
    });

    for (const uid of ['student-buyer-1', 'student-seller-1']) {
      await setupClient.query(
        `INSERT INTO cuentas (id, alumno, saldo, role, level)
         VALUES ($1, $2, 50000, 'student', 2)
         ON CONFLICT (id) DO UPDATE SET saldo = 50000`,
        [uid, uid === 'student-buyer-1' ? 'Alumno Comprador' : 'Alumno Vendedor']
      );

      await setupClient.query(
        `INSERT INTO materias_primas_inventario (
           alumno_id, alumno_nombre,
           fragmentos_hierro_kg, fragmentos_metal_kg, pellets_plastico_kg, pegamento_epoxi_kg,
           desglose_almacenes
         ) VALUES ($1, $2, 1000, 1000, 1000, 1000, $3::jsonb)
         ON CONFLICT (alumno_id) DO UPDATE SET
           fragmentos_hierro_kg = 1000,
           fragmentos_metal_kg = 1000,
           pellets_plastico_kg = 1000,
           pegamento_epoxi_kg = 1000,
           desglose_almacenes = $3::jsonb`,
        [uid, uid === 'student-buyer-1' ? 'Alumno Comprador' : 'Alumno Vendedor', defaultNaves]
      );
    }
  } finally {
    setupClient.release();
  }

  // TEST 1: Facturación normal (delivered order -> send-invoice -> estado = 'facturado', unique invoice_number, invoiced_at)
  {
    console.log('\n[TEST 1] Facturación normal sobre pedido entregado');
    const orderId = `test_inv_norm_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro Forjado',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    const res = await postSendInvoice(orderId, { userId: 'student-seller-1' });
    assert(res.status === 200, `Status is 200, got ${res.status}`);
    assert(res.data?.success === true, 'Response returns success: true');
    assert(typeof res.data?.invoiceNumber === 'string' && res.data?.invoiceNumber.startsWith('FACT-'), `Valid invoice number: ${res.data?.invoiceNumber}`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'facturado', `Estado in PostgreSQL updated to facturado, got ${pgOrder.estado}`);
    assert(pgOrder.invoice_number === res.data?.invoiceNumber, `invoice_number matches in PostgreSQL: ${pgOrder.invoice_number}`);
    assert(pgOrder.invoiced_at !== null, 'invoiced_at is set in PostgreSQL');
    assert(pgOrder.inventory_credited === true, 'inventory_credited is preserved as true');
    assert(pgOrder.fecha_entrega !== null, 'fecha_entrega is preserved');
  }

  // TEST 2: Dos /send-invoice simultáneos con claves diferentes → una sola factura efectiva
  {
    console.log('\n[TEST 2] Concurrency: 2 requests with different idempotency keys on delivered order');
    const orderId = `test_inv_conc_diff_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 5,
      precio_base: 50,
      importe_iva: 10.5,
      coste_transporte: 10,
      importe_total: 70.5,
      materia_tipo: 'metal',
      materia_titulo: 'Metal Galvanizado',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    const [res1, res2] = await Promise.all([
      postSendInvoice(orderId, { userId: 'student-seller-1', idempotencyKey: `key_a_${Date.now()}` }),
      postSendInvoice(orderId, { userId: 'student-seller-1', idempotencyKey: `key_b_${Date.now()}` })
    ]);

    assert(res1.status === 200 && res2.status === 200, `Both returned 200 (res1=${res1.status}, res2=${res2.status})`);
    assert(res1.data?.invoiceNumber === res2.data?.invoiceNumber, `Both return identical invoiceNumber: ${res1.data?.invoiceNumber} === ${res2.data?.invoiceNumber}`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'facturado', `PostgreSQL status is facturado`);
    assert(pgOrder.invoice_number === res1.data?.invoiceNumber, `PostgreSQL has single invoice number ${pgOrder.invoice_number}`);
  }

  // TEST 3: Misma clave simultánea → respuestas consistentes y una sola operación
  {
    console.log('\n[TEST 3] Concurrency: 2 simultaneous requests with SAME idempotency key');
    const orderId = `test_inv_same_key_${Date.now()}`;
    const sharedKey = `shared_inv_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 8,
      precio_base: 80,
      importe_iva: 16.8,
      coste_transporte: 12,
      importe_total: 108.8,
      materia_tipo: 'plastico',
      materia_titulo: 'Pellets Plástico',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    const [res1, res2] = await Promise.all([
      postSendInvoice(orderId, { userId: 'student-seller-1', idempotencyKey: sharedKey }),
      postSendInvoice(orderId, { userId: 'student-seller-1', idempotencyKey: sharedKey })
    ]);

    assert(res1.status === 200 && res2.status === 200, `Both returned 200`);
    assert(res1.data?.invoiceNumber === res2.data?.invoiceNumber, `Same invoice number: ${res1.data?.invoiceNumber}`);
    assert(res1.data?.message === res2.data?.message, `Consistent message`);
  }

  // TEST 4: Reintento después de una facturación ya confirmada → devuelve la factura existente, no 400 ni una nueva factura
  {
    console.log('\n[TEST 4] Retry after already invoiced order returns existing invoice without creating new one or failing');
    const orderId = `test_inv_retry_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 15,
      precio_base: 150,
      importe_iva: 31.5,
      coste_transporte: 20,
      importe_total: 201.5,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    const firstCall = await postSendInvoice(orderId, { userId: 'student-seller-1' });
    assert(firstCall.status === 200, `First call returned 200`);
    const originalInvoice = firstCall.data?.invoiceNumber;

    // Retry with different idempotency key
    const retryCall = await postSendInvoice(orderId, { userId: 'student-seller-1', idempotencyKey: `retry_key_${Date.now()}` });
    assert(retryCall.status === 200, `Retry returned 200, got ${retryCall.status}`);
    assert(retryCall.data?.invoiceNumber === originalInvoice, `Retry returned exact same invoiceNumber ${originalInvoice}`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.invoice_number === originalInvoice, `PostgreSQL retains original invoice_number`);
  }

  // TEST 5: /send-invoice simultáneo con /approve
  {
    console.log('\n[TEST 5] Concurrency: /send-invoice vs /approve on pending order');
    const orderId = `test_inv_vs_appr_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'pendiente',
      cantidad: 20,
      precio_base: 200,
      importe_iva: 42,
      coste_transporte: 25,
      importe_total: 267,
      materia_tipo: 'metal',
      materia_titulo: 'Metal'
    });

    const [invRes, apprRes] = await Promise.all([
      postSendInvoice(orderId, { userId: 'student-seller-1' }),
      postApprove(orderId, 'student-seller-1')
    ]);

    // Send-invoice on pending order must be rejected (400) because order is not delivered
    assert(invRes.status === 400, `send-invoice returned 400 on unfulfilled order, got ${invRes.status}`);
    // Approve succeeds
    assert(apprRes.status === 200, `approve succeeded with 200`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'aprobado', `PostgreSQL order transitioned cleanly to aprobado, got ${pgOrder.estado}`);
    assert(pgOrder.invoice_number === null, 'invoice_number is null');
  }

  // TEST 6: /send-invoice simultáneo con /ship
  {
    console.log('\n[TEST 6] Concurrency: /send-invoice vs /ship on approved order');
    const orderId = `test_inv_vs_ship_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'aprobado',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro'
    });

    // Ensure seller has sufficient inventory in PostgreSQL for /ship
    const client = await pool.connect();
    try {
      await client.query(
        `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, fragmentos_hierro_kg)
         VALUES ($1, $2, 100)
         ON CONFLICT (alumno_id) DO UPDATE SET fragmentos_hierro_kg = 100`,
        ['student-seller-1', 'Alumno Vendedor']
      );
    } finally {
      client.release();
    }

    const [invRes, shipRes] = await Promise.all([
      postSendInvoice(orderId, { userId: 'student-seller-1' }),
      postShip(orderId, 'student-seller-1')
    ]);

    // send-invoice on approved order must be rejected (400) because it has not been delivered yet
    assert(invRes.status === 400, `send-invoice returned 400 on undelivered order, got ${invRes.status}`);
    // ship succeeds
    assert(shipRes.status === 200, `ship succeeded with 200`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'en_transito', `PostgreSQL order is en_transito, got ${pgOrder.estado}`);
    assert(pgOrder.shipped_at !== null, 'shipped_at is recorded');
  }

  // TEST 7: /send-invoice simultáneo con /deliver
  {
    console.log('\n[TEST 7] Concurrency: /send-invoice vs /deliver on in_transit order');
    const orderId = `test_inv_vs_deliv_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'en_transito',
      cantidad: 12,
      precio_base: 120,
      importe_iva: 25.2,
      coste_transporte: 15,
      importe_total: 160.2,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro',
      shipped_at: new Date().toISOString()
    });

    const [delivRes, invRes] = await Promise.all([
      postDeliver(orderId, { userId: 'student-buyer-1' }),
      postSendInvoice(orderId, { userId: 'student-seller-1' })
    ]);

    // Deliver must succeed (credits buyer inventory)
    assert(delivRes.status === 200, `Deliver returned 200, got ${delivRes.status}`);
    // If invoice arrived after deliver, it succeeded (200), if arrived before deliver, it got 400
    assert(invRes.status === 200 || invRes.status === 400, `Invoice returned valid status (${invRes.status})`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.inventory_credited === true, `Inventory was safely credited to buyer`);
    assert(pgOrder.fecha_entrega !== null, `fecha_entrega is present`);
    assert(pgOrder.estado === 'entregado' || pgOrder.estado === 'facturado', `State is either entregado or facturado, got ${pgOrder.estado}`);
  }

  // TEST 8: /send-invoice simultáneo con /reject
  {
    console.log('\n[TEST 8] Concurrency: /send-invoice vs /reject on pending order');
    const orderId = `test_inv_vs_rej_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'pendiente',
      cantidad: 5,
      precio_base: 50,
      importe_iva: 10.5,
      coste_transporte: 10,
      importe_total: 70.5,
      materia_tipo: 'plastico',
      materia_titulo: 'Plástico'
    });

    const [invRes, rejRes] = await Promise.all([
      postSendInvoice(orderId, { userId: 'student-seller-1' }),
      postReject(orderId, { userId: 'student-seller-1', rejectionReason: 'Cancelado por vendedor' })
    ]);

    assert(invRes.status === 400, `send-invoice returned 400 on pending order`);
    assert(rejRes.status === 200, `reject succeeded with 200`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'rechazado', `PostgreSQL order is rechazado, got ${pgOrder.estado}`);
    assert(pgOrder.rejection_reason === 'Cancelado por vendedor', 'rejection_reason is saved');
  }

  // TEST 9: db.json deliberadamente obsoleto frente a PostgreSQL → PostgreSQL prevalece
  {
    console.log('\n[TEST 9] Obsolete db.json: PostgreSQL is single source of truth');
    const orderId = `test_inv_stale_db_${Date.now()}`;
    // In PostgreSQL: entregado
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 14,
      precio_base: 140,
      importe_iva: 29.4,
      coste_transporte: 15,
      importe_total: 184.4,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    // In db.json: deliberately obsolete (status: pendiente, or empty)
    const localDb = readLocalDb();
    if (!localDb.rawMaterialOrders) localDb.rawMaterialOrders = [];
    localDb.rawMaterialOrders = localDb.rawMaterialOrders.filter((o: any) => o.id !== orderId);
    localDb.rawMaterialOrders.push({
      id: orderId,
      studentId: 'student-buyer-1',
      status: 'pendiente',
      totalAmount: 184.4
    });
    writeLocalDb(localDb);

    // Call /send-invoice
    const res = await postSendInvoice(orderId, { userId: 'student-seller-1' });
    assert(res.status === 200, `send-invoice succeeded reading locked PostgreSQL row (status: 200)`);
    assert(res.data?.success === true, 'Success is true');

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'facturado', `PostgreSQL is facturado`);
    assert(pgOrder.inventory_credited === true, `PostgreSQL inventory_credited preserved`);

    const updatedLocalDb = readLocalDb();
    const cachedOrder = updatedLocalDb.rawMaterialOrders.find((o: any) => o.id === orderId);
    assert(cachedOrder?.status === 'facturado', `db.json cache refreshed to facturado post-commit`);
  }

  // TEST 10: Usuario no autorizado → 403 y ningún cambio
  {
    console.log('\n[TEST 10] Unauthorized user receives 403 and causes no changes');
    const orderId = `test_inv_unauth_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'entregado',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    // Intruding user (neither seller nor teacher)
    const res = await postSendInvoice(orderId, { userId: 'student-intruder-1' });
    assert(res.status === 403, `Status is 403, got ${res.status}`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'entregado', `State untouched: ${pgOrder.estado}`);
    assert(pgOrder.invoice_number === null, 'invoice_number remains null');
  }

  // TEST 11: Pedido inexistente en PostgreSQL → 404
  {
    console.log('\n[TEST 11] Non-existent order in PostgreSQL returns 404');
    const res = await postSendInvoice('non_existent_order_id_999', { userId: 'profesor-1' });
    assert(res.status === 404, `Status is 404, got ${res.status}`);
  }

  // TEST 12: Estado no permitido → 400 y ningún cambio
  {
    console.log('\n[TEST 12] Disallowed states return 400');
    const disallowedStates = ['pendiente', 'en_negociacion', 'aprobado', 'en_transito', 'rechazado'];
    for (const st of disallowedStates) {
      const orderId = `test_inv_disallowed_${st}_${Date.now()}`;
      await createOrderInPostgres({
        id: orderId,
        alumno_id: 'student-buyer-1',
        alumno_nombre: 'Alumno Comprador',
        seller_id: 'student-seller-1',
        seller_name: 'Alumno Vendedor',
        estado: st,
        cantidad: 10,
        precio_base: 100,
        importe_iva: 21,
        coste_transporte: 15,
        importe_total: 136,
        materia_tipo: 'hierro',
        materia_titulo: 'Hierro'
      });

      const res = await postSendInvoice(orderId, { userId: 'student-seller-1' });
      assert(res.status === 400, `State "${st}" returns 400, got ${res.status}`);

      const pgOrder = await getOrderFromPostgres(orderId);
      assert(pgOrder.estado === st, `State "${st}" untouched in PostgreSQL`);
      assert(pgOrder.invoice_number === null, `invoice_number is null for state "${st}"`);
    }
  }

  // TEST 13: Profesor autorizado para pedidos oficiales
  {
    console.log('\n[TEST 13] Teacher is authorized to send invoice for official supplier orders');
    const orderId = `test_inv_official_${Date.now()}`;
    await createOrderInPostgres({
      id: orderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'proveedor-materia-prima',
      seller_name: 'Distribuidora S.A.',
      estado: 'entregado',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro',
      fecha_entrega: new Date().toISOString(),
      inventory_credited: true
    });

    const res = await postSendInvoice(orderId, { userId: 'profesor-1' });
    assert(res.status === 200, `Teacher successfully issued invoice for official order (200)`);
    assert(typeof res.data?.invoiceNumber === 'string' && res.data?.invoiceNumber.startsWith('FACT-'), `Invoice generated: ${res.data?.invoiceNumber}`);

    const pgOrder = await getOrderFromPostgres(orderId);
    assert(pgOrder.estado === 'facturado', `Estado is facturado in PostgreSQL`);
  }

  // REGRESSION TESTS: Check that endpoints from 4.3.3, 4.3.4, 4.3.5, 4.3.6, 4.3.8 still work flawlessly
  {
    console.log('\n[REGRESSION TESTS] Verifying previous migrated endpoints');

    const defaultNaves = JSON.stringify({
      nave_principal: {
        ironKg: 1000,
        metalKg: 1000,
        plasticKg: 1000,
        epoxiKg: 1000
      }
    });

    await pool.query(
      `UPDATE materias_primas_inventario
       SET fragmentos_hierro_kg = 1000,
           fragmentos_metal_kg = 1000,
           pellets_plastico_kg = 1000,
           pegamento_epoxi_kg = 1000,
           desglose_almacenes = $1::jsonb
       WHERE alumno_id = 'student-seller-1'`,
      [defaultNaves]
    );

    // 1. /negotiate (4.3.6)
    const negOrderId = `test_reg_neg_${Date.now()}`;
    await createOrderInPostgres({
      id: negOrderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'pendiente',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro'
    });
    const negRes = await postNegotiate(negOrderId, {
      userId: 'student-seller-1',
      discountPercentage: 5,
      note: 'Descuento del 5%'
    });
    assert(negRes.status === 200, `Regression /negotiate: returned 200`);

    // 2. /approve (4.3.3)
    const apprRes = await postApprove(negOrderId, 'student-buyer-1');
    assert(apprRes.status === 200, `Regression /approve: returned 200`);

    // 3. /ship (4.3.4)
    const shipRes = await postShip(negOrderId, 'student-seller-1');
    assert(shipRes.status === 200, `Regression /ship: returned 200`);

    // 4. /deliver (4.3.5)
    const delivRes = await postDeliver(negOrderId, { userId: 'student-buyer-1' });
    assert(delivRes.status === 200, `Regression /deliver: returned 200`);

    // 5. /send-invoice (4.3.9) on delivered order
    const invRes = await postSendInvoice(negOrderId, { userId: 'student-seller-1' });
    assert(invRes.status === 200, `Regression /send-invoice after delivery: returned 200`);

    // 6. /reject (4.3.8)
    const rejOrderId = `test_reg_rej_${Date.now()}`;
    await createOrderInPostgres({
      id: rejOrderId,
      alumno_id: 'student-buyer-1',
      alumno_nombre: 'Alumno Comprador',
      seller_id: 'student-seller-1',
      seller_name: 'Alumno Vendedor',
      estado: 'pendiente',
      cantidad: 10,
      precio_base: 100,
      importe_iva: 21,
      coste_transporte: 15,
      importe_total: 136,
      materia_tipo: 'hierro',
      materia_titulo: 'Hierro'
    });
    const rejRes = await postReject(rejOrderId, { userId: 'student-seller-1', rejectionReason: 'No stock' });
    assert(rejRes.status === 200, `Regression /reject: returned 200`);
  }

  console.log(`\n========================================`);
  console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);

  await pool.end();

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Unhandled error in tests:', err);
  pool.end().finally(() => process.exit(1));
});
