import pg from 'pg';
import fs from 'fs';

const connectionString = 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';
const pool = new pg.Pool({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

async function runAudit() {
  console.log('--- FASE 4.9.1: AUDITORÍA TÉCNICA PROFUNDA DE PRÉSTAMOS BANCARIOS ---');

  // 1. Column metadata
  const colsRes = await pool.query(`
    SELECT column_name, data_type, is_nullable, column_default
    FROM information_schema.columns
    WHERE table_name = 'prestamos'
    ORDER BY ordinal_position
  `);

  // 2. Constraints
  const consRes = await pool.query(`
    SELECT conname, contype, pg_get_constraintdef(c.oid) as def
    FROM pg_constraint c
    JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE conrelid = 'prestamos'::regclass
  `);

  // 3. Existing rows in prestamos
  const rowsRes = await pool.query(`
    SELECT id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido, importe_concedido,
           plazo_meses, tipo_interes, euribor, diferencial, comision_apertura, cuota_mensual,
           garantia_tipo, garantia_inmueble_id, garantia_inmueble_titulo, garantia_superficie_m2, garantia_valor_tasacion,
           estado, requiere_profesor, notas_profesor, fecha_creacion, fecha_aceptacion,
           tabla_amortizacion
    FROM prestamos
    ORDER BY fecha_creacion DESC
  `);

  // 4. Compare with local db.json
  const rawDb = fs.readFileSync('./db.json', 'utf8');
  const db = JSON.parse(rawDb);
  const localLoans = db.loans || [];

  console.log(`Loans in PostgreSQL: ${rowsRes.rows.length}`);
  console.log(`Loans in db.json: ${localLoans.length}`);

  const discrepancies: any[] = [];
  for (const pgLoan of rowsRes.rows) {
    const memLoan = localLoans.find((l: any) => l.id === pgLoan.id);
    if (!memLoan) {
      discrepancies.push({
        id: pgLoan.id,
        issue: 'Loan exists in PostgreSQL but missing in db.json'
      });
      continue;
    }

    if (pgLoan.estado !== memLoan.status) {
      discrepancies.push({
        id: pgLoan.id,
        issue: 'Status mismatch',
        pgStatus: pgLoan.estado,
        memStatus: memLoan.status
      });
    }

    // Check amortization schedule rows
    let pgSchedule: any[] = [];
    if (typeof pgLoan.tabla_amortizacion === 'string') {
      try { pgSchedule = JSON.parse(pgLoan.tabla_amortizacion); } catch (e) {}
    } else if (Array.isArray(pgLoan.tabla_amortizacion)) {
      pgSchedule = pgLoan.tabla_amortizacion;
    }

    const memSchedule = memLoan.schedule || [];
    const pgPaidCount = pgSchedule.filter((r: any) => r.paid).length;
    const memPaidCount = memSchedule.filter((r: any) => r.paid).length;

    if (pgPaidCount !== memPaidCount) {
      discrepancies.push({
        id: pgLoan.id,
        issue: 'Amortization paid count mismatch',
        pgPaidCount,
        memPaidCount
      });
    }
  }

  // 5. Check if any movements in PostgreSQL correspond to loan disbursements or fees
  const loanDisbMovs = await pool.query(`
    SELECT count(*) as count, sum(importe) as total
    FROM movimientos
    WHERE concepto ILIKE '%préstamo%' OR concepto ILIKE '%prestamo%'
  `);

  const auditOutput = {
    timestamp: new Date().toISOString(),
    columns: colsRes.rows,
    constraints: consRes.rows,
    loansInPostgresCount: rowsRes.rows.length,
    loansInDbJsonCount: localLoans.length,
    discrepancies,
    loanMovements: loanDisbMovs.rows[0],
    sampleLoans: rowsRes.rows.map((r: any) => ({
      id: r.id,
      alumno_nombre: r.alumno_nombre,
      estado: r.estado,
      importe_solicitado: r.importe_solicitado,
      importe_concedido: r.importe_concedido,
      cuota_mensual: r.cuota_mensual,
      plazo_meses: r.plazo_meses,
      scheduleLength: Array.isArray(r.tabla_amortizacion) ? r.tabla_amortizacion.length : (typeof r.tabla_amortizacion === 'string' ? JSON.parse(r.tabla_amortizacion).length : 0)
    }))
  };

  fs.writeFileSync('scripts/audit_phase_4_9_1_results.json', JSON.stringify(auditOutput, null, 2));
  console.log('Audit completed. Results saved to scripts/audit_phase_4_9_1_results.json');

  await pool.end();
}

runAudit().catch(err => {
  console.error('Audit failed:', err);
  pool.end();
  process.exit(1);
});
