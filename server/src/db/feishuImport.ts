/**
 * One-shot Feishu → dashboard import.
 *   npm run sync:feishu
 * Requires FEISHU_APP_SECRET (+ FEISHU_* variables) in .env or ~/Desktop/.env.secrets
 */
import dotenv from 'dotenv';
import path from 'path';
import os from 'os';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
dotenv.config({ path: path.join(os.homedir(), 'Desktop/.env.secrets') });

import { syncFromFeishu } from '../services/feishuSync';

(async () => {
  try {
    console.log('Pulling visit schedule from Feishu…');
    const r = await syncFromFeishu();
    console.log('\n✅ Sync complete');
    console.log(`   scanned : ${r.scanned} rows`);
    console.log(`   imported: ${r.imported}  (downstream/confirmed only)`);
    console.log(`   skipped : ${r.skipped}  (still in Feishu funnel)`);
    console.log(`   removed : ${r.removed}  (regressed/deleted upstream — mirror cleaned)`);
    console.log(`   funnel  : ${JSON.stringify(r.funnel)}`);
    console.log(`   by stage: ${JSON.stringify(r.byStage)}`);
    console.log(`   campaigns: ${r.campaigns.join(', ')}`);
    process.exit(0);
  } catch (e) {
    console.error('\n❌ Sync failed:', e instanceof Error ? e.message : e);
    process.exit(1);
  }
})();
