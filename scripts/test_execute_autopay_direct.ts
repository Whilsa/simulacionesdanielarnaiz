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

async function withPostgresTransaction<T>(callback: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await dbPool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function run() {
  const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  const student = db.users.find((u: any) => u.id === 'user-hn51cg6wi');
  const now = new Date();

  console.log('Testing loan payment execution...');
  try {
    const txResult = await withPostgresTransaction(async (client) => {
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
      const dDate = new Date(targetRow.dueDate);
      const penalty = calculateMonthlyPenaltyInterest(targetRow.payment, dDate, now);

      const accountLockRes = await client.query(
        `SELECT id, alumno, saldo, usuario, password, account_number, role, level
         FROM cuentas
         WHERE id = $1
         FOR UPDATE`,
        [student.id]
      );

      const studentRow = accountLockRes.rows[0];
      const currentBalance = Number(studentRow.saldo);

      console.log('Lock acquired! Saldo PG:', currentBalance, 'Payment:', targetRow.payment, 'Penalty:', penalty);

      if (currentBalance < targetRow.payment) {
        console.log('Balance insufficient!');
        return { success: false, reason: 'insufficient_balance' };
      }

      const nowIso = new Date().toISOString();
      const txId = 'tx_test_' + Date.now();

      const canPayPenalty = penalty > 0 && currentBalance >= Number((targetRow.payment + penalty).toFixed(2));
      const penaltyPaid = canPayPenalty ? penalty : 0;
      const totalDeduction = Number((targetRow.payment + penaltyPaid).toFixed(2));
      const newBalance = Number((currentBalance - totalDeduction).toFixed(2));

      console.log('Deduction:', totalDeduction, 'New Balance:', newBalance);

      await client.query(
        `UPDATE cuentas
         SET saldo = $1
         WHERE id = $2`,
        [newBalance, student.id]
      );

      const concept = `Cuota 1/180 de préstamo hipotecario`;
      const senderAccount = studentRow.account_number || '';
      const senderName = studentRow.alumno || '';

      await client.query(
        `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto, sender_id, sender_name, sender_account, receiver_id, receiver_name, receiver_account)
         VALUES ($1, $2, 'TRANSFER_OUT', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          txId + '-out',
          student.id,
          targetRow.payment,
          nowIso,
          concept,
          student.id,
          senderName,
          senderAccount,
          'corp-banco-central',
          'Banco Central Hipotecario S.A.',
          'ES210001000299887700'
        ]
      );

      if (penaltyPaid > 0) {
        const penaltyTxId = txId + '-pen';
        const penaltyConcept = `Intereses de demora por retraso en cuota 1/180 de préstamo hipotecario`;
        await client.query(
          `INSERT INTO movimientos (id, cuenta_id, tipo, importe, fecha, concepto, sender_id, sender_name, sender_account, receiver_id, receiver_name, receiver_account)
           VALUES ($1, $2, 'TRANSFER_OUT', $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
          [
            penaltyTxId + '-out',
            student.id,
            penaltyPaid,
            nowIso,
            penaltyConcept,
            student.id,
            senderName,
            senderAccount,
            'corp-banco-central',
            'Banco Central Hipotecario S.A.',
            'ES210001000299887700'
          ]
        );
      }

      targetRow.paid = true;
      targetRow.paidDate = nowIso;
      targetRow.isOverdue = false;
      targetRow.penaltyInterest = 0;

      await client.query(
        `UPDATE prestamos
         SET tabla_amortizacion = $1, estado = $2
         WHERE id = $3`,
        [JSON.stringify(currentSchedule), 'active', loanRow.id]
      );

      return { success: true, newBalance };
    });

    console.log('Transaction result:', txResult);
  } catch (err) {
    console.error('Transaction error:', err);
  } finally {
    await dbPool.end();
  }
}

run().catch(console.error);
