import pg from 'pg';
import fs from 'fs';

const dbPool = new pg.Pool({
  connectionString: 'postgresql://postgres.qgjcytrtambfgnalpztk:802.11ABGDRAF@aws-0-eu-west-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function main() {
  console.log('Testing processDiscountedPromissoryNotesMaturityPG candidate query...');
  const t0 = Date.now();
  const candidateQuery = await dbPool.query(
    `SELECT id 
     FROM market_messages 
     WHERE type = 'promissory_note'
       AND (invoice_data->>'status' = 'descontado' OR invoice_data->>'status' = 'gestion_cobro')
       AND (invoice_data->>'maturityProcessed' IS NULL OR invoice_data->>'maturityProcessed' = 'false')
     ORDER BY id ASC`
  );
  console.log(`Candidate query took ${Date.now() - t0}ms, found ${candidateQuery.rows.length} rows`);

  let count = 0;
  for (const candidateRow of candidateQuery.rows) {
    count++;
    const tStart = Date.now();
    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      const msgResult = await client.query(
        `SELECT id, invoice_data FROM market_messages WHERE id = $1 FOR UPDATE`,
        [candidateRow.id]
      );
      await client.query('COMMIT');
    } finally {
      client.release();
    }
    console.log(`Row ${count} (${candidateRow.id}) took ${Date.now() - tStart}ms`);
    if (count >= 5) {
      console.log('Stopping test after 5 rows.');
      break;
    }
  }
  await dbPool.end();
}

main().catch(console.error);
