import fs from 'fs';
import pg from 'pg';

const SUPABASE_URL = process.env.DATABASE_URL || 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres';

interface RouteAudit {
  line: number;
  method: string;
  path: string;
  isClosed: boolean;
  closedPhase?: string;
  usesWithPostgresTransaction: boolean;
  usesSelectForUpdate: boolean;
  usesIdempotency: boolean;
  usesReadDb: boolean;
  usesWriteDb: boolean;
  usesSyncToSupabase: boolean;
  usesSafeDbQuery: boolean;
  hasPrematureResponse: boolean;
  modifiesMoney: boolean;
  modifiesInventory: boolean;
  modifiesAssignments: boolean;
  classification: 'A' | 'B' | 'C' | 'D' | 'E';
  notes: string;
  snippet?: string;
}

const serverCode = fs.readFileSync('server.ts', 'utf8');
const lines = serverCode.split('\n');

// Known closed routes from phases 3, 4.1, 4.2, 4.3, 4.4, 4.4.7.5-C1
const closedRouteMap: Record<string, string> = {
  // FASE 3
  '/api/transfers': 'FASE 3 — Operaciones Financieras',
  '/transfers': 'FASE 3 — Operaciones Financieras',
  '/api/bank/reconcile': 'FASE 3 — Operaciones Financieras',
  '/api/users/:id/adjust-balance': 'FASE 3 — Operaciones Financieras',
  '/users/:id/adjust-balance': 'FASE 3 — Operaciones Financieras',
  '/api/obligations/pay': 'FASE 3 — Operaciones Financieras',
  '/api/taxes/pay': 'FASE 3 — Operaciones Financieras',

  // FASE 4.1
  '/api/machinery/buy': 'FASE 4.1 — Maquinaria / Vehículos / Tienda',
  '/api/vehicles/buy': 'FASE 4.1 — Maquinaria / Vehículos / Tienda',
  '/api/vehicles/buy-cart': 'FASE 4.1 — Maquinaria / Vehículos / Tienda',
  '/api/office-store/checkout': 'FASE 4.1 — Maquinaria / Vehículos / Tienda',
  '/api/court/lawsuits': 'FASE 4.1 — Litigios iniciales',
  '/api/court/lawsuits/:id/preventative-embargo': 'FASE 4.1 — Litigios iniciales',
  '/api/court/lawsuits/:id/pay-settle': 'FASE 4.1 — Litigios iniciales',

  // FASE 4.2
  '/api/jobs/:id/hire': 'FASE 4.2 — Empleados',
  '/api/student/employees/:id/assign-machinery': 'FASE 4.2 — Empleados',
  '/api/student/employees/auto-assign-all': 'FASE 4.2 — Empleados',
  '/api/student/employees/unassign-all': 'FASE 4.2 — Empleados',
  '/api/student/employees/:id/assign-vehicle': 'FASE 4.2 — Empleados',

  // FASE 4.3
  '/api/raw-materials/announcements': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/teacher/raw-materials/announcements': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/announcements/:id': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/teacher/raw-materials/announcements/:id': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/negotiate': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/approve': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/reject': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/ship': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/deliver': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/confirm-receipt': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/raw-materials/orders/:id/send-invoice': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/student/machinery/:id/relocate': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/student/vehicles/:id/assign-warehouse': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/electricity/contract': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/electricity/floor-plan': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/inventory/transfer-stock': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',
  '/api/inventory/transfer-nave-stock': 'FASE 4.3 — Inventario / Materias Primas / Maquinaria',

  // FASE 4.4 / 4.4.7.5-C1
  '/api/market/messages/sign-promissory-note': 'FASE 4.4 — Pagarés y Judicial',
  '/api/market/messages/discount-promissory-note': 'FASE 4.4 — Pagarés y Judicial',
  '/api/market/messages/collection-management-promissory-note': 'FASE 4.4 — Pagarés y Judicial',
  '/api/market/messages/request-promissory-note-collection': 'FASE 4.4 — Pagarés y Judicial',
  '/api/market/messages/collect-promissory-note': 'FASE 4.4 — Pagarés y Judicial',
  '/api/court/lawsuits/:id/defendant-answer': 'FASE 4.4 — Pagarés y Judicial',
  '/api/court/lawsuits/:id/judge-ruling': 'FASE 4.4 — Pagarés y Judicial'
};

