const { Pool } = require('pg');
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const companyId = '15b70000-0000-4000-8000-000000000001';
const principals = [
  ['20202020-9e3b-46d4-a556-88b9ddc2b034', 'tim@apple.dev', 'scheduler'],
  ['20202020-3957-4908-9c36-2929a23f8357', 'jony.ive@apple.dev', 'employee'],
  [
    '20202020-7169-42cf-bc47-1cfef15264b8',
    'phil.schiler@apple.dev',
    'employee',
  ],
  ['20202020-e6b5-4680-8a32-b8209737156b', 'jane.austen@apple.dev', 'reviewer'],
];
const digest = (value) => createHash('sha256').update(value).digest('hex');
class Failure extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const demand = (condition, status, message) => {
  if (!condition) throw new Failure(status, message);
};
function createPool(url) {
  const u = new URL(url);
  demand(
    u.hostname === '127.0.0.1' &&
      /^\/lbt_(twenty_feasibility|development_test_[a-z0-9]+|restore_[a-z0-9]+)$/.test(
        u.pathname,
      ) &&
      !u.search,
    500,
    'Dedicated local synthetic database required',
  );
  return new Pool({
    connectionString: url,
    options: '-c search_path=lbt_development,public',
    max: 8,
  });
}
async function transaction(pool, fn) {
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    await c.query("SET LOCAL lock_timeout='5s'");
    const value = await fn(c);
    await c.query('COMMIT');
    return value;
  } catch (e) {
    await c.query('ROLLBACK');
    throw e;
  } finally {
    c.release();
  }
}
async function migrate(pool) {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await transaction(pool, async (c) => {
    await c.query(
      "SELECT pg_advisory_xact_lock(hashtext('lbt_development_schema'))",
    );
    await c.query(
      'CREATE TABLE IF NOT EXISTS public.lbt_development_migrations(version int PRIMARY KEY,hash text NOT NULL)',
    );
    const prior = await c.query(
      'SELECT hash FROM public.lbt_development_migrations WHERE version=1',
    );
    if (prior.rowCount) {
      demand(
        prior.rows[0].hash === digest(sql),
        500,
        'Applied migration checksum changed',
      );
      return;
    }
    await c.query(sql);
    await c.query(
      'INSERT INTO public.lbt_development_migrations VALUES(1,$1)',
      [digest(sql)],
    );
  });
  await transaction(pool, async (c) => {
    for (const p of principals)
      await c.query(
        'INSERT INTO principals(id,email,role) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',
        p,
      );
    await c.query(
      "INSERT INTO facilities VALUES('facility-a',$1,'Synthetic North Clinic') ON CONFLICT DO NOTHING",
      [companyId],
    );
    await c.query(
      "INSERT INTO equipment VALUES('equipment-a','facility-a','Synthetic imaging unit A') ON CONFLICT DO NOTHING",
    );
    await c.query(
      "INSERT INTO resources VALUES('meter-a','Shared synthetic meter','2027-01-01') ON CONFLICT DO NOTHING",
    );
  });
}
const elevated = (a) => ['scheduler', 'reviewer'].includes(a.role);
async function actor(pool, id) {
  const r = await pool.query(
    'SELECT * FROM principals WHERE id=$1 AND active',
    [id],
  );
  demand(
    r.rowCount,
    403,
    'Account is not enabled for this development workspace',
  );
  return r.rows[0];
}
async function visible(c, a, id, lock = false) {
  const r = await c.query(
    `SELECT v.*,c.status,c.version FROM visits v JOIN cycles c ON c.id=v.cycle_id WHERE v.id=$1 AND ($2::boolean OR v.assignee=$3) ${lock ? 'FOR UPDATE OF v' : ''}`,
    [id, elevated(a), a.id],
  );
  demand(r.rowCount, 404, 'Visit not found');
  return r.rows[0];
}
async function snapshot(pool, a) {
  const visits = (
    await pool.query(
      `SELECT v.*,c.version,c.status,c.due_date,f.label AS facility,e.label AS equipment,f.company_id,
 (SELECT json_build_object('id',r.id,'revision',r.revision,'sha256',r.sha256,'approved',d.approved) FROM reports r LEFT JOIN decisions d ON d.report_id=r.id WHERE r.visit_id=v.id ORDER BY r.revision DESC LIMIT 1) AS report
 FROM visits v JOIN cycles c ON c.id=v.cycle_id JOIN equipment e ON e.id=c.equipment_id JOIN facilities f ON f.id=e.facility_id WHERE ($1::boolean OR v.assignee=$2) ORDER BY c.due_date,v.ordinal`,
      [elevated(a), a.id],
    )
  ).rows;
  return {
    actor: { id: a.id, email: a.email, role: a.role },
    visits,
    principals: elevated(a)
      ? principals.map(([id, email, role]) => ({ id, email, role }))
      : [],
    mode: 'synthetic',
    workspaceId,
  };
}
async function command(pool, a, input, key, hook = async () => {}) {
  demand(
    typeof key === 'string' && /^[a-zA-Z0-9-]{8,100}$/.test(key),
    400,
    'Idempotency key required',
  );
  const fingerprint = digest(JSON.stringify(input));
  return transaction(pool, async (c) => {
    // The actor is locked and reloaded so deactivation/role changes serialize with commands.
    const current = await c.query(
      'SELECT * FROM principals WHERE id=$1 AND active FOR SHARE',
      [a.id],
    );
    demand(current.rowCount, 403, 'Account inactive');
    a = current.rows[0];
    await c.query('SELECT pg_advisory_xact_lock(hashtext($1))', [a.id + key]);
    const receipt = (
      await c.query('SELECT * FROM receipts WHERE actor=$1 AND key=$2', [
        a.id,
        key,
      ])
    ).rows[0];
    if (receipt) {
      demand(
        receipt.fingerprint === fingerprint,
        409,
        'Idempotency key has different intent',
      );
      return receipt.result;
    }
    let cycle, visit;
    if (input.action === 'generate') {
      demand(a.role === 'scheduler', 403, 'Scheduler required');
      demand(
        input.dueDate === '2026-11-10',
        400,
        'Only the approved synthetic due date is supported',
      );
      await c.query(
        "SELECT pg_advisory_xact_lock(hashtext('lbt-equipment-a-2026-11-10'))",
      );
      cycle = (
        await c.query(
          "SELECT * FROM cycles WHERE equipment_id='equipment-a' AND due_date=$1 FOR UPDATE",
          [input.dueDate],
        )
      ).rows[0];
      if (!cycle) {
        cycle = (
          await c.query(
            "INSERT INTO cycles(id,equipment_id,due_date) VALUES($1,'equipment-a',$2) RETURNING *",
            [randomUUID(), input.dueDate],
          )
        ).rows[0];
        for (let i = 1; i <= 2; i++)
          await c.query(
            'INSERT INTO visits(id,cycle_id,ordinal,assignee) VALUES($1,$2,$3,$4)',
            [randomUUID(), cycle.id, i, principals[i][0]],
          );
      } else {
        const result = {
          cycleId: cycle.id,
          version: cycle.version,
          status: cycle.status,
        };
        await c.query('INSERT INTO receipts VALUES($1,$2,$3,$4)', [
          a.id,
          key,
          fingerprint,
          result,
        ]);
        return result;
      }
    } else {
      demand(typeof input.cycleId === 'string', 400, 'Cycle required');
      cycle = (
        await c.query('SELECT * FROM cycles WHERE id=$1 FOR UPDATE', [
          input.cycleId,
        ])
      ).rows[0];
      demand(cycle, 404, 'Cycle not found');
      if (!elevated(a))
        demand(
          (
            await c.query(
              'SELECT 1 FROM visits WHERE cycle_id=$1 AND assignee=$2',
              [cycle.id, a.id],
            )
          ).rowCount,
          404,
          'Cycle not found',
        );
      demand(cycle.status === 'open', 409, 'Completed cycle is locked');
      demand(
        input.expectedVersion === cycle.version,
        409,
        'Stale cycle version; refresh',
      );
      if (input.visitId) {
        visit = await visible(c, a, input.visitId, true);
        demand(visit.cycle_id === cycle.id, 404, 'Visit not found');
      }
      switch (input.action) {
        case 'book': {
          demand(
            a.role === 'scheduler' && visit,
            403,
            'Scheduler and visit required',
          );
          demand(!visit.executed, 409, 'Executed visits cannot be rescheduled');
          const start = Date.parse(input.start),
            end = Date.parse(input.end);
          demand(
            Number.isFinite(start) &&
              Number.isFinite(end) &&
              end > start &&
              end - start <= 8 * 3600000 &&
              start >= Date.parse('2026-11-10T13:00:00Z') &&
              end <= Date.parse('2026-11-10T22:00:00Z'),
            400,
            'Use the approved synthetic window, 13:00–22:00 UTC on 10 November',
          );
          const meter = (
            await c.query('SELECT * FROM resources WHERE id=$1 FOR SHARE', [
              input.instrumentId,
            ])
          ).rows[0];
          demand(
            meter && Date.parse(meter.valid_until) >= end,
            409,
            'Instrument invalid at visit end',
          );
          await c.query('DELETE FROM reservations WHERE visit_id=$1', [
            visit.id,
          ]);
          for (const resource of [
            input.instrumentId,
            visit.assignee,
            cycle.equipment_id,
          ].sort())
            await c.query(
              "INSERT INTO reservations VALUES($1,$2,tstzrange($3,$4,'[)'))",
              [visit.id, resource, input.start, input.end],
            );
          await c.query(
            'UPDATE visits SET starts_at=$2,ends_at=$3,instrument_id=$4 WHERE id=$1',
            [visit.id, input.start, input.end, input.instrumentId],
          );
          break;
        }
        case 'reassign': {
          demand(a.role === 'scheduler' && visit, 403, 'Scheduler required');
          demand(!visit.executed, 409, 'Executed visit assignment is locked');
          const next = (
            await c.query(
              "SELECT * FROM principals WHERE id=$1 AND role='employee' AND active FOR SHARE",
              [input.assignee],
            )
          ).rows[0];
          demand(next, 400, 'Active employee required');
          if (visit.starts_at) {
            await c.query(
              'DELETE FROM reservations WHERE visit_id=$1 AND resource_id=$2',
              [visit.id, visit.assignee],
            );
            await c.query(
              "INSERT INTO reservations VALUES($1,$2,tstzrange($3,$4,'[)'))",
              [visit.id, next.id, visit.starts_at, visit.ends_at],
            );
          }
          await c.query('UPDATE visits SET assignee=$2 WHERE id=$1', [
            visit.id,
            next.id,
          ]);
          break;
        }
        case 'execute':
          demand(
            visit && a.role === 'employee' && visit.assignee === a.id,
            403,
            'Assigned employee required',
          );
          demand(
            visit.starts_at && !visit.executed,
            409,
            'Visit must be booked and not already executed',
          );
          demand(
            input.syntheticEvidence === true,
            400,
            'Synthetic execution evidence required',
          );
          await c.query('UPDATE visits SET executed=true WHERE id=$1', [
            visit.id,
          ]);
          break;
        case 'submit': {
          demand(
            visit && a.role === 'employee' && visit.assignee === a.id,
            403,
            'Assigned employee required',
          );
          demand(visit.executed, 409, 'Execution evidence required');
          demand(
            typeof input.text === 'string' &&
              input.text.startsWith('SYNTHETIC:') &&
              Buffer.byteLength(input.text) <= 16384,
            400,
            'Use a synthetic text report, maximum 16 KiB',
          );
          const rev = Number(
            (
              await c.query(
                'SELECT coalesce(max(revision),0)+1 AS n FROM reports WHERE visit_id=$1',
                [visit.id],
              )
            ).rows[0].n,
          );
          const bytes = Buffer.from(input.text);
          await c.query(
            'INSERT INTO reports(id,visit_id,revision,author,body,sha256) VALUES($1,$2,$3,$4,$5,$6)',
            [randomUUID(), visit.id, rev, a.id, bytes, digest(bytes)],
          );
          break;
        }
        case 'review': {
          demand(a.role === 'reviewer' && visit, 403, 'Reviewer required');
          const report = (
            await c.query(
              'SELECT * FROM reports WHERE visit_id=$1 ORDER BY revision DESC LIMIT 1',
              [visit.id],
            )
          ).rows[0];
          demand(
            report && report.id === input.reportId,
            409,
            'Review must reference the current report version',
          );
          demand(
            report.author !== a.id,
            403,
            'Author cannot review own report',
          );
          demand(
            typeof input.approved === 'boolean',
            400,
            'Review decision required',
          );
          await c.query('INSERT INTO decisions VALUES($1,$2,$3,$4,now())', [
            randomUUID(),
            report.id,
            a.id,
            input.approved,
          ]);
          break;
        }
        case 'complete': {
          demand(a.role === 'scheduler', 403, 'Scheduler required');
          const ready = await c.query(
            `SELECT v.id FROM visits v JOIN LATERAL (SELECT * FROM reports r WHERE r.visit_id=v.id ORDER BY revision DESC LIMIT 1) r ON true JOIN decisions d ON d.report_id=r.id AND d.approved WHERE v.cycle_id=$1 AND v.executed`,
            [cycle.id],
          );
          demand(
            ready.rowCount === 2,
            409,
            'Both visits require execution and approval of their current report',
          );
          await c.query("UPDATE cycles SET status='complete' WHERE id=$1", [
            cycle.id,
          ]);
          break;
        }
        default:
          throw new Failure(400, 'Unknown command');
      }
      cycle = (
        await c.query(
          'UPDATE cycles SET version=version+1 WHERE id=$1 RETURNING *',
          [cycle.id],
        )
      ).rows[0];
    }
    const event = (
      await c.query(
        'INSERT INTO events(cycle_id,actor,command,details) VALUES($1,$2,$3,$4) RETURNING sequence',
        [
          cycle.id,
          a.id,
          input.action,
          { visitId: visit?.id, version: cycle.version },
        ],
      )
    ).rows[0];
    await c.query(
      'INSERT INTO outbox(id,cycle_id,event_sequence) VALUES($1,$2,$3)',
      [randomUUID(), cycle.id, event.sequence],
    );
    const result = {
      cycleId: cycle.id,
      version: cycle.version,
      status: cycle.status,
    };
    await c.query('INSERT INTO receipts VALUES($1,$2,$3,$4)', [
      a.id,
      key,
      fingerprint,
      result,
    ]);
    await hook(c);
    return result;
  });
}
async function reportFile(pool, a, id) {
  // One statement checks current local activation and assignment and returns bytes. No bearer download URL.
  const r = await pool.query(
    `SELECT r.body,r.sha256 FROM reports r JOIN visits v ON v.id=r.visit_id JOIN principals p ON p.id=$2 AND p.active WHERE r.id=$1 AND (p.role IN ('scheduler','reviewer') OR v.assignee=p.id)`,
    [id, a.id],
  );
  demand(r.rowCount, 404, 'Report not found');
  return r.rows[0];
}
module.exports = {
  createPool,
  migrate,
  transaction,
  actor,
  snapshot,
  command,
  reportFile,
  principals,
  workspaceId,
  companyId,
  digest,
  Failure,
  demand,
};
