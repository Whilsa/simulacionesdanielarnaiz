import fs from 'fs';
import pg from 'pg';

const dbPool = new pg.Pool({
  connectionString: 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function testServerAutoPay() {
  console.log('[Test] Starting server autopay test...');
  // Let's see what candidate notes are being processed in processDiscountedPromissoryNotesMaturityPG
  const candidateQuery = await dbPool.query(
    `SELECT id, invoice_data->>'status' as status, invoice_data->>'dueDate' as due_date
     FROM market_messages 
     WHERE type = 'promissory_note'
       AND (invoice_data->>'status' = 'descontado' OR invoice_data->>'status' = 'gestion_cobro')
       AND (invoice_data->>'maturityProcessed' IS NULL OR invoice_data->>'maturityProcessed' = 'false')
     ORDER BY id ASC`
  );
  console.log(`[Test] Total candidates: ${candidateQuery.rows.length}`);

  let overdueCount = 0;
  const now = new Date();
  for (const row of candidateQuery.rows) {
    if (new Date(row.due_date) <= now) {
      overdueCount++;
      console.log(`[Test] Overdue note: ${row.id}, due: ${row.due_date}, status: ${row.status}`);
    }
  }
  console.log(`[Test] Total overdue notes: ${overdueCount}`);

  await dbPool.end();
}

testServerAutoPay().catch(console.error);
