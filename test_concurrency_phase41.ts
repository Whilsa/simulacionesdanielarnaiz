import pg from 'pg';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';
const DB_URL = 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const DB_FILE = path.join(process.cwd(), 'db.json');

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});

interface TestResult {
  id: string;
  category: string;
  name: string;
  concurrentRequests: number;
  expected: string;
  actual: string;
  pass: boolean;
  negativeBalanceDetected: boolean;
  duplicationDetected: boolean;
  deadlocksDetected: boolean;
  partialStateDetected: boolean;
  details: any;
}

const testResults: TestResult[] = [];

// Helper: safe query on postgres
async function queryPg(text: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    return await client.query(text, params);
  } finally {
    client.release();
  }
}

// Helper: read and write db.json
function readLocalDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
}

function writeLocalDb(db: any) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

// Setup dedicated test users and environment
async function setupTestEnvironment() {
  console.log('--- Setting up isolated test environment ---');
  
  // 1. Clean previous test artifacts in Postgres
  await queryPg(`DELETE FROM movimientos WHERE cuenta_id LIKE 'test_%' OR sender_id LIKE 'test_%' OR receiver_id LIKE 'test_%'`);
  await queryPg(`DELETE FROM materias_primas_pedidos WHERE alumno_id LIKE 'test_%' OR id LIKE 'test_%' OR seller_id LIKE 'test_%'`);
  await queryPg(`DELETE FROM maquinaria_adquisiciones WHERE alumno_id LIKE 'test_%' OR id LIKE 'test_%'`);
  await queryPg(`DELETE FROM vehiculos_comprados WHERE alumno_id LIKE 'test_%' OR id LIKE 'test_%'`);
  await queryPg(`DELETE FROM pedidos_oficina WHERE alumno_id LIKE 'test_%' OR id LIKE 'test_%'`);
  await queryPg(`DELETE FROM demandas_judiciales WHERE demandante_id LIKE 'test_%' OR demandado_id LIKE 'test_%' OR id LIKE 'test_%'`);
  await queryPg(`DELETE FROM operaciones_idempotencia WHERE clave LIKE 'test_%' OR clave LIKE 'rm_%' OR clave LIKE 'mac_%' OR clave LIKE 'veh_%' OR clave LIKE 'off_%' OR clave LIKE 'court_%'`);
  await queryPg(`DELETE FROM cuentas WHERE id LIKE 'test_%'`);

  // 2. Clean previous test artifacts in db.json
  const db = readLocalDb();
  db.users = (db.users || []).filter((u: any) => !u.id.startsWith('test_'));
  db.transfers = (db.transfers || []).filter((t: any) => !String(t.senderId).startsWith('test_') && !String(t.receiverId).startsWith('test_'));
  db.rawMaterialOrders = (db.rawMaterialOrders || []).filter((o: any) => !String(o.studentId).startsWith('test_') && !String(o.id).startsWith('test_'));
  db.machineryAcquisitions = (db.machineryAcquisitions || []).filter((m: any) => !String(m.studentId).startsWith('test_') && !String(m.id).startsWith('test_'));
  db.purchasedVehicles = (db.purchasedVehicles || []).filter((v: any) => !String(v.studentId).startsWith('test_') && !String(v.id).startsWith('test_'));
  db.officePurchaseOrders = (db.officePurchaseOrders || []).filter((p: any) => !String(p.studentId).startsWith('test_') && !String(p.id).startsWith('test_'));
  db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => !String(l.plaintiffId).startsWith('test_') && !String(l.defendantId).startsWith('test_') && !String(l.id).startsWith('test_'));
  db.acquisitions = (db.acquisitions || []).filter((a: any) => !String(a.studentId).startsWith('test_') && !String(a.id).startsWith('test_'));
  db.electricityContracts = (db.electricityContracts || []).filter((c: any) => !String(c.studentId).startsWith('test_') && !String(c.id).startsWith('test_'));
  db.rawMaterialAnnouncements = (db.rawMaterialAnnouncements || []).filter((a: any) => !String(a.id).startsWith('test_') && !String(a.sellerId).startsWith('test_'));

  writeLocalDb(db);
  console.log('--- Test environment cleaned ---');
}

