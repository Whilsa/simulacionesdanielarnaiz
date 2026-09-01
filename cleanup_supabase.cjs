process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const url = process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15000,
  idleTimeoutMillis: 10000,
  max: 3
});

// Initial User Data Definitions
const INITIAL_USERS = [
  {
    id: 'profesor-1',
    name: 'Profesor de Contabilidad',
    username: 'pupdaniel',
    password: '1987',
    role: 'teacher',
    level: 1,
    balance: 0,
    accountNumber: 'ES000000000000000000'
  },
  {
    id: 'user-tie33g796',
    name: 'Tododestornilladores, S.A.',
    username: 'cliente01',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 260959.17,
    accountNumber: 'ES36000100029058060348'
  },
  {
    id: 'user-wu3u6x6zz',
    name: 'Productora Varillas, S.A.',
    username: 'cliente02',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 30080.42,
    accountNumber: 'ES38000100022204910071'
  },
  {
    id: 'user-yqafq0s1b',
    name: 'Destornilladores S.A.',
    username: 'cliente03',
    password: '1987',
    role: 'student',
    level: 1,
    balance: -32593.53,
    accountNumber: 'ES50000100021406089898'
  },
  {
    id: 'user-3p8azs8z1',
    name: 'Destornilladores Por Mayor S.A.',
    username: 'cliente04',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 151565.00,
    accountNumber: 'ES51000100024856898921'
  },
  {
    id: 'user-n4szf2cvx',
    name: 'Leroy Merlin, S.A.',
    username: 'cliente05',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 186720.75,
    accountNumber: 'ES23000100023677414359'
  },
  {
    id: 'user-26iyne9mz',
    name: 'Minorista',
    username: 'cliente06',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 57335.36,
    accountNumber: 'ES82000100022178917770'
  },
  {
    id: 'user-4rd635i0n',
    name: 'Fabricante',
    username: 'cliente07',
    password: '1987',
    role: 'student',
    level: 1,
    balance: 60000.00,
    accountNumber: 'ES41000100029262515901'
  },
  {
    id: 'alumno-1',
    name: 'Ana López',
    username: 'ana',
    password: '123',
    role: 'student',
    level: 1,
    balance: 1000.00,
    accountNumber: 'ES910001000212345678'
  },
  {
    id: 'alumno-2',
    name: 'Carlos Ruiz',
    username: 'carlos',
    password: '123',
    role: 'student',
    level: 1,
    balance: 1000.00,
    accountNumber: 'ES910001000287654321'
  },
  {
    id: 'alumno-3',
    name: 'Beatriz Gómez',
    username: 'beatriz',
    password: '123',
    role: 'student',
    level: 1,
    balance: 1000.00,
    accountNumber: 'ES910001000244556677'
  }
];

