#!/usr/bin/env bash
# Safety checks use a disposable checkout and fake Docker/lsof commands only.
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
python3 - <<'PY'
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

source = Path('infra/lbt/desktop/desktop.sh').resolve()
print('Desktop preflight safety tests; mocked Docker/lsof, no real Docker calls')
print('UTC: ' + datetime.datetime.now(datetime.timezone.utc).isoformat())
print('desktop.sh SHA256: ' + hashlib.sha256(source.read_bytes()).hexdigest())

docker_mock = r'''
import json, os, sys
from pathlib import Path
args = sys.argv[1:]
with open(os.environ['MOCK_LOG'], 'a') as log:
    log.write(json.dumps(args) + '\n')
mode = os.environ['MOCK_MODE']
if args[:2] == ['context', 'inspect']:
    assert args[2] == 'colima-twenty', args
    print(os.environ.get('MOCK_ENDPOINT', 'unix:///tmp/lbt-test-only.sock'))
    sys.exit(0)
assert args[:2] == ['--context', 'colima-twenty'], args
args = args[2:]
if args[:1] == ['info']:
    if args[-1] == '{{.Architecture}}':
        print(os.environ.get('MOCK_ARCH', 'aarch64'))
    else:
        print('Mock Docker: arm64 / 4 CPUs / 12 GiB')
elif args == ['compose', 'version']:
    print('Mock Compose')
elif args[:2] == ['ps', '-a']:
    assert 'label=com.docker.compose.project=lbt-private-development' in args, args
    if mode in ('orphan_container', 'own'):
        print('lbt-test-container')
elif args[:2] == ['volume', 'ls']:
    if mode == 'orphan_volume':
        print('lbt-private-development_lbt-data')
elif args[:2] == ['inspect', 'lbt-test-container']:
    print('database|yes')
elif args[:1] == ['stats']:
    print('Existing workload: mock read only')
elif args[:1] == ['compose']:
    assert args[1:3] == ['--project-name', 'lbt-private-development'], args
    assert args[3] == '--env-file' and Path(args[4]).is_file(), args
    assert args[5:7] == ['-f', 'infra/lbt/desktop/compose.yaml'], args
    assert args[7:] in (
        ['up', '-d', '--build', '--wait', '--wait-timeout', '900'],
        ['stop'], ['ps'],
    ), args
else:
    raise AssertionError('Unexpected Docker command: ' + repr(args))
'''

lsof_mock = r'''
import os, sys
mode = os.environ['MOCK_MODE']
if mode in ('busy', 'own'):
    print('Mock process listening on 127.0.0.1:4330')
    sys.exit(0)
sys.exit(2 if mode == 'probe_error' else 1)
'''

def make_executable(path, body):
    path.write_text('#!' + sys.executable + '\n' + body)
    path.chmod(0o755)

def run_case(name, mode='fresh', action='preflight', expected=0,
             configured=False, endpoint=None, platform=None, architecture=None,
             message=None, expected_mutation=None):
    with tempfile.TemporaryDirectory(prefix='lbt-preflight-test-') as temporary:
        base = Path(temporary)
        root = base / 'checkout'
        directory = root / 'infra/lbt/desktop'
        directory.mkdir(parents=True)
        shutil.copyfile(source, directory / 'desktop.sh')
        binary = base / 'bin'
        binary.mkdir()
        make_executable(binary / 'docker', docker_mock)
        make_executable(binary / 'lsof', lsof_mock)
        make_executable(binary / 'openssl',
                        "raise AssertionError('This test must not generate credentials')\n")
        runtime = root / '.devenv/lbt-desktop/runtime.env'
        fixture = b'TEST_FIXTURE_ONLY=1\n'
        if configured:
            runtime.parent.mkdir(parents=True)
            runtime.write_bytes(fixture)
        env = os.environ.copy()
        env.pop('DOCKER_DEFAULT_PLATFORM', None)
        env.update(PATH=str(binary) + os.pathsep + env.get('PATH', ''),
                   LBT_DOCKER_CONTEXT='colima-twenty', MOCK_MODE=mode,
                   MOCK_LOG=str(base / 'docker.jsonl'),
                   COMPOSE_PROJECT_NAME='twenty-will-recruiting')
        if endpoint is not None:
            env['MOCK_ENDPOINT'] = endpoint
        if platform is not None:
            env['DOCKER_DEFAULT_PLATFORM'] = platform
        if architecture is not None:
            env['MOCK_ARCH'] = architecture
        result = subprocess.run(['bash', str(directory / 'desktop.sh'), action],
                                env=env, capture_output=True, text=True)
        assert result.returncode == expected, (
            name, result.returncode, result.stdout, result.stderr)
        if message:
            assert message in result.stdout + result.stderr, (
                name, result.stdout, result.stderr)
        if configured:
            assert runtime.read_bytes() == fixture, name + ': config changed'
        else:
            assert not (root / '.devenv').exists(), name + ': config path created'
        calls = [json.loads(line) for line in (base / 'docker.jsonl').read_text().splitlines()]
        mutations = [call for call in calls
                     if 'compose' in call and any(word in call for word in ('up', 'start', 'stop', 'down', 'rm'))]
        if expected_mutation:
            assert len(mutations) == 1 and expected_mutation in mutations[0], (name, calls)
            call = mutations[0]
            assert call[call.index('--project-name') + 1] == 'lbt-private-development', (name, call)
        else:
            assert not mutations, (name, calls)
        assert all('twenty-will-recruiting' not in call for call in calls), (name, calls)
        print('PASS ' + name)

run_case('fresh preflight leaves runtime configuration absent')
run_case('occupied 4330 rejects start before configuration or build',
         mode='busy', action='start', expected=1, message='Port 4330 is occupied')
run_case('remote Docker endpoint rejected before mutation', action='start',
         endpoint='ssh://unrelated-host', expected=1, message='local Unix-socket')
run_case('existing container without matching config rejected', mode='orphan_container',
         action='start', expected=1, message='no matching local runtime.env')
run_case('existing volume without matching config rejected', mode='orphan_volume',
         action='start', expected=1, message='no matching local runtime.env')
run_case('missing-config status is explanatory and does not initialize',
         action='status', expected=1, message='Desktop configuration is missing')
run_case('owned port publisher permits read-only preflight', mode='own',
         configured=True, message='idempotent start is allowed')
run_case('owned restart pins LBT project despite inherited recruiting project name',
         mode='own', action='start', configured=True, expected_mutation='up')
run_case('stop pins LBT project despite inherited recruiting project name',
         action='stop', configured=True, expected_mutation='stop')
run_case('platform mismatch rejects start without configuration changes',
         action='start', platform='linux/amd64', expected=1,
         message='DOCKER_DEFAULT_PLATFORM conflicts')
run_case('explicit matching ARM64 platform passes', platform='linux/arm64')
run_case('unsupported daemon architecture rejected', architecture='mips64',
         expected=1, message='Unsupported Docker architecture')
run_case('port-probe error fails closed', mode='probe_error', action='start',
         expected=1, message='lsof could not verify')
print('PASS 13 safety cases; no real Docker resources or credentials created')
PY
