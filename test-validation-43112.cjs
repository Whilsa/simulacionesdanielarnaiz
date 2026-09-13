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
  console.log('SUITE DE VALIDACIÓN FASE 4.3.11.2: PUT /api/raw-materials/announcements/:id');
  console.log('===============================================================\n');

  // Setup test student with inventory in PostgreSQL
  const testStudentId = 'test_plain_settle_3';
  const testStudentName = 'Demandante Settlement 3';
  const testBuyerId = 'reg_buyer_1789035312399';
  const testBuyerName = 'Comprador App';

  // Deactivate old active announcements for seller to release warehouse locks
  await queryPg('UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1', [testStudentId]);

  // Ensure inventory exists in PostgreSQL
  await queryPg(
    `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, productos_ensamblados, destornilladores_punta_estrella, destornilladores_punta_plana, desglose_almacenes)
     VALUES ($1, $2, 1000, 500, 500, '{"nave-1": {"destornilladores_estrella": 500, "destornilladores_plana": 500}}'::jsonb)
     ON CONFLICT (alumno_id) DO UPDATE
     SET productos_ensamblados = 1000, destornilladores_punta_estrella = 500, destornilladores_punta_plana = 500,
         desglose_almacenes = '{"nave-1": {"destornilladores_estrella": 500, "destornilladores_plana": 500}}'::jsonb`,
    [testStudentId, testStudentName]
  );

  await queryPg(
    `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, productos_ensamblados, destornilladores_punta_estrella, destornilladores_punta_plana, desglose_almacenes)
     VALUES ($1, $2, 50, 25, 25, '{"nave-1": {"destornilladores_estrella": 25, "destornilladores_plana": 25}}'::jsonb)
     ON CONFLICT (alumno_id) DO UPDATE
     SET productos_ensamblados = 50`,
    [testBuyerId, testBuyerName]
  );

  // -------------------------------------------------------------
  // PRUEBA 1 — Edición normal: Modificar precio y descripción
  // -------------------------------------------------------------
  console.log('--- PRUEBA 1: Edición normal (precio y descripción) ---');
  const ann1Id = `ann_test_p1_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Edición Normal', 15.50, 'Descripción Original', '50', true, $2, $3)`,
    [ann1Id, testStudentId, testStudentName]
  );

  const put1 = await request('PUT', `/api/raw-materials/announcements/${ann1Id}`, {
    pricePerUnit: 12.00,
    description: 'Descripción Modificada Normal'
  }, { 'x-idempotency-key': `idem_put1_${Date.now()}` });

  assert(put1.status === 200, `PUT normal debe responder 200 (obtenido ${put1.status})`);
  const check1 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann1Id]);
  assert(Number(check1.rows[0].price_per_unit) === 12.00, `El precio en PostgreSQL debe ser 12.00 (obtenido ${check1.rows[0].price_per_unit})`);
  assert(check1.rows[0].description === 'Descripción Modificada Normal', `La descripción en PostgreSQL debe coincidir`);
  assert(check1.rows[0].stock === '50', `El stock en PostgreSQL debe permanecer en 50 (obtenido ${check1.rows[0].stock})`);

  // -------------------------------------------------------------
  // PRUEBA 2 — Stock protegido frente a db.json desfasado
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 2: Stock protegido frente a discrepancia con db.json ---');
  const ann2Id = `ann_test_p2_${Date.now()}`;
  // En PostgreSQL el stock real es 40
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Stock Protegido', 20.00, 'Original', '40', true, $2, $3)`,
    [ann2Id, testStudentId, testStudentName]
  );

  // En db.json simulamos que quedó un snapshot antiguo con stock = 100
  const dbData2 = JSON.parse(fs.readFileSync('./db.json', 'utf8'));
  if (!dbData2.rawMaterialAnnouncements) dbData2.rawMaterialAnnouncements = [];
  dbData2.rawMaterialAnnouncements.unshift({
    id: ann2Id,
    materialType: 'producto_final',
    title: 'Destornillador Estrella Stock Protegido',
    pricePerUnit: 20.00,
    description: 'Original',
    stock: 100, // db.json obsoleto!
    active: true,
    sellerId: testStudentId,
    sellerName: testStudentName
  });
  fs.writeFileSync('./db.json', JSON.stringify(dbData2, null, 2));

  // Hacemos PUT cambiando SOLO el precio
  const put2 = await request('PUT', `/api/raw-materials/announcements/${ann2Id}`, {
    pricePerUnit: 25.00
  }, { 'x-idempotency-key': `idem_put2_${Date.now()}` });

  assert(put2.status === 200, `PUT con precio debe responder 200`);
  const check2 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann2Id]);
  assert(Number(check2.rows[0].price_per_unit) === 25.00, `Precio actualizado a 25.00`);
  assert(check2.rows[0].stock === '40', `Stock en PostgreSQL debe seguir siendo 40 y NUNCA resucitar 100 de db.json (obtenido ${check2.rows[0].stock})`);

  // -------------------------------------------------------------
  // PRUEBA 3 — PUT con db.json obsoleto no provoca regresión
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 3: PUT con campo irrelevante no altera stock en PostgreSQL ---');
  const put3 = await request('PUT', `/api/raw-materials/announcements/${ann2Id}`, {
    description: 'Nueva descripción de prueba'
  }, { 'x-idempotency-key': `idem_put3_${Date.now()}` });

  assert(put3.status === 200, `PUT con descripción debe responder 200`);
  const check3 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann2Id]);
  assert(check3.rows[0].stock === '40', `Stock debe conservarse exactamente en 40`);

  // -------------------------------------------------------------
  // PRUEBA 4 — Compra (/orders) + PUT concurrentes
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 4: Compra concurrente + PUT de edición ---');
  // Crear anuncio legítimo del estudiante vendedor con stock 50
  const postAnn4 = await request('POST', '/api/raw-materials/announcements', {
    sellerId: testStudentId,
    sellerName: testStudentName,
    materialType: 'producto_final',
    title: `Destornillador Punta Estrella Concurrente ${Date.now()}`,
    pricePerUnit: 10.00,
    stock: 50
  }, { 'x-idempotency-key': `idem_ann4_create_${Date.now()}` });
  assert(postAnn4.status === 200, `Creación de anuncio 4 debe responder 200`);
  const ann4Id = postAnn4.data.announcement.id;

  // Lanzar simultáneamente:
  // 1. Compra de 20 unidades (profesor-1 compra a alumno -> auto-aprobada, descuenta stock inmediatamente de 50 a 30)
  // 2. PUT editando descripción
  const [orderRes4, putRes4] = await Promise.all([
    request('POST', '/api/raw-materials/orders', {
      studentId: 'profesor-1',
      announcementId: ann4Id,
      quantity: 20
    }, { 'x-idempotency-key': `idem_order4_${Date.now()}` }),
    request('PUT', `/api/raw-materials/announcements/${ann4Id}`, {
      description: 'Descripción Actualizada Concurrente'
    }, { 'x-idempotency-key': `idem_put4_${Date.now()}` })
  ]);

  if (orderRes4.status !== 200) {
    console.error('orderRes4 error details:', orderRes4.status, orderRes4.data);
  }
  assert(orderRes4.status === 200, `Orden debe completarse con éxito 200 (obtenido ${orderRes4.status})`);
  assert(putRes4.status === 200, `PUT concurrente debe responder 200 (obtenido ${putRes4.status})`);

  const check4 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann4Id]);
  assert(check4.rows[0].stock === '30', `El stock final en PostgreSQL debe ser exactamente 30 (50 - 20) (obtenido ${check4.rows[0].stock})`);
  assert(check4.rows[0].description === 'Descripción Actualizada Concurrente', `La descripción debe ser la actualizada por el PUT`);

  // -------------------------------------------------------------
  // PRUEBA 5 — Múltiples PUT concurrentes sobre el mismo anuncio
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 5: Múltiples PUT concurrentes (5 simultáneos) ---');
  const ann5Id = `ann_test_p5_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella MultiPUT', 10.00, 'Original', '50', true, $2, $3)`,
    [ann5Id, testStudentId, testStudentName]
  );

  const putPromises5 = [1, 2, 3, 4, 5].map(i =>
    request('PUT', `/api/raw-materials/announcements/${ann5Id}`, {
      pricePerUnit: 10 + i,
      description: `Edición concurrente ${i}`
    }, { 'x-idempotency-key': `idem_multi_put5_${i}_${Date.now()}` })
  );

  const putResults5 = await Promise.all(putPromises5);
  const allSuccess5 = putResults5.every(r => r.status === 200);
  assert(allSuccess5, `Todos los 5 PUT concurrentes deben responder 200 sin deadlocks ni colisiones`);

  const check5 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann5Id]);
  assert(check5.rows[0].stock === '50', `El stock debe mantenerse estrictamente en 50`);
  assert(Number(check5.rows[0].price_per_unit) >= 11 && Number(check5.rows[0].price_per_unit) <= 15, `El precio final debe corresponder a una de las transacciones válidas`);

  // -------------------------------------------------------------
  // PRUEBA 6 — Idempotencia del PUT con la misma clave
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 6: Idempotencia estricta con x-idempotency-key ---');
  const ann6Id = `ann_test_p6_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Idem', 30.00, 'Desc Idem 1', '30', true, $2, $3)`,
    [ann6Id, testStudentId, testStudentName]
  );

  const idemKey6 = `idem_key_strict_put6_${Date.now()}`;
  const call6_1 = await request('PUT', `/api/raw-materials/announcements/${ann6Id}`, {
    description: 'Edición Idempotente',
    pricePerUnit: 28.00
  }, { 'x-idempotency-key': idemKey6 });

  assert(call6_1.status === 200, `Primera llamada debe responder 200`);

  const call6_2 = await request('PUT', `/api/raw-materials/announcements/${ann6Id}`, {
    description: 'Edición Idempotente',
    pricePerUnit: 28.00
  }, { 'x-idempotency-key': idemKey6 });

  assert(call6_2.status === 200, `Segunda llamada con la misma clave debe responder 200`);
  assert(call6_1.data.announcement.description === call6_2.data.announcement.description, `Ambas llamadas deben devolver el mismo payload cacheado`);

  // -------------------------------------------------------------
  // PRUEBA 7 — Rollback ante fallo
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 7: Rollback atómico ante fallo transaccional ---');
  // Intentar PUT con stock excesivo (violación de validación de almacén)
  const ann7Id = `ann_test_p7_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Rollback', 10.00, 'Desc Inicial', '20', true, $2, $3)`,
    [ann7Id, testStudentId, testStudentName]
  );

  const failPut7 = await request('PUT', `/api/raw-materials/announcements/${ann7Id}`, {
    stock: 999999, // Supera con creces el inventario físico
    description: 'Intento Fallido'
  }, { 'x-idempotency-key': `idem_fail7_${Date.now()}` });

  assert(failPut7.status === 400, `Debe rechazar con 400 por stock insuficiente`);
  const check7 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann7Id]);
  assert(check7.rows[0].stock === '20', `El stock en PostgreSQL debe permanecer inalterado en 20 tras rollback`);
  assert(check7.rows[0].description === 'Desc Inicial', `La descripción no debe haberse modificado tras rollback`);

  // -------------------------------------------------------------
  // PRUEBA 8 — Anuncio inexistente responde 404
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 8: Anuncio inexistente ---');
  const put8 = await request('PUT', `/api/raw-materials/announcements/anuncio-totalmente-inexistente-${Date.now()}`, {
    title: 'Titulo Fantasma'
  }, { 'x-idempotency-key': `idem_404_${Date.now()}` });

  assert(put8.status === 404, `Debe responder 404 limpio para anuncio inexistente (obtenido ${put8.status})`);

  // -------------------------------------------------------------
  // PRUEBA 9 — Usuario no autorizado responde 403
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 9: Usuario no autorizado (403) ---');
  const ann9Id = `ann_test_p9_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Autorizacion', 10.00, 'Original', '10', true, $2, $3)`,
    [ann9Id, testStudentId, testStudentName]
  );

  const put9 = await request('PUT', `/api/raw-materials/announcements/${ann9Id}`, {
    userId: 'otro_estudiante_intruso',
    description: 'Modificacion no permitida'
  }, { 'x-idempotency-key': `idem_unauth_${Date.now()}` });

  assert(put9.status === 403, `Debe responder 403 para usuario no autorizado (obtenido ${put9.status})`);
  const check9 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann9Id]);
  assert(check9.rows[0].description === 'Original', `No se debe haber modificado ningún campo`);

  // -------------------------------------------------------------
  // PRUEBA 10 — PUT no altera campos no enviados
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 10: Preservación de campos no enviados ---');
  const ann10Id = `ann_test_p10_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name, presentation)
     VALUES ($1, 'producto_final', 'Destornillador Preservar', 18.00, 'Original P10', '45', true, $2, $3, 'Caja Especial')`,
    [ann10Id, testStudentId, testStudentName]
  );

  const put10 = await request('PUT', `/api/raw-materials/announcements/${ann10Id}`, {
    pricePerUnit: 19.50
    // No se envía active, ni stock, ni description, ni presentation, ni title
  }, { 'x-idempotency-key': `idem_p10_${Date.now()}` });

  assert(put10.status === 200, `PUT debe responder 200`);
  const check10 = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann10Id]);
  assert(check10.rows[0].stock === '45', `Stock se preserva en 45`);
  assert(check10.rows[0].active === true, `Active se preserva en true`);
  assert(check10.rows[0].description === 'Original P10', `Description se preserva`);
  assert(check10.rows[0].presentation === 'Caja Especial', `Presentation se preserva`);
  assert(Number(check10.rows[0].price_per_unit) === 19.50, `PricePerUnit actualizado`);

  // -------------------------------------------------------------
  // PRUEBA 11 — Validación cuando el PUT sí pretende cambiar stock
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 11: Validación de stock explícito contra inventario físico ---');
  const s11Id = `s11_seller_${Date.now()}`;
  const s11Name = `Vendedor Prueba 11 ${Date.now()}`;
  await queryPg(
    `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
     VALUES ($1, $2, 10000, $3, 'student', 1)`,
    [s11Id, s11Name, s11Id]
  );
  await queryPg(
    `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, productos_ensamblados, destornilladores_punta_estrella, destornilladores_hierro, desglose_almacenes)
     VALUES ($1, $2, 100, 100, 100, '{"nave-1": {"destornilladores_estrella": 100}}'::jsonb)`,
    [s11Id, s11Name]
  );

  const ann11Id = `ann_test_p11_${Date.now()}`;
  await queryPg(
    `INSERT INTO anuncios_materia_prima (id, material_type, title, price_per_unit, description, stock, active, seller_id, seller_name)
     VALUES ($1, 'producto_final', 'Destornillador Estrella Test Stock', 10.00, 'Original', '10', true, $2, $3)`,
    [ann11Id, s11Id, s11Name]
  );

  // Intentar cambiar a 30 (válido porque tiene 100 en almacén y 0 en otros anuncios)
  const put11Valid = await request('PUT', `/api/raw-materials/announcements/${ann11Id}`, {
    stock: 30
  }, { 'x-idempotency-key': `idem_p11_val_${Date.now()}` });
  if (put11Valid.status !== 200) {
    console.error('put11Valid error details:', put11Valid.status, put11Valid.data);
  }
  assert(put11Valid.status === 200, `Cambio de stock válido debe responder 200`);
  const check11Val = await queryPg(`SELECT * FROM anuncios_materia_prima WHERE id = $1`, [ann11Id]);
  assert(check11Val.rows[0].stock === '30', `El stock debe actualizarse a 30`);

  // Intentar cambiar a 500 (inválido porque solo tiene 100 en almacén)
  const put11Invalid = await request('PUT', `/api/raw-materials/announcements/${ann11Id}`, {
    stock: 500
  }, { 'x-idempotency-key': `idem_p11_inval_${Date.now()}` });
  assert(put11Invalid.status === 400, `Cambio de stock excesivo debe ser rechazado con 400`);

  // -------------------------------------------------------------
  // PRUEBA 12 — Regresión del ciclo completo de órdenes
  // -------------------------------------------------------------
  console.log('\n--- PRUEBA 12: Regresión del ciclo completo de vida del pedido ---');
  // Reset inventory for testStudentId for the regression
  await queryPg('UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1', [testStudentId]);
  const naveInv12 = {
    'nave-1': {
      ironKg: 0,
      metalKg: 0,
      plasticKg: 0,
      epoxiKg: 0,
      producedRodsUnits: 100,
      producedStarRodsUnits: 100,
      producedFlatRodsUnits: 0,
      starScrewdriversUnits: 100,
      flatScrewdriversUnits: 0,
      producedScrewdriversUnits: 100
    }
  };
  await queryPg(
    `UPDATE materias_primas_inventario
     SET productos_ensamblados = 200,
         destornilladores_punta_estrella = 100,
         destornilladores_hierro = 100,
         desglose_almacenes = $1::jsonb
     WHERE alumno_id = $2`,
    [JSON.stringify(naveInv12), testStudentId]
  );

  // 12.1. Crear anuncio via POST /api/raw-materials/announcements
  const postAnn = await request('POST', '/api/raw-materials/announcements', {
    sellerId: testStudentId,
    sellerName: testStudentName,
    materialType: 'producto_final',
    title: 'Destornillador Estrella Ciclo Completo',
    pricePerUnit: 14.00,
    stock: 20
  }, { 'x-idempotency-key': `idem_reg_post_${Date.now()}` });
  assert(postAnn.status === 200, `POST announcement debe responder 200`);
  const fullAnnId = postAnn.data.announcement.id;

  // 12.2. Modificar precio via PUT
  const putAnn = await request('PUT', `/api/raw-materials/announcements/${fullAnnId}`, {
    pricePerUnit: 13.50,
    description: 'Precio mejorado en ciclo completo'
  }, { 'x-idempotency-key': `idem_reg_put_${Date.now()}` });
  assert(putAnn.status === 200, `PUT announcement debe responder 200`);

  // 12.3. Crear orden via POST /api/raw-materials/orders
  const orderRes = await request('POST', '/api/raw-materials/orders', {
    studentId: testBuyerId,
    announcementId: fullAnnId,
    quantity: 5
  }, { 'x-idempotency-key': `idem_reg_order_${Date.now()}` });
  assert(orderRes.status === 200, `POST order debe responder 200`);
  const fullOrderId = orderRes.data.order.id;

  // 12.4. Negociar orden
  const negRes = await request('POST', `/api/raw-materials/orders/${fullOrderId}/negotiate`, {
    pricePerUnit: 12.50,
    note: 'Oferta negociada',
    userId: testStudentId
  }, { 'x-idempotency-key': `idem_reg_neg_${Date.now()}` });
  assert(negRes.status === 200, `Negociación debe responder 200`);

  // 12.5. Aprobar orden
  const appRes = await request('POST', `/api/raw-materials/orders/${fullOrderId}/approve`, {
    userId: testStudentId
  }, { 'x-idempotency-key': `idem_reg_app_${Date.now()}` });
  assert(appRes.status === 200, `Aprobación debe responder 200`);

  // 12.6. Enviar orden (ship)
  const shipRes = await request('POST', `/api/raw-materials/orders/${fullOrderId}/ship`, {
    userId: testStudentId
  }, { 'x-idempotency-key': `idem_reg_ship_${Date.now()}` });
  if (shipRes.status !== 200) {
    console.error('shipRes error details:', shipRes.status, shipRes.data);
  }
  assert(shipRes.status === 200, `Envío (ship) debe responder 200`);

  // 12.7. Entregar orden (deliver / confirm-receipt)
  const delRes = await request('POST', `/api/raw-materials/orders/${fullOrderId}/deliver`, {
    userId: testBuyerId
  }, { 'x-idempotency-key': `idem_reg_del_${Date.now()}` });
  if (delRes.status !== 200) {
    console.error('delRes error details:', delRes.status, delRes.data);
  }
  assert(delRes.status === 200, `Entrega (deliver) debe responder 200`);

  // 12.8. Emitir factura (send-invoice)
  const invRes = await request('POST', `/api/raw-materials/orders/${fullOrderId}/send-invoice`, {
    userId: testStudentId
  }, { 'x-idempotency-key': `idem_reg_inv_${Date.now()}` });
  if (invRes.status !== 200) {
    console.error('invRes error details:', invRes.status, invRes.data);
  }
  assert(invRes.status === 200, `Emisión de factura debe responder 200`);

  // 12.9. Rechazar orden (reject con un segundo pedido)
  const order2Res = await request('POST', '/api/raw-materials/orders', {
    studentId: testBuyerId,
    announcementId: fullAnnId,
    quantity: 2
  }, { 'x-idempotency-key': `idem_reg_order2_${Date.now()}` });
  assert(order2Res.status === 200, `Segundo pedido debe crearse con 200`);
  const order2Id = order2Res.data.order.id;

  const rejRes = await request('POST', `/api/raw-materials/orders/${order2Id}/reject`, {
    userId: testStudentId,
    rejectionReason: 'Rechazo de prueba regresion'
  }, { 'x-idempotency-key': `idem_reg_rej_${Date.now()}` });
  assert(rejRes.status === 200, `Rechazo de orden debe responder 200`);

  console.log('\n===============================================================');
  console.log(`RESULTADO DE LA VALIDACIÓN: ${passedTests} / ${totalTests} PRUEBAS SUPERADAS`);
  console.log('===============================================================');
  await pool.end();
  process.exit(0);
}

run().catch(async (err) => {
  console.error('\n💥 ERROR FATAL EN LA EJECUCIÓN:', err);
  await pool.end();
  process.exit(1);
});
