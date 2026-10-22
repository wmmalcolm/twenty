const { spawn } = require('node:child_process');
const http = require('node:http');
const { Client } = require('pg');
const { createApp } = require('../../../packages/lbt-development/server.cjs');
const D = require('../../../packages/lbt-development/domain.cjs');
const fs = require('node:fs');
const children = [];
async function run(file, args = []) {
  await new Promise((resolve, reject) => {
    const p = spawn(process.execPath, [file, ...args], {
      cwd: '/app/packages/twenty-server',
      stdio: 'inherit',
    });
    children.push(p);
    p.on('error', reject);
    p.on('exit', (code) =>
      code === 0 ? resolve() : reject(Error('Twenty initialization failed')),
    );
  });
}
async function main() {
  if (fs.existsSync('/app/packages/twenty-server/.env'))
    throw Error('Ambiguous server env');
  const password = process.env.POSTGRES_PASSWORD;
  D.demand(
    password && /^[a-f0-9]{48}$/.test(password),
    500,
    'Use the generated desktop environment',
  );
  process.env.PG_DATABASE_URL = `postgres://postgres:${password}@127.0.0.1:55433/lbt_twenty_feasibility`;
  const c = new Client({ connectionString: process.env.PG_DATABASE_URL });
  await c.connect();
  const exists = (await c.query("SELECT to_regclass('core.workspace') AS name"))
    .rows[0].name;
  if (!exists) {
    await run('dist/database/scripts/setup-db.js');
    await run('dist/command/command.js', [
      'run-instance-commands',
      '--force',
      '--include-slow',
    ]);
  }
  const count = Number(
    (await c.query('SELECT count(*) FROM core.workspace')).rows[0].count,
  );
  if (count === 0)
    await run('dist/command/command.js', ['workspace:seed:dev', '--light']);
  const ws = await c.query('SELECT id FROM core.workspace');
  D.demand(
    ws.rowCount === 1 && ws.rows[0].id === D.workspaceId,
    500,
    'Refusing a non-synthetic workspace',
  );
  await c.end();
  const server = spawn(process.execPath, ['dist/main.js'], {
    cwd: '/app/packages/twenty-server',
    stdio: 'inherit',
  });
  children.push(server);
  server.on('exit', () => (process.exitCode = 1));
  let healthy = false;
  for (let i = 0; i < 90; i++) {
    try {
      healthy = (await fetch('http://127.0.0.1:4320/healthz')).ok;
    } catch {}
    if (healthy) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  D.demand(healthy, 500, 'Twenty failed health check');
  const pool = D.createPool(process.env.PG_DATABASE_URL);
  await D.migrate(pool);
  const app = createApp(pool);
  await new Promise((r) => app.listen(4330, '127.0.0.1', r));
  // Only this gateway is exposed to Docker's bridge; native API, DB and Redis have no host ports.
  // App authenticates every request and sees loopback; exact Host and Origin remain enforced.
  const proxy = http.createServer((req, res) => {
    const upstream = http.request(
      {
        hostname: '127.0.0.1',
        port: 4330,
        path: req.url,
        method: req.method,
        headers: req.headers,
      },
      (r) => {
        res.writeHead(r.statusCode, r.headers);
        r.pipe(res);
      },
    );
    upstream.on('error', () => {
      res.writeHead(502);
      res.end('Development service unavailable');
    });
    req.pipe(upstream);
  });
  proxy.listen(4331, '0.0.0.0', () =>
    console.log('Private synthetic LBT portal ready on mapped host port 4330'),
  );
  for (const signal of ['SIGTERM', 'SIGINT'])
    process.once(signal, () => {
      proxy.close();
      app.close(() => pool.end());
      for (const child of children)
        if (child.exitCode === null) child.kill('SIGTERM');
      setTimeout(() => process.exit(), 2000).unref();
    });
}
main().catch((e) => {
  console.error(e.message);
  for (const p of children) if (p.exitCode === null) p.kill();
  process.exitCode = 1;
});