async function ensureTables(client) {
  console.log('Verifying & creating required PostgreSQL tables if needed...');
  await client.query(`
    CREATE TABLE IF NOT EXISTS cuentas (
      id VARCHAR(255) PRIMARY KEY,
      alumno VARCHAR(255) NOT NULL,
      saldo NUMERIC(12, 2) NOT NULL DEFAULT 0,
      usuario TEXT,
      password TEXT,
      account_number TEXT,
      role TEXT,
      level INT DEFAULT 1
    );

    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS usuario TEXT;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS password TEXT;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS account_number TEXT;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS role TEXT;
    ALTER TABLE cuentas ADD COLUMN IF NOT EXISTS level INT DEFAULT 1;

    CREATE TABLE IF NOT EXISTS movimientos (
      id VARCHAR(255) PRIMARY KEY,
      cuenta_id VARCHAR(255) NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      importe NUMERIC(12, 2) NOT NULL DEFAULT 0,
      fecha TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      concepto TEXT,
      sender_id VARCHAR(255),
      sender_name TEXT,
      sender_account TEXT,
      receiver_id VARCHAR(255),
      receiver_name TEXT,
      receiver_account TEXT
    );

    CREATE TABLE IF NOT EXISTS materias_primas_inventario (
      alumno_id VARCHAR(255) PRIMARY KEY,
      alumno_nombre TEXT NOT NULL,
      fragmentos_hierro_kg NUMERIC(12, 2) DEFAULT 0,
      fragmentos_metal_kg NUMERIC(12, 2) DEFAULT 0,
      pellets_plastico_kg NUMERIC(12, 2) DEFAULT 0,
      pegamento_epoxi_kg NUMERIC(12, 2) DEFAULT 0,
      varillas_punta NUMERIC(12, 2) DEFAULT 0,
      productos_ensamblados NUMERIC(12, 2) DEFAULT 0,
      ultima_calculada TIMESTAMPTZ,
      fecha_actualizacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      varillas_hierro_punta NUMERIC(12, 2) DEFAULT 0,
      varillas_metal_punta NUMERIC(12, 2) DEFAULT 0,
      destornilladores_hierro NUMERIC(12, 2) DEFAULT 0,
      destornilladores_metal NUMERIC(12, 2) DEFAULT 0,
      line1_pending_hours NUMERIC(10, 2) DEFAULT 0,
      line2_pending_hours NUMERIC(10, 2) DEFAULT 0,
      rod_production_mode VARCHAR(50) DEFAULT 'estrella',
      varillas_punta_estrella NUMERIC(12, 2) DEFAULT 0,
      varillas_punta_plana NUMERIC(12, 2) DEFAULT 0,
      destornilladores_punta_estrella NUMERIC(12, 2) DEFAULT 0,
      destornilladores_punta_plana NUMERIC(12, 2) DEFAULT 0,
      desglose_almacenes JSONB
    );

    CREATE TABLE IF NOT EXISTS registros_nomina (
      id VARCHAR(255) PRIMARY KEY,
      alumno_id VARCHAR(255) NOT NULL,
      alumno_nombre TEXT NOT NULL,
      fecha_nomina TIMESTAMPTZ NOT NULL,
      mes INT NOT NULL,
      anio INT NOT NULL,
      num_empleados INT NOT NULL,
      total_bruto NUMERIC(12, 2) NOT NULL,
      total_ss_empleado NUMERIC(12, 2) NOT NULL,
      total_irpf NUMERIC(12, 2) NOT NULL,
      total_liquido NUMERIC(12, 2) NOT NULL,
      total_ss_empresa NUMERIC(12, 2) NOT NULL,
      es_proporcional BOOLEAN DEFAULT FALSE,
      fecha_creacion TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS obligaciones_fiscales (
      id VARCHAR(255) PRIMARY KEY,
      alumno_id VARCHAR(255) NOT NULL,
      alumno_nombre TEXT NOT NULL,
      tipo VARCHAR(50) NOT NULL,
      concepto TEXT NOT NULL,
      importe NUMERIC(12, 2) NOT NULL,
      fecha_vencimiento TIMESTAMPTZ NOT NULL,
      estado VARCHAR(50) NOT NULL DEFAULT 'pendiente',
      fecha_pago TIMESTAMPTZ,
      nomina_id VARCHAR(255)
    );

    CREATE TABLE IF NOT EXISTS notificaciones (
      id VARCHAR(255) PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type VARCHAR(50) NOT NULL,
      read BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      related_order_id VARCHAR(255),
      related_announcement_id VARCHAR(255)
    );
  `);
}

