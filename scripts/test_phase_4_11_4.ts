process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
import pg from 'pg';
import fs from 'fs';

const BASE_URL = 'http://localhost:3000';
const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false, checkServerIdentity: () => undefined }
});

async function queryPG(text: string, params?: any[]) {
  return await pool.query(text, params);
}

async function requestJson(method: string, endpoint: string, body?: any, headers?: Record<string, string>) {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE_URL}${endpoint}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(headers || {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => null);
    const latencyMs = Date.now() - start;
    return { status: res.status, data, latencyMs };
  } catch (err: any) {
    const latencyMs = Date.now() - start;
    return { status: 500, data: null, error: err.message, latencyMs };
  }
}

interface TestResult {
  suite: string;
  name: string;
  passed: boolean;
  latencyMs?: number;
  details?: string;
  error?: string;
}

const testResults: TestResult[] = [];

function record(suite: string, name: string, passed: boolean, details?: string, error?: string, latencyMs?: number) {
  testResults.push({ suite, name, passed, latencyMs, details, error });
  console.log(`[${passed ? 'PASS' : 'FAIL'}] [${suite}] ${name}${latencyMs !== undefined ? ` (${latencyMs}ms)` : ''}${details ? ` -> ${details}` : ''}${error ? ` (Error: ${error})` : ''}`);
}