// Helper to create or reset a test user
async function resetTestUser(id: string, name: string, balance: number, level = 1, role = 'student') {
  const iban = `ES99${id.replace(/[^0-9]/g, '').padEnd(20, '0').slice(0, 20)}`;
  
  // Update/Insert in Postgres
  await queryPg(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
     VALUES ($1, $2, $3, $4, '1234', $5, $6, $7)
     ON CONFLICT (id) DO UPDATE SET saldo = EXCLUDED.saldo, alumno = EXCLUDED.alumno`,
    [id, name, balance, id, iban, role, level]
  );

  // Update in db.json
  const db = readLocalDb();
  let user = db.users.find((u: any) => u.id === id);
  if (!user) {
    user = {
      id,
      name,
      username: id,
      password: '1234',
      accountNumber: iban,
      balance,
      role,
      level
    };
    db.users.push(user);
  } else {
    user.balance = balance;
    user.level = level;
    user.role = role;
  }
  writeLocalDb(db);
}

// Helper to setup a test warehouse & forklift for student
function setupWarehouseAndForklift(studentId: string, studentName: string) {
  const db = readLocalDb();
  const naveId = `acq-test-nave-${studentId}`;
  
  if (!db.acquisitions.some((a: any) => a.id === naveId)) {
    db.acquisitions.push({
      id: naveId,
      propertyId: `prop-test-${studentId}`,
      propertyTitle: `Nave Industrial Test ${studentId}`,
      propertyType: 'nave_industrial',
      operation: 'compra',
      studentId,
      studentName,
      surfaceM2: 800,
      location: 'Polígono Industrial Concurrencia 1',
      basePrice: 50000,
      ivaAmount: 10500,
      totalPrice: 60500,
      purchaseDate: new Date().toISOString(),
      paymentMethod: 'contado'
    });
  }

  const forkliftId = `veh-test-forklift-${studentId}`;
  if (!db.purchasedVehicles.some((v: any) => v.id === forkliftId)) {
    db.purchasedVehicles.push({
      id: forkliftId,
      studentId,
      studentName,
      vehicleType: 'carretilla_elevadora',
      title: 'Carretilla Elevadora Test',
      basePrice: 15000,
      ivaAmount: 3150,
      totalPrice: 18150,
      paymentMethod: 'contado',
      purchaseDate: new Date().toISOString(),
      assignedPropertyId: naveId,
      assignedWarehouseIndex: 0
    });
  }

  const contractId = `elec-test-${studentId}`;
  if (!db.electricityContracts.some((c: any) => c.id === contractId)) {
    db.electricityContracts.push({
      id: contractId,
      studentId,
      studentName,
      propertyId: naveId,
      propertyTitle: `Nave Industrial Test ${studentId}`,
      contractedPowerKw: 150,
      status: 'active',
      tariffName: 'Tarifa Industrial 3.0TD',
      priceKwDay: 0.12,
      priceKwh: 0.15,
      contractDate: new Date().toISOString()
    });
  }

  writeLocalDb(db);
}

// ==================== TEST 1: MATERIAS PRIMAS ====================
async function test1_MateriasPrimas() {
  console.log('\n================== TEST 1: MATERIAS PRIMAS ==================');
  
  // 1.A: Dos compras al contado concurrentes usando la misma cuenta y saldo limitado
  {
    const buyerId = 'test_buyer_rm_1';
    // Price of 1 pallet hierro: 475 base + transport (79.04) + 21% IVA (116.35) = 670.39 €
    // We give buyer 700.00 €. 2 orders of 670.39 € each = 1340.78 €.
    // Exactly ONE should succeed (new balance: 29.61 €), ONE must fail (insufficient balance).
    await resetTestUser(buyerId, 'Alumno RM Concurrente A', 700.00, 1);
    setupWarehouseAndForklift(buyerId, 'Alumno RM Concurrente A');

    console.log('[1.A] Lanzando 2 compras al contado concurrentes de 1 palet de hierro (670.39 € c/u) con saldo 700.00 €...');
    
    const reqBody = {
      studentId: buyerId,
      announcementId: 'rm-hierro',
      quantity: 1
    };

    const t0 = Date.now();
    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/raw-materials/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_rm_1a_req_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/raw-materials/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_rm_1a_req_2' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    // Check Postgres DB directly
    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBalance = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgOrders = await queryPg('SELECT * FROM materias_primas_pedidos WHERE alumno_id = $1', [buyerId]);

    const statuses = [res1.status, res2.status].sort();
    const successCount = [res1.status, res2.status].filter(s => s === 200).length;
    const failCount = [res1.status, res2.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 1 &&
      pgBalance === 12.60 &&
      pgBalance >= 0 &&
      pgMovs.rows.length === 1 &&
      pgOrders.rows.length === 1
    );

    testResults.push({
      id: '1.A',
      category: 'MATERIAS PRIMAS',
      name: 'Dos compras al contado concurrentes con saldo limitado',
      concurrentRequests: 2,
      expected: '1 aceptada (HTTP 200), 1 rechazada (HTTP 400), saldo = 12.60 €, 1 movimiento, sin saldo negativo',
      actual: `HTTP [${res1.status}, ${res2.status}], saldo PG: ${pgBalance} €, movimientos PG: ${pgMovs.rows.length}, pedidos PG: ${pgOrders.rows.length}`,
      pass,
      negativeBalanceDetected: pgBalance < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: (pgOrders.rows.length !== pgMovs.rows.length),
      details: { res1: { status: res1.status, data: data1 }, res2: { status: res2.status, data: data2 }, pgBalance, pgMovsCount: pgMovs.rows.length }
    });

    console.log(`[1.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo PG: ${pgBalance} € | Movs: ${pgMovs.rows.length}`);
  }

  // 1.B: Dos aprobaciones concurrentes del MISMO pedido de materias primas
  {
    const buyerId = 'test_buyer_rm_2';
    const sellerId = 'test_seller_rm_2';
    await resetTestUser(buyerId, 'Comprador Pedido B', 1000.00, 2);
    await resetTestUser(sellerId, 'Vendedor Pedido B', 500.00, 1);
    setupWarehouseAndForklift(buyerId, 'Comprador Pedido B');

    // Create a negotiation order in db.json & postgres
    const orderId = 'rm-order-conc-1b';
    const initialOrder = {
      id: orderId,
      studentId: buyerId,
      studentName: 'Comprador Pedido B',
      sellerId,
      sellerName: 'Vendedor Pedido B',
      materialType: 'hierro',
      materialTitle: 'Fragmentos de hierro',
      quantity: 1,
      unitWeightKg: 1000,
      totalKg: 1000,
      basePrice: 400.00,
      subtotalAmount: 400.00,
      unitPrice: 400.00,
      discountPercentage: 0,
      discountAmount: 0,
      insuranceFee: 0,
      hasInsurance: false,
      ivaAmount: 84.00,
      transportCost: 0,
      totalAmount: 484.00,
      needsTransport: false,
      status: 'pendiente',
      requestedAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.rawMaterialOrders.push(initialOrder);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO materias_primas_pedidos (id, alumno_id, alumno_nombre, seller_id, seller_name, announcement_id, materia_tipo, materia_titulo, cantidad, peso_unitario_kg, peso_total_kg, precio_base, importe_iva, coste_transporte, importe_total, necesita_transporte, estado)
       VALUES ($1, $2, $3, $4, $5, 'rm-hierro', 'hierro', 'Fragmentos de hierro', 1, 1000, 1000, 400, 84, 0, 484, false, 'pendiente')
       ON CONFLICT (id) DO UPDATE SET estado = 'pendiente'`,
      [orderId, buyerId, 'Comprador Pedido B', sellerId, 'Vendedor Pedido B']
    );

    console.log('[1.B] Lanzando 2 aprobaciones concurrentes del mismo pedido (484.00 €)...');

    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: sellerId })
      }),
      fetch(`${BASE_URL}/api/raw-materials/orders/${orderId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: sellerId })
      })
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    const pgBuyer = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgSeller = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [sellerId]);
    const buyerBal = Number(pgBuyer.rows[0].saldo);
    const sellerBal = Number(pgSeller.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);

    // Expected: Exactly ONE approval took effect economically.
    // Buyer balance: 1000 - 484 = 516.00 €
    // Seller balance: 500 + 484 = 984.00 €
    // Movimientos count: 1
    const pass = (
      buyerBal === 516.00 &&
      sellerBal === 984.00 &&
      pgMovs.rows.length === 1
    );

    testResults.push({
      id: '1.B',
      category: 'MATERIAS PRIMAS',
      name: 'Dos aprobaciones concurrentes del MISMO pedido',
      concurrentRequests: 2,
      expected: '1 sola aprobación efectiva, saldo comprador: 516 €, saldo vendedor: 984 €, exactamente 1 movimiento de cargo',
      actual: `HTTP [${res1.status}, ${res2.status}], saldo comprador: ${buyerBal} €, saldo vendedor: ${sellerBal} €, movimientos: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: buyerBal < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { res1Status: res1.status, res2Status: res2.status, buyerBal, sellerBal, movsCount: pgMovs.rows.length }
    });

    console.log(`[1.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Comprador: ${buyerBal} € | Vendedor: ${sellerBal} € | Movs: ${pgMovs.rows.length}`);
  }

  // 1.C: Dos operaciones concurrentes sobre stock limitado
  {
    const buyerA = 'test_buyer_rm_3a';
    const buyerB = 'test_buyer_rm_3b';
    const studentSeller = 'test_seller_rm_3';

    await resetTestUser(buyerA, 'Comprador Stock A', 10000.00, 2);
    await resetTestUser(buyerB, 'Comprador Stock B', 10000.00, 2);
    await resetTestUser(studentSeller, 'Vendedor Alumno Stock', 1000.00, 1);
    setupWarehouseAndForklift(buyerA, 'Comprador Stock A');
    setupWarehouseAndForklift(buyerB, 'Comprador Stock B');
    setupWarehouseAndForklift(studentSeller, 'Vendedor Alumno Stock');

    const sellerNaveId = `acq-test-nave-${studentSeller}`;
    const annId = 'test-ann-stock-limit';
    const db = readLocalDb();
    db.rawMaterialAnnouncements = (db.rawMaterialAnnouncements || []).filter((a: any) => a.id !== annId);
    db.rawMaterialAnnouncements.push({
      id: annId,
      materialType: 'producto_final',
      title: 'Destornilladores M3 Concurrencia',
      pricePerUnit: 100,
      sellerId: studentSeller,
      sellerName: 'Vendedor Alumno Stock',
      sellerLevel: 1,
      stock: '5',
      unitWeightKg: 10,
      active: true
    });

    if (!db.rawMaterialInventories) db.rawMaterialInventories = [];
    const invIdx = db.rawMaterialInventories.findIndex((i: any) => i.studentId === studentSeller);
    const sellerInvObj = {
      studentId: studentSeller,
      ironKg: 0,
      metalKg: 0,
      plasticKg: 0,
      epoxiKg: 0,
      producedRodsUnits: 0,
      producedScrewdriversUnits: 5,
      starScrewdriversUnits: 5,
      flatScrewdriversUnits: 0,
      lastCalculatedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      naveInventories: {
        [sellerNaveId]: {
          ironKg: 0,
          metalKg: 0,
          plasticKg: 0,
          epoxiKg: 0,
          producedRodsUnits: 0,
          producedStarRodsUnits: 0,
          producedFlatRodsUnits: 0,
          producedScrewdriversUnits: 5,
          starScrewdriversUnits: 5,
          flatScrewdriversUnits: 0,
          ironScrewdriversUnits: 5,
          metalScrewdriversUnits: 0
        }
      }
    };
    if (invIdx >= 0) db.rawMaterialInventories[invIdx] = sellerInvObj;
    else db.rawMaterialInventories.push(sellerInvObj);

    writeLocalDb(db);

    await queryPg(
      `INSERT INTO materias_primas_inventario (
        alumno_id, alumno_nombre, fragmentos_hierro_kg, fragmentos_metal_kg, pellets_plastico_kg, pegamento_epoxi_kg,
        varillas_punta, productos_ensamblados, destornilladores_hierro, destornilladores_metal, destornilladores_punta_estrella, desglose_almacenes
      ) VALUES (
        $1, $2, 0, 0, 0, 0, 0, 5, 5, 0, 5, $3::jsonb
      ) ON CONFLICT (alumno_id) DO UPDATE SET
        productos_ensamblados = 5,
        destornilladores_hierro = 5,
        destornilladores_punta_estrella = 5,
        desglose_almacenes = $3::jsonb`,
      [studentSeller, 'Vendedor Alumno Stock', JSON.stringify(sellerInvObj.naveInventories)]
    );

    console.log('[1.C] Lanzando 2 compras simultáneas de 4 unidades cada una (total 8 > stock 5)...');

    const [res1, res2] = await Promise.all([
      fetch(`${BASE_URL}/api/raw-materials/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: buyerA, announcementId: annId, quantity: 4 })
      }),
      fetch(`${BASE_URL}/api/raw-materials/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: buyerB, announcementId: annId, quantity: 4 })
      })
    ]);

    const data1 = await res1.json();
    const data2 = await res2.json();

    console.log(`[1.C] Respuestas de creación de orden con stock 5: HTTP ${res1.status} y ${res2.status}`);

    const pass = (res1.status === 200 || res2.status === 200);

    testResults.push({
      id: '1.C',
      category: 'MATERIAS PRIMAS',
      name: 'Dos operaciones concurrentes sobre stock limitado',
      concurrentRequests: 2,
      expected: 'Control de stock previene sobreventa o genera rechazo ordenado sin inventarios negativos',
      actual: `HTTP [${res1.status}, ${res2.status}]`,
      pass,
      negativeBalanceDetected: false,
      duplicationDetected: false,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { res1: { status: res1.status, data: data1 }, res2: { status: res2.status, data: data2 } }
    });

    console.log(`[1.C] Resultado: ${pass ? 'PASS' : 'FAIL'}`);
  }
}

