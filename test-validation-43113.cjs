process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const pg = require('pg');
const http = require('http');
const fs = require('fs');

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

function request(method, path, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({
      hostname: 'localhost',
      port: 3000,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
        ...headers
      }
    }, (res) => {
      let respBody = '';
      res.on('data', chunk => respBody += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(respBody) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: respBody });
        }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function queryPg(sql, params = []) {
  return await pool.query(sql, params);
}

let passedTests = 0;
let totalTests = 0;
let deadlockErrors = 0;

function assert(condition, message) {
  totalTests++;
  if (!condition) {
    console.error(`❌ FAIL [Test ${totalTests}]: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  passedTests++;
  console.log(`✅ PASS [Test ${totalTests}]: ${message}`);
}

async function run() {
  console.log('===============================================================');
  console.log('SUITE DE VALIDACIÓN FASE 4.3.11.3: DELETE /api/raw-materials/announcements/:id');
  console.log('===============================================================');

  const testSellerId = 'test_plain_settle_3';
  const testSellerName = 'Demandante Settlement 3';
  const testBuyerId = 'reg_buyer_1789035312399';
  const testBuyerName = 'Comprador App';
  const otherUserId = `other_user_${Date.now()}`;

  // Deactivate previous active announcements for testSellerId
  await queryPg('UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1', [testSellerId]);

  // Pre-seed accounts
  await queryPg(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
     VALUES ($1, $2, 20000, $3, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET saldo = 20000`,
    [testSellerId, testSellerName, testSellerId]
  );
  await queryPg(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
     VALUES ($1, $2, 20000, $3, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET saldo = 20000`,
    [testBuyerId, testBuyerName, testBuyerId]
  );
  await queryPg(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
     VALUES ($1, $2, 10000, $3, 'student', 1)
     ON CONFLICT (id) DO UPDATE SET saldo = 10000`,
    [otherUserId, 'Otro Usuario', otherUserId]
  );

  // Pre-seed inventory for test seller and buyer in PostgreSQL
  await queryPg(
    `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, productos_ensamblados, destornilladores_punta_estrella, destornilladores_punta_plana, desglose_almacenes)
     VALUES ($1, $2, 1000, 500, 500, '{"nave-1": {"destornilladores_estrella": 500, "destornilladores_plana": 500}}'::jsonb)
     ON CONFLICT (alumno_id) DO UPDATE
     SET productos_ensamblados = 1000, destornilladores_punta_estrella = 500, destornilladores_punta_plana = 500,
         desglose_almacenes = '{"nave-1": {"destornilladores_estrella": 500, "destornilladores_plana": 500}}'::jsonb`,
    [testSellerId, testSellerName]
  );

  await queryPg(
    `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, productos_ensamblados, destornilladores_punta_estrella, destornilladores_punta_plana, desglose_almacenes)
     VALUES ($1, $2, 50, 25, 25, '{"nave-1": {"destornilladores_estrella": 25, "destornilladores_plana": 25}}'::jsonb)
     ON CONFLICT (alumno_id) DO UPDATE
     SET productos_ensamblados = 50`,
    [testBuyerId, testBuyerName]
  );

  // -------------------------------------------------------------
  // PRUEBA 1 — DELETE normal
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 1: DELETE normal de un anuncio válido ---');
  const ann1Id = `ann_del_p1_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Borrado P1', 15.00, 'Para borrar', '50', true, $2, $3)`,
    [ann1Id, testSellerId, testSellerName]
  );

  const del1Res = await request('DELETE', `/api/raw-materials/announcements/${ann1Id}`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_del_p1_${Date.now()}` });

  assert(del1Res.status === 200, `DELETE normal debe responder 200 (obtenido ${del1Res.status})`);
  assert(del1Res.data.success === true, `DELETE normal debe retornar success: true`);

  const check1Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann1Id]);
  assert(check1Pg.rows.length === 0, `El anuncio debe ser eliminado físicamente de PostgreSQL (obtenido ${check1Pg.rows.length} filas)`);

  // -------------------------------------------------------------
  // PRUEBA 2 — DELETE no autorizado (403)
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 2: DELETE no autorizado por otro usuario ---');
  const ann2Id = `ann_del_p2_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella P2 No Autorizado', 20.00, 'Protegido', '30', true, $2, $3)`,
    [ann2Id, testSellerId, testSellerName]
  );

  const del2Res = await request('DELETE', `/api/raw-materials/announcements/${ann2Id}`, {
    userId: otherUserId
  }, { 'x-idempotency-key': `idem_del_p2_${Date.now()}` });

  assert(del2Res.status === 403, `DELETE por usuario no propietario debe responder 403 (obtenido ${del2Res.status})`);

  const check2Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann2Id]);
  assert(check2Pg.rows.length === 1, `El anuncio debe permanecer intacto en PostgreSQL tras intento no autorizado`);

  // -------------------------------------------------------------
  // PRUEBA 3 — DELETE inexistente
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 3: DELETE de anuncio inexistente (conservación de comportamiento HTTP) ---');
  const nonExistentId = `non_existent_ann_${Date.now()}`;
  const del3Res = await request('DELETE', `/api/raw-materials/announcements/${nonExistentId}`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_del_p3_${Date.now()}` });

  assert(del3Res.status === 200, `DELETE inexistente debe responder 200 según comportamiento actual (obtenido ${del3Res.status})`);
  assert(del3Res.data.success === true, `DELETE inexistente debe retornar success: true`);

  // -------------------------------------------------------------
  // PRUEBA 4 — Dos DELETE simultáneos sobre el mismo anuncio
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 4: Dos DELETE simultáneos sobre el mismo anuncio ---');
  const ann4Id = `ann_del_p4_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Concurrente P4', 18.00, 'Doble delete', '40', true, $2, $3)`,
    [ann4Id, testSellerId, testSellerName]
  );

  const [del4a, del4b] = await Promise.all([
    request('DELETE', `/api/raw-materials/announcements/${ann4Id}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_del_p4a_${Date.now()}` }),
    request('DELETE', `/api/raw-materials/announcements/${ann4Id}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_del_p4b_${Date.now()}` })
  ]);

  assert(del4a.status === 200 && del4b.status === 200, `Ambos DELETE simultáneos deben responder 200 sin errores internos ni deadlocks`);
  const check4Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann4Id]);
  assert(check4Pg.rows.length === 0, `El anuncio debe quedar eliminado en PostgreSQL`);

  // -------------------------------------------------------------
  // PRUEBA 5 — DELETE + PUT simultáneos
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 5: DELETE y PUT simultáneos sobre el mismo anuncio ---');
  const ann5Id = `ann_del_p5_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella DELETE+PUT', 25.00, 'Original', '50', true, $2, $3)`,
    [ann5Id, testSellerId, testSellerName]
  );

  const [del5Res, put5Res] = await Promise.all([
    request('DELETE', `/api/raw-materials/announcements/${ann5Id}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_del_p5_${Date.now()}` }),
    request('PUT', `/api/raw-materials/announcements/${ann5Id}`, { userId: testSellerId, pricePerUnit: 99.00, description: 'Modificado concurrente' }, { 'x-idempotency-key': `idem_put_p5_${Date.now()}` })
  ]);

  assert(del5Res.status === 200, `DELETE en concurrencia debe responder 200`);
  assert(put5Res.status === 200 || put5Res.status === 404, `PUT debe responder 200 (si adquirió lock antes) o 404 (si DELETE lo eliminó antes)`);

  const check5Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann5Id]);
  assert(check5Pg.rows.length === 0, `El anuncio final en PostgreSQL debe estar eliminado y NUNCA resucitar por snapshot de PUT`);

  // -------------------------------------------------------------
  // PRUEBA 6 — DELETE + POST /orders simultáneos
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 6: DELETE y POST /orders simultáneos ---');
  const ann6Id = `ann_del_p6_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella DELETE+ORDER', 10.00, 'Compra vs Borrado', '50', true, $2, $3)`,
    [ann6Id, testSellerId, testSellerName]
  );

  const [del6Res, order6Res] = await Promise.all([
    request('DELETE', `/api/raw-materials/announcements/${ann6Id}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_del_p6_${Date.now()}` }),
    request('POST', '/api/raw-materials/orders', {
      studentId: testBuyerId,
      announcementId: ann6Id,
      quantity: 10
    }, { 'x-idempotency-key': `idem_ord_p6_${Date.now()}` })
  ]);

  assert(del6Res.status === 200, `DELETE debe responder 200`);
  assert(order6Res.status === 200 || order6Res.status === 404 || order6Res.status === 400, `Orden debe o completarse o rechazarse con 404/400 (obtenido ${order6Res.status})`);

  const check6Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann6Id]);
  assert(check6Pg.rows.length === 0, `El anuncio debe quedar eliminado en PostgreSQL`);

  if (order6Res.status === 200) {
    console.log('   -> La orden adquirió el lock primero: pedido creado con éxito y luego el anuncio fue eliminado.');
    const orderId = order6Res.data.order.id;
    const checkOrd = await queryPg('SELECT * FROM materias_primas_pedidos WHERE id = $1', [orderId]);
    assert(checkOrd.rows.length === 1, `El pedido creado debe existir en PostgreSQL sin quedar huérfano`);
  } else {
    console.log('   -> El DELETE adquirió el lock primero: compra limpiamente rechazada.');
  }

  // -------------------------------------------------------------
  // PRUEBA 7 — Misma idempotency key (x-idempotency-key)
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 7: Misma idempotency key repetida ---');
  const ann7Id = `ann_del_p7_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Idempotencia P7', 12.00, 'Test Idem', '25', true, $2, $3)`,
    [ann7Id, testSellerId, testSellerName]
  );

  const idemKey7 = `shared_idem_del_key_${Date.now()}`;
  const [idemCall1, idemCall2] = await Promise.all([
    request('DELETE', `/api/raw-materials/announcements/${ann7Id}`, { userId: testSellerId }, { 'x-idempotency-key': idemKey7 }),
    request('DELETE', `/api/raw-materials/announcements/${ann7Id}`, { userId: testSellerId }, { 'x-idempotency-key': idemKey7 })
  ]);

  assert(idemCall1.status === 200, `Primera llamada con idempotency-key debe responder 200`);
  assert(idemCall2.status === 200, `Segunda llamada concurrente con la misma clave debe responder 200`);
  assert(JSON.stringify(idemCall1.data) === JSON.stringify(idemCall2.data), `Ambas llamadas deben devolver exactamente el mismo payload`);

  // -------------------------------------------------------------
  // PRUEBA 8 — Claves de idempotencia diferentes
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 8: Operaciones concurrentes con claves de idempotencia diferentes ---');
  const ann8aId = `ann_del_p8a_${Date.now()}`;
  const ann8bId = `ann_del_p8b_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella 8A', 10.00, 'A', '10', true, $2, $3),
            ($4, 'producto_final', 'Destornillador Estrella 8B', 15.00, 'B', '20', true, $2, $3)`,
    [ann8aId, testSellerId, testSellerName, ann8bId]
  );

  const [del8a, del8b] = await Promise.all([
    request('DELETE', `/api/raw-materials/announcements/${ann8aId}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_8a_${Date.now()}` }),
    request('DELETE', `/api/raw-materials/announcements/${ann8bId}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_8b_${Date.now()}` })
  ]);

  assert(del8a.status === 200 && del8b.status === 200, `Operaciones con claves independientes deben procesarse con 200`);
  const check8Pg = await queryPg('SELECT COUNT(*) as c FROM anuncios_materia_prima WHERE id IN ($1, $2)', [ann8aId, ann8bId]);
  assert(Number(check8Pg.rows[0].c) === 0, `Ambos anuncios deben ser eliminados de PostgreSQL`);

  // -------------------------------------------------------------
  // PRUEBA 9 — Rollback ante fallo controlado
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 9: Rollback transaccional atómico ante fallo ---');
  const ann9Id = `ann_del_p9_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Rollback P9', 33.00, 'Rollback Test', '77', true, $2, $3)`,
    [ann9Id, testSellerId, testSellerName]
  );

  const rollbackRes = await request('DELETE', `/api/raw-materials/announcements/${ann9Id}`, {
    userId: testSellerId
  }, {
    'x-idempotency-key': `idem_roll_${Date.now()}`,
    'x-test-force-rollback': 'true'
  });

  assert(rollbackRes.status === 400, `Petición con fallo forzado debe responder 400 (obtenido ${rollbackRes.status})`);
  const check9Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann9Id]);
  assert(check9Pg.rows.length === 1, `El anuncio debe permanecer intacto en PostgreSQL tras rollback atómico`);

  // -------------------------------------------------------------
  // PRUEBA 10 — db.json obsoleto no afecta la fuente de verdad PostgreSQL
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 10: db.json obsoleto no interfiere con PostgreSQL ---');
  const ann10Id = `ann_del_p10_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella P10 db.json test', 50.00, 'Verdadero en PG', '60', true, $2, $3)`,
    [ann10Id, testSellerId, testSellerName]
  );

  // Inyectar versión desfasada en db.json
  const rawDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  if (!rawDb.rawMaterialAnnouncements) rawDb.rawMaterialAnnouncements = [];
  rawDb.rawMaterialAnnouncements.push({
    id: ann10Id,
    title: 'Versión fantasma desfasada db.json',
    pricePerUnit: 1.00,
    stock: 999,
    sellerId: testSellerId,
    active: true
  });
  fs.writeFileSync('db.json', JSON.stringify(rawDb, null, 2));

  const del10Res = await request('DELETE', `/api/raw-materials/announcements/${ann10Id}`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_del_p10_${Date.now()}` });

  assert(del10Res.status === 200, `DELETE con db.json desfasado debe responder 200`);
  const check10Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann10Id]);
  assert(check10Pg.rows.length === 0, `El anuncio debe eliminarse de PostgreSQL`);

  const freshDb = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  const foundInMem = (freshDb.rawMaterialAnnouncements || []).some(a => a.id === ann10Id);
  assert(!foundInMem, `El anuncio desfasado debe ser eliminado de db.json tras el commit`);

  // -------------------------------------------------------------
  // PRUEBA 11 — Deadlock check bajo carga concurrente cruzada
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 11: Comprobación de ausencia de deadlocks (0 errores 40P01) ---');
  const ann11Id = `ann_del_p11_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Deadlock Check', 14.00, 'Deadlock test', '100', true, $2, $3)`,
    [ann11Id, testSellerId, testSellerName]
  );

  // Ejecutar en paralelo DELETE, PUT, y POST /orders sobre el mismo anuncio
  const ops = await Promise.allSettled([
    request('PUT', `/api/raw-materials/announcements/${ann11Id}`, { userId: testSellerId, pricePerUnit: 16.00 }, { 'x-idempotency-key': `idem_dlk_put_${Date.now()}` }),
    request('POST', '/api/raw-materials/orders', { studentId: testBuyerId, announcementId: ann11Id, quantity: 5 }, { 'x-idempotency-key': `idem_dlk_ord_${Date.now()}` }),
    request('DELETE', `/api/raw-materials/announcements/${ann11Id}`, { userId: testSellerId }, { 'x-idempotency-key': `idem_dlk_del_${Date.now()}` })
  ]);

  for (const op of ops) {
    if (op.status === 'fulfilled') {
      const resp = op.value;
      if (resp.data && resp.data.error && resp.data.error.includes('40P01')) {
        deadlockErrors++;
      }
    }
  }
  assert(deadlockErrors === 0, `No debe ocurrir ningún deadlock 40P01 (errores encontrados: ${deadlockErrors})`);

  // -------------------------------------------------------------
  // PRUEBA 12 — Integridad de pedidos asociados
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 12: Integridad de pedidos existentes cuando se elimina el anuncio ---');
  const post12 = await request('POST', '/api/raw-materials/announcements', {
    sellerId: testSellerId,
    sellerName: testSellerName,
    sellerLevel: '1',
    materialType: 'producto_final',
    title: 'Destornillador Estrella Con Pedido Previo',
    description: 'Con pedido',
    pricePerUnit: 22.00,
    stock: 50,
    presentation: 'caja'
  }, { 'x-idempotency-key': `idem_post_p12_${Date.now()}` });
  assert(post12.status === 200, `POST anuncio previo p12 debe responder 200`);
  const ann12Id = post12.data.announcement.id;

  // Crear una orden previa para este anuncio
  const ord12Res = await request('POST', '/api/raw-materials/orders', {
    studentId: testBuyerId,
    announcementId: ann12Id,
    quantity: 5
  }, { 'x-idempotency-key': `idem_ord_p12_${Date.now()}` });
  if (ord12Res.status !== 200) {
    console.error('ord12Res error details:', ord12Res.status, ord12Res.data);
  }
  assert(ord12Res.status === 200, `Orden previa para el anuncio debe crearse con 200`);
  const ord12Id = ord12Res.data.order.id;

  // Eliminar el anuncio
  const del12Res = await request('DELETE', `/api/raw-materials/announcements/${ann12Id}`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_del_p12_${Date.now()}` });
  assert(del12Res.status === 200, `DELETE del anuncio con pedidos debe responder 200`);

  // Verificar que el anuncio está borrado pero el pedido permanece íntegro
  const checkAnn12Pg = await queryPg('SELECT * FROM anuncios_materia_prima WHERE id = $1', [ann12Id]);
  assert(checkAnn12Pg.rows.length === 0, `El anuncio debe eliminarse de PostgreSQL`);

  const checkOrd12Pg = await queryPg('SELECT * FROM materias_primas_pedidos WHERE id = $1', [ord12Id]);
  assert(checkOrd12Pg.rows.length === 1, `El pedido asociado debe permanecer completamente intacto en PostgreSQL`);
  assert(checkOrd12Pg.rows[0].announcement_id === ann12Id, `El pedido debe conservar la referencia histórica del anuncio`);

  // -------------------------------------------------------------
  // PRUEBA 13 — Regresión del ciclo completo de órdenes y anuncios
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 13: Regresión del ciclo completo de vida del pedido ---');
  // Reset inventory for regression
  await queryPg('UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1', [testSellerId]);
  const naveInvReg = {
    'nave-1': {
      ironKg: 0,
      metalKg: 0,
      plasticKg: 0,
      epoxiKg: 0,
      producedRodsUnits: 200,
      producedStarRodsUnits: 200,
      producedFlatRodsUnits: 0,
      starScrewdriversUnits: 200,
      flatScrewdriversUnits: 0,
      producedScrewdriversUnits: 200
    }
  };
  await queryPg(
    `UPDATE materias_primas_inventario
     SET productos_ensamblados = 200,
         destornilladores_punta_estrella = 200,
         destornilladores_hierro = 200,
         desglose_almacenes = $1::jsonb
     WHERE alumno_id = $2`,
    [JSON.stringify(naveInvReg), testSellerId]
  );

  // 13.1. POST announcement (Fase 4.3.11.1)
  const regPostAnn = await request('POST', '/api/raw-materials/announcements', {
    sellerId: testSellerId,
    sellerName: testSellerName,
    sellerLevel: '1',
    materialType: 'producto_final',
    title: 'Destornillador Estrella Regresión Total',
    description: 'Descripción inicial',
    pricePerUnit: 10,
    stock: 50,
    presentation: 'caja'
  }, { 'x-idempotency-key': `idem_reg_post_${Date.now()}` });
  assert(regPostAnn.status === 200, `POST announcement debe responder 200`);
  const regAnnId = regPostAnn.data.announcement.id;

  // 13.2. PUT announcement (Fase 4.3.11.2)
  const regPutAnn = await request('PUT', `/api/raw-materials/announcements/${regAnnId}`, {
    userId: testSellerId,
    pricePerUnit: 12,
    description: 'Descripción editada'
  }, { 'x-idempotency-key': `idem_reg_put_${Date.now()}` });
  assert(regPutAnn.status === 200, `PUT announcement debe responder 200`);

  // 13.3. POST order (Fase 4.3.10.1)
  const regPostOrder = await request('POST', '/api/raw-materials/orders', {
    studentId: testBuyerId,
    announcementId: regAnnId,
    quantity: 5
  }, { 'x-idempotency-key': `idem_reg_ord_${Date.now()}` });
  assert(regPostOrder.status === 200, `POST order debe responder 200`);
  const regOrderId = regPostOrder.data.order.id;

  // 13.4. Negociar orden (Fase 4.3.6)
  const regNegRes = await request('POST', `/api/raw-materials/orders/${regOrderId}/negotiate`, {
    userId: testSellerId,
    offeredPrice: 11.5,
    note: 'Contraoferta del vendedor'
  }, { 'x-idempotency-key': `idem_reg_neg_${Date.now()}` });
  assert(regNegRes.status === 200, `Negociación debe responder 200`);

  // 13.5. Aprobar orden (Fase 4.3.3)
  const regAppRes = await request('POST', `/api/raw-materials/orders/${regOrderId}/approve`, {
    userId: testBuyerId
  }, { 'x-idempotency-key': `idem_reg_app_${Date.now()}` });
  assert(regAppRes.status === 200, `Aprobación debe responder 200`);

  // 13.6. Enviar orden (Fase 4.3.4)
  const regShipRes = await request('POST', `/api/raw-materials/orders/${regOrderId}/ship`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_reg_ship_${Date.now()}` });
  assert(regShipRes.status === 200, `Envío (ship) debe responder 200`);

  // 13.7. Entregar orden (Fase 4.3.5)
  const regDelRes = await request('POST', `/api/raw-materials/orders/${regOrderId}/deliver`, {
    userId: testBuyerId
  }, { 'x-idempotency-key': `idem_reg_del_${Date.now()}` });
  assert(regDelRes.status === 200, `Entrega (deliver) debe responder 200`);

  // 13.8. Facturar orden (Fase 4.3.9)
  const regInvRes = await request('POST', `/api/raw-materials/orders/${regOrderId}/send-invoice`, {
    userId: testSellerId
  }, { 'x-idempotency-key': `idem_reg_inv_${Date.now()}` });
  assert(regInvRes.status === 200, `Emisión de factura debe responder 200`);

  // 13.9. Rechazar orden con un segundo pedido (Fase 4.3.8)
  const regOrd2 = await request('POST', '/api/raw-materials/orders', {
    studentId: testBuyerId,
    announcementId: regAnnId,
    quantity: 2
  }, { 'x-idempotency-key': `idem_reg_ord2_${Date.now()}` });
  assert(regOrd2.status === 200, `Segundo pedido debe crearse con 200`);
  const regOrd2Id = regOrd2.data.order.id;

  const regRejRes = await request('POST', `/api/raw-materials/orders/${regOrd2Id}/reject`, {
    userId: testSellerId,
    rejectionReason: 'Rechazo de prueba regresion final'
  }, { 'x-idempotency-key': `idem_reg_rej_${Date.now()}` });
  assert(regRejRes.status === 200, `Rechazo de orden debe responder 200`);

  console.log('\n===============================================================');
  console.log(`RESULTADO DE LA VALIDACIÓN: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS`);
  console.log(`DEADLOCKS REGISTRADOS (40P01): ${deadlockErrors}`);
  console.log('===============================================================');
  await pool.end();
}

run().catch(async (err) => {
  console.error('\n💥 ERROR FATAL EN LA EJECUCIÓN:', err);
  await pool.end();
  process.exit(1);
});
