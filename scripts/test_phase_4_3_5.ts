import pg from 'pg';
import fs from 'fs';
import path from 'path';

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

async function postDeliver(orderId: string, options: {
  endpoint?: 'deliver' | 'confirm-receipt';
  userId?: string;
  idempotencyKey?: string;
} = {}) {
  const endpoint = options.endpoint || 'deliver';
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (options.idempotencyKey) {
    headers['x-idempotency-key'] = options.idempotencyKey;
  }
  const body: any = {};
  if (options.userId) body.userId = options.userId;
  if (options.idempotencyKey) body.idempotencyKey = options.idempotencyKey;

  const res = await fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/${endpoint}`, {
    method: 'POST',
    headers,
    body: Object.keys(body).length > 0 ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, data };
}

async function setupOrderAndBuyer(params: {
  orderId: string;
  sellerId: string;
  sellerName: string;
  buyerId: string;
  buyerName: string;
  status: string;
  materialType?: string;
  materialTitle?: string;
  quantity: number;
  inventoryCredited?: boolean;
  buyerInitialStock?: number;
  naveId?: string;
  shippedAt?: string | null;
}) {
  const {
    orderId,
    sellerId,
    sellerName,
    buyerId,
    buyerName,
    status,
    materialType = 'varilla',
    materialTitle = 'Varilla de hierro estrella',
    quantity,
    inventoryCredited = false,
    buyerInitialStock = 0,
    naveId = 'nave-1',
    shippedAt = null
  } = params;

  // Clean prior state
  await pool.query('DELETE FROM materias_primas_pedidos WHERE id = $1', [orderId]);
  await pool.query('DELETE FROM operaciones_idempotencia WHERE clave LIKE $1', [`%${orderId}%`]);

  // Set buyer inventory in PostgreSQL
  const isVarilla = materialTitle.toLowerCase().includes('varilla') || materialType === 'varilla';
  const isHierroKg = materialType === 'hierro' || materialTitle.toLowerCase().includes('hierro') && !isVarilla;

  let naveStock: any = {};
  if (isVarilla) {
    naveStock = {
      [naveId]: {
        ironKg: 0,
        producedStarRodsUnits: buyerInitialStock,
        producedIronRodsUnits: buyerInitialStock,
        producedRodsUnits: buyerInitialStock
      }
    };
  } else if (isHierroKg) {
    naveStock = {
      [naveId]: {
        ironKg: buyerInitialStock,
        producedStarRodsUnits: 0,
        producedIronRodsUnits: 0,
        producedRodsUnits: 0
      }
    };
  }

  await pool.query(`
    INSERT INTO materias_primas_inventario (
      alumno_id, alumno_nombre, fragmentos_hierro_kg, varillas_punta_estrella, varillas_punta, desglose_almacenes, fecha_actualizacion
    ) VALUES ($1, $2, $3, $4, $4, $5::jsonb, NOW())
    ON CONFLICT (alumno_id) DO UPDATE SET
      fragmentos_hierro_kg = $3,
      varillas_punta_estrella = $4,
      varillas_punta = $4,
      desglose_almacenes = $5::jsonb,
      fecha_actualizacion = NOW()
  `, [
    buyerId,
    buyerName,
    isHierroKg ? buyerInitialStock : 0,
    isVarilla ? buyerInitialStock : 0,
    JSON.stringify(naveStock)
  ]);

  // Insert order in PostgreSQL
  await pool.query(`
    INSERT INTO materias_primas_pedidos (
      id, alumno_id, alumno_nombre, announcement_id, seller_id, seller_name, materia_tipo, materia_titulo,
      cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_total, importe_iva, coste_transporte,
      necesita_transporte, direccion_entrega, estado, fecha_pedido, inventory_credited, destination_nave_id, shipped_at
    ) VALUES (
      $1, $2, $3, 'ann_test', $4, $5, $6, $7,
      $8, 0.1, $8 * 0.1, 100, 100, 21, 0,
      false, 'Nave Central', $9, NOW(), $10, $11, $12
    )
    ON CONFLICT (id) DO UPDATE SET
      estado = $9,
      cantidad = $8,
      inventory_credited = $10,
      destination_nave_id = $11,
      shipped_at = $12
  `, [
    orderId, buyerId, buyerName, sellerId, sellerName, materialType, materialTitle,
    quantity, status, inventoryCredited, naveId, shippedAt ? new Date(shippedAt) : null
  ]);

  // Mirror to db.json
  const db = readLocalDb();
  if (!db.rawMaterialOrders) db.rawMaterialOrders = [];
  const oIdx = db.rawMaterialOrders.findIndex((o: any) => o.id === orderId);
  const orderObj = {
    id: orderId,
    studentId: buyerId,
    studentName: buyerName,
    sellerId,
    sellerName,
    materialType,
    materialTitle,
    quantity,
    unitWeightKg: 0.1,
    totalKg: quantity * 0.1,
    basePrice: 100,
    ivaAmount: 21,
    transportCost: 0,
    totalAmount: 121,
    needsTransport: false,
    deliveryAddress: 'Nave Central',
    destinationNaveId: naveId,
    status,
    inventoryCredited,
    shippedAt: shippedAt || undefined,
    requestedAt: new Date().toISOString()
  };
  if (oIdx >= 0) {
    db.rawMaterialOrders[oIdx] = orderObj;
  } else {
    db.rawMaterialOrders.push(orderObj);
  }

  if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
  const bInvIdx = db.rawMaterialInventories.findIndex((i: any) => i.studentId === buyerId);
  const invObj = {
    studentId: buyerId,
    ironKg: isHierroKg ? buyerInitialStock : 0,
    metalKg: 0,
    plasticKg: 0,
    epoxiKg: 0,
    producedRodsUnits: isVarilla ? buyerInitialStock : 0,
    producedStarRodsUnits: isVarilla ? buyerInitialStock : 0,
    producedFlatRodsUnits: 0,
    producedScrewdriversUnits: 0,
    naveInventories: naveStock,
    updatedAt: new Date().toISOString()
  };
  if (bInvIdx >= 0) {
    db.rawMaterialInventories[bInvIdx] = invObj;
  } else {
    db.rawMaterialInventories.push(invObj);
  }
  writeLocalDb(db);
}

async function runAllTests() {
  console.log("========================================================");
  console.log(" FASE 4.3.5: BATERÍA COMPLETA DE PRUEBAS /DELIVER Y /CONFIRM-RECEIPT ");
  console.log("========================================================");

  let passed = 0;
  let failed = 0;

  // ----------------------------------------------------
  // TEST 1: DOBLE RECEPCIÓN EXTREMA (10 peticiones simultáneas)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 1: DOBLE RECEPCIÓN EXTREMA (10 peticiones simultáneas) ---");
    const orderId = `test_435_t1_${Date.now()}`;
    const buyerId = `buyer_435_t1_${Date.now()}`;
    const sellerId = `seller_435_t1_${Date.now()}`;

    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 1',
      buyerId,
      buyerName: 'Comprador Test 1',
      status: 'aprobado',
      quantity: 100,
      buyerInitialStock: 0,
      naveId: 'nave-principal',
      shippedAt: new Date().toISOString() // already shipped
    });

    const promises = Array.from({ length: 10 }, (_, i) =>
      postDeliver(orderId, {
        endpoint: i % 2 === 0 ? 'deliver' : 'confirm-receipt',
        userId: buyerId,
        idempotencyKey: `key_t1_${orderId}_${i}`
      })
    );

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 200);
    const rejections = results.filter(r => r.status === 400);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const buyerRow = invRes.rows[0];
    const finalStock = Number(buyerRow.varillas_punta_estrella);

    const ordRes = await pool.query('SELECT * FROM materias_primas_pedidos WHERE id = $1', [orderId]);
    const finalOrder = ordRes.rows[0];

    console.log(`[TEST 1] Éxitos: ${successes.length}, Rechazos: ${rejections.length}, Stock acreditado: ${finalStock}, Estado PG: ${finalOrder.estado}, Credited: ${finalOrder.inventory_credited}`);

    if (
      successes.length === 1 &&
      rejections.length === 9 &&
      finalStock === 100 &&
      finalOrder.estado === 'entregado' &&
      finalOrder.inventory_credited === true
    ) {
      console.log("✅ TEST 1 PASSED: Exactamente 1 éxito (200), 9 rechazos (400), stock aumentó exactamente en 100 u., estado entregado, inventory_credited true");
      passed++;
    } else {
      console.error("❌ TEST 1 FAILED: Discrepancia en concurrencia extrema");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 1 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 2: MISMA CLAVE DE IDEMPOTENCIA (3 peticiones misma clave)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 2: MISMA CLAVE DE IDEMPOTENCIA (3 peticiones simultáneas) ---");
    const orderId = `test_435_t2_${Date.now()}`;
    const buyerId = `buyer_435_t2_${Date.now()}`;
    const sellerId = `seller_435_t2_${Date.now()}`;
    const sharedKey = `idem_key_shared_t2_${orderId}`;

    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 2',
      buyerId,
      buyerName: 'Comprador Test 2',
      status: 'en_transito',
      quantity: 50,
      buyerInitialStock: 10,
      naveId: 'nave-1',
      shippedAt: new Date().toISOString()
    });

    const promises = [
      postDeliver(orderId, { endpoint: 'deliver', userId: buyerId, idempotencyKey: sharedKey }),
      postDeliver(orderId, { endpoint: 'deliver', userId: buyerId, idempotencyKey: sharedKey }),
      postDeliver(orderId, { endpoint: 'confirm-receipt', userId: buyerId, idempotencyKey: sharedKey })
    ];

    const results = await Promise.all(promises);
    const statuses = results.map(r => r.status);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    console.log(`[TEST 2] HTTP Statuses: ${statuses.join(', ')}, Stock final PG: ${finalStock} (inicial: 10 + pedido: 50)`);

    if (statuses.every(s => s === 200) && finalStock === 60) {
      console.log("✅ TEST 2 PASSED: Todas las peticiones devolvieron 200 y el inventario solo se acreditó una única vez (10 + 50 = 60)");
      passed++;
    } else {
      console.error("❌ TEST 2 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 2 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 3: CLAVES DIFERENTES (10 peticiones simultáneas con claves distintas)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 3: CLAVES DIFERENTES (10 peticiones simultáneas) ---");
    const orderId = `test_435_t3_${Date.now()}`;
    const buyerId = `buyer_435_t3_${Date.now()}`;
    const sellerId = `seller_435_t3_${Date.now()}`;

    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 3',
      buyerId,
      buyerName: 'Comprador Test 3',
      status: 'aprobado',
      quantity: 40,
      buyerInitialStock: 0,
      naveId: 'nave-1',
      shippedAt: new Date().toISOString()
    });

    const promises = Array.from({ length: 10 }, (_, i) =>
      postDeliver(orderId, {
        endpoint: 'deliver',
        userId: buyerId,
        idempotencyKey: `diff_key_t3_${orderId}_${i}`
      })
    );

    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 200);
    const rejections = results.filter(r => r.status === 400);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    console.log(`[TEST 3] Éxitos: ${successes.length}, Rechazos: ${rejections.length}, Stock: ${finalStock}`);

    if (successes.length === 1 && rejections.length === 9 && finalStock === 40) {
      console.log("✅ TEST 3 PASSED: 1 éxito, 9 rechazos con claves distintas, sin duplicación de stock");
      passed++;
    } else {
      console.error("❌ TEST 3 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 3 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 4: PEDIDO YA RECIBIDO (inventory_credited = true, estado = entregado)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 4: PEDIDO YA RECIBIDO (inventory_credited = true, estado = entregado) ---");
    const orderId = `test_435_t4_${Date.now()}`;
    const buyerId = `buyer_435_t4_${Date.now()}`;
    const sellerId = `seller_435_t4_${Date.now()}`;

    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 4',
      buyerId,
      buyerName: 'Comprador Test 4',
      status: 'entregado',
      quantity: 30,
      buyerInitialStock: 30,
      inventoryCredited: true,
      naveId: 'nave-1'
    });

    const res = await postDeliver(orderId, { endpoint: 'deliver', userId: buyerId });
    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    console.log(`[TEST 4] Status HTTP: ${res.status}, Error recibido: "${res.data?.error}", Stock final PG: ${finalStock}`);

    if (res.status === 400 && finalStock === 30 && res.data?.error?.includes('ya ha sido entregado previamente')) {
      console.log("✅ TEST 4 PASSED: Rechazo con HTTP 400, stock sin cambios (30 u.)");
      passed++;
    } else {
      console.error("❌ TEST 4 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 4 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 5: ESTADO NO RECEPCIONABLE (estados que el código rechaza)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 5: ESTADOS NO RECEPCIONABLES ---");
    const buyerId = `buyer_435_t5_${Date.now()}`;
    const sellerId = `seller_435_t5_${Date.now()}`;

    const invalidStates = ['pendiente', 'en_negociacion', 'rechazado', 'entregado', 'finalizado', 'facturado'];
    let allPassed = true;

    for (const st of invalidStates) {
      const orderId = `test_435_t5_${st}_${Date.now()}`;
      await setupOrderAndBuyer({
        orderId,
        sellerId,
        sellerName: 'Vendedor Test 5',
        buyerId,
        buyerName: 'Comprador Test 5',
        status: st,
        quantity: 25,
        buyerInitialStock: 50,
        inventoryCredited: ['entregado', 'finalizado', 'facturado'].includes(st),
        naveId: 'nave-1'
      });

      const res = await postDeliver(orderId, { endpoint: 'deliver', userId: buyerId });
      const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
      const stock = Number(invRes.rows[0].varillas_punta_estrella);
      const ordRes = await pool.query('SELECT estado FROM materias_primas_pedidos WHERE id = $1', [orderId]);
      const currentStatus = ordRes.rows[0].estado;

      if (res.status !== 400 || stock !== 50 || currentStatus !== st) {
        console.error(`  - Estado "${st}": Falló la validación (status: ${res.status}, stock: ${stock}, estadoPG: ${currentStatus})`);
        allPassed = false;
      } else {
        console.log(`  - Estado "${st}": Rechazado correctamente con 400 ("${res.data?.error}"), estado y stock intactos.`);
      }
    }

    if (allPassed) {
      console.log("✅ TEST 5 PASSED: Todos los estados inválidos rechazados con 400 sin alteraciones");
      passed++;
    } else {
      console.error("❌ TEST 5 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 5 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 6: CONCURRENCIA CON TRANSFERENCIA DE NAVE (transfer-nave-stock)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 6: CONCURRENCIA CON TRANSFERENCIA DE NAVE (transfer-nave-stock) ---");
    const buyerId = `buyer_435_t6_${Date.now()}`;
    const sellerId = `seller_435_t6_${Date.now()}`;
    const orderId = `order_435_t6_${Date.now()}`;

    // Setup user with 2 warehouses in PostgreSQL and db.json
    const initialNave1 = 100;
    const initialNave2 = 0;
    const desglose = {
      'nave-1': { ironKg: 0, producedStarRodsUnits: initialNave1, producedRodsUnits: initialNave1 },
      'nave-2': { ironKg: 0, producedStarRodsUnits: initialNave2, producedRodsUnits: initialNave2 }
    };

    await pool.query(`
      INSERT INTO materias_primas_inventario (
        alumno_id, alumno_nombre, varillas_punta_estrella, varillas_punta, desglose_almacenes, fecha_actualizacion
      ) VALUES ($1, $2, $3, $3, $4::jsonb, NOW())
      ON CONFLICT (alumno_id) DO UPDATE SET
        varillas_punta_estrella = $3,
        varillas_punta = $3,
        desglose_almacenes = $4::jsonb,
        fecha_actualizacion = NOW()
    `, [buyerId, 'Comprador Test 6', initialNave1, JSON.stringify(desglose)]);

    await pool.query(`
      INSERT INTO materias_primas_pedidos (
        id, alumno_id, alumno_nombre, announcement_id, seller_id, seller_name, materia_tipo, materia_titulo,
        cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_total, importe_iva, coste_transporte,
        necesita_transporte, direccion_entrega, estado, fecha_pedido, inventory_credited, destination_nave_id
      ) VALUES (
        $1, $2, 'Comprador Test 6', 'ann_test', $3, 'Vendedor Test 6', 'varilla', 'Varilla de hierro estrella',
        50, 0.1, 5, 100, 100, 21, 0,
        false, 'Nave 1', 'aprobado', NOW(), false, 'nave-1'
      )
      ON CONFLICT (id) DO UPDATE SET
        estado = 'aprobado',
        cantidad = 50,
        inventory_credited = false,
        destination_nave_id = 'nave-1'
    `, [orderId, buyerId, sellerId]);

    // Setup acquisitions & forklifts in db.json for buyer so transfer-nave-stock finds warehouses
    const db = readLocalDb();
    if (!db.users) db.users = [];
    if (!db.users.some((u: any) => u.id === buyerId)) {
      db.users.push({ id: buyerId, name: 'Comprador Test 6', role: 'student', accountNumber: 'ES990000', balance: 5000 });
    }
    if (!db.acquisitions) db.acquisitions = [];
    db.acquisitions.push(
      { id: 'nave-1', studentId: buyerId, propertyTitle: 'Nave Industrial 1', propertyType: 'nave_industrial' },
      { id: 'nave-2', studentId: buyerId, propertyTitle: 'Nave Industrial 2', propertyType: 'nave_industrial' }
    );
    if (!db.purchasedVehicles) db.purchasedVehicles = [];
    db.purchasedVehicles.push(
      { id: `fork_n1_${buyerId}`, studentId: buyerId, vehicleType: 'carretilla_elevadora', assignedPropertyId: 'nave-1' },
      { id: `fork_n2_${buyerId}`, studentId: buyerId, vehicleType: 'carretilla_elevadora', assignedPropertyId: 'nave-2' }
    );
    writeLocalDb(db);

    // Launch concurrently:
    // 1. /confirm-receipt (adds 50 units to nave-1)
    // 2. /api/inventory/transfer-nave-stock (moves 30 units from nave-1 to nave-2)
    const p1 = postDeliver(orderId, { endpoint: 'confirm-receipt', userId: buyerId });
    const p2 = fetch(`${BASE_URL}/api/inventory/transfer-nave-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: buyerId,
        fromNaveId: 'nave-1',
        toNaveId: 'nave-2',
        itemKey: 'varillas_punta_estrella',
        quantity: 30
      })
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

    const [r1, r2] = await Promise.all([p1, p2]);
    console.log(`[TEST 6] Confirm-receipt status: ${r1.status}, Transfer-nave-stock status: ${r2.status}`, r2.data);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalRow = invRes.rows[0];
    const finalTotal = Number(finalRow.varillas_punta_estrella);
    const finalDesglose = typeof finalRow.desglose_almacenes === 'string'
      ? JSON.parse(finalRow.desglose_almacenes)
      : finalRow.desglose_almacenes;

    const n1 = Number(finalDesglose['nave-1']?.producedStarRodsUnits || 0);
    const n2 = Number(finalDesglose['nave-2']?.producedStarRodsUnits || 0);

    console.log(`[TEST 6] Final Total PG: ${finalTotal}, Nave-1: ${n1}, Nave-2: ${n2}`);
    // Initial nave-1 = 100
    // + 50 from delivery = 150
    // - 30 moved to nave-2 = 120 in nave-1, 30 in nave-2. Total = 150.
    if (r1.status === 200 && r2.status === 200 && finalTotal === 150 && n1 === 120 && n2 === 30) {
      console.log("✅ TEST 6 PASSED: Concurrencia entre confirm-receipt y transfer-nave-stock resuelta sin Lost Update. Total = 150 u. (nave-1: 120, nave-2: 30)");
      passed++;
    } else {
      console.error("❌ TEST 6 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 6 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 7: CONCURRENCIA CON TRANSFER-STOCK (entre alumnos)
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 7: CONCURRENCIA CON TRANSFER-STOCK ---");
    const buyerId = `buyer_435_t7_${Date.now()}`;
    const sellerId = `seller_435_t7_${Date.now()}`;
    const thirdStudentId = `student3_435_t7_${Date.now()}`;
    const orderId = `order_435_t7_${Date.now()}`;

    // Setup buyer with 50 units
    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 7',
      buyerId,
      buyerName: 'Comprador Test 7',
      status: 'aprobado',
      quantity: 40,
      buyerInitialStock: 50,
      naveId: 'nave-1'
    });

    // Setup third student inventory in PostgreSQL
    await pool.query(`
      INSERT INTO materias_primas_inventario (
        alumno_id, alumno_nombre, varillas_punta_estrella, varillas_punta, desglose_almacenes, fecha_actualizacion
      ) VALUES ($1, $2, 0, 0, '{"nave-third": {"producedStarRodsUnits": 0}}'::jsonb, NOW())
      ON CONFLICT (alumno_id) DO NOTHING
    `, [thirdStudentId, 'Tercer Alumno']);

    // Setup forklift and warehouse in db.json for buyer and third student
    const db = readLocalDb();
    if (!db.users) db.users = [];
    if (!db.users.some((u: any) => u.id === buyerId)) {
      db.users.push({ id: buyerId, name: 'Comprador Test 7', role: 'student', accountNumber: 'ES770001', balance: 5000 });
    }
    if (!db.users.some((u: any) => u.id === thirdStudentId)) {
      db.users.push({ id: thirdStudentId, name: 'Tercer Alumno', role: 'student', accountNumber: 'ES770002', balance: 5000 });
    }
    if (!db.acquisitions) db.acquisitions = [];
    db.acquisitions.push(
      { id: 'nave-1', studentId: buyerId, propertyTitle: 'Nave Comprador', propertyType: 'nave_industrial' },
      { id: 'nave-third', studentId: thirdStudentId, propertyTitle: 'Nave Tercero', propertyType: 'nave_industrial' }
    );
    if (!db.purchasedVehicles) db.purchasedVehicles = [];
    db.purchasedVehicles.push(
      {
        id: `fork_${buyerId}`,
        studentId: buyerId,
        vehicleType: 'carretilla_elevadora',
        assignedPropertyId: 'nave-1'
      },
      {
        id: `fork_${thirdStudentId}`,
        studentId: thirdStudentId,
        vehicleType: 'carretilla_elevadora',
        assignedPropertyId: 'nave-third'
      }
    );
    writeLocalDb(db);

    // Concurrently:
    // 1. Deliver order to buyer (+40 u.)
    // 2. Buyer transfers stock to third student (-20 u.)
    const p1 = postDeliver(orderId, { endpoint: 'deliver', userId: buyerId });
    const p2 = fetch(`${BASE_URL}/api/inventory/transfer-stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: buyerId,
        recipientId: thirdStudentId,
        itemKey: 'varillas_punta_estrella',
        quantity: 20,
        fromNaveId: 'nave-1',
        destinationNaveId: 'nave-third'
      })
    }).then(async r => ({ status: r.status, data: await r.json().catch(() => null) }));

    const [r1, r2] = await Promise.all([p1, p2]);
    console.log(`[TEST 7] Deliver status: ${r1.status}, Transfer-stock status: ${r2.status}`, r2.data);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    console.log(`[TEST 7] Final buyer stock PG: ${finalStock} (inicial 50 + 40 recibido - 20 transferido = 70)`);
    if (r1.status === 200 && r2.status === 200 && finalStock === 70) {
      console.log("✅ TEST 7 PASSED: Concurrencia entre /deliver y /transfer-stock serializada correctamente sin Lost Update (70 u.)");
      passed++;
    } else {
      console.error("❌ TEST 7 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 7 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 8: ROLLBACK ATÓMICO TRAS FALLO
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 8: ROLLBACK ATÓMICO TRAS FALLO ---");
    const buyerId = `buyer_435_t8_${Date.now()}`;
    const sellerId = `seller_435_t8_${Date.now()}`;
    const orderId = `order_435_t8_${Date.now()}`;

    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 8',
      buyerId,
      buyerName: 'Comprador Test 8',
      status: 'aprobado',
      quantity: 50,
      buyerInitialStock: 20,
      naveId: 'nave-1'
    });

    // Test rollback by simulating an unauthorized user (userId mismatch triggers throw error inside transaction)
    const res = await postDeliver(orderId, { endpoint: 'deliver', userId: 'unauthorized_hacker' });
    console.log(`[TEST 8] Status HTTP: ${res.status}, Error: "${res.data?.error}"`);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    const ordRes = await pool.query('SELECT estado, inventory_credited, fecha_entrega FROM materias_primas_pedidos WHERE id = $1', [orderId]);
    const finalOrder = ordRes.rows[0];

    console.log(`[TEST 8] Stock PG: ${finalStock}, Estado PG: ${finalOrder.estado}, Credited PG: ${finalOrder.inventory_credited}, DeliveredAt PG: ${finalOrder.fecha_entrega}`);

    if (
      res.status === 403 &&
      finalStock === 20 &&
      finalOrder.estado === 'aprobado' &&
      finalOrder.inventory_credited === false &&
      finalOrder.fecha_entrega === null
    ) {
      console.log("✅ TEST 8 PASSED: Rollback completo confirmado. Inventario, estado, inventory_credited y fecha_entrega sin cambios.");
      passed++;
    } else {
      console.error("❌ TEST 8 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 8 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 9: POSTGRESQL COMO FUENTE DE VERDAD
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 9: POSTGRESQL COMO FUENTE DE VERDAD ---");
    const buyerId = `buyer_435_t9_${Date.now()}`;
    const sellerId = `seller_435_t9_${Date.now()}`;
    const orderId = `order_435_t9_${Date.now()}`;

    // Setup order in PG with 80 units
    await setupOrderAndBuyer({
      orderId,
      sellerId,
      sellerName: 'Vendedor Test 9',
      buyerId,
      buyerName: 'Comprador Test 9',
      status: 'aprobado',
      quantity: 80,
      buyerInitialStock: 0,
      naveId: 'nave-1'
    });

    // Deliberately corrupt db.json with false stale quantity (999 u.) and stale status ('rechazado')
    const db = readLocalDb();
    const memOrder = (db.rawMaterialOrders || []).find((o: any) => o.id === orderId);
    if (memOrder) {
      memOrder.quantity = 999;
      memOrder.status = 'rechazado';
    }
    const memInv = (db.rawMaterialInventories || []).find((i: any) => i.studentId === buyerId);
    if (memInv) {
      memInv.producedStarRodsUnits = 777;
    }
    writeLocalDb(db);

    // Call /deliver
    const res = await postDeliver(orderId, { endpoint: 'deliver', userId: buyerId });
    console.log(`[TEST 9] Deliver status: ${res.status}`);

    const invRes = await pool.query('SELECT * FROM materias_primas_inventario WHERE alumno_id = $1', [buyerId]);
    const finalStock = Number(invRes.rows[0].varillas_punta_estrella);

    const ordRes = await pool.query('SELECT cantidad, estado, inventory_credited FROM materias_primas_pedidos WHERE id = $1', [orderId]);
    const finalOrder = ordRes.rows[0];

    console.log(`[TEST 9] Final stock in PG: ${finalStock} (esperado 80 de PG, no 999 de db.json), Estado: ${finalOrder.estado}`);

    if (res.status === 200 && finalStock === 80 && finalOrder.estado === 'entregado') {
      console.log("✅ TEST 9 PASSED: PostgreSQL prevaleció como fuente de verdad. Se acreditaron 80 u. reales de PostgreSQL ignorando la corrupción de db.json.");
      passed++;
    } else {
      console.error("❌ TEST 9 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 9 ERROR:", e.message);
    failed++;
  }

  // ----------------------------------------------------
  // TEST 10: REGRESIÓN DE FASES ANTERIORES
  // ----------------------------------------------------
  try {
    console.log("\n--- TEST 10: REGRESIÓN (Fase 3, Fase 4.3.1, Fase 4.3.3, Fase 4.3.4) ---");
    let regressionPassed = true;

    // 10.1: Fase 4.3.4 (/ship)
    const shipOrderId = `reg_ship_${Date.now()}`;
    const shipSellerId = `reg_seller_${Date.now()}`;
    const shipBuyerId = `reg_buyer_${Date.now()}`;

    await setupOrderAndBuyer({
      orderId: shipOrderId,
      sellerId: shipSellerId,
      sellerName: 'Vendedor Regresión',
      buyerId: shipBuyerId,
      buyerName: 'Comprador Regresión',
      status: 'aprobado',
      quantity: 15,
      buyerInitialStock: 0,
      naveId: 'nave-1'
    });

    // Setup seller stock for ship
    await pool.query(`
      INSERT INTO materias_primas_inventario (
        alumno_id, alumno_nombre, varillas_punta_estrella, varillas_punta, desglose_almacenes, fecha_actualizacion
      ) VALUES ($1, $2, 30, 30, '{"nave-1": {"producedStarRodsUnits": 30, "producedRodsUnits": 30}}'::jsonb, NOW())
      ON CONFLICT (alumno_id) DO UPDATE SET
        varillas_punta_estrella = 30,
        varillas_punta = 30,
        desglose_almacenes = '{"nave-1": {"producedStarRodsUnits": 30, "producedRodsUnits": 30}}'::jsonb
    `, [shipSellerId, 'Vendedor Regresión']);

    const shipRes = await fetch(`${BASE_URL}/api/raw-materials/orders/${shipOrderId}/ship`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: shipSellerId })
    });
    const shipData = await shipRes.json().catch(() => null);

    if (shipRes.status === 200 && shipData.success) {
      console.log("  - Regresión Fase 4.3.4 (/ship): OK (200, pedido en tránsito)");
    } else {
      console.error("  - Regresión Fase 4.3.4 (/ship): FAILED", shipRes.status, shipData);
      regressionPassed = false;
    }

    // 10.2: Then deliver the shipped order (/deliver)
    const deliverRes = await postDeliver(shipOrderId, { endpoint: 'deliver', userId: shipBuyerId });
    if (deliverRes.status === 200 && deliverRes.data.success) {
      console.log("  - Regresión entrega pedido enviado (/deliver tras /ship): OK (200, entregado)");
    } else {
      console.error("  - Regresión entrega pedido enviado: FAILED", deliverRes.status, deliverRes.data);
      regressionPassed = false;
    }

    // 10.3: Fase 4.3.3 (/approve)
    const appOrderId = `reg_app_${Date.now()}`;
    await pool.query(`
      INSERT INTO cuentas (id, account_number, alumno, saldo, role, level)
      VALUES 
        ($1, 'ES990001', 'Comprador App', 5000, 'student', 2),
        ($2, 'ES990002', 'Vendedor App', 5000, 'student', 2)
      ON CONFLICT (id) DO UPDATE SET saldo = 5000
    `, [shipBuyerId, shipSellerId]);

    const dbReg = readLocalDb();
    if (!dbReg.users) dbReg.users = [];
    if (!dbReg.users.some((u: any) => u.id === shipBuyerId)) {
      dbReg.users.push({ id: shipBuyerId, name: 'Comprador App', role: 'student', accountNumber: 'ES990001', balance: 5000 });
    }
    if (!dbReg.users.some((u: any) => u.id === shipSellerId)) {
      dbReg.users.push({ id: shipSellerId, name: 'Vendedor App', role: 'student', accountNumber: 'ES990002', balance: 5000 });
    }
    writeLocalDb(dbReg);

    await pool.query(`
      INSERT INTO materias_primas_pedidos (
        id, alumno_id, alumno_nombre, announcement_id, seller_id, seller_name, materia_tipo, materia_titulo,
        cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_total, importe_iva, coste_transporte,
        necesita_transporte, direccion_entrega, estado, fecha_pedido, inventory_credited, destination_nave_id
      ) VALUES (
        $1, $2, 'Comprador App', 'ann_test', $3, 'Vendedor App', 'varilla', 'Varilla de hierro estrella',
        10, 0.1, 1, 100, 100, 21, 0,
        false, 'Nave Central', 'pendiente', NOW(), false, 'nave-1'
      )
    `, [appOrderId, shipBuyerId, shipSellerId]);

    const appRes = await fetch(`${BASE_URL}/api/raw-materials/orders/${appOrderId}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: shipSellerId })
    });
    const appData = await appRes.json().catch(() => null);

    if (appRes.status === 200 && appData.success) {
      console.log("  - Regresión Fase 4.3.3 (/approve): OK (200, aprobado)");
    } else {
      console.error("  - Regresión Fase 4.3.3 (/approve): FAILED", appRes.status, appData);
      regressionPassed = false;
    }

    if (regressionPassed) {
      console.log("✅ TEST 10 PASSED: Todas las fases anteriores (/ship, /approve, transferencias) operan con perfecta compatibilidad.");
      passed++;
    } else {
      console.error("❌ TEST 10 FAILED");
      failed++;
    }
  } catch (e: any) {
    console.error("❌ TEST 10 ERROR:", e.message);
    failed++;
  }

  console.log("\n=====================================================");
  console.log(`RESUMEN FINAL: ${passed} PASSED, ${failed} FAILED (TOTAL 10 PRUEBAS)`);
  console.log("=====================================================");

  await pool.end();
  process.exit(failed > 0 ? 1 : 0);
}

runAllTests();
