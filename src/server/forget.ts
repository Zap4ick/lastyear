/**
 * Handle a data request by hand (About page → "Your rights"). Lives in src/ so it ships in the image.
 *
 *   npm run forget -- --user=<last.fm username>            list what is held about that user
 *   npm run forget -- --user=<last.fm username> --delete   delete their results and cached lookups
 *   npm run forget -- --id=<result id> --delete            delete one result
 *
 * On Fly: fly ssh console -C "node_modules/.bin/tsx src/server/forget.ts --user=<name> --delete"
 * Safe while the server runs (SQLite WAL). Rendered PNGs of a deleted result can stay in the server's
 * memory, but are no longer served: every story request looks the result up first.
 */
import { parseArgs } from 'node:util';
import { openDb } from './db.ts';

try {
  process.loadEnvFile();
} catch {
  /* no .env */
}

const { values } = parseArgs({
  options: { user: { type: 'string' }, id: { type: 'string' }, delete: { type: 'boolean', default: false } },
});
if (!values.user === !values.id) {
  console.error('Pass exactly one of --user=<username> or --id=<result id>, plus --delete to delete.');
  process.exit(2);
}

const db = openDb(process.env.DB_PATH ?? 'data/lastyear.db');
try {
  if (values.user) {
    const rows = db.resultsOfUser(values.user);
    console.log(`${rows.length} result(s) for "${values.user}":`);
    for (const r of rows) console.log(`  ${r.id}  ${r.year}  updated ${r.updated_at}`);
    if (values.delete) {
      const gone = db.forgetUser(values.user);
      console.log(`Deleted ${gone.results} result(s) and ${gone.cached} cached lookup(s).`);
    } else {
      console.log('Nothing deleted (add --delete).');
    }
  } else {
    const row = db.getResult(values.id!);
    if (!row) {
      console.log(`No result "${values.id}".`);
    } else {
      console.log(`${row.id}  ${row.username}  ${row.year}  updated ${row.updated_at}`);
      if (values.delete) {
        db.deleteResult(row.id);
        console.log('Deleted.');
      } else {
        console.log('Nothing deleted (add --delete).');
      }
    }
  }
} finally {
  db.close();
}
