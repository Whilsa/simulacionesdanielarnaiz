process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Pool } = require('pg');
const fs = require('fs');

const url = process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:5432/postgres';
const pool = new Pool({
  connectionString: url,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    console.log('1. Cleaning up duplicate PAG-2026-39245 movements in Supabase...');
    const deletePNRes = await client.query(`
      DELETE FROM movimientos 
      WHERE id LIKE 'tx-372tmdn37%' OR id LIKE 'tx-xvfls20du%'
    `);
    console.log('Deleted duplicate PAG-2026-39245 movements:', deletePNRes.rowCount);

    console.log('2. Cleaning up duplicate payroll movements in Supabase...');
    const delPayrollRes = await client.query(`
      DELETE FROM movimientos
      WHERE (concepto ILIKE '%nómina%' OR concepto ILIKE '%nomina%' OR concepto ILIKE '%Nómina%')
        AND id NOT IN (
          SELECT DISTINCT ON (cuenta_id, tipo, concepto, importe) id
          FROM movimientos
          WHERE (concepto ILIKE '%nómina%' OR concepto ILIKE '%nomina%' OR concepto ILIKE '%Nómina%')
          ORDER BY cuenta_id, tipo, concepto, importe, fecha ASC, id ASC
        )
    `);
    console.log('Deleted duplicate payroll movements:', delPayrollRes.rowCount);

    console.log('3. Cleaning up any other duplicate general movements in Supabase...');
    const delGeneralDupes = await client.query(`
      DELETE FROM movimientos
      WHERE id NOT IN (
        SELECT DISTINCT ON (COALESCE(sender_id, cuenta_id), COALESCE(receiver_id, cuenta_id), tipo, concepto, importe) id
        FROM movimientos
        ORDER BY COALESCE(sender_id, cuenta_id), COALESCE(receiver_id, cuenta_id), tipo, concepto, importe, fecha ASC, id ASC
      )
    `);
    console.log('Deleted general duplicate movements:', delGeneralDupes.rowCount);

    console.log('4. Cleaning up duplicate registros_nomina in Supabase...');
    const delPayrolls = await client.query(`
      DELETE FROM registros_nomina
      WHERE id NOT IN (
        SELECT DISTINCT ON (alumno_id, mes, anio) id
        FROM registros_nomina
        ORDER BY alumno_id, mes, anio, fecha_nomina ASC, id ASC
      )
    `);
    console.log('Deleted duplicate payroll records:', delPayrolls.rowCount);

    console.log('5. Cleaning up duplicate obligaciones_fiscales in Supabase...');
    const delTaxes = await client.query(`
      DELETE FROM obligaciones_fiscales
      WHERE id NOT IN (
        SELECT DISTINCT ON (alumno_id, tipo, concepto, fecha_vencimiento) id
        FROM obligaciones_fiscales
        ORDER BY alumno_id, tipo, concepto, fecha_vencimiento, id ASC
      )
    `);
    console.log('Deleted duplicate tax obligations:', delTaxes.rowCount);

    console.log('6. Cleaning up invalid market messages in Supabase...');
    await client.query(`DELETE FROM market_messages WHERE id = 'msg-ec7vk6gd0' OR id = 'msg-afnai928q'`);

    console.log('7. Syncing verified balances from db.json to Supabase cuentas...');
    const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
    for (const u of db.users) {
      await client.query(`
        UPDATE cuentas 
        SET saldo = $1, alumno = $2, usuario = $3, password = $4, account_number = $5, role = $6, level = $7
        WHERE id = $8
      `, [u.balance, u.name, u.username || null, u.password || null, u.accountNumber || null, u.role || 'student', u.level || 1, u.id]);
    }

    await client.query('COMMIT');
    console.log('Supabase cleanup successfully committed!');

    const countAfter = await client.query('SELECT count(*) FROM movimientos');
    console.log('Total remaining movements in Supabase:', countAfter.rows[0].count);

    const cuentasAfter = await client.query('SELECT alumno, saldo FROM cuentas');
    console.log('Supabase accounts after update:');
    cuentasAfter.rows.forEach(c => console.log('  -', c.alumno, ':', Number(c.saldo).toLocaleString('es-ES', { minimumFractionDigits: 2 }), '€'));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error during Supabase cleanup:', err);
  } finally {
    client.release();
    pool.end();
  }
}

run().catch(console.error);
