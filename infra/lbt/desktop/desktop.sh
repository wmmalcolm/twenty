#!/usr/bin/env bash
set -euo pipefail
root=$(cd "$(dirname "$0")/../../.." && pwd)
cd "$root"
# Never switch the global context, restart Colima, or use the existing recruiting project.
context=${LBT_DOCKER_CONTEXT:-colima-twenty}
project=lbt-private-development
action=${1:-status}
case "$action" in
  preflight|start|status|stop|logs|check) ;;
  *) echo 'Use preflight, start, status, stop, logs, or check.' >&2; exit 2 ;;
esac
command -v docker >/dev/null || { echo 'Docker CLI is required.' >&2; exit 1; }
endpoint=$(docker context inspect "$context" --format '{{.Endpoints.docker.Host}}')
case "$endpoint" in
  unix://*) ;;
  *) echo "Refusing context $context: this desktop package requires a local Unix-socket Docker endpoint." >&2; exit 1 ;;
esac
docker --context "$context" info --format 'Docker {{.ServerVersion}} / {{.Architecture}} / CPUs {{.NCPU}} / Memory {{.MemTotal}}'
runtime="$root/.devenv/lbt-desktop"
compose=(docker --context "$context" compose --project-name "$project" --env-file "$runtime/runtime.env" -f infra/lbt/desktop/compose.yaml)

preflight() {
  local containers volumes owned_publisher id binding listeners result architecture native_platform
  docker --context "$context" compose version
  architecture=$(docker --context "$context" info --format '{{.Architecture}}')
  case "$architecture" in
    aarch64|arm64) native_platform=linux/arm64 ;;
    x86_64|amd64) native_platform=linux/amd64 ;;
    *) echo 'Unsupported Docker architecture for this handoff.' >&2; return 1 ;;
  esac
  if [[ -n "${DOCKER_DEFAULT_PLATFORM:-}" && "$DOCKER_DEFAULT_PLATFORM" != "$native_platform" ]]; then
    echo "DOCKER_DEFAULT_PLATFORM conflicts with the daemon architecture. Run with env -u DOCKER_DEFAULT_PLATFORM; native platform is $native_platform." >&2
    return 1
  fi
  containers=$(docker --context "$context" ps -a --filter "label=com.docker.compose.project=$project" --format '{{.ID}}')
  volumes=$(docker --context "$context" volume ls --format '{{.Name}}' | awk '$0 == "lbt-private-development_lbt-data" || $0 == "lbt-private-development_lbt-files"')
  if [[ ! -f "$runtime/runtime.env" && ( -n "$containers" || -n "$volumes" ) ]]; then
    echo 'Existing LBT containers or volumes have no matching local runtime.env. Restore that configuration; refusing to initialize or reuse their data.' >&2
    return 1
  fi
  owned_publisher=false
  for id in $containers; do
    binding=$(docker --context "$context" inspect "$id" --format '{{index .Config.Labels "com.docker.compose.service"}}|{{if .State.Running}}{{range (index .NetworkSettings.Ports "4331/tcp")}}{{if eq .HostIp "127.0.0.1"}}{{if eq .HostPort "4330"}}yes{{end}}{{end}}{{end}}{{end}}')
    if [[ "$binding" == 'database|yes' ]]; then owned_publisher=true; fi
  done
  if command -v lsof >/dev/null; then
    result=0
    listeners=$(lsof -nP -iTCP:4330 -sTCP:LISTEN 2>&1) || result=$?
    if [[ -n "$listeners" ]]; then
      result=10
    elif [[ "$result" -le 1 ]]; then
      result=0
    else
      echo 'lsof could not verify local port 4330; refusing to start.' >&2
      return 1
    fi
  elif command -v python3 >/dev/null; then
    result=0
    python3 - <<'PY' || result=$?
import errno
import socket
import sys
with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
    try:
        probe.bind(('127.0.0.1', 4330))
    except OSError as error:
        if error.errno == errno.EADDRINUSE:
            sys.exit(10)
        print('Cannot check local port 4330: ' + str(error), file=sys.stderr)
        sys.exit(20)
PY
  else
    echo 'Port preflight requires macOS lsof or Python 3. No build or containers started.' >&2
    return 1
  fi
  if [[ "$result" == 10 && "$owned_publisher" != true ]]; then
    echo 'Port 4330 is occupied by another listener. Nothing was stopped; choose a free port through a reviewed configuration change before starting LBT.' >&2
    return 1
  elif [[ "$result" != 0 && "$result" != 10 ]]; then
    return "$result"
  elif [[ "$owned_publisher" == true ]]; then
    echo 'Port 4330 is already published by this LBT project; an idempotent start is allowed.'
  else
    echo 'Local port 4330 is available. Docker will also check it when publishing.'
  fi
  docker --context "$context" stats --no-stream --format '{{.Name}}: {{.MemUsage}}'
  echo 'Preflight complete. Review shared VM capacity before building; no VM settings were changed.'
}

case "$action" in
  preflight) preflight; exit ;;
  start)
    preflight
    if [[ ! -f "$runtime/runtime.env" ]]; then
      command -v openssl >/dev/null || { echo 'OpenSSL is required to generate local development secrets.' >&2; exit 1; }
      umask 077
      mkdir -p "$runtime"
      chmod 700 "$runtime"
      postgres_secret=$(openssl rand -hex 24)
      app_secret=$(openssl rand -hex 32)
      printf 'POSTGRES_PASSWORD=%s\nAPP_SECRET=%s\n' "$postgres_secret" "$app_secret" > "$runtime/runtime.env"
      unset postgres_secret app_secret
    fi
    "${compose[@]}" up -d --build --wait --wait-timeout 900
    ;;
  *)
    [[ -f "$runtime/runtime.env" ]] || { echo 'Desktop configuration is missing. Run preflight, then start to initialize a new isolated LBT instance.' >&2; exit 1; }
    case "$action" in
      status) "${compose[@]}" ps ;;
      stop) "${compose[@]}" stop ;;
      logs) "${compose[@]}" logs --tail 80 app ;;
      check)
        command -v curl >/dev/null || { echo 'curl is required for the local HTTP check.' >&2; exit 1; }
        "${compose[@]}" exec -T app node -e 'fetch("http://127.0.0.1:4320/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
        curl --fail --max-time 10 http://127.0.0.1:4330/health
        ;;
    esac
    ;;
esac