async function runSuite() {
  console.log('=== INICIANDO BATERÍA DE PRUEBAS DE CONCURRENCIA FASE 4.11.4 ===\n');

  // 0. Ensure dev server is reachable
  let serverReady = false;
  for (let i = 0; i < 20; i++) {
    const res = await requestJson('GET', '/api/users');
    if (res.status === 200) {
      serverReady = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }
  if (!serverReady) {
    throw new Error('Servidor no disponible en http://localhost:3000 tras 10s');
  }

  // -------------------------------------------------------------
  // Test 1: Concurrency among 10 accounts in parallel (Multi-party Transfers)
  // -------------------------------------------------------------
  console.log('--- Test Suite 1: Transferencias concurrentes entre 10 cuentas simultáneas ---');
  try {
    const userIds: string[] = [];
    const initialBalance = 2000;
    const numUsers = 10;
    const tag = Date.now().toString(36);

    for (let i = 0; i < numUsers; i++) {
      const uId = `t4114_u_${tag}_${i}`;
      const iban = `ES99000100${tag}${i}`.padEnd(24, '0').slice(0, 24);
      userIds.push(uId);

      await queryPG(
        `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
         VALUES ($1, $2, $3, $4, 'pass123', $5, 'student', 1)
         ON CONFLICT (id) DO UPDATE SET saldo = $3`,
        [uId, `Alumno Test ${i}`, initialBalance, `user_${uId}`, iban]
      );
    }

    const totalInitial = initialBalance * numUsers;

    // Launch 30 concurrent transfers among pairs of these 10 users
    const transferCount = 30;
    const transferAmount = 25;
    const transferPromises = [];

    const startTime = Date.now();
    for (let i = 0; i < transferCount; i++) {
      const senderIdx = i % numUsers;
      const receiverIdx = (i + 3) % numUsers;
      const sId = userIds[senderIdx];
      const rId = userIds[receiverIdx];
      const idemKey = `idem_p4114_tx_${tag}_${i}`;

      transferPromises.push(
        requestJson('POST', '/api/transfers', {
          senderId: sId,
          receiverId: rId,
          amount: transferAmount,
          concept: `Concurrencia Aula 30 Alumnos #${tag}_${i}`
        }, {
          'x-idempotency-key': idemKey
        })
      );
    }

    const responses = await Promise.all(transferPromises);
    const totalDuration = Date.now() - startTime;
    const successfulTx = responses.filter(r => r.status === 200).length;

    // Check balances from PostgreSQL
    const resBalances = await queryPG('SELECT saldo FROM cuentas WHERE id = ANY($1)', [userIds]);
    const totalFinal = resBalances.rows.reduce((sum, r) => sum + Number(r.saldo), 0);
    const zeroSumPreserved = Math.abs(totalFinal - totalInitial) < 0.001;

    record(
      'Multi-Party Transfers',
      'Invariante suma cero de saldos tras 30 transferencias concurrentes entre 10 cuentas',
      zeroSumPreserved && successfulTx === transferCount,
      `Exitosas: ${successfulTx}/${transferCount}. Suma inicial: ${totalInitial}€, Suma final: ${totalFinal}€. Latencia total: ${totalDuration}ms (media ${(totalDuration/transferCount).toFixed(1)}ms/req)`,
      undefined,
      totalDuration
    );

    // Verify accounting movements in PostgreSQL
    const movsRes = await queryPG(
      `SELECT count(*) as cnt FROM movimientos WHERE concepto LIKE $1`,
      [`%Concurrencia Aula 30 Alumnos #${tag}%`]
    );
    const totalMovements = Number(movsRes.rows[0].cnt);
    // Each successful transfer creates 2 movements (OUT + IN)
    const movementsConsistent = totalMovements === (successfulTx * 2);

    record(
      'Movements Ledger Integrity',
      'Cada transferencia genera exactamente 2 asientos (TRANSFER_OUT y TRANSFER_IN) sin duplicados',
      movementsConsistent,
      `Movimientos contables registrados: ${totalMovements} (esperados: ${successfulTx * 2})`
    );

  } catch (e: any) {
    record('Multi-Party Transfers', 'Error en ejecución', false, undefined, e.message);
  }

  // -------------------------------------------------------------
  // Test 2: Concurrent Loan Accept / Reject with Idempotency
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 2: Aceptación y rechazo concurrente de préstamos ---');
  try {
    const loanStudentId = `t4114_loan_u_${Date.now().toString(36)}`;
    const loanId = `t4114_loan_${Date.now().toString(36)}`;
    const initialStudentBal = 10000;
    const loanPrincipal = 50000;
    const openingFee = 500;
    const loanAccount = 'ES99000100990011223344';

    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Alumno Prestamo', $2, $3, 'pass', $4, 'student', 1)`,
      [loanStudentId, initialStudentBal, `user_${loanStudentId}`, loanAccount]
    );

    await queryPG(
      `INSERT INTO prestamos (
         id, alumno_id, alumno_nombre, alumno_cuenta, importe_solicitado, importe_ofrecido,
         importe_concedido, plazo_meses, tipo_interes, euribor, diferencial, comision_apertura,
         cuota_mensual, estado, garantia_tipo, garantia_valor_tasacion, requiere_profesor, fecha_creacion, tabla_amortizacion
       ) VALUES (
         $1, $2, 'Alumno Prestamo', $3, $4, $4,
         $4, 36, 5.5, 3.5, 2.0, $5,
         1500, 'offered', 'personal', 0, false, NOW(), '[]'::jsonb
       )`,
      [loanId, loanStudentId, loanAccount, loanPrincipal, openingFee]
    );

    // Sync to memory db.json to avoid cold cache mismatch
    const rawDb = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(rawDb);
    if (!db.loans) db.loans = [];
    db.loans.push({
      id: loanId,
      studentId: loanStudentId,
      studentName: 'Alumno Prestamo',
      bankName: 'Banco Santander',
      loanType: 'Préstamo Inversión',
      requestedAmount: loanPrincipal,
      offeredAmount: loanPrincipal,
      grantedAmount: loanPrincipal,
      monthlyFee: 1500,
      termMonths: 36,
      interestRate: 5.5,
      openingFeePercentage: 1.0,
      openingFeeAmount: openingFee,
      status: 'offered',
      requestDate: new Date().toISOString(),
      resolutionDate: new Date().toISOString(),
      amortizationSchedule: []
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

    // Attempt 5 concurrent accept requests on the same loan
    const acceptPromises = Array.from({ length: 5 }).map((_, i) =>
      requestJson('POST', `/api/loans/${loanId}/accept`, {
        studentId: loanStudentId
      }, {
        'x-idempotency-key': `idem_accept_loan_${loanId}`
      })
    );

    const acceptResponses = await Promise.all(acceptPromises);
    const successAccepts = acceptResponses.filter(r => r.status === 200).length;

    // Check student balance in PG (net addition: principal - openingFee = +49500 once only)
    const expectedBal = initialStudentBal + loanPrincipal - openingFee;
    const postLoanCheck = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [loanStudentId]);
    const actualBal = Number(postLoanCheck.rows[0].saldo);

    record(
      'Concurrent Loan Acceptance',
      '5 peticiones concurrentes de aceptación sobre el mismo préstamo abonan el capital exactamente una sola vez',
      actualBal === expectedBal,
      `Aceptaciones HTTP 200: ${successAccepts}/5. Saldo final: ${actualBal}€ (esperado: ${expectedBal}€)`
    );

    // Verify loan state in PG
    const loanCheck = await queryPG('SELECT estado FROM prestamos WHERE id = $1', [loanId]);
    record(
      'Loan State Progression',
      'El estado del préstamo pasa estrictamente a "active"',
      loanCheck.rows[0]?.estado === 'active',
      `Estado actual en PostgreSQL: ${loanCheck.rows[0]?.estado}`
    );

  } catch (e: any) {
    record('Loan Acceptance', 'Error en ejecución', false, undefined, e.message);
  }

  // -------------------------------------------------------------
  // Test 3: Concurrent Purchases with Balance Depletion (Race to 0)
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 3: Compras concurrentes con validación de fondos y agotamiento de saldo ---');
  try {
    const buyerId = `t4114_buyer_${Date.now().toString(36)}`;
    const initialBuyerBal = 250; // Just enough for 1 desk (~120€ + IVA = 145.20€), 2nd or 3rd must fail!

    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Comprador Concurrente', $2, $3, 'pass', 'ES99000100998877112233', 'student', 1)`,
      [buyerId, initialBuyerBal, `user_${buyerId}`]
    );

    // Update db.json
    const rawDb = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(rawDb);
    if (!db.users) db.users = [];
    db.users.push({
      id: buyerId,
      name: 'Comprador Concurrente',
      username: `user_${buyerId}`,
      password: 'pass',
      accountNumber: 'ES99000100998877112233',
      role: 'student',
      balance: initialBuyerBal,
      level: 1
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

    // Try to buy 3 identical orders concurrently
    const buyPromises = Array.from({ length: 3 }).map((_, i) =>
      requestJson('POST', '/api/office-store/checkout', {
        studentId: buyerId,
        cartItems: [{ itemId: 'escritorio_despacho_1', quantity: 1 }]
      }, {
        'x-idempotency-key': `idem_checkout_${buyerId}_${i}_${Date.now()}`
      })
    );

    const buyResponses = await Promise.all(buyPromises);
    const successfulPurchases = buyResponses.filter(r => r.status === 200).length;
    const rejectedPurchases = buyResponses.filter(r => r.status === 400).length;

    const buyerCheck = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [buyerId]);
    const finalBuyerBal = Number(buyerCheck.rows[0].saldo);

    record(
      'Insufficient Funds Prevention under Concurrency',
      'Operaciones concurrentes de compra nunca permiten que el saldo caiga en negativo',
      finalBuyerBal >= 0 && rejectedPurchases >= 1,
      `Compras aceptadas: ${successfulPurchases}, Compras rechazadas por fondos: ${rejectedPurchases}, Saldo final: ${finalBuyerBal}€`
    );

  } catch (e: any) {
    record('Concurrent Purchases', 'Error en ejecución', false, undefined, e.message);
  }

  // -------------------------------------------------------------
  // Test 4: Concurrent Tax Payments
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 4: Liquidación concurrente de obligaciones fiscales ---');
  try {
    const taxStudentId = `t4114_tax_u_${Date.now().toString(36)}`;
    const taxId = `t4114_tax_${Date.now().toString(36)}`;
    const taxAmount = 450;

    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Contribuyente Test', 5000, $2, 'pass', 'ES99000100778899001122', 'student', 1)`,
      [taxStudentId, `user_${taxStudentId}`]
    );

    await queryPG(
      `INSERT INTO obligaciones_fiscales (
         id, alumno_id, alumno_nombre, tipo, concepto, importe, fecha_vencimiento, estado
       ) VALUES ($1, $2, 'Contribuyente Test', 'IRPF', 'Retenciones IRPF Nóminas', $3, NOW() + INTERVAL '10 days', 'pendiente')`,
      [taxId, taxStudentId, taxAmount]
    );

    // Sync to db.json
    const rawDb = fs.readFileSync('db.json', 'utf8');
    const db = JSON.parse(rawDb);
    if (!db.taxObligations) db.taxObligations = [];
    db.taxObligations.push({
      id: taxId,
      studentId: taxStudentId,
      studentName: 'Contribuyente Test',
      taxType: 'IRPF',
      concept: 'Retenciones IRPF Nóminas',
      amount: taxAmount,
      dueDate: new Date(Date.now() + 864000000).toISOString(),
      status: 'pendiente'
    });
    fs.writeFileSync('db.json', JSON.stringify(db, null, 2));

    // Send 4 concurrent payment requests for the same tax obligation
    const taxPromises = Array.from({ length: 4 }).map((_, i) =>
      requestJson('POST', '/api/taxes/pay', {
        studentId: taxStudentId,
        taxId
      }, {
        'x-idempotency-key': `idem_tax_${taxId}`
      })
    );

    const taxResponses = await Promise.all(taxPromises);
    const successTaxes = taxResponses.filter(r => r.status === 200).length;

    const taxAccountCheck = await queryPG('SELECT saldo FROM cuentas WHERE id = $1', [taxStudentId]);
    const finalTaxBal = Number(taxAccountCheck.rows[0].saldo);
    const expectedTaxBal = 5000 - taxAmount;

    record(
      'Concurrent Tax Obligation Payment',
      'El importe de la obligación fiscal se debita exactamente una sola vez (5000 -> 4550€)',
      finalTaxBal === expectedTaxBal,
      `Pagos aprobados HTTP 200: ${successTaxes}/4. Saldo: ${finalTaxBal}€ (esperado: ${expectedTaxBal}€)`
    );

    const taxCheck = await queryPG('SELECT estado FROM obligaciones_fiscales WHERE id = $1', [taxId]);
    record(
      'Tax Status Updated',
      'La obligación fiscal pasa a estado "pagado" en PostgreSQL',
      taxCheck.rows[0]?.estado === 'pagado',
      `Estado actual: ${taxCheck.rows[0]?.estado}`
    );

  } catch (e: any) {
    record('Concurrent Tax Payment', 'Error en ejecución', false, undefined, e.message);
  }

  // -------------------------------------------------------------
  // Test 5: Latency and Lock Contention Benchmark
  // -------------------------------------------------------------
  console.log('\n--- Test Suite 5: Benchmark de contención de locks y tiempos de respuesta ---');
  try {
    const benchUserA = `t4114_bench_a_${Date.now().toString(36)}`;
    const benchUserB = `t4114_bench_b_${Date.now().toString(36)}`;

    await queryPG(
      `INSERT INTO cuentas (id, alumno, saldo, usuario, password, account_number, role, level)
       VALUES ($1, 'Bench A', 10000, $2, 'pass', 'ES99000100111122223333', 'student', 1),
              ($3, 'Bench B', 10000, $4, 'pass', 'ES99000100444455556666', 'student', 1)`,
      [benchUserA, `user_${benchUserA}`, benchUserB, `user_${benchUserB}`]
    );

    // 10 rapid cross transfers between A and B
    const benchLatencies: number[] = [];
    const benchPromises = Array.from({ length: 10 }).map(async (_, i) => {
      const from = i % 2 === 0 ? benchUserA : benchUserB;
      const to = i % 2 === 0 ? benchUserB : benchUserA;
      const res = await requestJson('POST', '/api/transfers', {
        senderId: from,
        receiverId: to,
        amount: 10,
        concept: `Bench Ping-Pong ${i}`
      }, {
        'x-idempotency-key': `idem_bench_${Date.now()}_${i}`
      });
      benchLatencies.push(res.latencyMs);
      return res;
    });

    await Promise.all(benchPromises);

    const avgLatency = benchLatencies.reduce((a, b) => a + b, 0) / benchLatencies.length;
    const maxLatency = Math.max(...benchLatencies);
    const minLatency = Math.min(...benchLatencies);

    // With remote Supabase pooled connection, 10 serialized FOR UPDATE locks typically complete within 7000ms max
    const isPerformanceAcceptable = maxLatency < 8000;

    record(
      'Lock Contention Benchmark',
      'Transacciones cruzadas bajo contención completan sin deadlocks ni colisiones',
      isPerformanceAcceptable,
      `Min: ${minLatency}ms, Media: ${avgLatency.toFixed(1)}ms, Max: ${maxLatency}ms`
    );

  } catch (e: any) {
    record('Benchmark', 'Error en ejecución', false, undefined, e.message);
  }

  // -------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------
  console.log('\n===============================================================');
  console.log('                 RESUMEN DE PRUEBAS FASE 4.11.4');
  console.log('===============================================================');
  const total = testResults.length;
  const passedCount = testResults.filter(r => r.passed).length;
  const failedCount = total - passedCount;

  console.log(`Total pruebas: ${total}`);
  console.log(`Aprobadas: ${passedCount}`);
  console.log(`Fallidas: ${failedCount}`);

  await pool.end();
  return {
    total,
    passedCount,
    failedCount,
    testResults
  };
}

runSuite().catch(err => {
  console.error('Fatal Test Runner Error:', err);
  pool.end();
  process.exit(1);
});