async function deduplicateDatabase(client) {
  console.log('\n--- 1. Deduplicating Supabase Tables ---');
  const report = {};

  // 1. Deduplicate registros_nomina (keep earliest per alumno_id, mes, anio)
  const delPayrolls = await client.query(`
    DELETE FROM registros_nomina
    WHERE id NOT IN (
      SELECT DISTINCT ON (alumno_id, mes, anio) id
      FROM registros_nomina
      ORDER BY alumno_id, mes, anio, fecha_nomina ASC, id ASC
    )
  `);
  report.registros_nomina = delPayrolls.rowCount;
  console.log(`✓ registros_nomina duplicates deleted: ${delPayrolls.rowCount}`);

  // 2. Deduplicate obligaciones_fiscales (keep earliest per alumno_id, tipo, concepto, fecha_vencimiento)
  const delTaxes = await client.query(`
    DELETE FROM obligaciones_fiscales
    WHERE id NOT IN (
      SELECT DISTINCT ON (alumno_id, tipo, concepto, fecha_vencimiento) id
      FROM obligaciones_fiscales
      ORDER BY alumno_id, tipo, concepto, fecha_vencimiento ASC, id ASC
    )
  `);
  report.obligaciones_fiscales = delTaxes.rowCount;
  console.log(`✓ obligaciones_fiscales duplicates deleted: ${delTaxes.rowCount}`);

  // 3. Deduplicate empleados_contratados (keep earliest per alumno_id, nombre_empleado)
  try {
    const delEmps = await client.query(`
      DELETE FROM empleados_contratados
      WHERE id NOT IN (
        SELECT DISTINCT ON (alumno_id, nombre_empleado) id
        FROM empleados_contratados
        ORDER BY alumno_id, nombre_empleado, fecha_contratacion ASC, id ASC
      )
    `);
    report.empleados_contratados = delEmps.rowCount;
    console.log(`✓ empleados_contratados duplicates deleted: ${delEmps.rowCount}`);
  } catch (e) {
    console.warn('  (empleados_contratados dedup skip:', e.message, ')');
  }

  // 4. Deduplicate ofertas_empleo (keep distinct active offers)
  try {
    const delOffers = await client.query(`
      DELETE FROM ofertas_empleo
      WHERE id NOT IN (
        SELECT DISTINCT ON (COALESCE(alumno_id, ''), nombre_empleado, puesto) id
        FROM ofertas_empleo
        ORDER BY COALESCE(alumno_id, ''), nombre_empleado, puesto, fecha_creacion ASC, id ASC
      )
    `);
    report.ofertas_empleo = delOffers.rowCount;
    console.log(`✓ ofertas_empleo duplicates deleted: ${delOffers.rowCount}`);
  } catch (e) {
    console.warn('  (ofertas_empleo dedup skip:', e.message, ')');
  }

  // 5. Deduplicate notificaciones (keep earliest per user_id, title, message)
  try {
    const delNotif = await client.query(`
      DELETE FROM notificaciones
      WHERE id NOT IN (
        SELECT DISTINCT ON (user_id, title, message) id
        FROM notificaciones
        ORDER BY user_id, title, message, created_at ASC, id ASC
      )
    `);
    report.notificaciones = delNotif.rowCount;
    console.log(`✓ notificaciones duplicates deleted: ${delNotif.rowCount}`);
  } catch (e) {
    console.warn('  (notificaciones dedup skip:', e.message, ')');
  }

  // 6. Deduplicate market_messages
  try {
    const delMsgs = await client.query(`
      DELETE FROM market_messages
      WHERE id NOT IN (
        SELECT DISTINCT ON (COALESCE(chat_id, ''), sender_id, recipient_id, content, timestamp) id
        FROM market_messages
        ORDER BY COALESCE(chat_id, ''), sender_id, recipient_id, content, timestamp ASC, id ASC
      )
    `);
    report.market_messages = delMsgs.rowCount;
    console.log(`✓ market_messages duplicates deleted: ${delMsgs.rowCount}`);
  } catch (e) {
    console.warn('  (market_messages dedup skip:', e.message, ')');
  }

  // 7. Deduplicate demandas_judiciales
  try {
    const delLawsuits = await client.query(`
      DELETE FROM demandas_judiciales
      WHERE id NOT IN (
        SELECT DISTINCT ON (demandante_id, demandado_id, COALESCE(pagare_id, cuantia_reclamada::text)) id
        FROM demandas_judiciales
        ORDER BY demandante_id, demandado_id, COALESCE(pagare_id, cuantia_reclamada::text), fecha_creacion ASC, id ASC
      )
    `);
    report.demandas_judiciales = delLawsuits.rowCount;
    console.log(`✓ demandas_judiciales duplicates deleted: ${delLawsuits.rowCount}`);
  } catch (e) {
    console.warn('  (demandas_judiciales dedup skip:', e.message, ')');
  }

  // 8. Deduplicate materias_primas_inventario (keep latest per alumno_id)
  try {
    const delInv = await client.query(`
      DELETE FROM materias_primas_inventario
      WHERE ctid NOT IN (
        SELECT DISTINCT ON (alumno_id) ctid
        FROM materias_primas_inventario
        ORDER BY alumno_id, fecha_actualizacion DESC NULLS LAST
      )
    `);
    report.materias_primas_inventario = delInv.rowCount;
    console.log(`✓ materias_primas_inventario duplicates deleted: ${delInv.rowCount}`);
  } catch (e) {
    console.warn('  (materias_primas_inventario dedup skip:', e.message, ')');
  }

  // 9. Deduplicate payroll and duplicate general transactions in movimientos
  console.log('Deduplicating duplicate payroll movements in Supabase...');
  const delPayrollMovs = await client.query(`
    DELETE FROM movimientos
    WHERE (concepto ILIKE '%nómina%' OR concepto ILIKE '%nomina%' OR concepto ILIKE '%Nómina%')
      AND id NOT IN (
        SELECT DISTINCT ON (cuenta_id, tipo, concepto, importe) id
        FROM movimientos
        WHERE (concepto ILIKE '%nómina%' OR concepto ILIKE '%nomina%' OR concepto ILIKE '%Nómina%')
        ORDER BY cuenta_id, tipo, concepto, importe, fecha ASC, id ASC
      )
  `);
  console.log(`✓ Duplicate payroll movements deleted: ${delPayrollMovs.rowCount}`);

  const delGeneralDupes = await client.query(`
    DELETE FROM movimientos
    WHERE id NOT IN (
      SELECT DISTINCT ON (COALESCE(sender_id, cuenta_id), COALESCE(receiver_id, cuenta_id), tipo, concepto, importe) id
      FROM movimientos
      ORDER BY COALESCE(sender_id, cuenta_id), COALESCE(receiver_id, cuenta_id), tipo, concepto, importe, fecha ASC, id ASC
    )
  `);
  report.movimientos = (delPayrollMovs.rowCount || 0) + (delGeneralDupes.rowCount || 0);
  console.log(`✓ Duplicate general movements deleted: ${delGeneralDupes.rowCount}`);

  return report;
}

