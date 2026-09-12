import pg from 'pg';
import fs from 'fs';
import path from 'path';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const DB_URL = process.env.DATABASE_URL || "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const BASE_URL = "http://localhost:3000";
const DB_FILE = path.join(process.cwd(), 'db.json');

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 15,
  connectionTimeoutMillis: 15000
});

function readLocalDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeLocalDb(db: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

interface OrderPayload {
  studentId: string;
  announcementId?: string;
  quantity?: number;
  items?: Array<{ announcementId: string; quantity: number }>;
  transportMethod?: 'vendedor_envio' | 'comprador_recogida';
  discountPercentage?: number;
  insuranceFee?: number;
  destinationNaveId?: string;
  note?: string;
  idempotencyKey?: string;
}

async function postCreateOrder(payload: OrderPayload, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) {
    headers['x-idempotency-key'] = idempotencyKey;
  }
  const body: any = { ...payload };
  if (idempotencyKey) {
    body.idempotencyKey = idempotencyKey;
  }

  const res = await fetch(`${BASE_URL}/api/raw-materials/orders`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postApprove(orderId: string, userId: string, idempotencyKey?: string) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
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
  if (idempotencyKey) headers['x-idempotency-key'] = idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/ship`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ userId, idempotencyKey })
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postDeliver(orderId: string, options: { userId: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/deliver`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postReject(orderId: string, options: { userId: string; rejectionReason?: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/reject`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postSendInvoice(orderId: string, options: { userId: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/send-invoice`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function postNegotiate(orderId: string, options: { userId: string; discountPercentage?: number; note?: string; idempotencyKey?: string }) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) headers['x-idempotency-key'] = options.idempotencyKey;
  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/negotiate`, {
    method: 'POST',
    headers,
    body: JSON.stringify(options)
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function syncAnnouncementsBatch(announcements: any[]) {
  // 1. Sync to db.json in a single atomic write
  const db = readLocalDb();
  if (!db.rawMaterialAnnouncements) db.rawMaterialAnnouncements = [];
  for (const ann of announcements) {
    const idx = db.rawMaterialAnnouncements.findIndex((a: any) => a.id === ann.id);
    if (idx >= 0) db.rawMaterialAnnouncements[idx] = ann;
    else db.rawMaterialAnnouncements.push(ann);
  }
  writeLocalDb(db);

  // 2. Sync to Postgres
  const client = await pool.connect();
  try {
    for (const ann of announcements) {
      await client.query(
        `INSERT INTO anuncios_materia_prima (
           id, material_type, title, presentation, unit_weight_kg, is_pallet, price_per_unit,
           description, updated_at, duration_days, expiration_date, stock, active, seller_id, seller_name, seller_level,
           seller_location, seller_municipality, seller_province,
           is_des_tornillo, price_alert
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7,
           $8, $9, $10, $11, $12, $13, $14, $15, $16,
           $17, $18, $19,
           $20, $21
         )
         ON CONFLICT (id) DO UPDATE SET
           material_type = EXCLUDED.material_type,
           title = EXCLUDED.title,
           presentation = EXCLUDED.presentation,
           unit_weight_kg = EXCLUDED.unit_weight_kg,
           is_pallet = EXCLUDED.is_pallet,
           price_per_unit = EXCLUDED.price_per_unit,
           description = EXCLUDED.description,
           updated_at = EXCLUDED.updated_at,
           duration_days = EXCLUDED.duration_days,
           expiration_date = EXCLUDED.expiration_date,
           stock = EXCLUDED.stock,
           active = EXCLUDED.active,
           seller_id = EXCLUDED.seller_id,
           seller_name = EXCLUDED.seller_name,
           seller_level = EXCLUDED.seller_level,
           is_des_tornillo = EXCLUDED.is_des_tornillo`,
        [
          ann.id,
          ann.materialType,
          ann.title,
          ann.presentation || 'Pallet',
          ann.unitWeightKg || 1,
          ann.isPallet !== undefined ? ann.isPallet : true,
          ann.pricePerUnit || 0,
          ann.description || '',
          new Date(),
          'indefinido',
          null,
          String(ann.stock),
          ann.active !== undefined ? ann.active : true,
          ann.sellerId || null,
          ann.sellerName || null,
          ann.sellerLevel || 'official',
          ann.sellerLocation || null,
          ann.sellerMunicipality || null,
          ann.sellerProvince || null,
          ann.isDesTornillo !== undefined ? !!ann.isDesTornillo : false,
          null
        ]
      );
    }
  } finally {
    client.release();
  }
}

async function runValidationBattery() {
  console.log('================================================================================');
  console.log('=== FASE 4.3.10.2: VALIDACIÓN DE CONCURRENCIA Y CONSISTENCIA DE POST /api/raw-materials/orders ===');
  console.log('================================================================================\n');

  let passed = 0;
  let failed = 0;
  const deadlocks: any[] = [];
  const testResults: Record<string, any> = {};

  function assert(cond: boolean, msg: string) {
    if (cond) {
      console.log(`  ✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${msg}`);
      failed++;
    }
  }

  // --- SEED USERS, WAREHOUSES & VEHICLES ---
  const db = readLocalDb();
  if (!db.users) db.users = [];
  if (!db.acquisitions) db.acquisitions = [];
  if (!db.purchasedVehicles) db.purchasedVehicles = [];

  const setupUser = (id: string, name: string, role: string, balance: number = 50000, level: number = 1) => {
    let u = db.users.find((x: any) => x.id === id);
    if (!u) {
      u = { id, name, username: id, role, balance, level, accountNumber: `ES9900010009${id.slice(-6)}` };
      db.users.push(u);
    } else {
      u.balance = balance;
      u.level = level;
    }
  };

  setupUser('profesor-1', 'Profesor de Contabilidad', 'teacher', 999999, 2);
  setupUser('test_buyer_rm_1', 'Alumno Comprador A', 'student', 50000, 1);
  setupUser('test_buyer_rm_2', 'Alumno Comprador B', 'student', 1000, 1);
  setupUser('test_seller_rm_1', 'Alumno Vendedor Alfa', 'student', 25000, 2);
  setupUser('test_seller_rm_2', 'Alumno Vendedor Beta', 'student', 25000, 1);

  // Setup warehouse and forklift for test_buyer_rm_1 and test_buyer_rm_2
  const ensureBuyerWarehouseAndForklift = (studentId: string, naveId: string) => {
    const existingNave = db.acquisitions.find((a: any) => a.studentId === studentId && a.id === naveId);
    if (!existingNave) {
      db.acquisitions.push({
        id: naveId,
        studentId,
        propertyTitle: `Nave Industrial ${studentId}`,
        propertyType: 'nave_industrial',
        surfaceM2: 500,
        storageM2: 200,
        location: 'Polígono Industrial San Fernando, Madrid'
      });
    }
    const existingVehicle = db.purchasedVehicles.find((v: any) => v.studentId === studentId && v.vehicleType === 'carretilla_elevadora');
    if (!existingVehicle) {
      db.purchasedVehicles.push({
        id: `veh_forklift_${studentId}`,
        studentId,
        vehicleType: 'carretilla_elevadora',
        plate: `FK-${studentId.slice(-4)}`,
        assignedPropertyId: naveId
      });
    }
  };

  ensureBuyerWarehouseAndForklift('test_buyer_rm_1', 'nave_test_buyer_1');
  ensureBuyerWarehouseAndForklift('test_buyer_rm_2', 'nave_test_buyer_2');
  writeLocalDb(db);

  // Seed Postgres cuentas and materias_primas_inventario
  const initClient = await pool.connect();
  try {
    for (const u of ['test_buyer_rm_1', 'test_buyer_rm_2', 'test_seller_rm_1', 'test_seller_rm_2', 'profesor-1']) {
      const uObj = db.users.find((x: any) => x.id === u)!;
      await initClient.query(
        `INSERT INTO cuentas (id, alumno, saldo, role, level, account_number)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (id) DO UPDATE SET saldo = EXCLUDED.saldo, level = EXCLUDED.level`,
        [u, uObj.name, uObj.balance, uObj.role, uObj.level, uObj.accountNumber]
      );

      const defaultNaves = JSON.stringify({
        nave_principal: {
          ironKg: 10000,
          metalKg: 500,
          plasticKg: 10000,
          epoxiKg: 500,
          producedScrewdriversUnits: 100,
          starScrewdriversUnits: 100,
          flatScrewdriversUnits: 100
        }
      });
      await initClient.query(
        `INSERT INTO materias_primas_inventario (
           alumno_id, alumno_nombre, fragmentos_hierro_kg, destornilladores_punta_estrella, destornilladores_punta_plana, desglose_almacenes
         ) VALUES ($1, $2, 10000, 100, 100, $3::jsonb)
         ON CONFLICT (alumno_id) DO UPDATE SET
           fragmentos_hierro_kg = 10000,
           destornilladores_punta_estrella = 100,
           destornilladores_punta_plana = 100,
           desglose_almacenes = $3::jsonb`,
        [u, uObj.name, defaultNaves]
      );
    }
  } finally {
    initClient.release();
  }

  // --- PRE-SEED ALL ANNOUNCEMENTS UPFRONT TO PREVENT CONCURRENT DB.JSON OVERWRITES ---
  const ts = Date.now();
  const ann1Id = `ann_stock_test_${ts}`;
  const ann2Id = `ann_dest_test_${ts}`;
  const ann3Id = `ann_balance_test_${ts}`;
  const ann4Id = `ann_idem_test_${ts}`;
  const ann5Id = `ann_diff_keys_${ts}`;
  const ann6Id = `ann_rollback_${ts}`;
  const ann7Id = `ann_inv_${ts}`;
  const ann8Id = `ann_peer_pending_${ts}`;
  const annCrossA = `ann_cross_a_${ts}`;
  const annCrossB = `ann_cross_b_${ts}`;
  const pipelineAnnId = `ann_pipe_${ts}`;
  const rejectAnnId = `ann_rej_pipe_${ts}`;

  const allTestAnnouncements = [
    {
      id: ann1Id,
      title: 'Hierro Laminado Test Concurrencia',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 100,
      active: true,
      minOrderUnits: 1,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann2Id,
      title: 'Destornilladores Estrella Lote Test',
      sellerId: 'test_seller_rm_1',
      sellerName: 'Alumno Vendedor Alfa',
      sellerLevel: 1,
      materialType: 'producto_final',
      unitWeightKg: 0,
      pricePerUnit: 25,
      stock: 200,
      active: true,
      isDesTornillo: true,
      minOrderUnits: 1,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann3Id,
      title: 'Pellets Plástico Test Saldo',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'plastico',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 200,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann4Id,
      title: 'Epoxi Resina Idem Test',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'epoxi',
      unitWeightKg: 1,
      pricePerUnit: 12,
      stock: 200,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann5Id,
      title: 'Plástico Diff Keys Test',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'plastico',
      unitWeightKg: 1,
      pricePerUnit: 8,
      stock: 100,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann6Id,
      title: 'Hierro Rollback Test',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 50,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann7Id,
      title: 'Hierro Acreditación Directa',
      sellerId: 'proveedor-materia-prima',
      sellerName: 'Proveedor Oficial Siderúrgico',
      sellerLevel: 'official',
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 50,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: ann8Id,
      title: 'Hierro Sobrante Peer-to-Peer',
      sellerId: 'test_seller_rm_2',
      sellerName: 'Alumno Vendedor Beta',
      sellerLevel: 1,
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 80,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: annCrossA,
      title: 'Cross A',
      sellerId: 'test_seller_rm_1',
      sellerName: 'Vendedor Alfa',
      sellerLevel: 1,
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 5,
      stock: 50,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: annCrossB,
      title: 'Cross B Plástico',
      sellerId: 'test_buyer_rm_1',
      sellerName: 'Comprador A',
      sellerLevel: 1,
      materialType: 'plastico',
      unitWeightKg: 1,
      pricePerUnit: 5,
      stock: 50,
      active: true,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: pipelineAnnId,
      title: 'Destornilladores Estrella Pipeline Test',
      sellerId: 'test_seller_rm_1',
      sellerName: 'Alumno Vendedor Alfa',
      sellerLevel: 1,
      materialType: 'producto_final',
      unitWeightKg: 0,
      pricePerUnit: 25,
      stock: 50,
      active: true,
      isDesTornillo: false,
      deliveryOptions: ['vendedor_envio']
    },
    {
      id: rejectAnnId,
      title: 'Reject Regression Material',
      sellerId: 'test_seller_rm_1',
      sellerName: 'Alumno Vendedor Alfa',
      sellerLevel: 1,
      materialType: 'hierro',
      unitWeightKg: 1,
      pricePerUnit: 10,
      stock: 50,
      active: true
    }
  ];

  console.log('Total announcements to sync:', allTestAnnouncements.length);
  console.log('IDs to sync:', allTestAnnouncements.map(a => a.id));
  await syncAnnouncementsBatch(allTestAnnouncements);
  const verifyDb = readLocalDb();
  console.log('Verified in db.json immediately after sync:', verifyDb.rawMaterialAnnouncements?.filter((a: any) => a.id.includes(String(ts))).map((a: any) => a.id));

  // ---------------------------------------------------------------------------
  // 1. PRUEBA 1: COMPRA AUTOAPROBADA — STOCK DEL ANUNCIO
  // ---------------------------------------------------------------------------
  console.log('\n--- 1. COMPRA AUTOAPROBADA: STOCK DEL ANUNCIO (10 peticiones concurrentes) ---');

  const buyer1Before = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_1'])).rows[0];
  const buyer1InitialBalance = Number(buyer1Before.saldo);

  const reqs1 = Array.from({ length: 10 }, (_, i) => 
    postCreateOrder({
      studentId: 'test_buyer_rm_1',
      announcementId: ann1Id,
      quantity: 100,
      transportMethod: 'vendedor_envio'
    }, `idem_ann1_req_${i}_${Date.now()}`)
  );

  const results1 = await Promise.all(reqs1);
  const successes1 = results1.filter(r => r.status === 200 && r.data?.success === true);
  const rejects1 = results1.filter(r => r.status === 400 || (r.data && !r.data.success));

  const ann1After = (await pool.query('SELECT stock, active FROM anuncios_materia_prima WHERE id = $1', [ann1Id])).rows[0];
  const buyer1After = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_1'])).rows[0];
  const buyer1FinalBalance = Number(buyer1After.saldo);
  const orders1InPg = (await pool.query('SELECT * FROM materias_primas_pedidos WHERE announcement_id = $1', [ann1Id])).rows;
  const movs1InPg = (await pool.query("SELECT * FROM movimientos WHERE cuenta_id = 'test_buyer_rm_1' AND concepto LIKE $1", [`%${ann1Id}%`])).rows;

  assert(successes1.length === 1, `Exactamente 1 respuesta exitosa (obtenidas: ${successes1.length})`);
  assert(rejects1.length === 9, `Exactamente 9 respuestas rechazadas por stock (obtenidas: ${rejects1.length})`);
  assert(Number(ann1After.stock) === 0, `Stock final en PostgreSQL es 0 (obtenido: ${ann1After.stock})`);
  assert(Number(ann1After.stock) >= 0, `Stock nunca es negativo`);
  assert(ann1After.active === false, `El anuncio se marca como inactivo tras agotarse el stock`);
  assert(orders1InPg.length === 1, `Exactamente 1 pedido creado en PostgreSQL (obtenidos: ${orders1InPg.length})`);
  assert(buyer1FinalBalance < buyer1InitialBalance, `El comprador fue debitado por el pedido exitoso`);
  
  const expectedTotalCost = orders1InPg[0] ? Number(orders1InPg[0].importe_total) : 0;
  const actualDebited = Math.round((buyer1InitialBalance - buyer1FinalBalance) * 100) / 100;
  assert(Math.abs(actualDebited - expectedTotalCost) < 0.05, `Comprador debitado exactamente 1 vez por el importe correcto (${actualDebited} € vs ${expectedTotalCost} €)`);

  testResults['1_stock_anuncio'] = {
    initialStock: 100,
    concurrentRequests: 10,
    successCount: successes1.length,
    rejectCount: rejects1.length,
    finalStock: Number(ann1After.stock),
    ordersCreated: orders1InPg.length
  };
  console.log('[After Test 1] ann5 in db.json?', !!readLocalDb().rawMaterialAnnouncements?.find((a: any) => a.id === ann5Id));

  // ---------------------------------------------------------------------------
  // 2. PRUEBA 2: INVENTARIO DEL MISMO VENDEDOR (El Des-Tornillo / Alumno Vendedor)
  // ---------------------------------------------------------------------------
  console.log('\n--- 2. INVENTARIO DEL VENDEDOR ALUMNO (Compras concurrentes que superan inventario) ---');
  await new Promise(r => setTimeout(r, 400));
  // Set seller inventory: 50 star screwdrivers with warehouse breakdown
  const sellerNaves = JSON.stringify({
    nave_principal: {
      starScrewdriversUnits: 50,
      producedScrewdriversUnits: 50,
      ironScrewdriversUnits: 50
    }
  });
  await pool.query(
    `UPDATE materias_primas_inventario
     SET destornilladores_punta_estrella = 50,
         destornilladores_punta_plana = 0,
         destornilladores_hierro = 50,
         destornilladores_metal = 0,
         productos_ensamblados = 50,
         desglose_almacenes = $1::jsonb
     WHERE alumno_id = 'test_seller_rm_1'`,
    [sellerNaves]
  );

  const seller2Before = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_seller_rm_1'])).rows[0];
  const seller2InitialBalance = Number(seller2Before.saldo);

  // 4 concurrent purchases of 25 screwdrivers by Teacher (profesor-1) -> total 100, but only 50 in stock
  const reqs2 = Array.from({ length: 4 }, (_, i) =>
    postCreateOrder({
      studentId: 'profesor-1',
      announcementId: ann2Id,
      quantity: 25,
      transportMethod: 'vendedor_envio'
    }, `idem_ann2_dest_${i}_${Date.now()}`)
  );

  const results2 = await Promise.all(reqs2);
  for (const [idx, r] of results2.entries()) {
    console.log(`    [Test 2 Req ${idx}] status: ${r.status}, error: ${r.data?.error || 'none'}`);
  }
  const successes2 = results2.filter(r => r.status === 200 && r.data?.success === true);
  const rejects2 = results2.filter(r => r.status === 400 || (r.data && !r.data.success));

  const sellerInvAfter = (await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', ['test_seller_rm_1'])).rows[0];
  const seller2After = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_seller_rm_1'])).rows[0];
  const seller2FinalBalance = Number(seller2After.saldo);
  const remainingScrewdrivers = Number(sellerInvAfter.destornilladores_punta_estrella || sellerInvAfter.destornilladores_hierro || 0);

  assert(successes2.length === 2, `Exactamente 2 compras exitosas aprobadas (25 + 25 = 50) (obtenidas: ${successes2.length})`);
  assert(rejects2.length === 2, `Exactamente 2 compras rechazadas por falta de inventario (obtenidas: ${rejects2.length})`);
  assert(remainingScrewdrivers === 0, `Inventario final del vendedor es 0 (obtenido: ${remainingScrewdrivers})`);
  assert(remainingScrewdrivers >= 0, `Inventario del vendedor nunca es negativo`);
  assert(seller2FinalBalance > seller2InitialBalance, `Saldo del vendedor acreditado por las 2 ventas realizadas`);

  testResults['2_inventario_vendedor'] = {
    initialScrewdrivers: 50,
    requestedTotal: 100,
    successCount: successes2.length,
    rejectCount: rejects2.length,
    finalScrewdrivers: remainingScrewdrivers
  };
  console.log('[After Test 2] ann5 in db.json?', !!readLocalDb().rawMaterialAnnouncements?.find((a: any) => a.id === ann5Id));

  // ---------------------------------------------------------------------------
  // 3. PRUEBA 3: SALDO DEL COMPRADOR (Compras concurrentes que superan saldo)
  // ---------------------------------------------------------------------------
  console.log('\n--- 3. SALDO DEL COMPRADOR (Límite de saldo estricto con compras concurrentes) ---');
  await new Promise(r => setTimeout(r, 400));
  // Set test_buyer_rm_2 saldo to 1,000 € in PostgreSQL
  await pool.query('UPDATE cuentas SET saldo = 1000 WHERE id = $1', ['test_buyer_rm_2']);

  // Launch 3 concurrent requests of 50 units (~750 € each, 3 * 750 = 2,250 € > 1,000 €)
  const reqs3 = Array.from({ length: 3 }, (_, i) =>
    postCreateOrder({
      studentId: 'test_buyer_rm_2',
      announcementId: ann3Id,
      quantity: 50,
      transportMethod: 'vendedor_envio'
    }, `idem_ann3_bal_${i}_${Date.now()}`)
  );

  const results3 = await Promise.all(reqs3);
  const successes3 = results3.filter(r => r.status === 200 && r.data?.success === true);
  const rejects3 = results3.filter(r => r.status === 400 && String(r.data?.error || '').toLowerCase().includes('saldo'));

  const buyer2After = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_2'])).rows[0];
  const buyer2FinalBalance = Number(buyer2After.saldo);

  assert(successes3.length === 1, `Exactamente 1 compra aprobada con saldo disponible (obtenidas: ${successes3.length})`);
  assert(rejects3.length === 2, `Exactamente 2 compras rechazadas por saldo insuficiente (obtenidas: ${rejects3.length})`);
  assert(buyer2FinalBalance >= 0, `Saldo del comprador nunca es negativo (saldo final: ${buyer2FinalBalance} €)`);
  assert(buyer2FinalBalance < 1000, `Saldo descontado limpiamente por el pedido aprobado`);

  testResults['3_saldo_comprador'] = {
    initialBalance: 1000,
    successCount: successes3.length,
    rejectCount: rejects3.length,
    finalBalance: buyer2FinalBalance
  };
  console.log('[After Test 3] ann5 in db.json?', !!readLocalDb().rawMaterialAnnouncements?.find((a: any) => a.id === ann5Id));

  // ---------------------------------------------------------------------------
  // 4. PRUEBA 4: IDEMPOTENCIA REAL (Misma clave simultánea y reintento diferido)
  // ---------------------------------------------------------------------------
  console.log('\n--- 4. IDEMPOTENCIA REAL (Misma clave x-idempotency-key simultánea y secuencial) ---');
  const fixedIdemKey = `idem_exact_match_${Date.now()}`;
  // 4 simultaneous calls with identical idempotency key
  const reqs4Simultaneous = Array.from({ length: 4 }, () =>
    postCreateOrder({
      studentId: 'test_buyer_rm_1',
      announcementId: ann4Id,
      quantity: 10,
      transportMethod: 'vendedor_envio'
    }, fixedIdemKey)
  );

  const results4 = await Promise.all(reqs4Simultaneous);
  const successes4 = results4.filter(r => r.status === 200 && r.data?.success === true);
  const orderIds4 = new Set(results4.map(r => r.data?.order?.id).filter(Boolean));

  assert(successes4.length === 4, `Las 4 peticiones concurrentes devuelven 200 OK consistente (obtenidas: ${successes4.length})`);
  assert(orderIds4.size === 1, `Todas retornan exactamente el mismo ID de pedido (${Array.from(orderIds4)[0]})`);

  // Sequential retry after completion
  const retry4 = await postCreateOrder({
    studentId: 'test_buyer_rm_1',
    announcementId: ann4Id,
    quantity: 10,
    transportMethod: 'vendedor_envio'
  }, fixedIdemKey);

  assert(retry4.status === 200, `Reintento secuencial devuelve 200 OK`);
  assert(retry4.data?.order?.id === Array.from(orderIds4)[0], `Reintento secuencial devuelve el pedido original sin duplicar`);

  const orders4InPg = (await pool.query('SELECT * FROM materias_primas_pedidos WHERE announcement_id = $1', [ann4Id])).rows;
  assert(orders4InPg.length === 1, `En PostgreSQL existe exactamente 1 pedido físico (encontrados: ${orders4InPg.length})`);

  const ann4After = (await pool.query('SELECT stock FROM anuncios_materia_prima WHERE id = $1', [ann4Id])).rows[0];
  assert(Number(ann4After.stock) === 190, `Stock descontado solo 1 vez (200 - 10 = 190, obtenido: ${ann4After.stock})`);

  testResults['4_idempotencia_real'] = {
    simultaneousRequests: 4,
    uniqueOrderIds: orderIds4.size,
    pgOrdersCount: orders4InPg.length,
    finalStock: Number(ann4After.stock)
  };
  console.log('[After Test 4] ann5 in db.json?', !!readLocalDb().rawMaterialAnnouncements?.find((a: any) => a.id === ann5Id));

  // ---------------------------------------------------------------------------
  // 5. PRUEBA 5: CLAVES DIFERENTES (Operaciones legítimas no se bloquean)
  // ---------------------------------------------------------------------------
  console.log('\n--- 5. CLAVES DIFERENTES (Compras independientes simultáneas) ---');
  await new Promise(r => setTimeout(r, 400));
  const checkDb5 = readLocalDb();
  const foundAnn5 = checkDb5.rawMaterialAnnouncements?.find((a: any) => a.id === ann5Id);
  console.log(`[Test 5 Check] ann5Id ${ann5Id} in db.json?`, !!foundAnn5);
  console.log(`[Test 5 Check] Current announcements with ts ${ts} in db.json:`, checkDb5.rawMaterialAnnouncements?.filter((a: any) => a.id.includes(String(ts))).map((a: any) => a.id));
  const reqs5 = Array.from({ length: 3 }, (_, i) =>
    postCreateOrder({
      studentId: 'test_buyer_rm_1',
      announcementId: ann5Id,
      quantity: 10,
      transportMethod: 'vendedor_envio'
    }, `idem_diff_key_${i}_${Date.now()}`)
  );

  const results5 = await Promise.all(reqs5);
  for (const [idx, r] of results5.entries()) {
    console.log(`    [Test 5 Req ${idx}] status: ${r.status}, error: ${r.data?.error || 'none'}`);
  }
  const successes5 = results5.filter(r => r.status === 200 && r.data?.success === true);
  const orderIds5 = new Set(results5.map(r => r.data?.order?.id).filter(Boolean));

  assert(successes5.length === 3, `Las 3 peticiones con claves diferentes se ejecutaron con éxito (obtenidas: ${successes5.length})`);
  assert(orderIds5.size === 3, `Se generaron 3 pedidos distintos (1 por operación)`);

  const ann5After = (await pool.query('SELECT stock FROM anuncios_materia_prima WHERE id = $1', [ann5Id])).rows[0];
  assert(Number(ann5After.stock) === 70, `Stock descontado exactamente por las 3 operaciones (100 - 30 = 70, obtenido: ${ann5After.stock})`);

  testResults['5_claves_diferentes'] = {
    requestsCount: 3,
    successCount: successes5.length,
    distinctOrderIds: orderIds5.size,
    finalStock: Number(ann5After.stock)
  };

  // ---------------------------------------------------------------------------
  // 6. PRUEBA 6: ROLLBACK Y ATOMICIDAD
  // ---------------------------------------------------------------------------
  console.log('\n--- 6. ROLLBACK Y ATOMICIDAD (Reversión completa ante error) ---');
  await new Promise(r => setTimeout(r, 400));
  // Attempt purchase with insufficient balance
  const buyer2PreBal = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_2'])).rows[0].saldo;
  const ann6PreStock = (await pool.query('SELECT stock FROM anuncios_materia_prima WHERE id = $1', [ann6Id])).rows[0].stock;

  const failRes = await postCreateOrder({
    studentId: 'test_buyer_rm_2',
    announcementId: ann6Id,
    quantity: 40, // 40 * 10 = 400 € > buyer saldo or set unit price high
    transportMethod: 'vendedor_envio'
  }, `idem_rollback_${Date.now()}`);

  assert(failRes.status === 400, `Operación fallida rechazada con 400 (obtenido: ${failRes.status})`);

  const buyer2PostBal = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_2'])).rows[0].saldo;
  const ann6PostStock = (await pool.query('SELECT stock FROM anuncios_materia_prima WHERE id = $1', [ann6Id])).rows[0].stock;
  const orders6InPg = (await pool.query('SELECT * FROM materias_primas_pedidos WHERE announcement_id = $1', [ann6Id])).rows;

  assert(buyer2PreBal === buyer2PostBal, `Saldo del comprador sin cambios tras rollback (${buyer2PreBal} == ${buyer2PostBal})`);
  assert(ann6PreStock === ann6PostStock, `Stock del anuncio sin cambios tras rollback (${ann6PreStock} == ${ann6PostStock})`);
  assert(orders6InPg.length === 0, `Ningún pedido huérfano creado en PostgreSQL (encontrados: ${orders6InPg.length})`);

  testResults['6_rollback'] = {
    status: failRes.status,
    saldoUnchanged: buyer2PreBal === buyer2PostBal,
    stockUnchanged: ann6PreStock === ann6PostStock,
    orphanOrders: orders6InPg.length
  };

  // ---------------------------------------------------------------------------
  // 7. PRUEBA 7: ACREDITACIÓN DEL INVENTARIO DEL COMPRADOR
  // ---------------------------------------------------------------------------
  console.log('\n--- 7. ACREDITACIÓN DIRECTA DEL INVENTARIO DEL COMPRADOR EN POSTGRESQL ---');
  await new Promise(r => setTimeout(r, 400));
  const buyerInv7Pre = (await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', ['test_buyer_rm_1'])).rows[0];
  const initialIronKg = Number(buyerInv7Pre.fragmentos_hierro_kg || 0);

  const order7Res = await postCreateOrder({
    studentId: 'test_buyer_rm_1',
    announcementId: ann7Id,
    quantity: 15, // 15 kg iron
    transportMethod: 'vendedor_envio'
  }, `idem_credit_${Date.now()}`);

  assert(order7Res.status === 200, `Pedido creado con éxito (200 OK)`);

  const buyerInv7Post = (await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', ['test_buyer_rm_1'])).rows[0];
  const finalIronKg = Number(buyerInv7Post.fragmentos_hierro_kg || 0);
  const order7Pg = (await pool.query('SELECT * FROM materias_primas_pedidos WHERE announcement_id = $1', [ann7Id])).rows[0];

  assert(finalIronKg === initialIronKg + 15, `Inventario de hierro en PostgreSQL incrementado exactamente en 15 kg (${initialIronKg} -> ${finalIronKg})`);
  assert(order7Pg.inventory_credited === true, `Flag inventory_credited en PostgreSQL es true`);
  assert(order7Pg.estado === 'entregado', `Estado del pedido autoaprobado es entregado`);

  // Verify desglose_almacenes
  const warehousesJson = buyerInv7Post.desglose_almacenes;
  assert(warehousesJson !== null && typeof warehousesJson === 'object', `desglose_almacenes actualizado en PostgreSQL`);

  testResults['7_acreditacion_inventario'] = {
    initialIronKg,
    finalIronKg,
    inventoryCredited: order7Pg.inventory_credited,
    orderStatus: order7Pg.estado
  };

  // ---------------------------------------------------------------------------
  // 8. PRUEBA 8: COMPRA PENDIENTE / NEGOCIACIÓN (Alumno a Alumno)
  // ---------------------------------------------------------------------------
  console.log('\n--- 8. COMPRA PENDIENTE / NEGOCIACIÓN (Alumno a Alumno) ---');
  await new Promise(r => setTimeout(r, 400));
  const checkDb8 = readLocalDb();
  const foundAnn8 = checkDb8.rawMaterialAnnouncements?.find((a: any) => a.id === ann8Id);
  console.log(`[Test 8 Check] ann8Id ${ann8Id} in db.json?`, !!foundAnn8);
  const buyerPreBal8 = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_1'])).rows[0].saldo;
  const sellerPreBal8 = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_seller_rm_2'])).rows[0].saldo;

  const pendingRes = await postCreateOrder({
    studentId: 'test_buyer_rm_1',
    announcementId: ann8Id,
    quantity: 20,
    transportMethod: 'vendedor_envio',
    note: 'Propuesta de compra pendiente'
  }, `idem_peer_${Date.now()}`);

  console.log(`    [Test 8 pendingRes] status: ${pendingRes.status}, error: ${pendingRes.data?.error || 'none'}`);

  assert(pendingRes.status === 200, `Solicitud pendiente creada con éxito (200 OK)`);
  assert(pendingRes.data?.order?.status === 'pendiente', `Estado de la orden es "pendiente"`);

  const order8Pg = (await pool.query('SELECT * FROM materias_primas_pedidos WHERE announcement_id = $1', [ann8Id])).rows[0];
  assert(order8Pg?.estado === 'pendiente', `Estado en PostgreSQL persistido como "pendiente"`);
  assert(order8Pg?.inventory_credited === false, `inventory_credited en PostgreSQL es false (no acreditado prematuramente)`);

  const buyerPostBal8 = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_1'])).rows[0].saldo;
  const sellerPostBal8 = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_seller_rm_2'])).rows[0].saldo;

  assert(buyerPreBal8 === buyerPostBal8, `Saldo del comprador NO se descuenta prematuramente (${buyerPreBal8} == ${buyerPostBal8})`);
  assert(sellerPreBal8 === sellerPostBal8, `Saldo del vendedor NO se acredita prematuramente (${sellerPreBal8} == ${sellerPostBal8})`);

  // Concurrent pending requests on same announcement
  const pendingReqs2 = Array.from({ length: 2 }, (_, i) =>
    postCreateOrder({
      studentId: 'test_buyer_rm_1',
      announcementId: ann8Id,
      quantity: 15,
      transportMethod: 'vendedor_envio'
    }, `idem_peer_conc_${i}_${Date.now()}`)
  );
  const pendingResults2 = await Promise.all(pendingReqs2);
  const pendingSuccesses2 = pendingResults2.filter(r => r.status === 200);
  assert(pendingSuccesses2.length === 2, `Ambas solicitudes de negociación concurrentes son aceptadas como pendientes`);

  testResults['8_compra_pendiente'] = {
    orderStatus: order8Pg?.estado,
    inventoryCredited: order8Pg?.inventory_credited,
    buyerBalPreserved: buyerPreBal8 === buyerPostBal8,
    sellerBalPreserved: sellerPreBal8 === sellerPostBal8
  };

  // ---------------------------------------------------------------------------
  // 9. PRUEBA 9: CONCURRENCIA CRUZADA (Creación vs estados posteriores)
  // ---------------------------------------------------------------------------
  console.log('\n--- 9. CONCURRENCIA CRUZADA (Creación vs Flujos de Pedido) ---');
  // Create a pending order, then test concurrent approve + reject
  const pendingOrderId = pendingSuccesses2[0]?.data?.order?.id || pendingRes.data?.order?.id;
  if (pendingOrderId) {
    const [approveRes, rejectRes] = await Promise.all([
      postApprove(pendingOrderId, 'test_seller_rm_2', `idem_app_${Date.now()}`),
      postReject(pendingOrderId, { userId: 'test_seller_rm_2', rejectionReason: 'Rechazado concurrentemente', idempotencyKey: `idem_rej_${Date.now()}` })
    ]);

    const finalOrderInPg = (await pool.query('SELECT estado FROM materias_primas_pedidos WHERE id = $1', [pendingOrderId])).rows[0];
    assert(['aprobado', 'rechazado', 'entregado'].includes(finalOrderInPg.estado), `Estado final consistente en PostgreSQL (${finalOrderInPg.estado}), sin corrupción ni doble transición`);
  }

  // ---------------------------------------------------------------------------
  // 10. PRUEBA 10: DB.JSON POST-COMMIT CACHE AUDIT
  // ---------------------------------------------------------------------------
  console.log('\n--- 10. AUDITORÍA DE DB.JSON Y FUENTE DE VERDAD ---');
  // Check that PostgreSQL is queried directly for balance and stock
  // and db.json updates are performed post-commit via fresh readDb()
  const dbCurrent = readLocalDb();
  const buyerInDb = dbCurrent.users.find((u: any) => u.id === 'test_buyer_rm_1');
  const buyerInPg = (await pool.query('SELECT saldo FROM cuentas WHERE id = $1', ['test_buyer_rm_1'])).rows[0];
  
  console.log(`  Información: Saldo en db.json (${buyerInDb?.balance}) vs Saldo en PostgreSQL (${Number(buyerInPg.saldo)})`);
  assert(Math.abs(Number(buyerInDb?.balance) - Number(buyerInPg.saldo)) < 1.0, `db.json cache se mantiene sincronizado post-commit con PostgreSQL`);

  // ---------------------------------------------------------------------------
  // 11. PRUEBA 11: PREVENCIÓN DE DEADLOCKS (Cuentas cruzadas y orden determinista)
  // ---------------------------------------------------------------------------
  console.log('\n--- 11. PREVENCIÓN DE DEADLOCKS (Cuentas cruzadas) ---');
  await new Promise(r => setTimeout(r, 400));
  const crossReqs = [
    postCreateOrder({ studentId: 'test_buyer_rm_1', announcementId: annCrossA, quantity: 2 }, `idem_cr1_${Date.now()}`),
    postCreateOrder({ studentId: 'test_seller_rm_1', announcementId: annCrossB, quantity: 2 }, `idem_cr2_${Date.now()}`),
    postCreateOrder({ studentId: 'test_buyer_rm_1', announcementId: annCrossA, quantity: 2 }, `idem_cr3_${Date.now()}`),
    postCreateOrder({ studentId: 'test_seller_rm_1', announcementId: annCrossB, quantity: 2 }, `idem_cr4_${Date.now()}`)
  ];

  const crossResults = await Promise.all(crossReqs);
  const crossErrors = crossResults.filter(r => String(r.data?.error || '').includes('deadlock') || String(r.data?.error || '').includes('40P01'));

  assert(crossErrors.length === 0, `Cero errores de deadlock (40P01) detectados en ejecuciones cruzadas (detectados: ${crossErrors.length})`);

  // ---------------------------------------------------------------------------
  // 12. PRUEBA 12: INTEGRIDAD FINAL
  // ---------------------------------------------------------------------------
  console.log('\n--- 12. INTEGRIDAD GLOBAL EN POSTGRESQL ---');
  const negBalances = (await pool.query('SELECT count(*) as c FROM cuentas WHERE saldo < 0')).rows[0].c;
  assert(Number(negBalances) === 0, `Cero cuentas con saldo negativo en PostgreSQL`);

  const negInventories = (await pool.query(`
    SELECT count(*) as c FROM materias_primas_inventario
    WHERE fragmentos_hierro_kg < 0
       OR fragmentos_metal_kg < 0
       OR pellets_plastico_kg < 0
       OR pegamento_epoxi_kg < 0
       OR destornilladores_punta_estrella < 0
       OR destornilladores_punta_plana < 0
  `)).rows[0].c;
  assert(Number(negInventories) === 0, `Cero inventarios con valores negativos en PostgreSQL`);

  const orphanMovements = (await pool.query(`
    SELECT count(*) as c FROM movimientos m
    LEFT JOIN cuentas c ON m.cuenta_id = c.id
    WHERE c.id IS NULL AND m.cuenta_id IN ('test_buyer_rm_1', 'test_buyer_rm_2', 'test_seller_rm_1', 'test_seller_rm_2')
  `)).rows[0].c;
  assert(Number(orphanMovements) === 0, `Cero movimientos financieros huérfanos`);

  // ---------------------------------------------------------------------------
  // 13. PRUEBA 13: REGRESIÓN DE FASES CERRADAS (4.3.3 - 4.3.9)
  // ---------------------------------------------------------------------------
  console.log('\n--- 13. REGRESIÓN DE FASES PREVIAS (4.3.3 - 4.3.9) ---');
  await new Promise(r => setTimeout(r, 400));
  await pool.query(
    `UPDATE materias_primas_inventario
     SET destornilladores_punta_estrella = 100,
         destornilladores_punta_plana = 100,
         destornilladores_hierro = 100,
         destornilladores_metal = 100,
         productos_ensamblados = 100
     WHERE alumno_id = 'test_seller_rm_1'`
  );
  const pipeOrderRes = await postCreateOrder({
    studentId: 'test_buyer_rm_1',
    announcementId: pipelineAnnId,
    quantity: 5,
    transportMethod: 'vendedor_envio'
  }, `idem_pipe_create_${Date.now()}`);
  console.log('[Test 13 pipeOrderRes]', pipeOrderRes.status, JSON.stringify(pipeOrderRes.data));
  const pipeOrderId = pipeOrderRes.data?.order?.id;
  assert(pipeOrderRes.status === 200 && pipeOrderId, `Regresión Create: Pedido creado (${pipeOrderId})`);

  if (pipeOrderId) {
    const regNeg = await postNegotiate(pipeOrderId, { userId: 'test_seller_rm_1', discountPercentage: 5, note: 'Descuento 5%' });
    console.log('[Test 13 regNeg]', regNeg.status, JSON.stringify(regNeg.data));
    assert(regNeg.status === 200, `Regresión 4.3.6 /negotiate: 200 OK`);

    const regApp = await postApprove(pipeOrderId, 'test_seller_rm_1');
    console.log('[Test 13 regApp]', regApp.status, JSON.stringify(regApp.data));
    assert(regApp.status === 200, `Regresión 4.3.3 /approve: 200 OK`);

    // Ensure seller has stock before shipping
    await pool.query(
      `UPDATE materias_primas_inventario
       SET destornilladores_punta_estrella = 100,
           destornilladores_punta_plana = 100,
           destornilladores_hierro = 100,
           destornilladores_metal = 100,
           productos_ensamblados = 100
       WHERE alumno_id = 'test_seller_rm_1'`
    );

    const regShip = await postShip(pipeOrderId, 'test_seller_rm_1');
    console.log('[Test 13 regShip]', regShip.status, JSON.stringify(regShip.data));
    assert(regShip.status === 200, `Regresión 4.3.4 /ship: 200 OK`);

    const regDel = await postDeliver(pipeOrderId, { userId: 'test_buyer_rm_1' });
    console.log('[Test 13 regDel]', regDel.status, JSON.stringify(regDel.data));
    assert(regDel.status === 200, `Regresión 4.3.5 /deliver: 200 OK`);

    const regInv = await postSendInvoice(pipeOrderId, { userId: 'test_seller_rm_1' });
    console.log('[Test 13 regInv]', regInv.status, JSON.stringify(regInv.data));
    assert(regInv.status === 200, `Regresión 4.3.9 /send-invoice: 200 OK, factura emitida`);
  }

  // Reject regression
  const rejOrderRes = await postCreateOrder({
    studentId: 'test_buyer_rm_1',
    announcementId: rejectAnnId,
    quantity: 5,
    transportMethod: 'vendedor_envio'
  }, `idem_pipe_rej_${Date.now()}`);
  const rejOrderId = rejOrderRes.data?.order?.id;
  if (rejOrderId) {
    const regRej = await postReject(rejOrderId, { userId: 'test_seller_rm_1', rejectionReason: 'Prueba de regresión rechazo' });
    assert(regRej.status === 200, `Regresión 4.3.8 /reject: 200 OK`);
  }

  console.log('\n================================================================================');
  console.log(`=== RESUMEN BATERÍA 4.3.10.2: ${passed} PASSED, ${failed} FAILED ===`);
  console.log('================================================================================\n');

  await pool.end();
  return { passed, failed, testResults };
}

runValidationBattery().then(res => {
  if (res.failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}).catch(err => {
  console.error('Fatal Error running validation battery:', err);
  process.exit(1);
});
