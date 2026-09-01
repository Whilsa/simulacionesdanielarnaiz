/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { execSync } from 'child_process';
import path from 'path';

export function seedInitialUsers(): boolean {
  try {
    const scriptPath = path.join(process.cwd(), 'cleanup_supabase.cjs');
    console.log('[DB Seed] Seeding initial users into Supabase & db.json...');
    const output = execSync(`node "${scriptPath}"`, {
      encoding: 'utf-8',
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' }
    });
    console.log(output);
    return true;
  } catch (err) {
    console.error('[DB Seed Error]', err);
    return false;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const success = seedInitialUsers();
  if (!success) {
    process.exit(1);
  }
}
