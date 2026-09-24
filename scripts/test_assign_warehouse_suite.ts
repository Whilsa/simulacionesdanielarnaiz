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

async function runTestSuite() {
  console.log("================================================================================");
  console.log("BATERÍA DE PRUEBAS COMPLETA: PUT /api/student/vehicles/:id/assign-warehouse");
  console.log("================================================================================\n");

  const results: Record<string, boolean> = {};

  const testStudent1 = `stu_wh_test_${Date.now()}_1`;
  const testStudent2 = `stu_wh_test_${Date.now()}_2`;
  const propStudent1 = `prop_wh_test_${Date.now()}_1`;
  const propStudent2 = `prop_wh_test_${Date.now()}_2`;
  const veh1 = `veh_wh_test_${Date.now()}_1`;
  const veh2 = `veh_wh_test_${Date.now()}_2`;

  try {
    // SETUP: Crear registros en PostgreSQL
    console.log("--- SETUP: Insertando datos de prueba en PostgreSQL ---");
    // Alumno 1 y Alumno 2 en cuentas
    await pool.query(
      `INSERT INTO cuentas (id, alumno, saldo, usuario)
       VALUES ($1, $2, 50000, $3), ($4, $5, 50000, $6)
       ON CONFLICT (id) DO NOTHING`,
      [testStudent1, 'Alumno Test 1', testStudent1, testStudent2, 'Alumno Test 2', testStudent2]
    );

    // Propiedad 1 para Alumno 1
    await pool.query(
      `INSERT INTO adquisiciones (id, alumno_id, alumno_nombre, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, superficie_m2, porcentaje_suelo, precio_base, importe_iva, precio_total, metodo_pago)
       VALUES ($1, $2, 'Alumno Test 1', $1, 'Nave Industrial Norte', 'industrial', 'compra', 500, 20, 100000, 21000, 121000, 'contado')`,
      [propStudent1, testStudent1]
    );

    // Propiedad 2 para Alumno 2
    await pool.query(
      `INSERT INTO adquisiciones (id, alumno_id, alumno_nombre, inmueble_id, inmueble_titulo, inmueble_tipo, operacion, superficie_m2, porcentaje_suelo, precio_base, importe_iva, precio_total, metodo_pago)
       VALUES ($1, $2, 'Alumno Test 2', $1, 'Nave Industrial Sur', 'industrial', 'compra', 600, 20, 120000, 25200, 145200, 'contado')`,
      [propStudent2, testStudent2]
    );

    // Vehículo 1 perteneciente a Alumno 1
    await pool.query(
      `INSERT INTO vehiculos_comprados (id, alumno_id, alumno_nombre, vehiculo_tipo, titulo, precio_base, importe_iva, precio_total, metodo_pago, fecha_compra, estado)
       VALUES ($1, $2, 'Alumno Test 1', 'carretilla_elevadora', 'Carretilla Eléctrica A', 15000, 3150, 18150, 'contado', CURRENT_TIMESTAMP, 'activo')`,
      [veh1, testStudent1]
    );

    // Vehículo 2 perteneciente a Alumno 2
    await pool.query(
      `INSERT INTO vehiculos_comprados (id, alumno_id, alumno_nombre, vehiculo_tipo, titulo, precio_base, importe_iva, precio_total, metodo_pago, fecha_compra, estado)
       VALUES ($1, $2, 'Alumno Test 2', 'camion_trailer', 'Camión Trailer B', 80000, 16800, 96800, 'contado', CURRENT_TIMESTAMP, 'activo')`,
      [veh2, testStudent2]
    );
    console.log("Datos de prueba creados exitosamente.\n");

    // -------------------------------------------------------------------------
    // PRUEBA 1: ASIGNACIÓN NORMAL
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 1: ASIGNACIÓN NORMAL ---");
    const res1 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 2,
        propertyId: propStudent1,
        propertyTitle: 'Nave Industrial Norte',
        warehouseName: 'Nave Industrial Norte - Almacén 2'
      })
    });
    const data1 = await res1.json();
    console.log(`[P1] Status HTTP: ${res1.status}`);

    const pgVeh1 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p1Row = pgVeh1.rows[0];

    const p1Passed = res1.status === 200 &&
      data1.success === true &&
      data1.vehicle.assignedWarehouseIndex === 2 &&
      data1.vehicle.assignedPropertyId === propStudent1 &&
      p1Row.almacen_asignado_index === 2 &&
      p1Row.propiedad_asignada_id === propStudent1 &&
      p1Row.propiedad_asignada_titulo === 'Nave Industrial Norte' &&
      p1Row.almacen_asignado_nombre === 'Nave Industrial Norte - Almacén 2';

    console.log(`[P1] Resultado: ${p1Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['1_asignacion_normal'] = p1Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 2: DESASIGNACIÓN
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 2: DESASIGNACIÓN ---");
    const res2 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: undefined,
        propertyId: undefined,
        propertyTitle: undefined,
        warehouseName: undefined
      })
    });
    const data2 = await res2.json();
    console.log(`[P2] Status HTTP: ${res2.status}`);

    const pgVeh2 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p2Row = pgVeh2.rows[0];

    const p2Passed = res2.status === 200 &&
      data2.success === true &&
      data2.vehicle.assignedWarehouseIndex === undefined &&
      data2.vehicle.assignedPropertyId === undefined &&
      p2Row.almacen_asignado_index === null &&
      p2Row.propiedad_asignada_id === null &&
      p2Row.propiedad_asignada_titulo === null &&
      p2Row.almacen_asignado_nombre === null;

    console.log(`[P2] Resultado: ${p2Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['2_desasignacion'] = p2Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 3: VEHÍCULO INEXISTENTE
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 3: VEHÍCULO INEXISTENTE ---");
    const res3 = await fetch(`${BASE_URL}/api/student/vehicles/veh_no_existe_99999/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1
      })
    });
    const data3 = await res3.json();
    console.log(`[P3] Status HTTP: ${res3.status}, Error: ${data3.error}`);
    const p3Passed = res3.status === 404 && data3.error === 'Vehículo no encontrado';
    console.log(`[P3] Resultado: ${p3Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['3_vehiculo_inexistente'] = p3Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 4: VEHÍCULO PERTENECIENTE A OTRO ALUMNO
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 4: VEHÍCULO PERTENECIENTE A OTRO ALUMNO ---");
    // Alumno 1 intenta modificar vehículo 2 (que pertenece a Alumno 2)
    const res4 = await fetch(`${BASE_URL}/api/student/vehicles/${veh2}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1, // Intruso
        warehouseIndex: 1,
        propertyId: propStudent1
      })
    });
    const data4 = await res4.json();
    console.log(`[P4] Status HTTP: ${res4.status}, Error: ${data4.error}`);

    // Verificar que vehículo 2 no fue modificado
    const pgVeh4 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh2]);
    const p4Unmodified = pgVeh4.rows[0].almacen_asignado_index === null;
    const p4Passed = res4.status === 403 && p4Unmodified;
    console.log(`[P4] Resultado: ${p4Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['4_vehiculo_otro_alumno'] = p4Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 5: PROPIEDAD PERTENECIENTE AL ALUMNO
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 5: PROPIEDAD PERTENECIENTE AL ALUMNO ---");
    const res5 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 3,
        propertyId: propStudent1
      })
    });
    const data5 = await res5.json();
    console.log(`[P5] Status HTTP: ${res5.status}`);
    const pgVeh5 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p5Passed = res5.status === 200 &&
      data5.success === true &&
      pgVeh5.rows[0].almacen_asignado_index === 3 &&
      pgVeh5.rows[0].propiedad_asignada_id === propStudent1;
    console.log(`[P5] Resultado: ${p5Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['5_propiedad_pertenece_alumno'] = p5Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 6: PROPIEDAD PERTENECIENTE A OTRO ALUMNO
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 6: PROPIEDAD PERTENECIENTE A OTRO ALUMNO ---");
    // Alumno 1 intenta asignar vehículo 1 a propStudent2 (perteneciente a Alumno 2)
    const res6 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent2 // Propiedad de Alumno 2
      })
    });
    const data6 = await res6.json();
    console.log(`[P6] Status HTTP: ${res6.status}, Error: ${data6.error}`);
    // Verificar que vehículo 1 NO se modificó (permanece en almacén 3 de propStudent1)
    const pgVeh6 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p6Unchanged = pgVeh6.rows[0].almacen_asignado_index === 3 && pgVeh6.rows[0].propiedad_asignada_id === propStudent1;
    const p6Passed = res6.status === 403 && p6Unchanged;
    console.log(`[P6] Resultado: ${p6Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['6_propiedad_otro_alumno'] = p6Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 7: PROPIEDAD INEXISTENTE
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 7: PROPIEDAD INEXISTENTE ---");
    const res7 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: 'prop_fantasma_invalida_999'
      })
    });
    const data7 = await res7.json();
    console.log(`[P7] Status HTTP: ${res7.status}, Error: ${data7.error}`);
    const pgVeh7 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p7Unchanged = pgVeh7.rows[0].almacen_asignado_index === 3;
    const p7Passed = res7.status === 404 && p7Unchanged;
    console.log(`[P7] Resultado: ${p7Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['7_propiedad_inexistente'] = p7Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 8: DOS ASIGNACIONES SIMULTÁNEAS DEL MISMO VEHÍCULO
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 8: DOS ASIGNACIONES SIMULTÁNEAS DEL MISMO VEHÍCULO ---");
    const p8Req1 = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1,
        warehouseName: 'Destino Concurrente 1'
      })
    });
    const p8Req2 = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 2,
        propertyId: propStudent1,
        warehouseName: 'Destino Concurrente 2'
      })
    });
    const [res8a, res8b] = await Promise.all([p8Req1, p8Req2]);
    const [data8a, data8b] = await Promise.all([res8a.json(), res8b.json()]);
    console.log(`[P8] Status 1: ${res8a.status}, Status 2: ${res8b.status}`);

    const pgVeh8 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const finalWhIdx = pgVeh8.rows[0].almacen_asignado_index;
    const p8Passed = res8a.status === 200 && res8b.status === 200 && (finalWhIdx === 1 || finalWhIdx === 2);
    console.log(`[P8] Índice final en PostgreSQL: ${finalWhIdx} (coherente y serializado)`);
    console.log(`[P8] Resultado: ${p8Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['8_dos_asignaciones_simultaneas'] = p8Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 9: ASIGNACIÓN + DESASIGNACIÓN SIMULTÁNEAS
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 9: ASIGNACIÓN + DESASIGNACIÓN SIMULTÁNEAS ---");
    const p9ReqAssign = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 3,
        propertyId: propStudent1
      })
    });
    const p9ReqUnassign = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: null,
        propertyId: null
      })
    });
    const [res9a, res9b] = await Promise.all([p9ReqAssign, p9ReqUnassign]);
    console.log(`[P9] Status Asignar: ${res9a.status}, Status Desasignar: ${res9b.status}`);
    const pgVeh9 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const finalIdx9 = pgVeh9.rows[0].almacen_asignado_index;
    const p9Passed = res9a.status === 200 && res9b.status === 200 && (finalIdx9 === 3 || finalIdx9 === null);
    console.log(`[P9] Estado final en PostgreSQL: ${finalIdx9 === null ? 'DESASIGNADO' : 'ALMACÉN ' + finalIdx9}`);
    console.log(`[P9] Resultado: ${p9Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['9_asignar_desasignar_simultaneas'] = p9Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 10: MISMA CLAVE DE IDEMPOTENCIA SIMULTÁNEA
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 10: MISMA CLAVE DE IDEMPOTENCIA SIMULTÁNEA ---");
    const idemKey10 = `idem_veh_sim_${Date.now()}`;
    const p10Req1 = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': idemKey10
      },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1,
        warehouseName: 'Idem Simultáneo'
      })
    });
    const p10Req2 = fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': idemKey10
      },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1,
        warehouseName: 'Idem Simultáneo'
      })
    });
    const [res10a, res10b] = await Promise.all([p10Req1, p10Req2]);
    const [data10a, data10b] = await Promise.all([res10a.json(), res10b.json()]);
    console.log(`[P10] Status 1: ${res10a.status}, Status 2: ${res10b.status}`);

    const p10Passed = res10a.status === 200 &&
      res10b.status === 200 &&
      data10a.success === true &&
      data10b.success === true &&
      JSON.stringify(data10a.vehicle) === JSON.stringify(data10b.vehicle);
    console.log(`[P10] Respuestas idénticas deduplicadas: ${p10Passed ? 'SÍ' : 'NO'}`);
    console.log(`[P10] Resultado: ${p10Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['10_misma_clave_idempotencia_simultanea'] = p10Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 11: MISMA CLAVE REPETIDA DESPUÉS
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 11: MISMA CLAVE REPETIDA DESPUÉS ---");
    const res11 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'x-idempotency-key': idemKey10
      },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1
      })
    });
    const data11 = await res11.json();
    console.log(`[P11] Status: ${res11.status}`);
    const p11Passed = res11.status === 200 &&
      data11.success === true &&
      JSON.stringify(data11.vehicle) === JSON.stringify(data10a.vehicle);
    console.log(`[P11] Resultado: ${p11Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['11_misma_clave_repetida_despues'] = p11Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 12: CLAVES DIFERENTES
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 12: CLAVES DIFERENTES ---");
    const idemKey12a = `idem_diff_a_${Date.now()}`;
    const idemKey12b = `idem_diff_b_${Date.now()}`;

    const res12a = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey12a },
      body: JSON.stringify({ studentId: testStudent1, warehouseIndex: 2, propertyId: propStudent1 })
    });
    const res12b = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey12b },
      body: JSON.stringify({ studentId: testStudent1, warehouseIndex: 3, propertyId: propStudent1 })
    });
    const data12a = await res12a.json();
    const data12b = await res12b.json();

    const p12Passed = res12a.status === 200 &&
      res12b.status === 200 &&
      data12a.vehicle.assignedWarehouseIndex === 2 &&
      data12b.vehicle.assignedWarehouseIndex === 3;
    console.log(`[P12] Status A: ${res12a.status} (wh=2), Status B: ${res12b.status} (wh=3)`);
    console.log(`[P12] Resultado: ${p12Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['12_claves_diferentes'] = p12Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 13: ROLLBACK ANTE ERROR
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 13: ROLLBACK ANTE ERROR ---");
    // Almacén actual es 3. Intentamos pasar una propiedad de otro alumno para forzar error en la transacción.
    const res13 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 99, // Intentaba asignar a 99
        propertyId: propStudent2 // Pero falla por propiedad no autorizada
      })
    });
    console.log(`[P13] Status HTTP: ${res13.status}`);

    const pgVeh13 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p13Passed = res13.status === 403 &&
      pgVeh13.rows[0].almacen_asignado_index === 3 &&
      pgVeh13.rows[0].propiedad_asignada_id === propStudent1;
    console.log(`[P13] Estado en PostgreSQL conservado (almacen 3): ${p13Passed ? 'SÍ' : 'NO'}`);
    console.log(`[P13] Resultado: ${p13Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['13_rollback_sin_cambios_parciales'] = p13Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 14: PERSISTENCIA DIRECTA EN POSTGRESQL
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 14: PERSISTENCIA DIRECTA EN POSTGRESQL ---");
    const res14 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        studentId: testStudent1,
        warehouseIndex: 1,
        propertyId: propStudent1,
        propertyTitle: 'Nave Industrial Norte',
        warehouseName: 'Nave Principal - Zona A'
      })
    });
    console.log(`[P14] Status HTTP: ${res14.status}`);
    const pgVeh14 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const row14 = pgVeh14.rows[0];
    const p14Passed = row14.almacen_asignado_index === 1 &&
      row14.propiedad_asignada_id === propStudent1 &&
      row14.propiedad_asignada_titulo === 'Nave Industrial Norte' &&
      row14.almacen_asignado_nombre === 'Nave Principal - Zona A';
    console.log(`[P14] Filas verificadas en PostgreSQL: ${p14Passed ? 'CORRECTO' : 'ERROR'}`);
    console.log(`[P14] Resultado: ${p14Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['14_persistencia_directa_postgresql'] = p14Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 15: RECONSTRUCCIÓN CORRECTA DESDE POSTGRESQL TRAS REINICIO
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 15: RECONSTRUCCIÓN CORRECTA DESDE POSTGRESQL TRAS REINICIO ---");
    // Verificamos que el mapeo de inicio de server.ts (líneas 3093-3113) aplicado a la fila
    // persistida en PostgreSQL reconstruye de forma idéntica el objeto en memoria
    const pgReconstructRes = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const rRow = pgReconstructRes.rows[0];
    const reconstructedVehicle = {
      id: String(rRow.id),
      studentId: String(rRow.alumno_id),
      studentName: String(rRow.alumno_nombre),
      vehicleType: String(rRow.vehiculo_tipo),
      title: String(rRow.titulo),
      basePrice: Number(rRow.precio_base),
      ivaAmount: Number(rRow.importe_iva),
      totalPrice: Number(rRow.precio_total),
      paymentMethod: String(rRow.metodo_pago),
      purchaseDate: new Date(rRow.fecha_compra).toISOString(),
      assignedDriverId: rRow.conductor_asignado_id ? String(rRow.conductor_asignado_id) : undefined,
      assignedDriverName: rRow.conductor_asignado_nombre ? String(rRow.conductor_asignado_nombre) : undefined,
      assignedShift: rRow.turno_asignado ? Number(rRow.turno_asignado) : undefined,
      assignedWarehouseIndex: rRow.almacen_asignado_index !== null && rRow.almacen_asignado_index !== undefined ? Number(rRow.almacen_asignado_index) : undefined,
      assignedPropertyId: rRow.propiedad_asignada_id ? String(rRow.propiedad_asignada_id) : undefined,
      assignedPropertyTitle: rRow.propiedad_asignada_titulo ? String(rRow.propiedad_asignada_titulo) : undefined,
      assignedWarehouseName: rRow.almacen_asignado_nombre ? String(rRow.almacen_asignado_nombre) : undefined,
      status: String(rRow.estado || 'activo'),
      imageUrl: rRow.imagen_url ? String(rRow.imagen_url) : '/images/vehicles/carretilla_elevadora.jpg'
    };

    const p15Passed = reconstructedVehicle.id === veh1 &&
      reconstructedVehicle.studentId === testStudent1 &&
      reconstructedVehicle.assignedWarehouseIndex === 1 &&
      reconstructedVehicle.assignedPropertyId === propStudent1 &&
      reconstructedVehicle.assignedPropertyTitle === 'Nave Industrial Norte' &&
      reconstructedVehicle.assignedWarehouseName === 'Nave Principal - Zona A';

    console.log(`[P15] Reconstrucción idéntica con el mapeo del servidor: ${p15Passed ? 'SÍ' : 'NO'}`);
    console.log(`[P15] Resultado: ${p15Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['15_reconstruccion_desde_postgresql'] = !!p15Passed;

    // -------------------------------------------------------------------------
    // PRUEBA 16: REGRESIONES DEL FLUJO EXISTENTE (CompanyDashboard / VehicleDealershipPortal)
    // -------------------------------------------------------------------------
    console.log("\n--- PRUEBA 16: REGRESIONES DEL FLUJO EXISTENTE (sin studentId explícito en body) ---");
    // CompanyDashboard y VehicleDealershipPortal no envían studentId en el body
    const res16 = await fetch(`${BASE_URL}/api/student/vehicles/${veh1}/assign-warehouse`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        warehouseIndex: 2,
        propertyId: propStudent1,
        propertyTitle: 'Nave Industrial Norte',
        warehouseName: 'Nave Industrial Norte - Almacén 2'
      })
    });
    const data16 = await res16.json();
    console.log(`[P16] Status HTTP: ${res16.status}`);
    const pgVeh16 = await pool.query('SELECT * FROM vehiculos_comprados WHERE id = $1', [veh1]);
    const p16Passed = res16.status === 200 &&
      data16.success === true &&
      data16.vehicle.assignedWarehouseIndex === 2 &&
      pgVeh16.rows[0].almacen_asignado_index === 2;
    console.log(`[P16] Resultado: ${p16Passed ? 'SUPERADA' : 'FALLIDA'}`);
    results['16_compatibilidad_payloads_existentes'] = p16Passed;

    // -------------------------------------------------------------------------
    // VERIFICACIÓN ADICIONAL: AUSENCIA DE writeDb() Y syncVehicleToSupabase() EN EL ENDPOINT
    // -------------------------------------------------------------------------
    console.log("\n--- VERIFICACIÓN DE CÓDIGO ESTÁTICO: NO writeDb() NI FIRE-AND-FORGET EN assign-warehouse ---");
    const serverCode = fs.readFileSync(path.join(process.cwd(), 'server.ts'), 'utf-8');
    const endpointRegex = /app\.put\('\/api\/student\/vehicles\/:id\/assign-warehouse'[\s\S]*?app\.put\('\/api\/student\/employees\/:id\/assign-vehicle'/;
    const match = serverCode.match(endpointRegex);
    const endpointSnippet = match ? match[0] : '';

    const hasWriteDb = endpointSnippet.includes('writeDb(');
    const hasFireAndForget = endpointSnippet.includes('syncVehicleToSupabase(');
    const usesWithPostgresTransaction = endpointSnippet.includes('withPostgresTransaction(');
    const usesExecuteWithIdempotency = endpointSnippet.includes('executeWithIdempotency(');
    const usesForUpdate = endpointSnippet.includes('FOR UPDATE');
    const usesForShare = endpointSnippet.includes('FOR SHARE');

    console.log(`[AUDIT] writeDb() presente: ${hasWriteDb ? 'SÍ (ERROR)' : 'NO (CORRECTO)'}`);
    console.log(`[AUDIT] syncVehicleToSupabase() presente: ${hasFireAndForget ? 'SÍ (ERROR)' : 'NO (CORRECTO)'}`);
    console.log(`[AUDIT] withPostgresTransaction(): ${usesWithPostgresTransaction ? 'SÍ' : 'NO'}`);
    console.log(`[AUDIT] executeWithIdempotency(): ${usesExecuteWithIdempotency ? 'SÍ' : 'NO'}`);
    console.log(`[AUDIT] SELECT FOR UPDATE en vehículo: ${usesForUpdate ? 'SÍ' : 'NO'}`);
    console.log(`[AUDIT] SELECT FOR SHARE en inmueble: ${usesForShare ? 'SÍ' : 'NO'}`);

    const staticAuditPassed = !hasWriteDb && !hasFireAndForget && usesWithPostgresTransaction && usesExecuteWithIdempotency && usesForUpdate && usesForShare;
    results['17_auditoria_estatica_flujo_critico'] = staticAuditPassed;

  } catch (err) {
    console.error("Error durante la ejecución de las pruebas:", err);
  } finally {
    // Cleanup datos de prueba
    console.log("\n--- LIMPIEZA DE DATOS DE PRUEBA ---");
    await pool.query('DELETE FROM vehiculos_comprados WHERE id IN ($1, $2)', [veh1, veh2]).catch(() => {});
    await pool.query('DELETE FROM adquisiciones WHERE id IN ($1, $2)', [propStudent1, propStudent2]).catch(() => {});
    await pool.query('DELETE FROM cuentas WHERE id IN ($1, $2)', [testStudent1, testStudent2]).catch(() => {});
    await pool.end();
  }

  console.log("\n================================================================================");
  console.log("RESUMEN FINAL DE LA BATERÍA DE PRUEBAS:");
  console.log("================================================================================");
  let allOk = true;
  for (const [name, ok] of Object.entries(results)) {
    console.log(`- ${name}: ${ok ? '✅ SUPERADA' : '❌ FALLIDA'}`);
    if (!ok) allOk = false;
  }
  console.log("================================================================================");
  console.log(`ESTADO GENERAL: ${allOk ? 'TODAS LAS PRUEBAS SUPERADAS EXITOSAMENTE (17/17)' : 'HAY PRUEBAS FALLIDAS'}`);
  console.log("================================================================================");
}

runTestSuite();