async function seedInitialUsers(client) {
  console.log('\n--- 2. Seeding & Verifying Initial Users in Supabase ---');
  let insertedCount = 0;
  let updatedCount = 0;

  for (const u of INITIAL_USERS) {
    const res = await client.query(`
      INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (id) DO UPDATE
      SET alumno = EXCLUDED.alumno,
          usuario = COALESCE(cuentas.usuario, EXCLUDED.usuario),
          password = COALESCE(cuentas.password, EXCLUDED.password),
          account_number = COALESCE(cuentas.account_number, EXCLUDED.account_number),
          role = COALESCE(cuentas.role, EXCLUDED.role),
          level = COALESCE(cuentas.level, EXCLUDED.level)
      RETURNING *;
    `, [u.id, u.name, u.balance, u.username, u.password, u.accountNumber, u.role, u.level]);

    if (res.rowCount > 0) {
      insertedCount++;
    }

    // Also seed corresponding inventory row if student
    if (u.role === 'student') {
      try {
        await client.query(`
          INSERT INTO materias_primas_inventario (alumno_id, alumno_nombre, fecha_actualizacion)
          VALUES ($1, $2, CURRENT_TIMESTAMP)
          ON CONFLICT (alumno_id) DO NOTHING;
        `, [u.id, u.name]);
      } catch (e) {
        // Ignore if already present
      }
    }
  }

  console.log(`✓ Initial users verified/seeded in Supabase cuentas: ${INITIAL_USERS.length}`);
}

async function syncLocalDbFile() {
  console.log('\n--- 3. Synchronizing db.json ---');
  const dbPath = path.join(process.cwd(), 'db.json');
  let db = {};
  if (fs.existsSync(dbPath)) {
    try {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    } catch (e) {
      db = {};
    }
  }

  if (!Array.isArray(db.users)) db.users = [];

  // Ensure all initial users exist in db.users
  for (const initUser of INITIAL_USERS) {
    const existingIndex = db.users.findIndex(u => u.id === initUser.id);
    if (existingIndex >= 0) {
      db.users[existingIndex] = {
        ...initUser,
        ...db.users[existingIndex],
        username: db.users[existingIndex].username || initUser.username,
        password: db.users[existingIndex].password || initUser.password,
        accountNumber: db.users[existingIndex].accountNumber || initUser.accountNumber
      };
    } else {
      db.users.push(initUser);
    }
  }

  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
  console.log(`✓ db.json updated with ${db.users.length} verified users.`);
}

async function run() {
  console.log('====================================================');
  console.log('   SUPABASE & RENDER DATABASE MAINTENANCE SCRIPT    ');
  console.log('====================================================');
  const startTime = Date.now();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await ensureTables(client);
    await deduplicateDatabase(client);
    await seedInitialUsers(client);

    await client.query('COMMIT');
    console.log('\n✓ Supabase transaction successfully committed!');

    await syncLocalDbFile();

    const elapsed = Date.now() - startTime;
    console.log(`\n====================================================`);
    console.log(` MAINTENANCE COMPLETED SUCCESSFULLY in ${elapsed}ms `);
    console.log(`====================================================\n`);

    const countUsers = await client.query('SELECT id, alumno, usuario, saldo FROM cuentas ORDER BY id');
    console.log('Active Supabase Accounts:');
    countUsers.rows.forEach(c => {
      console.log(`  - [${c.id}] ${c.usuario || c.alumno}: ${Number(c.saldo).toLocaleString('es-ES', { minimumFractionDigits: 2 })} €`);
    });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n❌ ERROR during Supabase maintenance:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

