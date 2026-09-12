import pg from 'pg';
import fs from 'fs';

const DB_URL = "postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres";
const BASE_URL = "http://localhost:3000";

const pool = new pg.Pool({
  connectionString: DB_URL,
  ssl: { rejectUnauthorized: false }
});

async function runTests() {
  console.log("================================================================================");
  console.log("INICIANDO SUITE DE PRUEBAS FASE 4.2.1 — MIGRACIÓN TRANSACCIONAL DE CONTRATACIÓN");
  console.log("================================================================================\n");

  const results = {
    test1: false,
    test2: false,
    test3: false,
    test4: false,
    test5: false,
    test6: false
  };

  try {
    // -------------------------------------------------------------------------
    // PRUEBA 1: CONTRATACIÓN NORMAL
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 1: CONTRATACIÓN NORMAL ---");
    const jobId1 = `test_job_normal_${Date.now()}`;
    await pool.query(`
      INSERT INTO ofertas_empleo (id, titulo, puesto, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado)
      VALUES ($1, 'Operario Logístico', 'operario', 'Juan Normal Perez', 'M', 1550, 28, 'disponible')
    `, [jobId1]);

    const res1 = await fetch(`${BASE_URL}/api/jobs/${jobId1}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'user-5b2wk2oby' })
    });
    const data1 = await res1.json();
    console.log(`[P1] Status HTTP: ${res1.status}`);

    const dbEmp1 = await pool.query('SELECT * FROM empleados_contratados WHERE oferta_id = $1', [jobId1]);
    const dbJob1 = await pool.query('SELECT * FROM ofertas_empleo WHERE id = $1', [jobId1]);

    const p1HttpOk = res1.status === 200 && data1.success === true;
    const p1EmpCreated = dbEmp1.rows.length === 1 && dbEmp1.rows[0].nombre_empleado === 'Juan Normal Perez';
    const p1JobRetired = dbJob1.rows.length === 0;

    console.log(`[P1] Empleado en PostgreSQL: ${p1EmpCreated ? 'SÍ (1 registro)' : 'NO'}`);
    console.log(`[P1] Oferta retirada de PostgreSQL: ${p1JobRetired ? 'SÍ (0 registros)' : 'NO'}`);

    if (p1HttpOk && p1EmpCreated && p1JobRetired) {
      console.log(">>> PRUEBA 1: SUPERADA EXITOSAMENTE <<<\n");
      results.test1 = true;
    } else {
      console.error(">>> PRUEBA 1: FALLIDA <<<\n");
    }

    // -------------------------------------------------------------------------
    // PRUEBA 2: CONCURRENCIA REAL (2 PETICIONES PARALELAS SOBRE LA MISMA OFERTA)
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 2: CONCURRENCIA REAL (DOS PETICIONES PARALELAS SOBRE LA MISMA OFERTA) ---");
    const jobId2 = `test_job_conc_${Date.now()}`;
    await pool.query(`
      INSERT INTO ofertas_empleo (id, titulo, puesto, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado)
      VALUES ($1, 'Carretillero Concurrente', 'carretillero', 'Pedro Concurrente Diaz', 'M', 1800, 32, 'disponible')
    `, [jobId2]);

    console.log(`[P2] Lanzando 2 peticiones concurrentes para contratar ${jobId2}...`);
    const [res2A, res2B] = await Promise.all([
      fetch(`${BASE_URL}/api/jobs/${jobId2}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `key_conc_A_${Date.now()}` },
        body: JSON.stringify({ studentId: 'user-5b2wk2oby' })
      }),
      fetch(`${BASE_URL}/api/jobs/${jobId2}/hire`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-idempotency-key': `key_conc_B_${Date.now()}` },
        body: JSON.stringify({ studentId: 'test_buyer_rm_1' })
      })
    ]);

    const data2A = await res2A.json();
    const data2B = await res2B.json();

    console.log(`[P2] Petición A: Status ${res2A.status}, Body: ${JSON.stringify(data2A)}`);
    console.log(`[P2] Petición B: Status ${res2B.status}, Body: ${JSON.stringify(data2B)}`);

    const statuses = [res2A.status, res2B.status];
    const exactlyOne200 = statuses.filter(s => s === 200).length === 1;
    const exactlyOneReject = statuses.filter(s => s === 400 || s === 409).length === 1;

    const dbEmp2 = await pool.query('SELECT * FROM empleados_contratados WHERE oferta_id = $1', [jobId2]);
    const dbJob2 = await pool.query('SELECT * FROM ofertas_empleo WHERE id = $1', [jobId2]);

    const exactlyOneEmpInPg = dbEmp2.rows.length === 1;
    const jobRetiredOnce = dbJob2.rows.length === 0;

    console.log(`[P2] Exactamente 1 HTTP 200: ${exactlyOne200}`);
    console.log(`[P2] Exactamente 1 HTTP 400/409: ${exactlyOneReject}`);
    console.log(`[P2] Empleados creados en PostgreSQL: ${dbEmp2.rows.length}`);
    console.log(`[P2] Ofertas restantes en PostgreSQL: ${dbJob2.rows.length}`);

    if (exactlyOne200 && exactlyOneReject && exactlyOneEmpInPg && jobRetiredOnce) {
      console.log(">>> PRUEBA 2: SUPERADA EXITOSAMENTE <<<\n");
      results.test2 = true;
    } else {
      console.error(">>> PRUEBA 2: FALLIDA <<<\n");
    }

    // -------------------------------------------------------------------------
    // PRUEBA 3: IDEMPOTENCIA
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 3: IDEMPOTENCIA ---");
    const jobId3 = `test_job_idem_${Date.now()}`;
    const idemKey = `idem_hire_${Date.now()}`;
    await pool.query(`
      INSERT INTO ofertas_empleo (id, titulo, puesto, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado)
      VALUES ($1, 'Mozo Idempotente', 'mozo_almacen', 'Lucas Idem Gomez', 'M', 1400, 24, 'disponible')
    `, [jobId3]);

    const res3A = await fetch(`${BASE_URL}/api/jobs/${jobId3}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
      body: JSON.stringify({ studentId: 'user-5b2wk2oby' })
    });
    const data3A = await res3A.json();
    console.log(`[P3] Primer intento: Status ${res3A.status}, Employee ID: ${data3A.employee?.id}`);

    const res3B = await fetch(`${BASE_URL}/api/jobs/${jobId3}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-idempotency-key': idemKey },
      body: JSON.stringify({ studentId: 'user-5b2wk2oby' })
    });
    const data3B = await res3B.json();
    console.log(`[P3] Segundo intento (misma clave): Status ${res3B.status}, Employee ID: ${data3B.employee?.id}`);

    const dbEmp3 = await pool.query('SELECT * FROM empleados_contratados WHERE oferta_id = $1', [jobId3]);
    const p3SameId = data3A.employee?.id === data3B.employee?.id;
    const p3CountOne = dbEmp3.rows.length === 1;

    console.log(`[P3] Misma respuesta recuperada: ${p3SameId}`);
    console.log(`[P3] Empleados en PostgreSQL: ${dbEmp3.rows.length} (esperado: 1)`);

    if (res3A.status === 200 && res3B.status === 200 && p3SameId && p3CountOne) {
      console.log(">>> PRUEBA 3: SUPERADA EXITOSAMENTE <<<\n");
      results.test3 = true;
    } else {
      console.error(">>> PRUEBA 3: FALLIDA <<<\n");
    }

    // -------------------------------------------------------------------------
    // PRUEBA 4: ROLLBACK ANTE ERROR
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 4: ROLLBACK ANTE ERROR ---");
    const jobId4 = `test_job_rollback_${Date.now()}`;
    await pool.query(`
      INSERT INTO ofertas_empleo (id, titulo, puesto, nombre_empleado, genero, sueldo_bruto_mensual, edad, estado)
      VALUES ($1, 'Operario Fallo', 'operario', 'Carlos Rollback', 'M', 1600, 30, 'disponible')
    `, [jobId4]);

    // Usar un alumno inexistente para disparar error dentro de la transacción
    const res4 = await fetch(`${BASE_URL}/api/jobs/${jobId4}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 'alumno_totalmente_inexistente_99999' })
    });
    const data4 = await res4.json();
    console.log(`[P4] Status: ${res4.status}, Error: ${data4.error}`);

    const dbEmp4 = await pool.query('SELECT * FROM empleados_contratados WHERE oferta_id = $1', [jobId4]);
    const dbJob4 = await pool.query('SELECT * FROM ofertas_empleo WHERE id = $1', [jobId4]);

    const p4HttpErr = res4.status === 404;
    const p4JobStillAvailable = dbJob4.rows.length === 1 && dbJob4.rows[0].estado === 'disponible';
    const p4NoEmpCreated = dbEmp4.rows.length === 0;

    console.log(`[P4] Oferta sigue existiendo y disponible: ${p4JobStillAvailable}`);
    console.log(`[P4] Empleados creados: ${dbEmp4.rows.length} (esperado: 0)`);

    if (p4HttpErr && p4JobStillAvailable && p4NoEmpCreated) {
      console.log(">>> PRUEBA 4: SUPERADA EXITOSAMENTE <<<\n");
      results.test4 = true;
    } else {
      console.error(">>> PRUEBA 4: FALLIDA <<<\n");
    }

    // -------------------------------------------------------------------------
    // PRUEBA 5: PERSISTENCIA TRAS RECONEXIÓN
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 5: PERSISTENCIA ---");
    // Crear un nuevo pool para simular conexión completamente aislada
    const isolatedPool = new pg.Pool({
      connectionString: DB_URL,
      ssl: { rejectUnauthorized: false }
    });

    const verifyPersist = await isolatedPool.query(`
      SELECT id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, puesto, sueldo_bruto_mensual, edad, fecha_contratacion
      FROM empleados_contratados
      WHERE oferta_id = $1
    `, [jobId1]);

    await isolatedPool.end();

    const row = verifyPersist.rows[0];
    const p5Ok = verifyPersist.rows.length === 1 &&
                 row.nombre_empleado === 'Juan Normal Perez' &&
                 row.alumno_id === 'user-5b2wk2oby' &&
                 Number(row.sueldo_bruto_mensual) === 1550;

    console.log(`[P5] Verificación en cliente PostgreSQL aislado: ${p5Ok ? 'DATOS ÍNTEGROS Y PERSISTIDOS' : 'FALLÓ'}`);
    if (p5Ok) {
      console.log(">>> PRUEBA 5: SUPERADA EXITOSAMENTE <<<\n");
      results.test5 = true;
    } else {
      console.error(">>> PRUEBA 5: FALLIDA <<<\n");
    }

    // -------------------------------------------------------------------------
    // PRUEBA 6: VERIFICACIÓN DE LA RESTRICCIÓN UNIQUE
    // -------------------------------------------------------------------------
    console.log("--- PRUEBA 6: VERIFICACIÓN DE LA RESTRICCIÓN DE INTEGRIDAD UNIQUE ---");
    const testUniqOfertaId = `test_uniq_oferta_${Date.now()}`;
    const empIdA = `emp_test_uniq_A_${Date.now()}`;
    const empIdB = `emp_test_uniq_B_${Date.now()}`;

    // Inserción 1: Debe tener éxito
    await pool.query(`
      INSERT INTO empleados_contratados (id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, puesto, genero, sueldo_bruto_mensual, edad)
      VALUES ($1, $2, 'user-5b2wk2oby', 'Prueba', 'Empleado Unicidad 1', 'operario', 'M', 1500, 25)
    `, [empIdA, testUniqOfertaId]);
    console.log(`[P6] Inserción 1 con oferta_id ${testUniqOfertaId}: EXITOSA`);

    let rejectedByConstraint = false;
    let errorCode = '';
    let constraintName = '';
    try {
      // Inserción 2 con el MISMO oferta_id: PostgreSQL debe rechazarla
      await pool.query(`
        INSERT INTO empleados_contratados (id, oferta_id, alumno_id, alumno_nombre, nombre_empleado, puesto, genero, sueldo_bruto_mensual, edad)
        VALUES ($1, $2, 'test_buyer_rm_1', 'Comprador', 'Empleado Unicidad 2', 'operario', 'F', 1600, 27)
      `, [empIdB, testUniqOfertaId]);
    } catch (err: any) {
      rejectedByConstraint = true;
      errorCode = err.code;
      constraintName = err.constraint;
      console.log(`[P6] Inserción 2 RECHAZADA por PostgreSQL: código ${errorCode}, restricción: '${constraintName}'`);
    }

    // Limpieza de la fila de prueba
    await pool.query('DELETE FROM empleados_contratados WHERE id = $1', [empIdA]);

    const p6Ok = rejectedByConstraint && errorCode === '23505' && constraintName === 'uq_empleados_contratados_oferta_id';
    if (p6Ok) {
      console.log(">>> PRUEBA 6: SUPERADA EXITOSAMENTE <<<\n");
      results.test6 = true;
    } else {
      console.error(`>>> PRUEBA 6: FALLIDA (rechazado: ${rejectedByConstraint}, código: ${errorCode}, restricción: ${constraintName}) <<<\n`);
    }

  } catch (globalErr) {
    console.error("Error global durante ejecución de pruebas:", globalErr);
  } finally {
    await pool.end();
  }

  console.log("================================================================================");
  console.log("RESUMEN FINAL DE PRUEBAS FASE 4.2.1:");
  console.log(`Prueba 1 (Contratación Normal):      ${results.test1 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 2 (Concurrencia Real):         ${results.test2 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 3 (Idempotencia):              ${results.test3 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 4 (Rollback ante Error):       ${results.test4 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 5 (Persistencia):              ${results.test5 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log(`Prueba 6 (Restricción UNIQUE PG):     ${results.test6 ? '✅ PASÓ' : '❌ FALLÓ'}`);
  console.log("================================================================================");
}

runTests();
