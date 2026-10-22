const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const assert = require('node:assert/strict');
const D = require('../../../packages/lbt-development/domain.cjs');
require('dotenv').config({ path: '.devenv/lbt-feasibility/runtime.env' });
const dockerArgs = ['--host=unix:///var/run/docker.sock'];
const container = 'lbt-twenty-feasibility-database-1';
async function docker(args, { input, output } = {}) {
  await new Promise((resolve, reject) => {
    const p = spawn('docker', [...dockerArgs, ...args], {
      stdio: [input ? 'pipe' : 'ignore', output ? 'pipe' : 'ignore', 'pipe'],
    });
    let error = '';
    p.stderr.on('data', (b) => (error += b.toString()));
    if (input) fs.createReadStream(input).pipe(p.stdin);
    if (output) p.stdout.pipe(fs.createWriteStream(output, { mode: 0o600 }));
    p.on('error', reject);
    p.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            Error('Docker database operation failed: ' + error.slice(0, 300)),
          ),
    );
  });
}
async function snapshot(c) {
  const result = {};
  for (const table of [
    'principals',
    'facilities',
    'equipment',
    'cycles',
    'resources',
    'visits',
    'reservations',
    'reports',
    'decisions',
    'events',
    'outbox',
    'receipts',
  ])
    result[table] = (
      await c.query(
        `SELECT row_to_json(t) AS row FROM lbt_development.${table} t ORDER BY row_to_json(t)::text`,
      )
    ).rows;
  result.nativeWorkspace = (
    await c.query('SELECT id FROM core.workspace ORDER BY id')
  ).rows;
  return result;
}
async function main() {
  const u = new URL(process.env.PG_DATABASE_URL);
  assert.equal(u.hostname, '127.0.0.1');
  assert.equal(u.pathname, '/lbt_twenty_feasibility');
  const source = new Client({ connectionString: u.href });
  await source.connect();
  const name = 'lbt_restore_' + randomUUID().replaceAll('-', '');
  let restored;
  const dir = path.resolve('.devenv/lbt-feasibility/backups', name);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  try {
    const before = await snapshot(source);
    assert.equal(before.cycles[0].row.status, 'complete');
    assert.equal(before.reports.length, 2);
    await docker(
      [
        'exec',
        container,
        'pg_dump',
        '-U',
        'postgres',
        '-Fc',
        '--no-owner',
        '--no-acl',
        'lbt_twenty_feasibility',
      ],
      { output: path.join(dir, 'database.dump') },
    );
    await source.query(`CREATE DATABASE "${name}"`);
    await docker(
      [
        'exec',
        '-i',
        container,
        'pg_restore',
        '-U',
        'postgres',
        '--exit-on-error',
        '--no-owner',
        '--no-acl',
        '-d',
        name,
      ],
      { input: path.join(dir, 'database.dump') },
    );
    u.pathname = '/' + name;
    restored = new Client({ connectionString: u.href });
    await restored.connect();
    assert.deepEqual(await snapshot(restored), before);
    for (const r of (
      await restored.query('SELECT body,sha256 FROM lbt_development.reports')
    ).rows)
      assert.equal(D.digest(r.body), r.sha256);
    // Report bytes are in the transactional DB; native file storage is separately copied and byte-verified.
    const storage = path.resolve('.devenv/lbt-feasibility/storage');
    const copy = path.join(dir, 'native-storage');
    fs.cpSync(storage, copy, { recursive: true });
    let files = 0;
    function verify(folder, relative = '') {
      for (const e of fs.readdirSync(folder, { withFileTypes: true })) {
        const p = path.join(relative, e.name);
        if (e.isDirectory()) verify(path.join(folder, e.name), p);
        else if (e.isFile()) {
          assert.equal(
            D.digest(fs.readFileSync(path.join(storage, p))),
            D.digest(fs.readFileSync(path.join(copy, p))),
          );
          files++;
        }
      }
    }
    verify(storage);
    console.log(
      'PASS full PostgreSQL dump restored into a new isolated database; all 12 LBT tables and native workspace IDs match exactly',
    );
    console.log(
      'PASS restored completed cycle, both report byte hashes, approvals, reservations, audit, receipts and captured outbox',
    );
    console.log(
      'PASS native local-file storage copied and SHA-256 checked: ' +
        files +
        ' files',
    );
    console.log(
      'LIMIT: App-secret/runtime config is retained separately; this is a data restore test, not a full fresh Mac application restoration.',
    );
  } finally {
    if (restored) await restored.end();
    await source.query(`DROP DATABASE IF EXISTS "${name}"`);
    await source.end();
  }
}
main().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