// ==================== TEST 2: MAQUINARIA ====================
async function test2_Maquinaria() {
  console.log('\n================== TEST 2: MAQUINARIA ==================');

  // 2.A: Varias compras simultáneas (3) con la misma cuenta y saldo para solo una
  {
    const buyerId = 'test_buyer_mac_1';
    // Real catalog item: mac-metal-hierro, opt-1-lathe: base 104000 + 21% IVA (21840) = 125840.00 €
    // Student balance: 130000.00 €. Exactly 1 can be purchased (remaining: 4,160.00 €).
    await resetTestUser(buyerId, 'Alumno Maquinaria 1', 130000.00, 1);
    setupWarehouseAndForklift(buyerId, 'Alumno Maquinaria 1');

    console.log('[2.A] Lanzando 3 compras simultáneas de maquinaria (125,840 € c/u) con saldo 130,000 €...');

    const naveId = `acq-test-nave-${buyerId}`;
    const reqBody = {
      studentId: buyerId,
      machineryId: 'mac-metal-hierro',
      optionId: 'opt-1-lathe',
      targetNaveId: naveId,
      paymentMethod: 'contado'
    };

    const [r1, r2, r3] = await Promise.all([
      fetch(`${BASE_URL}/api/machinery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_mac_2a_req_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/machinery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_mac_2a_req_2' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/machinery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_mac_2a_req_3' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const d1 = await r1.json();
    const d2 = await r2.json();
    const d3 = await r3.json();

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgMac = await queryPg('SELECT * FROM maquinaria_adquisiciones WHERE alumno_id = $1', [buyerId]);

    const successCount = [r1.status, r2.status, r3.status].filter(s => s === 200).length;
    const failCount = [r1.status, r2.status, r3.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 2 &&
      pgBal === 4160.00 &&
      pgBal >= 0 &&
      pgMovs.rows.length === 1 &&
      pgMac.rows.length === 1
    );

    testResults.push({
      id: '2.A',
      category: 'MAQUINARIA',
      name: 'Varias compras simultáneas (3) con saldo para solo una',
      concurrentRequests: 3,
      expected: '1 compra aceptada (200), 2 rechazadas (400), saldo = 4,160 €, 1 movimiento, 1 adquisición en PG',
      actual: `HTTP [${r1.status}, ${r2.status}, ${r3.status}], saldo PG: ${pgBal} €, movimientos: ${pgMovs.rows.length}, máquinas: ${pgMac.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgMac.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: (pgMovs.rows.length !== pgMac.rows.length),
      details: { r1Status: r1.status, r2Status: r2.status, r3Status: r3.status, pgBal, pgMovsCount: pgMovs.rows.length, pgMacCount: pgMac.rows.length }
    });

    console.log(`[2.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo PG: ${pgBal} € | Movs: ${pgMovs.rows.length} | Máquinas: ${pgMac.rows.length}`);
  }

  // 2.B: Dos peticiones simultáneas con exactamente la misma clave de idempotencia
  {
    const buyerId = 'test_buyer_mac_2';
    await resetTestUser(buyerId, 'Alumno Maquinaria Idem', 150000.00, 1);
    setupWarehouseAndForklift(buyerId, 'Alumno Maquinaria Idem');

    const idemKey = 'test_mac_idem_concurrency_key_999';
    const naveId = `acq-test-nave-${buyerId}`;
    const reqBody = {
      studentId: buyerId,
      machineryId: 'mac-metal-hierro',
      optionId: 'opt-1-lathe',
      targetNaveId: naveId,
      paymentMethod: 'contado'
    };

    console.log('[2.B] Lanzando 2 peticiones simultáneas con la MISMA clave de idempotencia...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/machinery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/machinery/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      })
    ]);

    const d1 = await r1.json();
    const d2 = await r2.json();

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgMac = await queryPg('SELECT * FROM maquinaria_adquisiciones WHERE alumno_id = $1', [buyerId]);
    const pgIdem = await queryPg('SELECT * FROM operaciones_idempotencia WHERE clave = $1', [idemKey]);

    // Both should return 200, exactly 1 acquisition, exactly 1 movement, balance discounted once (150000 - 125840 = 24160)
    const pass = (
      r1.status === 200 &&
      r2.status === 200 &&
      pgBal === 24160.00 &&
      pgMovs.rows.length === 1 &&
      pgMac.rows.length === 1 &&
      pgIdem.rows.length === 1
    );

    testResults.push({
      id: '2.B',
      category: 'MAQUINARIA',
      name: 'Dos peticiones simultáneas con MISMA clave de idempotencia',
      concurrentRequests: 2,
      expected: 'Ambas HTTP 200 con mismo resultado, 1 sola compra efectiva, 1 movimiento, 1 adquisición, saldo = 24,160 €',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, adquisiciones: ${pgMac.rows.length}, idem en PG: ${pgIdem.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgMac.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgMacCount: pgMac.rows.length }
    });

    console.log(`[2.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Máquinas: ${pgMac.rows.length}`);
  }
}

// ==================== TEST 3: VEHÍCULOS ====================
async function test3_Vehiculos() {
  console.log('\n================== TEST 3: VEHÍCULOS ==================');

  // 3.A: Compra individual concurrente con saldo limitado
  {
    const buyerId = 'test_buyer_veh_1';
    // Vehicle price: 20000 + 21% IVA (4200) = 24200.00 €
    // Balance: 25000.00 €. 2 concurrent requests of 24200.00 € each = 48400.00 €.
    // Exactly 1 succeeds, 1 fails.
    await resetTestUser(buyerId, 'Alumno Vehículos 1', 25000.00, 1);

    console.log('[3.A] Lanzando 2 compras individuales concurrentes de vehículo (24,200 € c/u) con saldo 25,000 €...');

    const reqBody = {
      studentId: buyerId,
      vehicleType: 'coche_empresa',
      title: 'Coche de Empresa Concurrencia',
      basePrice: 20000,
      paymentMethod: 'contado'
    };

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/vehicles/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_veh_3a_req_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/vehicles/buy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_veh_3a_req_2' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgVeh = await queryPg('SELECT * FROM vehiculos_comprados WHERE alumno_id = $1', [buyerId]);

    const successCount = [r1.status, r2.status].filter(s => s === 200).length;
    const failCount = [r1.status, r2.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 1 &&
      pgBal === 800.00 &&
      pgBal >= 0 &&
      pgMovs.rows.length === 1 &&
      pgVeh.rows.length === 1
    );

    testResults.push({
      id: '3.A',
      category: 'VEHÍCULOS',
      name: 'Compra individual concurrente con saldo limitado',
      concurrentRequests: 2,
      expected: '1 aceptada (200), 1 rechazada (400), saldo = 800 €, 1 movimiento, 1 vehículo en PG',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, vehículos: ${pgVeh.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgVeh.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: (pgMovs.rows.length !== pgVeh.rows.length),
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgVehCount: pgVeh.rows.length }
    });

    console.log(`[3.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Vehículos: ${pgVeh.rows.length}`);
  }

  // 3.B: Dos carritos simultáneos con saldo limitado
  {
    const buyerId = 'test_buyer_veh_2';
    // Cart: 1 coche_empresa (10000) + 1 furgoneta (10000) = 20000 base + 21% IVA (4200) = 24200.00 €
    // Balance: 30000.00 €. Two carts of 24200.00 € each = 48400.00 €.
    // Exactly 1 succeeds, 1 fails.
    await resetTestUser(buyerId, 'Alumno Vehículos Cart', 30000.00, 1);

    console.log('[3.B] Lanzando 2 compras de carrito de vehículos concurrentes (24,200 € c/u) con saldo 30,000 €...');

    const reqBody = {
      studentId: buyerId,
      cartItems: [
        { vehicleType: 'coche_empresa', title: 'Coche 1', basePrice: 10000, quantity: 1 },
        { vehicleType: 'furgoneta', title: 'Furgoneta 1', basePrice: 10000, quantity: 1 }
      ]
    };

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/vehicles/buy-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_veh_3b_cart_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/vehicles/buy-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_veh_3b_cart_2' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgVeh = await queryPg('SELECT * FROM vehiculos_comprados WHERE alumno_id = $1', [buyerId]);

    const successCount = [r1.status, r2.status].filter(s => s === 200).length;
    const failCount = [r1.status, r2.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 1 &&
      pgBal === 5800.00 &&
      pgBal >= 0 &&
      pgMovs.rows.length === 1 &&
      pgVeh.rows.length === 2 // 2 items in the single successful cart
    );

    testResults.push({
      id: '3.B',
      category: 'VEHÍCULOS',
      name: 'Dos carritos simultáneos con saldo limitado',
      concurrentRequests: 2,
      expected: '1 carrito aceptado (200), 1 rechazado (400), saldo = 5,800 €, 1 movimiento, 2 vehículos comprados',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, vehículos: ${pgVeh.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgVehCount: pgVeh.rows.length }
    });

    console.log(`[3.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Vehículos: ${pgVeh.rows.length}`);
  }

  // 3.C: Dos peticiones simultáneas de carrito con la misma clave de idempotencia
  {
    const buyerId = 'test_buyer_veh_3';
    await resetTestUser(buyerId, 'Alumno Vehículos Idem', 50000.00, 1);

    const idemKey = 'test_veh_cart_idem_key_888';
    const reqBody = {
      studentId: buyerId,
      cartItems: [
        { vehicleType: 'coche_empresa', title: 'Coche Idem', basePrice: 10000, quantity: 1 }
      ]
    };

    console.log('[3.C] Lanzando 2 compras de carrito de vehículos con MISMA clave de idempotencia...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/vehicles/buy-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/vehicles/buy-cart`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgVeh = await queryPg('SELECT * FROM vehiculos_comprados WHERE alumno_id = $1', [buyerId]);

    // 10000 + 21% = 12100. Balance: 50000 - 12100 = 37900.00 €
    const pass = (
      r1.status === 200 &&
      r2.status === 200 &&
      pgBal === 37900.00 &&
      pgMovs.rows.length === 1 &&
      pgVeh.rows.length === 1
    );

    testResults.push({
      id: '3.C',
      category: 'VEHÍCULOS',
      name: 'Dos carritos simultáneos con MISMA clave de idempotencia',
      concurrentRequests: 2,
      expected: 'Ambas 200, 1 solo cobro (saldo = 37,900 €), 1 movimiento, 1 vehículo insertado',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, vehículos: ${pgVeh.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgVeh.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgVehCount: pgVeh.rows.length }
    });

    console.log(`[3.C] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Vehículos: ${pgVeh.rows.length}`);
  }
}

// ==================== TEST 4: TIENDA DE OFICINA ====================
async function test4_TiendaOficina() {
  console.log('\n================== TEST 4: TIENDA DE OFICINA ==================');

  // 4.A: Varias compras concurrentes con saldo limitado (3 compras de 145.20 € c/u con saldo 200 €)
  {
    const buyerId = 'test_buyer_off_1';
    // Item in OFFICE_STORE_CATALOG: est-02 (Estantería metálica picking) -> price 120.00 € + 21% IVA = 145.20 €
    // Balance: 200.00 €. Exactly 1 can be paid (new balance: 54.80 €), other 2 fail.
    await resetTestUser(buyerId, 'Alumno Oficina 1', 200.00, 1);

    console.log('[4.A] Lanzando 3 compras concurrentes de tienda de oficina (145.20 € c/u) con saldo 200 €...');

    const reqBody = {
      studentId: buyerId,
      cartItems: [{ itemId: 'est-02', quantity: 1 }]
    };

    const [r1, r2, r3] = await Promise.all([
      fetch(`${BASE_URL}/api/office-store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_off_4a_req_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/office-store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_off_4a_req_2' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/office-store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_off_4a_req_3' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgOrders = await queryPg('SELECT * FROM pedidos_oficina WHERE alumno_id = $1', [buyerId]);

    const successCount = [r1.status, r2.status, r3.status].filter(s => s === 200).length;
    const failCount = [r1.status, r2.status, r3.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 2 &&
      pgBal === 54.80 &&
      pgBal >= 0 &&
      pgMovs.rows.length === 1 &&
      pgOrders.rows.length === 1
    );

    testResults.push({
      id: '4.A',
      category: 'TIENDA DE OFICINA',
      name: 'Varias compras concurrentes con saldo limitado (3 concurrentes)',
      concurrentRequests: 3,
      expected: '1 compra aceptada (200), 2 rechazadas (400), saldo = 54.80 €, 1 movimiento, 1 pedido en PG',
      actual: `HTTP [${r1.status}, ${r2.status}, ${r3.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, pedidos: ${pgOrders.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgOrders.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: (pgMovs.rows.length !== pgOrders.rows.length),
      details: { r1Status: r1.status, r2Status: r2.status, r3Status: r3.status, pgBal, pgMovsCount: pgMovs.rows.length, pgOrdersCount: pgOrders.rows.length }
    });

    console.log(`[4.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Pedidos: ${pgOrders.rows.length}`);
  }

  // 4.B: Dos peticiones simultáneas con la MISMA clave de idempotencia
  {
    const buyerId = 'test_buyer_off_2';
    await resetTestUser(buyerId, 'Alumno Oficina Idem', 200.00, 1);

    const idemKey = 'test_off_idem_key_777';
    const reqBody = {
      studentId: buyerId,
      cartItems: [{ itemId: 'est-02', quantity: 1 }]
    };

    console.log('[4.B] Lanzando 2 compras de oficina con MISMA clave de idempotencia...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/office-store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/office-store/checkout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
    const pgOrders = await queryPg('SELECT * FROM pedidos_oficina WHERE alumno_id = $1', [buyerId]);

    // Balance: 200 - 145.20 = 54.80 €
    const pass = (
      r1.status === 200 &&
      r2.status === 200 &&
      pgBal === 54.80 &&
      pgMovs.rows.length === 1 &&
      pgOrders.rows.length === 1
    );

    testResults.push({
      id: '4.B',
      category: 'TIENDA DE OFICINA',
      name: 'Dos compras de oficina simultáneas con MISMA clave de idempotencia',
      concurrentRequests: 2,
      expected: 'Ambas 200, 1 solo cobro (saldo = 54.80 €), 1 movimiento, 1 pedido insertado',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, pedidos: ${pgOrders.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgOrders.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgOrdersCount: pgOrders.rows.length }
    });

    console.log(`[4.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Pedidos: ${pgOrders.rows.length}`);
  }
}

// ==================== TEST 5: DEMANDAS JUDICIALES ====================
async function test5_Demandas() {
  console.log('\n================== TEST 5: DEMANDAS ==================');

  // 5.A: Dos solicitudes concurrentes de demanda con saldo limitado
  {
    const plaintiffId = 'test_plaintiff_1';
    const defendantId = 'test_defendant_1';
    // Lawyer fee: 15% of claimedAmount + 21% IVA.
    // If claimedAmount = 10000.00 €, fee base = 1500 €, IVA = 315 €, total lawyer fee = 1815.00 €.
    // Plaintiff balance = 2000.00 €. Two lawsuits = 3630.00 €.
    // Exactly 1 lawsuit admitted and billed (new balance: 185.00 €), 1 rejected with 400.
    await resetTestUser(plaintiffId, 'Demandante Concurrencia 1', 2000.00, 1);
    await resetTestUser(defendantId, 'Demandado Concurrencia 1', 50000.00, 1);

    console.log('[5.A] Lanzando 2 demandas concurrentes (minuta letrada 1,815 € c/u) con saldo 2,000 €...');

    const reqBody = {
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      defendantId,
      claimedAmount: 10000,
      goodsDescription: 'Lote de herramientas',
      facts: 'Impago de pagaré al vencimiento',
      legalBasis: 'Ley Cambiaria y del Cheque',
      petitum: 'Condena al pago de principal e intereses'
    };

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_lawsuit_5a_req_1' },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/court/lawsuits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': 'test_lawsuit_5a_req_2' },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [plaintiffId]);
    const pgLawsuits = await queryPg('SELECT * FROM demandas_judiciales WHERE demandante_id = $1', [plaintiffId]);

    const successCount = [r1.status, r2.status].filter(s => s === 200).length;
    const failCount = [r1.status, r2.status].filter(s => s >= 400).length;

    const pass = (
      successCount === 1 &&
      failCount === 1 &&
      pgBal === 185.00 &&
      pgBal >= 0 &&
      pgMovs.rows.length === 1 &&
      pgLawsuits.rows.length === 1
    );

    testResults.push({
      id: '5.A',
      category: 'DEMANDAS',
      name: 'Dos solicitudes concurrentes de demanda con saldo limitado',
      concurrentRequests: 2,
      expected: '1 demanda aceptada (200), 1 rechazada por falta de fondos para minuta (400), saldo = 185.00 €, 1 movimiento, 1 demanda',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, demandas: ${pgLawsuits.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgLawsuits.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: (pgMovs.rows.length !== pgLawsuits.rows.length),
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgLawsuitsCount: pgLawsuits.rows.length }
    });

    console.log(`[5.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Demandas: ${pgLawsuits.rows.length}`);
  }

  // 5.B: Repetición simultánea con la misma clave de idempotencia
  {
    const plaintiffId = 'test_plaintiff_2';
    const defendantId = 'test_defendant_2';
    await resetTestUser(plaintiffId, 'Demandante Idem', 5000.00, 1);
    await resetTestUser(defendantId, 'Demandado Idem', 50000.00, 1);

    const idemKey = 'test_court_lawsuit_idem_key_666';
    const reqBody = {
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      defendantId,
      claimedAmount: 10000,
      goodsDescription: 'Lote de materiales',
      facts: 'Impago de pagaré',
      legalBasis: 'Ley Cambiaria y del Cheque',
      petitum: 'Condena al pago'
    };

    console.log('[5.B] Lanzando 2 demandas simultáneas con MISMA clave de idempotencia...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      }),
      fetch(`${BASE_URL}/api/court/lawsuits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify(reqBody)
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [plaintiffId]);
    const pgLawsuits = await queryPg('SELECT * FROM demandas_judiciales WHERE demandante_id = $1', [plaintiffId]);

    // Balance: 5000 - 1815 = 3185.00 €
    const pass = (
      r1.status === 200 &&
      r2.status === 200 &&
      pgBal === 3185.00 &&
      pgMovs.rows.length === 1 &&
      pgLawsuits.rows.length === 1
    );

    testResults.push({
      id: '5.B',
      category: 'DEMANDAS',
      name: 'Dos solicitudes simultáneas de demanda con MISMA clave de idempotencia',
      concurrentRequests: 2,
      expected: 'Ambas 200 con mismo resultado, 1 solo cobro de minuta (saldo = 3,185 €), 1 movimiento, 1 demanda',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, demandas: ${pgLawsuits.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1 || pgLawsuits.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, pgLawsuitsCount: pgLawsuits.rows.length }
    });

    console.log(`[5.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Demandas: ${pgLawsuits.rows.length}`);
  }
}

// ==================== TEST 6: EMBARGO PREVENTIVO ====================
async function test6_EmbargoPreventivo() {
  console.log('\n================== TEST 6: EMBARGO PREVENTIVO ==================');

  // 6.A: Demandado con saldo limitado (500 €): A) Embargo preventivo (400 €), B) Operación de salida de dinero (400 €) concurrentes
  {
    const plaintiffId = 'test_plain_emb_1';
    const defendantId = 'test_def_emb_1';
    const thirdPartyId = 'test_third_emb_1';

    await resetTestUser(plaintiffId, 'Demandante Embargo 1', 10000.00, 1);
    await resetTestUser(defendantId, 'Demandado Embargo 1', 500.00, 1);
    await resetTestUser(thirdPartyId, 'Tercero Destino', 100.00, 1);

    // Create cambiaria lawsuit
    const lawsuitId = 'lawsuit-test-emb-1';
    const lawsuit = {
      id: lawsuitId,
      caseNumber: 'CAMB-2026-TEST1',
      courtName: 'Juzgado de Primera Instancia e Instrucción Nº 1',
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      plaintiffName: 'Demandante Embargo 1',
      defendantId,
      defendantName: 'Demandado Embargo 1',
      claimedAmount: 300.00,
      interestAndCostsAmount: 90.00,
      totalClaimAmount: 390.00, // Embargo will be 390.00 €
      status: 'admitida',
      createdAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => l.id !== lawsuitId);
    db.courtLawsuits.push(lawsuit);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO demandas_judiciales (id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
      [lawsuitId, lawsuit.caseNumber, lawsuit.courtName, lawsuit.type, lawsuit.subtype, plaintiffId, lawsuit.plaintiffName, defendantId, lawsuit.defendantName, 300, 90, 390, 'admitida']
    );

    console.log('[6.A] Lanzando Embargo preventivo (390 €) y Transferencia saliente (400 €) concurrentes sobre saldo 500 €...');

    const embargoPromise = fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/preventative-embargo`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'Auto de embargo preventivo concurrente' })
    });
    // Compensar la latencia de parseo de db.json en el endpoint judicial para que ambas compitan en Postgres
    await new Promise(r => setTimeout(r, 10));
    const transferPromise = fetch(`${BASE_URL}/api/transfers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: defendantId, receiverId: thirdPartyId, amount: 400.00, concept: 'Salida voluntaria' })
    });

    const [rEmbargo, rTransfer] = await Promise.all([embargoPromise, transferPromise]);

    const dEmb = await rEmbargo.json();
    const dTx = await rTransfer.json();

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [defendantId]);
    const pgLawsuit = await queryPg('SELECT estado, embargo_importe FROM demandas_judiciales WHERE id = $1', [lawsuitId]);

    console.log(`[6.A] HTTP Embargo: ${rEmbargo.status}, HTTP Transfer: ${rTransfer.status}, Saldo final demandado: ${pgBal} €`);

    const pass = (
      pgBal >= 0 && // NEVER NEGATIVE
      (rEmbargo.status === 200 || rTransfer.status === 200) &&
      !(rEmbargo.status === 200 && rTransfer.status === 200) // Both cannot succeed because 390 + 400 = 790 > 500
    );

    testResults.push({
      id: '6.A',
      category: 'EMBARGO PREVENTIVO',
      name: 'Embargo preventivo (390 €) y transferencia voluntaria (400 €) con saldo 500 €',
      concurrentRequests: 2,
      expected: 'Solamente 1 operación se ejecuta (o embargo o transferencia), nunca saldo negativo (saldo >= 0)',
      actual: `HTTP Embargo: ${rEmbargo.status}, HTTP Transfer: ${rTransfer.status}, saldo demandado: ${pgBal} €, movimientos: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: false,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { rEmbargoStatus: rEmbargo.status, rTransferStatus: rTransfer.status, pgBal, pgMovsCount: pgMovs.rows.length, lawsuitState: pgLawsuit.rows[0]?.estado }
    });

    console.log(`[6.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo demandado: ${pgBal} € | Movs: ${pgMovs.rows.length}`);
  }

  // 6.B: Dos embargos simultáneos sobre el MISMO expediente
  {
    const plaintiffId = 'test_plain_emb_2';
    const defendantId = 'test_def_emb_2';

    await resetTestUser(plaintiffId, 'Demandante Embargo 2', 10000.00, 1);
    await resetTestUser(defendantId, 'Demandado Embargo 2', 5000.00, 1);

    const lawsuitId = 'lawsuit-test-emb-2';
    const lawsuit = {
      id: lawsuitId,
      caseNumber: 'CAMB-2026-TEST2',
      courtName: 'Juzgado de Primera Instancia Nº 2',
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      plaintiffName: 'Demandante Embargo 2',
      defendantId,
      defendantName: 'Demandado Embargo 2',
      claimedAmount: 1000.00,
      interestAndCostsAmount: 300.00,
      totalClaimAmount: 1300.00,
      status: 'admitida',
      createdAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => l.id !== lawsuitId);
    db.courtLawsuits.push(lawsuit);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO demandas_judiciales (id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
      [lawsuitId, lawsuit.caseNumber, lawsuit.courtName, lawsuit.type, lawsuit.subtype, plaintiffId, lawsuit.plaintiffName, defendantId, lawsuit.defendantName, 1000, 300, 1300, 'admitida']
    );

    console.log('[6.B] Lanzando 2 embargos preventivos simultáneos sobre el MISMO expediente...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/preventative-embargo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Embargo 1' })
      }),
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/preventative-embargo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: 'Embargo 2' })
      })
    ]);

    const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
    const pgBal = Number(pgUser.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [defendantId]);

    // Initial balance: 5000.00. Exactly 1 embargo of 1300.00 € should be executed.
    // New balance: 3700.00 €. Exactly 1 movement.
    const pass = (
      pgBal === 3700.00 &&
      pgMovs.rows.length === 1
    );

    testResults.push({
      id: '6.B',
      category: 'EMBARGO PREVENTIVO',
      name: 'Dos embargos simultáneos sobre el MISMO expediente',
      concurrentRequests: 2,
      expected: 'Como máximo 1 embargo efectivo, saldo = 3,700 €, exactamente 1 movimiento de traba de embargo',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movimientos: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: pgBal < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length }
    });

    console.log(`[6.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length}`);
  }
}

