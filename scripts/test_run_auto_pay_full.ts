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

async function runAutoPay(targetStudentId?: string) {
  const db = JSON.parse(fs.readFileSync('db.json', 'utf8'));
  const now = new Date();
  console.log(`[AutoPay] Starting for targetStudentId = ${targetStudentId}, now = ${now.toISOString()}`);

  let students: any[] = [];
  if (targetStudentId) {
    const existing = (db.users || []).find((u: any) => u.id === targetStudentId);
    if (existing) {
      console.log(`[AutoPay] Found targetStudentId ${targetStudentId} in db.users:`, existing.id, existing.username, existing.balance);
      students = [existing];
    } else {
      console.log(`[AutoPay] targetStudentId ${targetStudentId} NOT found in db.users by u.id === targetStudentId`);
      const byUser = (db.users || []).find((u: any) => u.username === targetStudentId);
      if (byUser) {
        console.log(`[AutoPay] BUT found in db.users by u.username === targetStudentId!`, byUser.id, byUser.username);
      }
      const uRes = await dbPool.query('SELECT id, alumno, role, account_number, saldo FROM cuentas WHERE id = $1', [targetStudentId]);
      console.log(`[AutoPay] Query cuentas WHERE id = '${targetStudentId}' returned ${uRes.rows.length} rows`);
      if (uRes.rows.length === 0) {
        const uRes2 = await dbPool.query('SELECT id, alumno, role, account_number, saldo FROM cuentas WHERE usuario = $1', [targetStudentId]);
        console.log(`[AutoPay] Query cuentas WHERE usuario = '${targetStudentId}' returned ${uRes2.rows.length} rows`);
      }
    }
  } else {
    students = (db.users || []).filter((u: any) => u.role === 'student');
    console.log(`[AutoPay] No targetStudentId, processing all ${students.length} students from db.users`);
  }

  // Candidate loans query
  const q = targetStudentId
    ? `SELECT id, alumno_id, plazo_meses, garantia_inmueble_titulo, tabla_amortizacion FROM prestamos WHERE alumno_id = $1 AND estado = 'active'`
    : `SELECT id, alumno_id, plazo_meses, garantia_inmueble_titulo, tabla_amortizacion FROM prestamos WHERE estado = 'active'`;
  const p = targetStudentId ? [targetStudentId] : [];
  console.log(`[AutoPay] Querying loans with SQL: ${q}, params:`, p);
  const pgLoansRes = await dbPool.query(q, p);
  console.log(`[AutoPay] Candidate loans found in PG: ${pgLoansRes.rows.length}`);

  const candidateLoansByStudent = new Map<string, any[]>();
  for (const r of pgLoansRes.rows) {
    let sched: any[] = [];
    if (typeof r.tabla_amortizacion === 'string') {
      try { sched = JSON.parse(r.tabla_amortizacion); } catch (e) { sched = []; }
    } else if (Array.isArray(r.tabla_amortizacion)) {
      sched = r.tabla_amortizacion;
    }
    const lObj = {
      id: r.id,
      studentId: r.alumno_id,
      termMonths: Number(r.plazo_meses),
      propertyTitle: r.garantia_inmueble_titulo,
      schedule: sched
    };
    const curList = candidateLoansByStudent.get(r.alumno_id) || [];
    curList.push(lObj);
    candidateLoansByStudent.set(r.alumno_id, curList);
  }

  for (const student of students) {
    console.log(`\n--- Checking student ${student.id} (${student.name}, username: ${student.username}, balance: ${student.balance}) ---`);
    const pendingItems: any[] = [];

    // Obligations
    if (db.paymentObligations) {
      for (const ob of db.paymentObligations) {
        if (ob.acquisitionId && ob.acquisitionId.startsWith('promissory_')) continue;
        if (ob.studentId === student.id && (ob.status === 'pendiente' || ob.status === 'vencido')) {
          const dDate = new Date(ob.dueDate);
          if (dDate <= now) {
            pendingItems.push({
              id: ob.id,
              sourceType: 'obligation',
              dueDate: dDate,
              principal: ob.amount,
              concept: ob.propertyTitle,
              obligationRef: ob
            });
          }
        }
      }
    }

    // Loans
    let candidateLoans = candidateLoansByStudent.get(student.id) || [];
    console.log(`[AutoPay] candidateLoans for student.id '${student.id}': ${candidateLoans.length}`);
    for (const loan of candidateLoans) {
      (loan.schedule || []).forEach((row: any, idx: number) => {
        if (!row.paid) {
          const dDate = new Date(row.dueDate);
          if (dDate <= now) {
            const principal = row.payment;
            const penalty = calculateMonthlyPenaltyInterest(principal, dDate, now);
            const periodNum = row.period || idx + 1;
            pendingItems.push({
              id: `${loan.id}-row-${periodNum}`,
              sourceType: 'loan',
              dueDate: dDate,
              principal,
              penaltyInterest: penalty,
              loanId: loan.id,
              periodNum
            });
          }
        }
      });
    }

    console.log(`[AutoPay] Total pendingItems for student ${student.id}: ${pendingItems.length}`);
    for (const item of pendingItems) {
      console.log(`  - Item ${item.id} (${item.sourceType}), principal: ${item.principal}, penalty: ${item.penaltyInterest}, dueDate: ${item.dueDate.toISOString()}`);
    }
  }

  await dbPool.end();
}

async function main() {
  console.log('=== TEST 1: Calling with student.id "user-hn51cg6wi" ===');
  await runAutoPay('user-hn51cg6wi');
}

main().catch(console.error);
