const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const D = require('../../../packages/lbt-development/domain.cjs');
const { createApp } = require('../../../packages/lbt-development/server.cjs');
require('dotenv').config({ path: '.devenv/lbt-feasibility/runtime.env' });
async function main() {
  const original = new URL(process.env.PG_DATABASE_URL);
  assert.equal(original.pathname, '/lbt_twenty_feasibility');
  assert.equal(original.hostname, '127.0.0.1');
  const admin = new Client({ connectionString: original.href });
  await admin.connect();
  const name = 'lbt_development_test_' + randomUUID().replaceAll('-', '');
  let pool, server;
  try {
    await admin.query(`CREATE DATABASE "${name}"`);
    original.pathname = '/' + name;
    pool = D.createPool(original.href);
    await D.migrate(pool);
    await D.migrate(pool);
    server = createApp(pool, { port: 4332 });
    await new Promise((r) => server.listen(4332, '127.0.0.1', r));
    const base = 'http://127.0.0.1:4332';
    async function request(route, body, cookie, key = randomUUID()) {
      const r = await fetch(base + route, {
        method: body ? 'POST' : 'GET',
        headers: {
          ...(body
            ? {
                'Content-Type': 'application/json',
                Origin: base,
                'Idempotency-Key': key,
              }
            : {}),
          ...(cookie ? { Cookie: cookie } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      return {
        status: r.status,
        body: r.headers.get('content-type')?.startsWith('application/json')
          ? await r.json()
          : await r.text(),
        cookie: r.headers.get('set-cookie')?.split(';')[0],
      };
    }
    const sessions = [];
    for (const p of D.principals) {
      const r = await request('/api/login', {
        email: p[1],
        password: 'tim@apple.dev',
      });
      assert.equal(r.status, 200, JSON.stringify(r));
      sessions.push(r.cookie);
    }
    const [scheduler, a, b, reviewer] = sessions;
    console.log(
      'PASS native Twenty password authentication for scheduler, two employees and reviewer; no persistent credential grants',
    );
    const state = async (cookie) =>
      (await request('/api/state', undefined, cookie)).body;
    const cmd = async (
      action,
      v,
      extra = {},
      cookie = scheduler,
      key = randomUUID(),
    ) =>
      request(
        '/api/command',
        {
          action,
          cycleId: v.cycle_id,
          expectedVersion: v.version,
          ...(action === 'complete' ? {} : { visitId: v.id }),
          ...extra,
        },
        cookie,
        key,
      );
    assert.equal((await request('/api/state')).status, 401);
    assert.equal(
      (
        await request('/api/login', {
          email: 'tim@apple.dev',
          password: 'wrong',
        })
      ).status,
      401,
    );
    assert.equal(
      (
        await request('/api/login', {
          email: 'tim@apple.dev',
          password: 'tim@apple.dev',
          role: 'reviewer',
        })
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          '/api/command',
          { action: 'generate', dueDate: '2026-11-10' },
          a,
        )
      ).status,
      403,
    );
    const generated = await request(
      '/api/command',
      { action: 'generate', dueDate: '2026-11-10' },
      scheduler,
    );
    assert.equal(generated.status, 200, JSON.stringify(generated));
    const again = await request(
      '/api/command',
      { action: 'generate', dueDate: '2026-11-10' },
      scheduler,
    );
    assert.equal(again.body.cycleId, generated.body.cycleId);
    assert.equal((await state(scheduler)).visits.length, 2);
    assert.equal((await state(a)).visits.length, 1);
    assert.equal((await state(b)).visits.length, 1);
    assert.equal((await request('/api/activity', undefined, a)).status, 403);
    console.log(
      'PASS native client reference → facility → equipment → idempotent cycle with exactly two visits; assigned-only portal lists',
    );
    let v = (await state(scheduler)).visits;
    // Fault after domain/event/outbox/receipt writes must roll everything back.
    const counts = async () => {
      const r = {};
      for (const table of ['reservations', 'events', 'outbox', 'receipts'])
        r[table] = Number(
          (await pool.query('SELECT count(*) FROM ' + table)).rows[0].count,
        );
      return r;
    };
    const before = await counts();
    const input = {
      action: 'book',
      cycleId: v[0].cycle_id,
      visitId: v[0].id,
      expectedVersion: v[0].version,
      start: '2026-11-10T14:00:00Z',
      end: '2026-11-10T15:00:00Z',
      instrumentId: 'meter-a',
    };
    await assert.rejects(
      D.command(
        pool,
        await D.actor(pool, D.principals[0][0]),
        input,
        randomUUID(),
        () => {
          throw new Error('injected fault after all writes');
        },
      ),
      /injected fault/,
    );
    assert.deepEqual(await counts(), before);
    assert.equal((await state(scheduler)).visits[0].starts_at, null);
    console.log(
      'PASS explicit PostgreSQL connection rolls back booking, reservations, version, audit, outbox and receipt together after injected failure',
    );
    const key = randomUUID();
    const booked = await request('/api/command', input, scheduler, key);
    assert.equal(booked.status, 200);
    assert.deepEqual(
      (await request('/api/command', input, scheduler, key)).body,
      booked.body,
    );
    assert.equal(
      (
        await request(
          '/api/command',
          { ...input, end: '2026-11-10T16:00:00Z' },
          scheduler,
          key,
        )
      ).status,
      409,
    );
    v = (await state(scheduler)).visits;
    const conflict = await cmd('book', v[1], {
      start: input.start,
      end: input.end,
      instrumentId: 'meter-a',
    });
    assert.equal(conflict.status, 409);
    assert.equal((await state(scheduler)).visits[1].starts_at, null);
    assert.equal(
      (
        await cmd('book', v[1], {
          start: '2026-11-10T15:00:00Z',
          end: '2026-11-10T16:00:00Z',
          instrumentId: 'meter-a',
        })
      ).status,
      200,
    );
    v = (await state(scheduler)).visits;
    const race = await Promise.all([
      cmd('book', v[0], {
        start: '2026-11-10T17:00:00Z',
        end: '2026-11-10T18:00:00Z',
        instrumentId: 'meter-a',
      }),
      cmd('book', v[1], {
        start: '2026-11-10T17:00:00Z',
        end: '2026-11-10T18:00:00Z',
        instrumentId: 'meter-a',
      }),
    ]);
    assert.deepEqual(race.map((r) => r.status).sort(), [200, 409]);
    console.log(
      'PASS shared-meter overlap rejected, adjacent visits accepted, concurrent scheduling has one winner, idempotency replay and changed-intent denial',
    );
    v = (await state(scheduler)).visits;
    assert.equal((await cmd('complete', v[0])).status, 409);
    assert.equal(
      (await cmd('execute', v[1], { syntheticEvidence: true }, a)).status,
      404,
    );
    // Assignment changes affect subsequent requests, not just the visible UI.
    assert.equal(
      (await cmd('reassign', v[0], { assignee: D.principals[2][0] })).status,
      200,
    );
    assert.equal((await state(a)).visits.length, 0);
    v = (await state(scheduler)).visits;
    assert.equal(
      (await cmd('execute', v[0], { syntheticEvidence: true }, a)).status,
      404,
    );
    assert.equal(
      (await cmd('reassign', v[0], { assignee: D.principals[1][0] })).status,
      200,
    );
    console.log(
      'PASS assignment revocation takes effect on list and direct command; early completion denied',
    );
    for (const cookie of [a, b]) {
      let visit = (await state(cookie)).visits[0];
      assert.equal(
        (await cmd('submit', visit, { text: 'SYNTHETIC: premature' }, cookie))
          .status,
        409,
      );
      assert.equal(
        (await cmd('execute', visit, { syntheticEvidence: true }, cookie))
          .status,
        200,
      );
      visit = (await state(cookie)).visits[0];
      assert.equal(
        (
          await cmd(
            'submit',
            visit,
            { text: 'SYNTHETIC: report for visit ' + visit.ordinal },
            cookie,
          )
        ).status,
        200,
      );
    }
    v = (await state(scheduler)).visits;
    const reportId = v[0].report.id,
      path = '/api/reports/' + reportId + '/file';
    assert.equal((await request(path)).status, 401);
    assert.equal((await request(path, undefined, b)).status, 404);
    assert.equal(
      (await request(path, undefined, a)).body,
      'SYNTHETIC: report for visit 1',
    );
    assert.equal(
      (await request(path + '?token=forged', undefined, b)).status,
      404,
    );
    await pool.query('UPDATE principals SET active=false WHERE id=$1', [
      D.principals[1][0],
    ]);
    assert.equal((await request(path, undefined, a)).status, 403);
    await pool.query('UPDATE principals SET active=true WHERE id=$1', [
      D.principals[1][0],
    ]);
    assert.equal(
      (await cmd('review', v[0], { reportId, approved: true }, a)).status,
      403,
    );
    assert.equal(
      (await cmd('review', v[0], { reportId, approved: true }, reviewer))
        .status,
      200,
    );
    let first = (await state(a)).visits[0];
    assert.equal(
      (await cmd('submit', first, { text: 'SYNTHETIC: revised report' }, a))
        .status,
      200,
    );
    v = (await state(scheduler)).visits;
    assert.equal(v[0].report.revision, 2);
    assert.equal(v[0].report.approved, null);
    assert.equal(
      (await cmd('review', v[0], { reportId, approved: true }, reviewer))
        .status,
      409,
    );
    assert.equal((await cmd('complete', v[0])).status, 409);
    for (let i = 0; i < 2; i++) {
      v = (await state(reviewer)).visits;
      assert.equal(
        (
          await cmd(
            'review',
            v[i],
            { reportId: v[i].report.id, approved: true },
            reviewer,
          )
        ).status,
        200,
      );
    }
    await assert.rejects(
      pool.query('UPDATE reports SET body=$1 WHERE id=$2', [
        Buffer.from('tamper'),
        reportId,
      ]),
      /append-only/,
    );
    await assert.rejects(
      pool.query('DELETE FROM decisions WHERE report_id=$1', [reportId]),
      /append-only/,
    );
    console.log(
      'PASS report bytes require current session and assignment; cross-employee/anonymous/forged-token/deactivated access denied; version-specific independent review and immutable evidence',
    );
    v = (await state(scheduler)).visits;
    const closure = await Promise.all([
      cmd('complete', v[0]),
      cmd('complete', v[0]),
    ]);
    assert.deepEqual(closure.map((r) => r.status).sort(), [200, 409]);
    assert.equal((await state(scheduler)).visits[0].status, 'complete');
    first = (await state(a)).visits[0];
    assert.equal(
      (await cmd('submit', first, { text: 'SYNTHETIC: after closure' }, a))
        .status,
      409,
    );
    // Isolate the instrument rule: different cycles, equipment and employees share only meter-a.
    const auxiliary = [];
    for (let i = 0; i < 2; i++) {
      const equipment = 'instrument-isolation-' + i,
        cycleId = randomUUID(),
        visitId = randomUUID();
      await pool.query("INSERT INTO equipment VALUES($1,'facility-a',$2)", [
        equipment,
        'Synthetic conflict fixture ' + i,
      ]);
      await pool.query(
        "INSERT INTO cycles(id,equipment_id,due_date) VALUES($1,$2,'2026-11-10')",
        [cycleId, equipment],
      );
      await pool.query(
        'INSERT INTO visits(id,cycle_id,ordinal,assignee) VALUES($1,$2,1,$3)',
        [visitId, cycleId, D.principals[i + 1][0]],
      );
      auxiliary.push({ id: visitId, cycle_id: cycleId, version: 1 });
    }
    const interval = {
      start: '2026-11-10T19:00:00Z',
      end: '2026-11-10T20:00:00Z',
      instrumentId: 'meter-a',
    };
    assert.equal((await cmd('book', auxiliary[0], interval)).status, 200);
    assert.equal((await cmd('book', auxiliary[1], interval)).status, 409);
    assert.equal(
      (
        await pool.query('SELECT starts_at FROM visits WHERE id=$1', [
          auxiliary[1].id,
        ])
      ).rows[0].starts_at,
      null,
    );
    console.log(
      'PASS instrument-only conflict across different cycles, equipment and employees; losing booking leaves no visit time',
    );
    const totals = await counts();
    assert.equal(totals.events, totals.outbox);
    console.log(
      'PASS controlled completion requires both current approvals; concurrent completion has one winner; completed cycle rejects mutation; audit/outbox counts match',
    );
    console.log(
      'LIMIT: These controls protect the dedicated LBT API, not native Twenty generic APIs; native RLS remains license-gated.',
    );
  } finally {
    if (server) await new Promise((r) => server.close(r));
    if (pool) await pool.end();
    await admin.query(`DROP DATABASE IF EXISTS "${name}"`);
    await admin.end();
  }
}
main().catch((e) => {
  console.error(e.stack);
  process.exitCode = 1;
});