async function runAudit() {
  console.log('================================================================');
  console.log('AUDITORÍA FASE 4.8 — MAPEO COMPLETO DE RUTAS MUTADORAS');
  console.log('================================================================');

  // Match all route declarations: app.post, app.put, app.patch, app.delete
  // Handles single paths and array of paths
  const routeRegex = /app\.(post|put|patch|delete)\(\s*(\[[^\]]+\]|['"][^'"]+['"])/g;
  let match;
  const rawRoutes: { line: number; method: string; paths: string[]; endIndex: number; startIndex: number }[] = [];

  while ((match = routeRegex.exec(serverCode)) !== null) {
    const startIndex = match.index;
    const lineNum = serverCode.substring(0, startIndex).split('\n').length;
    const method = match[1].toUpperCase();
    const rawPaths = match[2];
    let paths: string[] = [];

    if (rawPaths.startsWith('[')) {
      paths = rawPaths
        .replace(/[\[\]'"]/g, '')
        .split(',')
        .map(s => s.trim())
        .filter(Boolean);
    } else {
      paths = [rawPaths.replace(/['"]/g, '').trim()];
    }

    rawRoutes.push({
      line: lineNum,
      method,
      paths,
      startIndex,
      endIndex: match.index + match[0].length
    });
  }

  console.log(`Total declaraciones de rutas mutadoras encontradas: ${rawRoutes.length}`);

  const audits: RouteAudit[] = [];

  for (let i = 0; i < rawRoutes.length; i++) {
    const curr = rawRoutes[i];
    const nextStart = i + 1 < rawRoutes.length ? rawRoutes[i + 1].startIndex : serverCode.length;
    // Extract handler code block (up to next route or max 4000 chars)
    const blockCode = serverCode.substring(curr.startIndex, Math.min(nextStart, curr.startIndex + 8000));

    for (const path of curr.paths) {
      const isClosed = Boolean(closedRouteMap[path]);
      const closedPhase = closedRouteMap[path];

      const usesWithPostgresTransaction = blockCode.includes('withPostgresTransaction');
      const usesSelectForUpdate = blockCode.includes('FOR UPDATE');
      const usesIdempotency = blockCode.includes('executeWithIdempotency') || blockCode.includes('operaciones_idempotencia');
      const usesReadDb = blockCode.includes('readDb(');
      const usesWriteDb = blockCode.includes('writeDb(');
      const usesSyncToSupabase = blockCode.includes('sync') && (blockCode.includes('ToSupabase') || blockCode.includes('scheduleDebouncedSyncAll'));
      const usesSafeDbQuery = blockCode.includes('safeDbQuery') || blockCode.includes('dbPool.query');

      const modifiesMoney = /saldo|balance|importe|amount|cuantia|transferencia|movimiento/i.test(blockCode);
      const modifiesInventory = /stock|materia|inventory|inventario|almacen|warehouse/i.test(blockCode);
      const modifiesAssignments = /assign|empleado|employee|operator|driver|maquinaria|vehiculo/i.test(blockCode);

      // Check premature response: res.json called before writeDb or sync or without await
      let hasPrematureResponse = false;
      const resJsonIdx = blockCode.indexOf('res.json(');
      const writeDbIdx = blockCode.indexOf('writeDb(');
      if (resJsonIdx !== -1 && writeDbIdx !== -1 && resJsonIdx < writeDbIdx) {
        hasPrematureResponse = true;
      }
      if (resJsonIdx !== -1 && blockCode.includes('sync') && blockCode.includes('ToSupabase')) {
        const syncIdx = blockCode.search(/sync\w+ToSupabase/);
        if (syncIdx !== -1 && resJsonIdx < syncIdx) {
          hasPrematureResponse = true;
        }
      }

      // Determine classification
      let classification: 'A' | 'B' | 'C' | 'D' | 'E';
      if (isClosed) {
        classification = 'A'; // Certified closed
      } else if (path.includes('/login') || path.includes('/acceso') || path.includes('/entrar') || blockCode.includes('// read only') || (!usesWriteDb && !usesWithPostgresTransaction && !blockCode.includes('UPDATE ') && !blockCode.includes('INSERT '))) {
        classification = 'E';
      } else if (usesWithPostgresTransaction) {
        classification = usesWriteDb ? 'B' : 'A';
      } else if (usesSyncToSupabase && !usesWithPostgresTransaction) {
        classification = 'D';
      } else if (usesWriteDb && !usesWithPostgresTransaction) {
        classification = 'C';
      } else {
        classification = 'B';
      }

      audits.push({
        line: curr.line,
        method: curr.method,
        path,
        isClosed,
        closedPhase,
        usesWithPostgresTransaction,
        usesSelectForUpdate,
        usesIdempotency,
        usesReadDb,
        usesWriteDb,
        usesSyncToSupabase,
        usesSafeDbQuery,
        hasPrematureResponse,
        modifiesMoney,
        modifiesInventory,
        modifiesAssignments,
        classification,
        notes: isClosed ? `CERRADO — EXCLUIDO DE LA AUDITORÍA DE PENDIENTES (${closedPhase})` : ''
      });
    }
  }

  console.log('\n--- RESUMEN POR CLASIFICACIÓN ---');
  const counts = { A: 0, B: 0, C: 0, D: 0, E: 0 };
  audits.forEach(a => counts[a.classification]++);
  console.log(`Total rutas analizadas: ${audits.length}`);
  console.log(`A (PG Transaccional Completo): ${counts.A}`);
  console.log(`B (PG Mayoritariamente Transaccional): ${counts.B}`);
  console.log(`C (Híbrida con riesgo Lost Update): ${counts.C}`);
  console.log(`D (Híbrida con sync asíncrona peligrosa): ${counts.D}`);
  console.log(`E (Solo Lectura / Auth): ${counts.E}`);

  console.log('\n--- RUTAS PENDIENTES CLASIFICADAS COMO C o D ---');
  const pendingCD = audits.filter(a => !a.isClosed && (a.classification === 'C' || a.classification === 'D'));
  pendingCD.forEach((a, idx) => {
    console.log(`${idx + 1}. [${a.classification}] L${a.line} [${a.method}] ${a.path}`);
    console.log(`   Money: ${a.modifiesMoney}, Inventory: ${a.modifiesInventory}, Assignments: ${a.modifiesAssignments}`);
    console.log(`   readDb: ${a.usesReadDb}, writeDb: ${a.usesWriteDb}, syncToSupabase: ${a.usesSyncToSupabase}, premature: ${a.hasPrematureResponse}`);
  });

  console.log('\n--- RUTAS PENDIENTES CLASIFICADAS COMO B (NO CERRADAS) ---');
  const pendingB = audits.filter(a => !a.isClosed && a.classification === 'B');
  pendingB.forEach((a, idx) => {
    console.log(`${idx + 1}. [B] L${a.line} [${a.method}] ${a.path}`);
  });

  // Save audit results to json for detailed reporting
  fs.writeFileSync('scripts/audit_phase_4_8_results.json', JSON.stringify(audits, null, 2));
  console.log('\nResultados exportados a scripts/audit_phase_4_8_results.json');
}

runAudit().catch(console.error);
