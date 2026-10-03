import pg from 'pg';
import fs from 'fs';

const dbPool = new pg.Pool({
  connectionString: 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

function calculateMonthlyPenaltyInterest(principal: number, dueDate: Date, now: Date): number {
  const dDate = new Date(dueDate);
  const endOfDueDay = new Date(dDate.getFullYear(), dDate.getMonth(), dDate.getDate(), 23, 59, 59, 999);
  if (now.getTime() <= endOfDueDay.getTime()) {
    return 0;
  }
  const msElapsed = now.getTime() - endOfDueDay.getTime();
  const daysElapsed = Math.floor(msElapsed / (1000 * 3600 * 24));
  if (daysElapsed < 1) return 0;
  const monthsElapsed = Math.max(1, Math.ceil(daysElapsed / 30));
  return Number((principal * 0.05 * monthsElapsed).toFixed(2));
}

async function run() {
  const targetStudentId = 'user-hn51cg6wi';
  console.log('Testing with studentId:', targetStudentId);
  const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));

  const now = new Date();

  // Step 1: candidate loans
  const q = `SELECT id, alumno_id, plazo_meses, garantia_inmueble_titulo, tabla_amortizacion FROM prestamos WHERE alumno_id = $1 AND estado = 'active'`;
  const pgLoansRes = await dbPool.query(q, [targetStudentId]);
  console.log('PG loans found:', pgLoansRes.rows.length);

  for (const r of pgLoansRes.rows) {
    let sched: any[] = [];
    if (typeof r.tabla_amortizacion === 'string') {
      try { sched = JSON.parse(r.tabla_amortizacion); } catch (e) { sched = []; }
    } else if (Array.isArray(r.tabla_amortizacion)) {
      sched = r.tabla_amortizacion;
    }
    console.log('Loan id:', r.id, 'term:', r.plazo_meses, 'schedule rows count:', sched.length);
    const dueRows = sched.filter(row => !row.paid && new Date(row.dueDate) <= now);
    console.log('Due unpaid rows:', dueRows);
  }

  // Step 2: Check cuentas
  const accRes = await dbPool.query('SELECT id, alumno, saldo, usuario, account_number FROM cuentas WHERE id = $1', [targetStudentId]);
  console.log('Account in PG:', accRes.rows);

  await dbPool.end();
}

run().catch(console.error);