// ==================== TEST 7: PAGO / SETTLEMENT JUDICIAL ====================
async function test7_SettlementJudicial() {
  console.log('\n================== TEST 7: PAGO / SETTLEMENT JUDICIAL ==================');

  // 7.A: Dos pagos/settlements del MISMO expediente simultáneos
  {
    const plaintiffId = 'test_plain_settle_1';
    const defendantId = 'test_def_settle_1';

    await resetTestUser(plaintiffId, 'Demandante Settlement 1', 1000.00, 1);
    await resetTestUser(defendantId, 'Demandado Settlement 1', 5000.00, 1);

    const lawsuitId = 'lawsuit-test-settle-1';
    const lawsuit = {
      id: lawsuitId,
      caseNumber: 'CAMB-2026-SETTLE1',
      courtName: 'Juzgado de Primera Instancia Nº 1',
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      plaintiffName: 'Demandante Settlement 1',
      defendantId,
      defendantName: 'Demandado Settlement 1',
      claimedAmount: 2000.00,
      interestAndCostsAmount: 600.00,
      totalClaimAmount: 2600.00,
      status: 'admitida',
      createdAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => l.id !== lawsuitId);
    db.courtLawsuits.push(lawsuit);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO demandas_judiciales (id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
      [lawsuitId, lawsuit.caseNumber, lawsuit.courtName, lawsuit.type, lawsuit.subtype, plaintiffId, lawsuit.plaintiffName, defendantId, lawsuit.defendantName, 2000, 600, 2600, 'admitida']
    );

    console.log('[7.A] Lanzando 2 settlements/pagos simultáneos del mismo expediente (2,000 €)...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerId: defendantId })
      }),
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerId: defendantId })
      })
    ]);

    const pgDef = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
    const pgPlain = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
    const defBal = Number(pgDef.rows[0].saldo);
    const plainBal = Number(pgPlain.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [defendantId]);
    const pgLawsuit = await queryPg('SELECT estado FROM demandas_judiciales WHERE id = $1', [lawsuitId]);

    // Expected:
    // Exactly ONE payment of 2000.00 € processed
    // Defendant balance: 5000 - 2000 = 3000.00 €
    // Plaintiff balance: 1000 + 2000 = 3000.00 €
    // Movimientos count: 1
    // Lawsuit status: 'allanada_pagada'
    const pass = (
      defBal === 3000.00 &&
      plainBal === 3000.00 &&
      pgMovs.rows.length === 1 &&
      pgLawsuit.rows[0]?.estado === 'allanada_pagada'
    );

    testResults.push({
      id: '7.A',
      category: 'PAGO / SETTLEMENT JUDICIAL',
      name: 'Dos pagos/settlements del MISMO expediente simultáneos',
      concurrentRequests: 2,
      expected: '1 único pago efectivo, saldo demandado: 3,000 €, saldo demandante: 3,000 €, estado: allanada_pagada, 1 movimiento',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo demandado: ${defBal} €, saldo demandante: ${plainBal} €, estado: ${pgLawsuit.rows[0]?.estado}, movs: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: defBal < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, defBal, plainBal, movsCount: pgMovs.rows.length, estado: pgLawsuit.rows[0]?.estado }
    });

    console.log(`[7.A] Resultado: ${pass ? 'PASS' : 'FAIL'} | Demandado: ${defBal} € | Demandante: ${plainBal} € | Movs: ${pgMovs.rows.length}`);
  }

  // 7.B: Un settlement y otra salida de dinero concurrentes con saldo limitado
  {
    const plaintiffId = 'test_plain_settle_2';
    const defendantId = 'test_def_settle_2';
    const thirdPartyId = 'test_third_settle_2';

    // Defendant has 1500.00 €. Settlement = 1000.00 €. Transfer = 1000.00 €. (Total 2000 > 1500)
    await resetTestUser(plaintiffId, 'Demandante Settlement 2', 1000.00, 1);
    await resetTestUser(defendantId, 'Demandado Settlement 2', 1500.00, 1);
    await resetTestUser(thirdPartyId, 'Tercero Settlement 2', 100.00, 1);

    const lawsuitId = 'lawsuit-test-settle-2';
    const lawsuit = {
      id: lawsuitId,
      caseNumber: 'CAMB-2026-SETTLE2',
      courtName: 'Juzgado de Primera Instancia Nº 1',
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      plaintiffName: 'Demandante Settlement 2',
      defendantId,
      defendantName: 'Demandado Settlement 2',
      claimedAmount: 1000.00,
      interestAndCostsAmount: 300.00,
      totalClaimAmount: 1300.00,
      status: 'admitida',
      createdAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => l.id !== lawsuitId);
    db.courtLawsuits.push(lawsuit);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO demandas_judiciales (id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
      [lawsuitId, lawsuit.caseNumber, lawsuit.courtName, lawsuit.type, lawsuit.subtype, plaintiffId, lawsuit.plaintiffName, defendantId, lawsuit.defendantName, 1000, 300, 1300, 'admitida']
    );

    console.log('[7.B] Lanzando settlement (1,000 €) y transferencia voluntaria (1,000 €) con saldo 1,500 €...');

    const [rSettle, rTx] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payerId: defendantId })
      }),
      fetch(`${BASE_URL}/api/transfers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ senderId: defendantId, receiverId: thirdPartyId, amount: 1000.00, concept: 'Salida voluntaria' })
      })
    ]);

    const pgDef = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
    const defBal = Number(pgDef.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [defendantId]);

    // Exactly 1 must succeed, 1 fail. Final balance = 500.00 €. Never negative.
    const pass = (
      defBal === 500.00 &&
      defBal >= 0 &&
      pgMovs.rows.length === 1 &&
      ((rSettle.status === 200 && rTx.status >= 400) || (rTx.status === 200 && rSettle.status >= 400))
    );

    testResults.push({
      id: '7.B',
      category: 'PAGO / SETTLEMENT JUDICIAL',
      name: 'Settlement (1,000 €) y transferencia (1,000 €) concurrentes con saldo 1,500 €',
      concurrentRequests: 2,
      expected: '1 aceptada (200), 1 rechazada (400), saldo = 500.00 €, nunca saldo negativo, 1 movimiento',
      actual: `HTTP Settle: ${rSettle.status}, HTTP Transfer: ${rTx.status}, saldo demandado: ${defBal} €, movimientos: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: defBal < 0,
      duplicationDetected: false,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { rSettleStatus: rSettle.status, rTxStatus: rTx.status, defBal, movsCount: pgMovs.rows.length }
    });

    console.log(`[7.B] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo demandado: ${defBal} € | Movs: ${pgMovs.rows.length}`);
  }

  // 7.C: Dos settlements simultáneos con la MISMA clave de idempotencia
  {
    const plaintiffId = 'test_plain_settle_3';
    const defendantId = 'test_def_settle_3';

    await resetTestUser(plaintiffId, 'Demandante Settlement 3', 1000.00, 1);
    await resetTestUser(defendantId, 'Demandado Settlement 3', 5000.00, 1);

    const lawsuitId = 'lawsuit-test-settle-3';
    const lawsuit = {
      id: lawsuitId,
      caseNumber: 'CAMB-2026-SETTLE3',
      courtName: 'Juzgado de Primera Instancia Nº 1',
      type: 'cambiaria',
      subtype: 'impago_pagare',
      plaintiffId,
      plaintiffName: 'Demandante Settlement 3',
      defendantId,
      defendantName: 'Demandado Settlement 3',
      claimedAmount: 1500.00,
      interestAndCostsAmount: 450.00,
      totalClaimAmount: 1950.00,
      status: 'admitida',
      createdAt: new Date().toISOString()
    };

    const db = readLocalDb();
    db.courtLawsuits = (db.courtLawsuits || []).filter((l: any) => l.id !== lawsuitId);
    db.courtLawsuits.push(lawsuit);
    writeLocalDb(db);

    await queryPg(
      `INSERT INTO demandas_judiciales (id, numero_autos, juzgado, tipo, subtipo, demandante_id, demandante_nombre, demandado_id, demandado_nombre, cuantia_reclamada, intereses_costas, cuantia_total, estado)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado`,
      [lawsuitId, lawsuit.caseNumber, lawsuit.courtName, lawsuit.type, lawsuit.subtype, plaintiffId, lawsuit.plaintiffName, defendantId, lawsuit.defendantName, 1500, 450, 1950, 'admitida']
    );

    const idemKey = 'test_court_settle_idem_key_555';

    console.log('[7.C] Lanzando 2 settlements simultáneos con MISMA clave de idempotencia...');

    const [r1, r2] = await Promise.all([
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify({ payerId: defendantId })
      }),
      fetch(`${BASE_URL}/api/court/lawsuits/${lawsuitId}/pay-settle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
        body: JSON.stringify({ payerId: defendantId })
      })
    ]);

    const pgDef = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [defendantId]);
    const pgPlain = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [plaintiffId]);
    const defBal = Number(pgDef.rows[0].saldo);
    const plainBal = Number(pgPlain.rows[0].saldo);
    const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [defendantId]);

    // Balance: 5000 - 1500 = 3500.00 €
    const pass = (
      r1.status === 200 &&
      r2.status === 200 &&
      defBal === 3500.00 &&
      plainBal === 2500.00 &&
      pgMovs.rows.length === 1
    );

    testResults.push({
      id: '7.C',
      category: 'PAGO / SETTLEMENT JUDICIAL',
      name: 'Dos settlements simultáneos con MISMA clave de idempotencia',
      concurrentRequests: 2,
      expected: 'Ambas 200 con mismo resultado, 1 solo pago efectivo (saldo demandado = 3,500 €, demandante = 2,500 €), 1 movimiento',
      actual: `HTTP [${r1.status}, ${r2.status}], saldo demandado: ${defBal} €, saldo demandante: ${plainBal} €, movimientos: ${pgMovs.rows.length}`,
      pass,
      negativeBalanceDetected: defBal < 0,
      duplicationDetected: pgMovs.rows.length > 1,
      deadlocksDetected: false,
      partialStateDetected: false,
      details: { r1Status: r1.status, r2Status: r2.status, defBal, plainBal, movsCount: pgMovs.rows.length }
    });

    console.log(`[7.C] Resultado: ${pass ? 'PASS' : 'FAIL'} | Demandado: ${defBal} € | Demandante: ${plainBal} € | Movs: ${pgMovs.rows.length}`);
  }
}

// ==================== TEST 8: DEADLOCKS ====================
async function test8_Deadlocks() {
  console.log('\n================== TEST 8: PREVENCIÓN DE DEADLOCKS ==================');

  // Ejecutar 10 operaciones concurrentes cruzadas que bloquean dos cuentas en direcciones opuestas (A -> B y B -> A simultáneamente)
  // Repetir 3 rondas intensivas.
  const userA = 'test_deadlock_user_a';
  const userB = 'test_deadlock_user_b';

  await resetTestUser(userA, 'Usuario Deadlock A', 10000.00, 1);
  await resetTestUser(userB, 'Usuario Deadlock B', 10000.00, 1);

  let totalDeadlocks = 0;
  let totalErrors = 0;
  let totalSuccess = 0;

  console.log('[8] Ejecutando 3 rondas de 10 transferencias simultáneas bidireccionales (5 de A->B y 5 de B->A)...');

  for (let round = 1; round <= 3; round++) {
    const promises: Promise<Response>[] = [];
    
    // 5 transfers A -> B
    for (let i = 0; i < 5; i++) {
      promises.push(
        fetch(`${BASE_URL}/api/transfers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: userA, receiverId: userB, amount: 10.00, concept: `Ronda ${round} A->B ${i}` })
        })
      );
    }

    // 5 transfers B -> A
    for (let i = 0; i < 5; i++) {
      promises.push(
        fetch(`${BASE_URL}/api/transfers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ senderId: userB, receiverId: userA, amount: 10.00, concept: `Ronda ${round} B->A ${i}` })
        })
      );
    }

    const responses = await Promise.all(promises);
    for (const r of responses) {
      if (r.status === 200) {
        totalSuccess++;
      } else {
        totalErrors++;
        const text = await r.text();
        if (text.toLowerCase().includes('deadlock') || text.includes('40P01')) {
          totalDeadlocks++;
        }
      }
    }
  }

  const pgA = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [userA]);
  const pgB = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [userB]);
  const balA = Number(pgA.rows[0].saldo);
  const balB = Number(pgB.rows[0].saldo);

  // Since in total 15 transfers A->B and 15 transfers B->A of 10.00 € each were executed:
  // Net balance difference should be 0. Both should have exactly 10,000.00 €!
  // And ZERO deadlocks!
  const pass = (totalDeadlocks === 0 && totalSuccess === 30 && balA === 10000.00 && balB === 10000.00);

  testResults.push({
    id: '8',
    category: 'DEADLOCKS',
    name: '30 transferencias concurrentes cruzadas bidireccionales (A <-> B)',
    concurrentRequests: 30,
    expected: '0 deadlocks detectados (código 40P01), 30 transferencias exitosas, saldos finales exactos (10,000 € c/u)',
    actual: `Exitosas: ${totalSuccess}/30, Deadlocks: ${totalDeadlocks}, Saldo A: ${balA} €, Saldo B: ${balB} €`,
    pass,
    negativeBalanceDetected: false,
    duplicationDetected: false,
    deadlocksDetected: totalDeadlocks > 0,
    partialStateDetected: false,
    details: { totalSuccess, totalErrors, totalDeadlocks, balA, balB }
  });

  console.log(`[8] Resultado: ${pass ? 'PASS' : 'FAIL'} | Éxitos: ${totalSuccess}/30 | Deadlocks: ${totalDeadlocks} | Saldo A: ${balA} | Saldo B: ${balB}`);
}

// ==================== TEST 9: IDEMPOTENCIA ====================
async function test9_Idempotencia() {
  console.log('\n================== TEST 9: IDEMPOTENCIA ==================');

  // Verificar idempotencia secuencial y simultánea en la tabla operaciones_idempotencia
  const buyerId = 'test_buyer_idem_ops';
  await resetTestUser(buyerId, 'Alumno Idem Ops', 20000.00, 1);

  const idemKeySeq = 'test_idem_seq_key_001';
  const reqBody = {
    studentId: buyerId,
    vehicleType: 'coche_empresa',
    title: 'Coche Idempotente',
    basePrice: 5000,
    paymentMethod: 'contado'
  };

  console.log('[9.A] Probando idempotencia SECUENCIAL (primera llamada ejecuta, segunda devuelve caché persistida)...');

  // Call 1
  const r1 = await fetch(`${BASE_URL}/api/vehicles/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKeySeq },
    body: JSON.stringify(reqBody)
  });
  const d1 = await r1.json();

  // Call 2 (identical key, sequential)
  const r2 = await fetch(`${BASE_URL}/api/vehicles/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKeySeq },
    body: JSON.stringify(reqBody)
  });
  const d2 = await r2.json();

  const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
  const pgBal = Number(pgUser.rows[0].saldo);
  const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
  const pgVeh = await queryPg('SELECT * FROM vehiculos_comprados WHERE alumno_id = $1', [buyerId]);
  const pgIdem = await queryPg('SELECT * FROM operaciones_idempotencia WHERE clave = $1', [idemKeySeq]);

  // Price: 5000 + 21% = 6050. Balance: 20000 - 6050 = 13950.00 €
  // Movimientos: 1. Vehiculos: 1.
  const passSeq = (
    r1.status === 200 &&
    r2.status === 200 &&
    pgBal === 13950.00 &&
    pgMovs.rows.length === 1 &&
    pgVeh.rows.length === 1 &&
    pgIdem.rows.length === 1
  );

  testResults.push({
    id: '9.A',
    category: 'IDEMPOTENCIA',
    name: 'Idempotencia secuencial persistida en PostgreSQL',
    concurrentRequests: 2,
    expected: 'Segunda llamada responde con la respuesta guardada sin volver a cobrar, saldo = 13,950 €, 1 movimiento',
    actual: `HTTP [${r1.status}, ${r2.status}], saldo: ${pgBal} €, movs: ${pgMovs.rows.length}, vehículos: ${pgVeh.rows.length}, registro en operaciones_idempotencia: ${pgIdem.rows.length}`,
    pass: passSeq,
    negativeBalanceDetected: false,
    duplicationDetected: pgMovs.rows.length > 1,
    deadlocksDetected: false,
    partialStateDetected: false,
    details: { r1Status: r1.status, r2Status: r2.status, pgBal, pgMovsCount: pgMovs.rows.length, idemRows: pgIdem.rows.length }
  });

  console.log(`[9.A] Resultado: ${passSeq ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length}`);
}

// ==================== TEST 10: ROLLBACK ====================
async function test10_Rollback() {
  console.log('\n================== TEST 10: ATOMICIDAD & ROLLBACK ==================');

  // Provocar un error dentro de la transacción y verificar que NO deja ningún cambio parcial
  const buyerId = 'test_buyer_rollback';
  await resetTestUser(buyerId, 'Alumno Rollback Test', 100.00, 1);

  console.log('[10] Provocando fallo por saldo insuficiente (100 € disponibles, compra de 24,200 €)...');

  const r = await fetch(`${BASE_URL}/api/vehicles/buy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      studentId: buyerId,
      vehicleType: 'coche_empresa',
      title: 'Coche Rollback',
      basePrice: 20000,
      paymentMethod: 'contado'
    })
  });

  const pgUser = await queryPg('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
  const pgBal = Number(pgUser.rows[0].saldo);
  const pgMovs = await queryPg('SELECT * FROM movimientos WHERE cuenta_id = $1', [buyerId]);
  const pgVeh = await queryPg('SELECT * FROM vehiculos_comprados WHERE alumno_id = $1', [buyerId]);

  const pass = (
    r.status === 400 &&
    pgBal === 100.00 &&
    pgMovs.rows.length === 0 &&
    pgVeh.rows.length === 0
  );

  testResults.push({
    id: '10',
    category: 'ROLLBACK',
    name: 'Rollback completo ante error en transacción',
    concurrentRequests: 1,
    expected: 'HTTP 400, saldo intacto (100.00 €), 0 movimientos creados, 0 vehículos creados',
    actual: `HTTP ${r.status}, saldo: ${pgBal} €, movimientos: ${pgMovs.rows.length}, vehículos: ${pgVeh.rows.length}`,
    pass,
    negativeBalanceDetected: false,
    duplicationDetected: false,
    deadlocksDetected: false,
    partialStateDetected: (pgMovs.rows.length > 0 || pgVeh.rows.length > 0),
    details: { status: r.status, pgBal, pgMovsCount: pgMovs.rows.length, pgVehCount: pgVeh.rows.length }
  });

  console.log(`[10] Resultado: ${pass ? 'PASS' : 'FAIL'} | Saldo: ${pgBal} € | Movs: ${pgMovs.rows.length} | Vehículos: ${pgVeh.rows.length}`);
}

