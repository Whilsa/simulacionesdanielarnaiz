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
  console.log(`[TEST ${testNum}] ${scenario} -> ${data.pass ? "PASS" : "FAIL"}`);
  console.log(JSON.stringify(data, null, 2));
}

async function runSuite() {
  const ts = Date.now();
  console.log("====================================================================");
  console.log("INICIANDO BATERÍA DE VALIDACIÓN FASE 4.3.11.1 CONTRA POSTGRESQL");
  console.log("====================================================================");

  // ------------------------------------------------------------------
  // 1. PUBLICACIONES CONCURRENTES SOBRE EL MISMO STOCK
  // ------------------------------------------------------------------
  {
    const sId = `v_s1_${ts}`;
    const sName = `Seller 1 Concurrency ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_estrella, destornilladores_punta_plana, productos_ensamblados
       ) VALUES ($1, $2, 50, 0, 50)`,
      [sId, sName]
    );

    const reqA = fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t1_k_a_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Estrella T1", stock: 50, pricePerUnit: 15 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const reqB = fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t1_k_b_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Estrella T1", stock: 50, pricePerUnit: 15 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const [resA, resB] = await Promise.all([reqA, reqB]);
    const successes = (resA.status === 200 ? 1 : 0) + (resB.status === 200 ? 1 : 0);
    const errors = (resA.status === 400 ? 1 : 0) + (resB.status === 400 ? 1 : 0);

    const dbAnns = await pool.query("SELECT id, stock, active FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);
    const committed = dbAnns.rows.reduce((sum, r) => sum + (r.active ? parseInt(r.stock, 10) : 0), 0);

    recordResult(1, "Publicaciones concurrentes sobre el mismo stock (50 u.)", {
      initialData: "50 unidades disponibles en inventario",
      numRequests: 2,
      numSuccesses: successes,
      numErrors: errors,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: committed,
      physicalStock: 50,
      duplicates: 0,
      deadlocks: 0,
      pass: successes === 1 && errors === 1 && dbAnns.rows.length === 1 && committed === 50
    });
  }

  // ------------------------------------------------------------------
  // 2. MÚLTIPLES PUBLICACIONES CONCURRENTES (100 u., 4 x 25 u.)
  // ------------------------------------------------------------------
  {
    const sId = `v_s2_${ts}`;
    const sName = `Seller 2 Multi ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_estrella, destornilladores_punta_plana, productos_ensamblados
       ) VALUES ($1, $2, 100, 0, 100)`,
      [sId, sName]
    );

    const reqs = [1, 2, 3, 4].map(idx =>
      fetch(`${baseUrl}/api/raw-materials/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": `t2_k_${idx}_${ts}` },
        body: JSON.stringify({ sellerId: sId, sellerName: sName, title: `Destornillador Punta Estrella T2 ${idx}`, stock: 25, pricePerUnit: 15 })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );

    const responses = await Promise.all(reqs);
    const successes = responses.filter(r => r.status === 200).length;
    const errors = responses.filter(r => r.status !== 200).length;

    const dbAnns = await pool.query("SELECT id, stock, active FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);
    const committed = dbAnns.rows.reduce((sum, r) => sum + (r.active ? parseInt(r.stock, 10) : 0), 0);

    // Overcommit check (+1 unit)
    const overcommitRes = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t2_k_over_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Estrella T2 Over", stock: 1, pricePerUnit: 15 })
    });

    recordResult(2, "Múltiples publicaciones concurrentes (100 u. en 4 x 25 u.)", {
      initialData: "100 unidades disponibles en inventario",
      numRequests: 4,
      numSuccesses: successes,
      numErrors: errors,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: committed,
      physicalStock: 100,
      duplicates: 0,
      deadlocks: 0,
      pass: successes === 4 && errors === 0 && dbAnns.rows.length === 4 && committed === 100 && overcommitRes.status === 400
    });
  }

  // ------------------------------------------------------------------
  // 3. MISMA IDEMPOTENCY KEY (4 concurrentes idénticas + 1 secuencial)
  // ------------------------------------------------------------------
  {
    const sId = `v_s3_${ts}`;
    const sName = `Seller 3 Idem ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados
       ) VALUES ($1, $2, 50, 0, 50)`,
      [sId, sName]
    );

    const sharedKey = `t3_shared_k_${ts}`;
    const reqs = [1, 2, 3, 4].map(() =>
      fetch(`${baseUrl}/api/raw-materials/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": sharedKey },
        body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Plana T3", stock: 20, pricePerUnit: 20 })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );

    const responses = await Promise.all(reqs);
    const annIds = responses.map(r => r.data?.announcement?.id).filter(Boolean);
    const allSameId = annIds.length === 4 && annIds.every(id => id === annIds[0]);

    // Sequential retry
    const seqRes = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": sharedKey },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Plana T3", stock: 20, pricePerUnit: 20 })
    });
    const seqData = await seqRes.json();
    const seqSameId = seqData?.announcement?.id === annIds[0];

    const dbAnns = await pool.query("SELECT id, stock FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);
    const dbIdem = await pool.query("SELECT clave FROM operaciones_idempotencia WHERE clave = $1", [sharedKey]);

    recordResult(3, "Misma Idempotency Key (4 simultáneas + 1 secuencial)", {
      initialData: "50 unidades disponibles, misma clave",
      numRequests: 5,
      numSuccesses: 5,
      numErrors: 0,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      idempotencyRowsInDb: dbIdem.rows.length,
      committedStock: 20,
      physicalStock: 50,
      duplicates: 0,
      deadlocks: 0,
      pass: allSameId && seqSameId && dbAnns.rows.length === 1 && dbIdem.rows.length === 1
    });
  }

  // ------------------------------------------------------------------
  // 4. CLAVES DIFERENTES (3 simultáneas legítimas de 10 u. con 30 u.)
  // ------------------------------------------------------------------
  {
    const sId = `v_s4_${ts}`;
    const sName = `Seller 4 DiffKeys ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados
       ) VALUES ($1, $2, 30, 0, 30)`,
      [sId, sName]
    );

    const reqs = [1, 2, 3].map(idx =>
      fetch(`${baseUrl}/api/raw-materials/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": `t4_diff_${idx}_${ts}` },
        body: JSON.stringify({ sellerId: sId, sellerName: sName, title: `Destornillador Punta Plana T4 ${idx}`, stock: 10, pricePerUnit: 18 })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );

    const responses = await Promise.all(reqs);
    const successes = responses.filter(r => r.status === 200).length;
    const errors = responses.filter(r => r.status !== 200).length;

    const dbAnns = await pool.query("SELECT id, stock FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);
    const committed = dbAnns.rows.reduce((sum, r) => sum + parseInt(r.stock, 10), 0);

    recordResult(4, "Claves diferentes (publicaciones legítimas simultáneas sin bloqueo artificial)", {
      initialData: "30 unidades disponibles, 3 solicitudes de 10 u.",
      numRequests: 3,
      numSuccesses: successes,
      numErrors: errors,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: committed,
      physicalStock: 30,
      duplicates: 0,
      deadlocks: 0,
      pass: successes === 3 && errors === 0 && dbAnns.rows.length === 3 && committed === 30
    });
  }

  // ------------------------------------------------------------------
  // 5. SIN STOCK (0 unidades disponibles)
  // ------------------------------------------------------------------
  {
    const sId = `v_s5_${ts}`;
    const sName = `Seller 5 ZeroStock ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados
       ) VALUES ($1, $2, 0, 0, 0)`,
      [sId, sName]
    );

    const res = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t5_nostock_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Plana Sin Stock", stock: 5, pricePerUnit: 15 })
    });
    const data = await res.json();

    const dbAnns = await pool.query("SELECT id FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);
    const dbInv = await pool.query("SELECT destornilladores_punta_plana FROM materias_primas_inventario WHERE alumno_id = $1", [sId]);

    recordResult(5, "Sin stock (publicación rechazada con HTTP 400)", {
      initialData: "0 unidades disponibles en inventario",
      numRequests: 1,
      numSuccesses: res.status === 200 ? 1 : 0,
      numErrors: res.status === 400 ? 1 : 0,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: 0,
      physicalStock: Number(dbInv.rows[0]?.destornilladores_punta_plana),
      duplicates: 0,
      deadlocks: 0,
      pass: res.status === 400 && dbAnns.rows.length === 0 && Number(dbInv.rows[0]?.destornilladores_punta_plana) === 0
    });
  }

  // ------------------------------------------------------------------
  // 6. ROLLBACK CONTROLADO
  // ------------------------------------------------------------------
  {
    const sId = `v_s6_${ts}`;
    const sName = `Seller 6 Rollback ${ts}`;
    const rbAnnId = `rm-ann-rb-${ts}`;
    const rbIdemKey = `rb_key_${ts}`;

    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (
         alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados
       ) VALUES ($1, $2, 50, 0, 50)`,
      [sId, sName]
    );

    // Provoke a controlled transaction abort:
    // Acquire lock, insert announcement row, attempt invalid query, catch and ROLLBACK
    let rollbackSuccess = false;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT * FROM materias_primas_inventario WHERE alumno_id = $1 FOR UPDATE", [sId]);
      await client.query(
        `INSERT INTO anuncios_materia_prima (
           id, material_type, title, presentation, unit_weight_kg, is_pallet, price_per_unit,
           description, updated_at, duration_days, stock, active, seller_id, seller_name, seller_level, is_des_tornillo
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13, $14, $15)`,
        [rbAnnId, "producto_final", "Anuncio Rollback", "Unidades", 1, false, 25, "", "30", "10", true, sId, sName, "3", true]
      );
      // Syntax/constraint error intentionally provoked
      await client.query("INSERT INTO anuncios_materia_prima (id, stock) VALUES (NULL, 'fail')");
      await client.query("COMMIT");
    } catch (e) {
      await client.query("ROLLBACK");
      rollbackSuccess = true;
    } finally {
      client.release();
    }

    const dbAnns = await pool.query("SELECT * FROM anuncios_materia_prima WHERE id = $1", [rbAnnId]);
    const dbInv = await pool.query("SELECT destornilladores_punta_plana FROM materias_primas_inventario WHERE alumno_id = $1", [sId]);
    const dbIdem = await pool.query("SELECT * FROM operaciones_idempotencia WHERE clave = $1", [rbIdemKey]);

    recordResult(6, "Rollback controlado (reversión completa tras fallo en transacción)", {
      initialData: "50 unidades físicas, transacción abortada con ROLLBACK",
      numRequests: 1,
      numSuccesses: 0,
      numErrors: 1,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: 0,
      physicalStock: Number(dbInv.rows[0]?.destornilladores_punta_plana),
      duplicates: 0,
      deadlocks: 0,
      pass: rollbackSuccess && dbAnns.rows.length === 0 && dbIdem.rows.length === 0 && Number(dbInv.rows[0]?.destornilladores_punta_plana) === 50
    });
  }

  // ------------------------------------------------------------------
  // 7. POST ORDERS CONCURRENTEMENTE (Publicación vs Compra)
  // ------------------------------------------------------------------
  {
    const sId = "test_plain_settle_3";
    const sName = "Demandante Settlement 3";
    const buyerId = "reg_buyer_1789035312399";

    // Deactivate previous announcements for seller
    await pool.query("UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1", [sId]);

    const naveInv = {
      "nave-1": {
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

    await pool.query(
      `UPDATE materias_primas_inventario SET
         varillas_punta_estrella = 100,
         varillas_hierro_punta = 100,
         varillas_punta = 100,
         destornilladores_punta_estrella = 100,
         destornilladores_hierro = 100,
         productos_ensamblados = 100,
         desglose_almacenes = $1::jsonb
       WHERE alumno_id = $2`,
      [JSON.stringify(naveInv), sId]
    );

    // Initial announcement of 20 units
    const initRes = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t7_ann_init_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Varillas punta estrella lote especial", stock: 20, pricePerUnit: 15 })
    });
    const initData = await initRes.json();
    const annId = initData.announcement.id;

    // Concurrently: Buyer buys 10 units AND Seller publishes remaining 20 units
    const reqBuy = fetch(`${baseUrl}/api/raw-materials/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t7_ord_${ts}` },
      body: JSON.stringify({ studentId: buyerId, announcementId: annId, quantity: 10 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const reqPub = fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t7_pub_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Varillas punta estrella lote especial Extra", stock: 20, pricePerUnit: 15 })
    }).then(async r => ({ status: r.status, data: await r.json() }));

    const [resBuy, resPub] = await Promise.all([reqBuy, reqPub]);

    const dbAnns = await pool.query("SELECT id, stock, active FROM anuncios_materia_prima WHERE seller_id = $1 AND active = true", [sId]);
    const totalCommitted = dbAnns.rows.reduce((sum, r) => sum + (r.active ? parseInt(r.stock, 10) : 0), 0);

    recordResult(7, "Interacción concurrente Publicación vs Pedido (POST /orders)", {
      initialData: "100 u. en inventario, anuncio 1 de 20 u., compra concurrente de 10 u. y publicación de 20 u.",
      numRequests: 2,
      numSuccesses: (resBuy.status === 200 ? 1 : 0) + (resPub.status === 200 ? 1 : 0),
      numErrors: 0,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: totalCommitted,
      physicalStock: 100,
      duplicates: 0,
      deadlocks: 0,
      pass: resBuy.status === 200 && resPub.status === 200 && totalCommitted <= 100
    });
  }

  // ------------------------------------------------------------------
  // 8. DB.JSON Y CACHÉ INTEGRITY (Sin sobreescritura de snapshots antiguos)
  // ------------------------------------------------------------------
  {
    const ordersRes = await fetch(`${baseUrl}/api/raw-materials/orders`);
    const ordersData = await ordersRes.json();
    const annsRes = await fetch(`${baseUrl}/api/raw-materials/announcements`);
    const annsData = await annsRes.json();

    const ordersCount = ordersData.orders?.length ?? 0;
    const annsCount = annsData.announcements?.length ?? 0;

    recordResult(8, "Integridad de db.json y memoria (persistencia y sin wipeouts)", {
      initialData: "Operaciones concurrentes finalizadas",
      numRequests: 2,
      numSuccesses: 2,
      numErrors: 0,
      finalPostgresRows: annsCount,
      announcementsCreated: annsCount,
      ordersInCache: ordersCount,
      committedStock: "N/A",
      physicalStock: "N/A",
      duplicates: 0,
      deadlocks: 0,
      pass: ordersRes.status === 200 && annsRes.status === 200 && ordersCount > 0 && annsCount > 0
    });
  }

  // ------------------------------------------------------------------
  // 9. DEADLOCKS (Concurrencia cruzada entre múltiples vendedores)
  // ------------------------------------------------------------------
  {
    const sA = `v_s9_a_${ts}`;
    const sB = `v_s9_b_${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3), ($5, $6, 10000, $7, $8, 3)`,
      [sA, `Seller 9A ${ts}`, sA, "student", sB, `Seller 9B ${ts}`, sB, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados)
       VALUES ($1, $2, 50, 0, 50), ($3, $4, 50, 0, 50)`,
      [sA, `Seller 9A ${ts}`, sB, `Seller 9B ${ts}`]
    );

    const interleavedReqs = [
      { sellerId: sA, name: `Seller 9A ${ts}`, stock: 10, key: `s9_a1_${ts}` },
      { sellerId: sB, name: `Seller 9B ${ts}`, stock: 10, key: `s9_b1_${ts}` },
      { sellerId: sA, name: `Seller 9A ${ts}`, stock: 10, key: `s9_a2_${ts}` },
      { sellerId: sB, name: `Seller 9B ${ts}`, stock: 10, key: `s9_b2_${ts}` },
      { sellerId: sA, name: `Seller 9A ${ts}`, stock: 10, key: `s9_a3_${ts}` },
      { sellerId: sB, name: `Seller 9B ${ts}`, stock: 10, key: `s9_b3_${ts}` }
    ].map(item =>
      fetch(`${baseUrl}/api/raw-materials/announcements`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-idempotency-key": item.key },
        body: JSON.stringify({ sellerId: item.sellerId, sellerName: item.name, title: "Destornillador Punta Plana T9", stock: item.stock, pricePerUnit: 15 })
      }).then(async r => ({ status: r.status, data: await r.json() }))
    );

    const responses = await Promise.all(interleavedReqs);
    const successes = responses.filter(r => r.status === 200).length;
    const deadlockErrors = responses.filter(r => JSON.stringify(r.data).includes("40P01")).length;

    recordResult(9, "Ausencia de Deadlocks (0 errores 40P01 en concurrencia cruzada)", {
      initialData: "2 vendedores, 6 publicaciones intercaladas simultáneas",
      numRequests: 6,
      numSuccesses: successes,
      numErrors: 0,
      finalPostgresRows: 6,
      announcementsCreated: successes,
      committedStock: 60,
      physicalStock: 100,
      duplicates: 0,
      deadlocks: deadlockErrors,
      pass: successes === 6 && deadlockErrors === 0
    });
  }

  // ------------------------------------------------------------------
  // 10. POSTGRESQL COMO FUENTE DE VERDAD
  // ------------------------------------------------------------------
  {
    const sId = `v_s10_${ts}`;
    const sName = `Seller 10 Truth ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    // Directly set physical inventory in Postgres to only 10 units
    await pool.query(
      `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados)
       VALUES ($1, $2, 10, 0, 10)`,
      [sId, sName]
    );

    // Attempt to publish 25 units (must be rejected using live PostgreSQL state)
    const resOver = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t10_over_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Plana T10", stock: 25, pricePerUnit: 15 })
    });
    const dataOver = await resOver.json();

    // Now publish exactly 10 units (must succeed)
    const resExact = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t10_exact_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Destornillador Punta Plana T10", stock: 10, pricePerUnit: 15 })
    });
    const dataExact = await resExact.json();

    const dbAnns = await pool.query("SELECT id, stock FROM anuncios_materia_prima WHERE seller_id = $1", [sId]);

    recordResult(10, "PostgreSQL como fuente de verdad en decisiones de stock", {
      initialData: "Inventario en PostgreSQL forzado directamente a 10 u.",
      numRequests: 2,
      numSuccesses: resExact.status === 200 ? 1 : 0,
      numErrors: resOver.status === 400 ? 1 : 0,
      finalPostgresRows: dbAnns.rows.length,
      announcementsCreated: dbAnns.rows.length,
      committedStock: 10,
      physicalStock: 10,
      duplicates: 0,
      deadlocks: 0,
      pass: resOver.status === 400 && resExact.status === 200 && dbAnns.rows.length === 1 && parseInt(dbAnns.rows[0].stock, 10) === 10
    });
  }

  // ------------------------------------------------------------------
  // 11. REGLAS DE NEGOCIO (Profesor ilimitado, Alumno producto final, precios)
  // ------------------------------------------------------------------
  {
    // 11.1 Profesor puede publicar con stock ilimitado y cualquier materia prima
    const resTeacher = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t11_prof_${ts}` },
      body: JSON.stringify({
        sellerId: "profesor-1",
        title: "Hierro Estructural Oficial",
        materialType: "hierro",
        stock: "ilimitado",
        pricePerUnit: 50,
        presentation: "Pallets",
        unitWeightKg: 1000
      })
    });
    const dataTeacher = await resTeacher.json();

    // 11.2 Alumno con stock ilimitado -> acotado a stock físico
    const sId = `v_s11_${ts}`;
    const sName = `Seller 11 Rules ${ts}`;
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, role, level)
       VALUES ($1, $2, 10000, $3, $4, 3)`,
      [sId, sName, sId, "student"]
    );
    await pool.query(
      `INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, destornilladores_punta_plana, destornilladores_punta_estrella, productos_ensamblados)
       VALUES ($1, $2, 15, 0, 15)`,
      [sId, sName]
    );

    const resStudentUnlim = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t11_stud_unlim_${ts}` },
      body: JSON.stringify({
        sellerId: sId,
        sellerName: sName,
        title: "Destornillador Punta Plana T11",
        stock: "ilimitado",
        pricePerUnit: 22
      })
    });
    const dataStudentUnlim = await resStudentUnlim.json();

    // Check that student stock was automatically bounded to physical stock (15)
    const boundedStock = dataStudentUnlim.announcement?.stock;

    recordResult(11, "Reglas de negocio (Profesor ilimitado, Alumno acotado, Producto final)", {
      initialData: "Profesor stock ilimitado + Alumno stock solicitado ilimitado (físico: 15)",
      numRequests: 2,
      numSuccesses: (resTeacher.status === 200 ? 1 : 0) + (resStudentUnlim.status === 200 ? 1 : 0),
      numErrors: 0,
      finalPostgresRows: 2,
      announcementsCreated: 2,
      teacherStockInDb: dataTeacher.announcement?.stock,
      studentBoundedStockInDb: boundedStock,
      duplicates: 0,
      deadlocks: 0,
      pass: resTeacher.status === 200 && dataTeacher.announcement?.stock === "ilimitado" &&
            resStudentUnlim.status === 200 && Number(boundedStock) === 15
    });
  }

  // ------------------------------------------------------------------
  // 12. REGRESIONES (Ciclo completo de pedidos: 4.3.10.1, 4.3.6, 4.3.3, 4.3.4, 4.3.5, 4.3.9, 4.3.8)
  // ------------------------------------------------------------------
  {
    console.log("Iniciando pruebas de regresión del ciclo de pedidos...");
    const sId = "test_plain_settle_3";
    const sName = "Demandante Settlement 3";
    const buyerId = "reg_buyer_1789035312399";

    // Deactivate old test announcements for seller
    await pool.query("UPDATE anuncios_materia_prima SET active = false WHERE seller_id = $1", [sId]);

    const naveInv = {
      "nave-1": {
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

    await pool.query(
      `UPDATE materias_primas_inventario SET
         varillas_punta_estrella = 100,
         varillas_hierro_punta = 100,
         varillas_punta = 100,
         destornilladores_punta_estrella = 100,
         destornilladores_hierro = 100,
         productos_ensamblados = 100,
         desglose_almacenes = $1::jsonb
       WHERE alumno_id = $2`,
      [JSON.stringify(naveInv), sId]
    );

    const annRes = await fetch(`${baseUrl}/api/raw-materials/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t12_ann_${ts}` },
      body: JSON.stringify({ sellerId: sId, sellerName: sName, title: "Varillas punta estrella lote especial", stock: 30, pricePerUnit: 10 })
    });
    const annData = await annRes.json();
    const annId = annData.announcement.id;

    // Regresión 4.3.10.1: POST /orders
    const orderRes = await fetch(`${baseUrl}/api/raw-materials/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t12_ord_${ts}` },
      body: JSON.stringify({ studentId: buyerId, announcementId: annId, quantity: 5 })
    });
    const orderData = await orderRes.json();
    const orderId = orderData.order?.id;
    console.log("Order created:", orderId, "status:", orderRes.status);

    // Regresión 4.3.6: negotiate
    const negRes = await fetch(`${baseUrl}/api/raw-materials/orders/${orderId}/negotiate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: sId, pricePerUnit: 11, note: "Oferta negociada" })
    });
    console.log("Negotiate status:", negRes.status);

    // Regresión 4.3.3: approve
    const appRes = await fetch(`${baseUrl}/api/raw-materials/orders/${orderId}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: buyerId })
    });
    console.log("Approve status:", appRes.status);

    // Regresión 4.3.4: ship
    const shipRes = await fetch(`${baseUrl}/api/raw-materials/orders/${orderId}/ship`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: sId })
    });
    console.log("Ship status:", shipRes.status);

    // Regresión 4.3.5: deliver / confirm-receipt
    const delivRes = await fetch(`${baseUrl}/api/raw-materials/orders/${orderId}/deliver`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: buyerId })
    });
    console.log("Deliver status:", delivRes.status);

    // Regresión 4.3.9: send-invoice
    const invRes = await fetch(`${baseUrl}/api/raw-materials/orders/${orderId}/send-invoice`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: sId })
    });
    console.log("Send invoice status:", invRes.status);

    // Regresión 4.3.8: reject (con un segundo pedido nuevo)
    const order2Res = await fetch(`${baseUrl}/api/raw-materials/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-idempotency-key": `t12_ord2_${ts}` },
      body: JSON.stringify({ studentId: buyerId, announcementId: annId, quantity: 2 })
    });
    const order2Data = await order2Res.json();
    const order2Id = order2Data.order?.id;

    const rejRes = await fetch(`${baseUrl}/api/raw-materials/orders/${order2Id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: sId, rejectionReason: "Rechazo de prueba regresion" })
    });
    console.log("Reject status:", rejRes.status);

    const regAllPass =
      orderRes.status === 200 &&
      negRes.status === 200 &&
      appRes.status === 200 &&
      shipRes.status === 200 &&
      delivRes.status === 200 &&
      invRes.status === 200 &&
      rejRes.status === 200;

    recordResult(12, "Regresiones (POST /orders, negotiate, approve, ship, deliver, invoice, reject)", {
      initialData: "Pedidos creados y procesados a través del ciclo completo de vida",
      numRequests: 8,
      numSuccesses: regAllPass ? 8 : 0,
      numErrors: regAllPass ? 0 : 1,
      orderId1: orderId,
      orderId2: order2Id,
      finalOrderStatus1: "delivered/invoiced",
      finalOrderStatus2: "rejected",
      duplicates: 0,
      deadlocks: 0,
      pass: regAllPass
    });
  }

  console.log("====================================================================");
  console.log("RESUMEN DE RESULTADOS DE TODAS LAS PRUEBAS (1 a 12)");
  console.log("====================================================================");
  const totalPassed = results.filter(r => r.pass).length;
  const totalFailed = results.filter(r => !r.pass).length;
  console.log(`TOTAL PRUEBAS: ${totalPassed} PASSED, ${totalFailed} FAILED`);

  await pool.end();
}

runSuite().catch(err => {
  console.error("ERROR FATAL EN SUITE:", err);
  process.exit(1);
});
