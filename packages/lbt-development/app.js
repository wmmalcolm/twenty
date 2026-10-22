let state;
const $ = (id) => document.getElementById(id);
function notice(text, error = false) {
  $('message').textContent = text;
  $('message').className = error ? 'error' : '';
}
async function api(route, body) {
  const r = await fetch('/api/' + route, {
    method: body ? 'POST' : 'GET',
    headers: body
      ? {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        }
      : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
const text = (tag, value) => {
  const e = document.createElement(tag);
  e.textContent = value;
  return e;
};
function button(label, action) {
  const b = text('button', label);
  b.type = 'button';
  b.addEventListener('click', () => run(action));
  return b;
}
async function run(action) {
  document.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    await action();
    notice('Saved.');
    await refresh();
  } catch (e) {
    notice(e.message, true);
  } finally {
    document.querySelectorAll('button').forEach((b) => (b.disabled = false));
  }
}
async function command(action, v, extra = {}) {
  return api('command', {
    action,
    cycleId: v.cycle_id,
    expectedVersion: v.version,
    ...(action === 'complete' ? {} : { visitId: v.id }),
    ...extra,
  });
}
async function refresh() {
  state = await api('state');
  $('login').hidden = true;
  $('workspace').hidden = false;
  $('logout').hidden = false;
  $('identity').textContent = state.actor.email + ' · ' + state.actor.role;
  $('generate').hidden = state.actor.role !== 'scheduler';
  $('complete').hidden =
    state.actor.role !== 'scheduler' ||
    !state.visits.length ||
    state.visits.every((v) => v.status === 'complete');
  const container = $('visits');
  container.replaceChildren();
  for (const v of state.visits) {
    const card = document.createElement('article');
    card.dataset.visitId = v.id;
    card.append(
      text('h2', 'Visit ' + v.ordinal),
      text(
        'span',
        v.status === 'complete'
          ? 'Cycle complete'
          : v.executed
            ? 'Execution recorded'
            : v.starts_at
              ? 'Booked'
              : 'Needs booking',
      ),
    );
    card.append(
      text('p', v.facility + ' · ' + v.equipment),
      text(
        'p',
        'Assignment: ' +
          (state.principals.find((p) => p.id === v.assignee)?.email ||
            state.actor.email),
      ),
    );
    card.append(
      text(
        'p',
        v.starts_at
          ? new Date(v.starts_at).toISOString() +
              ' — ' +
              new Date(v.ends_at).toISOString() +
              ' · shared meter'
          : 'No visit time yet',
      ),
    );
    if (
      v.status === 'open' &&
      state.actor.role === 'scheduler' &&
      !v.executed
    ) {
      const form = document.createElement('form');
      const inputs = {};
      for (const [name, label, value] of [
        ['start', 'Start (UTC)', v.starts_at || '2026-11-10T14:00:00Z'],
        ['end', 'End (UTC)', v.ends_at || '2026-11-10T15:00:00Z'],
      ]) {
        const l = text('label', label),
          i = document.createElement('input');
        i.name = name;
        i.value = value;
        i.required = true;
        l.append(i);
        form.append(l);
        inputs[name] = i;
      }
      form.append(text('button', 'Book visit'));
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        run(() =>
          command('book', v, {
            start: new Date(inputs.start.value).toISOString(),
            end: new Date(inputs.end.value).toISOString(),
            instrumentId: 'meter-a',
          }),
        );
      });
      card.append(form);
      const l = text('label', 'Reassign employee'),
        select = document.createElement('select');
      select.setAttribute('aria-label', 'Reassign employee');
      for (const p of state.principals.filter((p) => p.role === 'employee')) {
        const option = text('option', p.email);
        option.value = p.id;
        select.append(option);
      }
      select.value = v.assignee;
      l.append(select);
      card.append(
        l,
        button('Save assignment', () =>
          command('reassign', v, { assignee: select.value }),
        ),
      );
    }
    if (v.status === 'open' && state.actor.role === 'employee') {
      if (v.starts_at && !v.executed)
        card.append(
          button('Record synthetic execution', () =>
            command('execute', v, { syntheticEvidence: true }),
          ),
        );
      if (v.executed) {
        const label = text('label', 'Synthetic report text'),
          area = document.createElement('textarea');
        area.value =
          'SYNTHETIC: Visit ' +
          v.ordinal +
          ' demonstration evidence. No clinical findings.';
        label.append(area);
        card.append(
          label,
          button('Submit new report version', () =>
            command('submit', v, { text: area.value }),
          ),
        );
      }
    }
    if (v.report) {
      card.append(
        text(
          'p',
          'Report version ' +
            v.report.revision +
            ' · ' +
            (v.report.approved === true
              ? 'Approved'
              : v.report.approved === false
                ? 'Rejected'
                : 'Awaiting review'),
        ),
      );
      const a = text('a', 'Download current report');
      a.href = '/api/reports/' + v.report.id + '/file';
      card.append(a);
      if (
        v.status === 'open' &&
        state.actor.role === 'reviewer' &&
        v.report.approved === null
      ) {
        card.append(
          button('Approve current report', () =>
            command('review', v, { reportId: v.report.id, approved: true }),
          ),
          button('Reject current report', () =>
            command('review', v, { reportId: v.report.id, approved: false }),
          ),
        );
      }
    } else card.append(text('p', 'Report not submitted'));
    container.append(card);
  }
  $('activity').hidden = state.actor.role === 'employee';
  if (!$('activity').hidden) {
    const a = await api('activity');
    $('events').textContent =
      a.events
        .map(
          (e) =>
            e.sequence + ' · ' + e.command + ' · version ' + e.details.version,
        )
        .join('\n') + '\nNotifications: local capture only.';
  }
}
$('login-form').addEventListener('submit', (e) => {
  e.preventDefault();
  run(async () => {
    await api('login', {
      email: $('email').value,
      password: $('password').value,
    });
    $('password').value = '';
  });
});
$('generate').onclick = () =>
  run(() => api('command', { action: 'generate', dueDate: '2026-11-10' }));
$('complete').onclick = () => run(() => command('complete', state.visits[0]));
$('refresh').onclick = () => refresh().catch((e) => notice(e.message, true));
$('logout').onclick = async () => {
  await api('logout', {});
  location.reload();
};
refresh().catch(() => {});
