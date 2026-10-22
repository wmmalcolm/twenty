// Node 24 only; no host npm install is needed. From the source folder:
// docker --context colima-twenty compose --project-name lbt-private-development \
//   --env-file .devenv/lbt-desktop/runtime.env -f infra/lbt/desktop/compose.yaml \
//   exec -T app node - < tests/lbt/development/desktop-smoke.cjs
// Append --exercise after `node -` to complete a NEW, EMPTY synthetic fixture.
// Default mode reads data only (plus transient sign-in/sign-out sessions).
// Neither mode resets data. A partially completed fixture requires manual continuation.
const assert = require('node:assert/strict');
const { createHash, randomUUID } = require('node:crypto');
const base = 'http://127.0.0.1:4330';
const workspaceId = '20202020-1c25-4d02-bf25-6aeccf7ea419';
const companyId = '15b70000-0000-4000-8000-000000000001';
const accounts = [
  ['tim@apple.dev', 'scheduler'],
  ['jony.ive@apple.dev', 'employee'],
  ['phil.schiler@apple.dev', 'employee'],
  ['jane.austen@apple.dev', 'reviewer'],
];

async function request(route, cookie, body) {
  const response = await fetch(base + route, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(cookie ? { Cookie: cookie } : {}),
      ...(body
        ? {
            'Content-Type': 'application/json',
            Origin: base,
            'Idempotency-Key': randomUUID(),
          }
        : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(45000),
    redirect: 'error',
  });
  const bytes = Buffer.from(await response.arrayBuffer());
  return {
    status: response.status,
    body: response.headers.get('content-type')?.startsWith('application/json')
      ? JSON.parse(bytes.toString('utf8'))
      : bytes.toString('utf8'),
    bytes,
    sha256: response.headers.get('x-content-sha256'),
    cookie: response.headers.get('set-cookie')?.split(';')[0],
  };
}
function status(result, expected, label) {
  // Never print the response object: it can contain an authentication cookie.
  assert.equal(result.status, expected, label);
  return result;
}
async function state(cookie) {
  const result = status(await request('/api/state', cookie), 200, 'Read state');
  assert.equal(result.body.mode, 'synthetic');
  assert.equal(result.body.workspaceId, workspaceId);
  return result.body;
}
async function command(action, visit, extra, cookie) {
  return request('/api/command', cookie, {
    action,
    cycleId: visit.cycle_id,
    expectedVersion: visit.version,
    ...(action === 'complete' ? {} : { visitId: visit.id }),
    ...extra,
  });
}