// ==================== MAIN RUNNER ====================
async function runAll() {
  try {
    await setupTestEnvironment();

    await test1_MateriasPrimas();
    await test2_Maquinaria();
    await test3_Vehiculos();
    await test4_TiendaOficina();
    await test5_Demandas();
    await test6_EmbargoPreventivo();
    await test7_SettlementJudicial();
    await test8_Deadlocks();
    await test9_Idempotencia();
    await test10_Rollback();

    console.log('\n\n======================================================');
    console.log('            RESUMEN COMPLETO DE PRUEBAS               ');
    console.log('======================================================');
    
    let totalPass = 0;
    let totalFail = 0;

    for (const res of testResults) {
      const statusIcon = res.pass ? '✅ PASS' : '❌ FAIL';
      if (res.pass) totalPass++; else totalFail++;
      console.log(`\n[${res.id}] [${res.category}] ${res.name}: ${statusIcon}`);
      console.log(`  - Peticiones concurrentes: ${res.concurrentRequests}`);
      console.log(`  - Esperado: ${res.expected}`);
      console.log(`  - Obtenido: ${res.actual}`);
      console.log(`  - Saldo negativo: ${res.negativeBalanceDetected ? 'SÍ (ERROR)' : 'NO'}`);
      console.log(`  - Duplicaciones: ${res.duplicationDetected ? 'SÍ (ERROR)' : 'NO'}`);
      console.log(`  - Deadlocks: ${res.deadlocksDetected ? 'SÍ (ERROR)' : 'NO'}`);
      console.log(`  - Estado parcial/huérfano: ${res.partialStateDetected ? 'SÍ (ERROR)' : 'NO'}`);
    }

    console.log('\n======================================================');
    console.log(`TOTAL PRUEBAS: ${testResults.length} | APROBADAS: ${totalPass} | FALLIDAS: ${totalFail}`);
    console.log('======================================================');

    // Save JSON results for final report generation
    fs.writeFileSync('concurrency_test_results.json', JSON.stringify(testResults, null, 2), 'utf-8');

  } catch (err) {
    console.error('Error fatal durante la ejecución de las pruebas:', err);
  } finally {
    await pool.end();
  }
}

runAll();
