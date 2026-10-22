const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes } = require('node:crypto');
const { z } = require('zod');
const D = require('./domain.cjs');
const root = path.resolve(__dirname, '../..');
const nativeBase = 'http://127.0.0.1:4320';
async function native(query, variables, token) {
  const r = await fetch(nativeBase + '/metadata', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: 'Bearer ' + token } : {}),
    },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(30000),
  });
  const body = await r.json();
  D.demand(r.ok && !body.errors, 401, 'Twenty authentication failed');
  return body.data;
}
async function signIn(email, password) {
  const data = await native(
    'mutation($email:String!,$password:String!){signIn(email:$email,password:$password){availableWorkspaces{availableWorkspacesForSignIn{id loginToken workspaceUrls{subdomainUrl}}}}}',
    { email, password },
  );
  const w = data.signIn.availableWorkspaces.availableWorkspacesForSignIn.find(
    (w) => w.id === D.workspaceId,
  );
  D.demand(w, 403, 'Synthetic workspace membership required');
  const result = await native(
    'mutation($token:String!,$origin:String!){getAuthTokensFromLoginToken(loginToken:$token,origin:$origin){tokens{accessOrWorkspaceAgnosticToken{token}}}}',
    { token: w.loginToken, origin: w.workspaceUrls.subdomainUrl },
  );
  return result.getAuthTokensFromLoginToken.tokens
    .accessOrWorkspaceAgnosticToken.token;
}
async function identity(pool, token) {
  const { currentUser: u } = await native(
    '{currentUser{id email currentWorkspace{id}}}',
    {},
    token,
  );
  D.demand(u.currentWorkspace?.id === D.workspaceId, 403, 'Wrong workspace');
  const a = await D.actor(pool, u.id);
  D.demand(a.email === u.email, 403, 'Identity mismatch');
  return a;
}
const uuid = z.string().uuid();
const common = { cycleId: uuid, expectedVersion: z.number().int().positive() };
const commandSchema = z.discriminatedUnion('action', [
  z
    .object({ action: z.literal('generate'), dueDate: z.literal('2026-11-10') })
    .strict(),
  z
    .object({
      action: z.literal('book'),
      ...common,
      visitId: uuid,
      start: z.string().datetime(),
      end: z.string().datetime(),
      instrumentId: z.literal('meter-a'),
    })
    .strict(),
  z
    .object({
      action: z.literal('reassign'),
      ...common,
      visitId: uuid,
      assignee: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal('execute'),
      ...common,
      visitId: uuid,
      syntheticEvidence: z.literal(true),
    })
    .strict(),
  z
    .object({
      action: z.literal('submit'),
      ...common,
      visitId: uuid,
      text: z.string().max(16384),
    })
    .strict(),
  z
    .object({
      action: z.literal('review'),
      ...common,
      visitId: uuid,
      reportId: uuid,
      approved: z.boolean(),
    })
    .strict(),
  z.object({ action: z.literal('complete'), ...common }).strict(),
]);
async function readBody(req) {
  D.demand(
    req.headers['content-type']?.split(';')[0] === 'application/json',
    415,
    'JSON required',
  );
  const parts = [];
  let n = 0;
  for await (const chunk of req) {
    n += chunk.length;
    D.demand(n <= 20000, 413, 'Request too large');
    parts.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(parts));
  } catch {
    throw new D.Failure(400, 'Invalid JSON');
  }
}
function createApp(pool, { port = 4330 } = {}) {
  const sessions = new Map();
  const origin = `http://127.0.0.1:${port}`;
  const send = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  const server = http.createServer(async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    try {
      D.demand(
        ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(
          req.socket.remoteAddress,
        ),
        403,
        'Local development only',
      );
      D.demand(
        req.headers.host === `127.0.0.1:${port}`,
        403,
        'Use the exact local development address',
      );
      D.demand(['GET', 'POST'].includes(req.method), 405, 'Method not allowed');
      const url = new URL(req.url, origin);
      if (req.method === 'POST')
        D.demand(req.headers.origin === origin, 403, 'Origin denied');
      const assets = {
        '/': ['index.html', 'text/html'],
        '/app.js': ['app.js', 'text/javascript'],
        '/style.css': ['style.css', 'text/css'],
      };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [file, type] = assets[url.pathname];
        res.setHeader('Content-Type', type);
        return res.end(fs.readFileSync(path.join(__dirname, file)));
      }
      if (req.method === 'GET' && url.pathname === '/health') {
        await pool.query('SELECT 1');
        return send(res, 200, { status: 'ok', mode: 'synthetic', nativeBase });
      }
      const cookie = req.headers.cookie
        ?.split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('lbt_dev='))
        ?.slice(8);
      if (url.pathname === '/api/login' && req.method === 'POST') {
        const input = z
          .object({
            email: z.enum(D.principals.map((p) => p[1])),
            password: z.string().min(1).max(200),
          })
          .strict()
          .parse(await readBody(req));
        const token = await signIn(input.email, input.password);
        await identity(pool, token);
        // Memory-only native tokens; restart logs out all portal sessions. No new persistent credential grants.
        for (const [key, s] of sessions)
          if (s.until < Date.now()) sessions.delete(key);
        D.demand(sessions.size < 100, 429, 'Session limit reached');
        if (cookie) sessions.delete(D.digest(cookie));
        const id = randomBytes(32).toString('base64url');
        sessions.set(D.digest(id), { token, until: Date.now() + 3600000 });
        res.setHeader(
          'Set-Cookie',
          `lbt_dev=${id}; HttpOnly; SameSite=Strict; Path=/; Max-Age=3600`,
        );
        return send(res, 200, { ok: true });
      }
      const session = cookie && sessions.get(D.digest(cookie));
      D.demand(session && session.until > Date.now(), 401, 'Sign in required');
      const a = await identity(pool, session.token);
      if (url.pathname === '/api/logout' && req.method === 'POST') {
        sessions.delete(D.digest(cookie));
        res.setHeader(
          'Set-Cookie',
          'lbt_dev=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0',
        );
        return send(res, 200, { ok: true });
      }
      if (url.pathname === '/api/state' && req.method === 'GET')
        return send(res, 200, await D.snapshot(pool, a));
      if (url.pathname === '/api/command' && req.method === 'POST') {
        const input = commandSchema.parse(await readBody(req));
        if (input.action === 'generate') {
          D.demand(a.role === 'scheduler', 403, 'Scheduler required');
          // Native Company is the single customer master. Operational schema stores only its ID.
          let r = await fetch(nativeBase + '/rest/companies/' + D.companyId, {
            headers: { authorization: 'Bearer ' + session.token },
            signal: AbortSignal.timeout(30000),
          });
          if (r.status === 404) {
            r = await fetch(nativeBase + '/rest/companies', {
              method: 'POST',
              headers: {
                authorization: 'Bearer ' + session.token,
                'content-type': 'application/json',
              },
              body: JSON.stringify({
                id: D.companyId,
                name: 'SYNTHETIC LBT Demonstration Clinic',
              }),
              signal: AbortSignal.timeout(30000),
            });
          }
          D.demand(r.ok, 502, 'Native Twenty client record is unavailable');
        }
        return send(
          res,
          200,
          await D.command(pool, a, input, req.headers['idempotency-key']),
        );
      }
      const report = url.pathname.match(/^\/api\/reports\/([a-f0-9-]+)\/file$/);
      if (report && req.method === 'GET') {
        const file = await D.reportFile(pool, a, uuid.parse(report[1]));
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          'attachment; filename="synthetic-report.txt"',
        );
        res.setHeader('X-Content-SHA256', file.sha256);
        return res.end(file.body);
      }
      if (url.pathname === '/api/activity' && req.method === 'GET') {
        D.demand(
          ['scheduler', 'reviewer'].includes(a.role),
          403,
          'Scheduler or reviewer required',
        );
        return send(res, 200, {
          events: (
            await pool.query(
              'SELECT sequence,cycle_id,command,details FROM events ORDER BY sequence DESC LIMIT 40',
            )
          ).rows,
          outbox: (
            await pool.query('SELECT state,count(*) FROM outbox GROUP BY state')
          ).rows,
        });
      }
      throw new D.Failure(404, 'Not found');
    } catch (e) {
      const status =
        e instanceof D.Failure
          ? e.status
          : e instanceof z.ZodError
            ? 400
            : ['23P01', '23505', '55P03', '40P01'].includes(e.code)
              ? 409
              : 500;
      send(res, status, {
        error:
          status === 500
            ? 'Internal error'
            : status === 409 && !e.status
              ? 'Resource conflict or duplicate decision'
              : e instanceof z.ZodError
                ? 'Invalid request fields'
                : e.message,
      });
    }
  });
  server.requestTimeout = 35000;
  server.headersTimeout = 10000;
  return server;
}
async function main() {
  require('dotenv').config({
    path: path.join(root, '.devenv/lbt-feasibility/runtime.env'),
  });
  const pool = D.createPool(process.env.PG_DATABASE_URL);
  await D.migrate(pool);
  const app = createApp(pool);
  app.listen(4330, '127.0.0.1', () =>
    console.log(
      'LBT synthetic development service listening on loopback port 4330',
    ),
  );
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () =>
      app.close(() => pool.end().then(() => process.exit())),
    );
}
if (require.main === module)
  main().catch((e) => {
    console.error(e.message);
    process.exitCode = 1;
  });
module.exports = { createApp, identity, signIn };