async function main() {
  const flags = process.argv.slice(2);
  assert.ok(
    flags.every((flag) => flag === '--exercise'),
    'Only --exercise is supported',
  );
  const exercise = flags.includes('--exercise');
  const health = status(await request('/health'), 200, 'Portal health');
  assert.equal(health.body.mode, 'synthetic');
  assert.equal(health.body.nativeBase, 'http://127.0.0.1:4320');
  status(await request('/api/state'), 401, 'Anonymous state access denied');
  const sessions = [];
  try {
    for (const [email, role] of accounts) {
      const login = status(
        await request('/api/login', undefined, {
          email,
          password: 'tim@apple.dev',
        }),
        200,
        'Native Twenty sign-in for ' + role,
      );
      assert.ok(login.cookie?.startsWith('lbt_dev='), 'Session cookie issued');
      sessions.push(login.cookie);
      const snapshot = await state(login.cookie);
      assert.equal(snapshot.actor.email, email);
      assert.equal(snapshot.actor.role, role);
    }
    console.log(
      'PASS native sign-in and synthetic workspace identity for all four accounts; anonymous state denied',
    );
    const [scheduler, employeeA, employeeB, reviewer] = sessions;
    let visits = (await state(scheduler)).visits;
    const wasEmpty = visits.length === 0;
    if (
      exercise &&
      visits.length &&
      !visits.every((visit) => visit.status === 'complete')
    ) {
      throw Error(
        'Existing fixture is partially completed. No workflow commands sent; continue it manually.',
      );
    }
    if (exercise && wasEmpty) {
      status(
        await request('/api/command', scheduler, {
          action: 'generate',
          dueDate: '2026-11-10',
        }),
        200,
        'Generate two-visit fixture',
      );
      visits = (await state(scheduler)).visits;
      assert.equal(visits.length, 2);
      assert.ok(visits.every((visit) => visit.company_id === companyId));
      assert.ok(visits.every((visit) => visit.facility && visit.equipment));
      status(
        await command('complete', visits[0], {}, scheduler),
        409,
        'Premature completion denied',
      );
      const interval = {
        start: '2026-11-10T14:00:00Z',
        end: '2026-11-10T15:00:00Z',
        instrumentId: 'meter-a',
      };
      status(
        await command('book', visits[0], interval, scheduler),
        200,
        'First booking',
      );
      visits = (await state(scheduler)).visits;
      status(
        await command('book', visits[1], interval, scheduler),
        409,
        'Shared-resource overlap denied',
      );
      const afterConflict = (await state(scheduler)).visits;
      assert.equal(
        afterConflict[1].starts_at,
        null,
        'Rejected booking has no partial time',
      );
      assert.equal(
        afterConflict[1].version,
        visits[1].version,
        'Rejected booking has no version change',
      );
      status(
        await command(
          'book',
          afterConflict[1],
          {
            ...interval,
            start: '2026-11-10T15:00:00Z',
            end: '2026-11-10T16:00:00Z',
          },
          scheduler,
        ),
        200,
        'Adjacent booking',
      );
      console.log(
        'PASS native client/facility/equipment reference, two visits, rejected overlap without partial save, adjacent booking and premature-completion denial',
      );
      for (const cookie of [employeeA, employeeB]) {
        let own = (await state(cookie)).visits;
        assert.equal(own.length, 1);
        status(
          await command('execute', own[0], { syntheticEvidence: true }, cookie),
          200,
          'Assigned execution',
        );
        own = (await state(cookie)).visits;
        const text =
          'SYNTHETIC: desktop smoke report for visit ' + own[0].ordinal;
        status(
          await command('submit', own[0], { text }, cookie),
          200,
          'Assigned report submission',
        );
        own = (await state(cookie)).visits;
        const reportId = own[0].report.id;
        status(
          await command('review', own[0], { reportId, approved: true }, cookie),
          403,
          'Author review denied',
        );
        const downloaded = status(
          await request('/api/reports/' + reportId + '/file', cookie),
          200,
          'Own report download',
        );
        assert.deepEqual(
          downloaded.bytes,
          Buffer.from(text),
          'Exact submitted report bytes',
        );
      }
      for (let i = 0; i < 2; i++) {
        visits = (await state(reviewer)).visits;
        status(
          await command(
            'review',
            visits[i],
            { reportId: visits[i].report.id, approved: true },
            reviewer,
          ),
          200,
          'Independent review',
        );
      }
      visits = (await state(scheduler)).visits;
      status(
        await command('complete', visits[0], {}, scheduler),
        200,
        'Controlled completion',
      );
      console.log(
        'PASS both assigned executions, exact report bytes, author-review denial, independent approvals and controlled completion',
      );
    }

    visits = (await state(scheduler)).visits;
    assert.ok(
      visits.length === 0 || visits.length === 2,
      'Only the fixed two-visit fixture is expected',
    );
    const reviewState = await state(reviewer);
    assert.deepEqual(
      reviewState.visits.map((visit) => visit.id),
      visits.map((visit) => visit.id),
    );
    for (const [cookie, other] of [
      [employeeA, employeeB],
      [employeeB, employeeA],
    ]) {
      const own = await state(cookie);
      assert.equal(
        own.visits.length,
        visits.length ? 1 : 0,
        'Employee sees only assigned visit',
      );
      assert.ok(own.visits.every((visit) => visit.assignee === own.actor.id));
      assert.equal(
        own.principals.length,
        0,
        'Employee receives no staff directory',
      );
      status(
        await request('/api/activity', cookie),
        403,
        'Employee activity access denied',
      );
      for (const visit of own.visits.filter((item) => item.report)) {
        const route = '/api/reports/' + visit.report.id + '/file';
        status(await request(route), 401, 'Anonymous report denied');
        status(
          await request(route, other),
          404,
          'Other employee report denied',
        );
        status(
          await request(route + '?token=forged', other),
          404,
          'Forged report-link token denied',
        );
        const file = status(
          await request(route, cookie),
          200,
          'Assigned report download',
        );
        assert.ok(file.bytes.toString('utf8').startsWith('SYNTHETIC:'));
        const hash = createHash('sha256').update(file.bytes).digest('hex');
        assert.equal(
          hash,
          file.sha256,
          'Exact downloaded bytes match response hash',
        );
        assert.equal(
          hash,
          visit.report.sha256,
          'Exact downloaded bytes match stored report hash',
        );
        const reviewerFile = status(
          await request(route, reviewer),
          200,
          'Reviewer report download',
        );
        assert.deepEqual(
          reviewerFile.bytes,
          file.bytes,
          'Reviewer receives the same immutable report bytes',
        );
      }
    }
    console.log(
      'PASS assigned-only lists and current report permissions (report checks run when reports exist)',
    );
    if (!visits.length) {
      console.log(
        'EMPTY fixture preserved. Run with --exercise to create and complete the synthetic two-visit demonstration.',
      );
    } else if (visits.every((visit) => visit.status === 'complete')) {
      assert.ok(
        visits.every(
          (visit) => visit.executed && visit.report?.approved === true,
        ),
      );
      if (exercise) {
        status(
          await command('complete', visits[0], {}, scheduler),
          409,
          'Completed cycle stays locked',
        );
        const own = (await state(employeeA)).visits[0];
        status(
          await command(
            'submit',
            own,
            { text: 'SYNTHETIC: forbidden after completion' },
            employeeA,
          ),
          409,
          'Completed report mutation denied',
        );
        console.log(
          'PASS completed cycle rejects repeated completion and new report mutation; no reset performed',
        );
      }
      console.log(
        wasEmpty
          ? 'COMPLETE new synthetic fixture retained for browser inspection.'
          : 'COMPLETE existing fixture preserved and rechecked; workflow creation was not rerun.',
      );
    } else {
      console.log(
        'PARTIAL fixture observed without workflow mutation. Continue it manually.',
      );
    }
    console.log(
      'LIMIT: This checks the dedicated LBT portal, not native Twenty RLS, browser layout, full acceptance or disaster recovery.',
    );
  } finally {
    for (const cookie of sessions) {
      try {
        status(
          await request('/api/logout', cookie, {}),
          200,
          'End transient session',
        );
      } catch {
        // Do not print authentication material while preserving the original failure.
        console.error(
          'WARN transient session sign-out failed; app restart invalidates portal sessions.',
        );
      }
    }
  }
}
main().catch((error) => {
  console.error('FAIL desktop smoke: ' + error.message);
  process.exitCode = 1;
});
