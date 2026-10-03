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

async function testLoanPayment() {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const loanLockRes = await client.query(
      `SELECT id, alumno_id, alumno_nombre, alumno_cuenta, estado, tabla_amortizacion, plazo_meses, garantia_inmueble_titulo
       FROM prestamos
       WHERE id = $1
       FOR UPDATE`,
      ['prestamo-mufdi68tvu37w']
    );

    const loanRow = loanLockRes.rows[0];
    let currentSchedule = typeof loanRow.tabla_amortizacion === 'string'
      ? JSON.parse(loanRow.tabla_amortizacion)
      : loanRow.tabla_amortizacion;

    const targetRow = currentSchedule.find((r: any) => r.period === 1);
    console.log('Target row:', targetRow);

    const now = new Date();
    const dDate = new Date(targetRow.dueDate);
    const penalty = calculateMonthlyPenaltyInterest(targetRow.payment, dDate, now);
    console.log('Penalty calculated:', penalty);

    const studentId = 'user-hn51cg6wi';
    const accountLockRes = await client.query(
      `SELECT id, alumno, saldo, usuario, password, account_number, role, level
       FROM cuentas
       WHERE id = $1
       FOR UPDATE`,
      [studentId]
    );

    const studentRow = accountLockRes.rows[0];
    const currentBalance = Number(studentRow.saldo);
    console.log('Current balance from PG:', currentBalance);

    console.log(`Checking balance: currentBalance (${currentBalance}) < targetRow.payment (${targetRow.payment})`);
    if (currentBalance < targetRow.payment) {
      console.log('RESULT: INSUFFICIENT BALANCE!');
    } else {
      console.log('RESULT: SUFFICIENT BALANCE!');
      const canPayPenalty = penalty > 0 && currentBalance >= Number((targetRow.payment + penalty).toFixed(2));
      const penaltyPaid = canPayPenalty ? penalty : 0;
      const totalDeduction = Number((targetRow.payment + penaltyPaid).toFixed(2));
      const newBalance = Number((currentBalance - totalDeduction).toFixed(2));
      console.log('Penalty paid:', penaltyPaid, 'Total deduction:', totalDeduction, 'New balance:', newBalance);
    }

    await client.query('ROLLBACK');
  } finally {
    client.release();
    await dbPool.end();
  }
}

testLoanPayment().catch(console.error);
