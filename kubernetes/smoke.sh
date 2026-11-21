#!/bin/bash
# Read-only smoke test for the kubernetes.yml lab.
#
# Run from the repository root on the machine that runs the stack:
#   bash kubernetes/smoke.sh
#
# Every check is a read: compose state, kubectl get, and HTTP GETs on the
# loopback ports. Nothing is scaled, deleted or restarted. Exit code is 0 only
# when every check passes; warnings do not fail the run.
set -uo pipefail

cd "$(dirname "$0")/.." || exit 1

COMPOSE=(docker compose -f kubernetes.yml)
NS=landscape-lab
DASH_PORTS="${DASH_PORTS:-18080 18081 18082}"
HEADLAMP_PORT="${HEADLAMP_PORT_NUM:-18084}"
KUBEWALL_PORT="${KUBEWALL_PORT_NUM:-18085}"
STATUS_PORT="${STATUS_PORT:-18080}"

pass=0
fail=0
warn=0

hdr() { printf '\n== %s ==\n' "$1"; }
ok() { printf '  PASS  %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  FAIL  %s\n' "$1"; fail=$((fail + 1)); }
note() { printf '  WARN  %s\n' "$1"; warn=$((warn + 1)); }
detail() { printf '        %s\n' "$1"; }

kctl() { "${COMPOSE[@]}" exec -T k3s kubectl "$@"; }

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT

fetch() { # fetch <port> <path> <outfile> -> prints status code
  curl -s -o "$3" -w '%{http_code}' --max-time 10 "http://127.0.0.1:$1$2" 2>/dev/null
}

hdr "Docker engine and compose state"

if docker info >/dev/null 2>&1; then
  ok "docker engine reachable"
else
  bad "docker engine unreachable"
  printf '\nCannot continue without the Docker engine.\n'
  exit 1
fi

ps_out="$("${COMPOSE[@]}" ps -a --format '{{.Service}} {{.State}}' 2>&1)"
expect_running="k3s k3s-agent-1 k3s-agent-2 k3s-agent-3 headlamp kubewall"
for svc in $expect_running; do
  state="$(printf '%s\n' "$ps_out" | awk -v s="$svc" '$1 == s { print $2 }')"
  if [ "$state" = "running" ]; then
    ok "$svc is running"
  else
    bad "$svc state is '${state:-missing}'"
  fi
done

boot_id="$("${COMPOSE[@]}" ps -a -q lab-bootstrap 2>/dev/null | head -1)"
if [ -n "$boot_id" ]; then
  boot_code="$(docker inspect --format '{{.State.ExitCode}}' "$boot_id" 2>/dev/null)"
  if [ "$boot_code" = "0" ]; then
    ok "lab-bootstrap completed (exit 0)"
  else
    bad "lab-bootstrap exit code is '${boot_code:-unknown}'"
    detail "$("${COMPOSE[@]}" logs --no-color --tail=5 lab-bootstrap 2>&1 | tail -3)"
  fi
else
  bad "lab-bootstrap container missing"
fi

expected_names="kubernetes-lab-bootstrap kubernetes-lab-headlamp kubernetes-lab-k3s kubernetes-lab-k3s-agent-1 kubernetes-lab-k3s-agent-2 kubernetes-lab-k3s-agent-3 kubernetes-lab-kubewall"
actual_names="$("${COMPOSE[@]}" ps -a --format '{{.Name}}' 2>/dev/null | sed '/^$/d' | sort)"
if [ "$actual_names" = "$(printf '%s
' $expected_names | sort)" ]; then
  ok "all 7 containers use their pinned names"
else
  bad "container names are not the pinned ones"
  detail "got: $(printf '%s ' $actual_names)"
fi

hdr "Cluster nodes"

nodes_ready="$(kctl get nodes -o jsonpath='{range .items[*]}{.metadata.name} {.status.conditions[?(@.type=="Ready")].status}{"\n"}{end}' 2>&1)"
if printf '%s\n' "$nodes_ready" | grep -q '^k3s-server True$'; then
  ok "k3s-server is Ready"
else
  bad "k3s-server is not Ready"
  detail "$(printf '%s\n' "$nodes_ready" | head -5)"
fi

for agent in k3s-agent-1 k3s-agent-2 k3s-agent-3; do
  if printf '%s\n' "$nodes_ready" | grep -q "^$agent True$"; then
    ok "$agent joined and is Ready"
  else
    bad "$agent has not joined as Ready"
  fi
done

node_total="$(printf '%s\n' "$nodes_ready" | grep -c ' True$')"
if [ "$node_total" = "4" ]; then
  ok "cluster has exactly 4 nodes"
else
  bad "cluster has $node_total Ready nodes, expected 4"
fi

taint="$(kctl get node k3s-server -o jsonpath='{.spec.taints[*].key}' 2>/dev/null)"
case "$taint" in
  *k3s.io/lab-control-plane*) ok "control plane carries the lab NoSchedule taint" ;;
  *) bad "control plane taint missing (got '${taint:-none}')" ;;
esac

agent_log="$("${COMPOSE[@]}" logs --no-color --tail=120 k3s-agent-1 2>&1)"
if printf '%s\n' "$agent_log" | grep -qiE 'x509|certificate signed by unknown authority|tls: failed'; then
  bad "k3s-agent-1 log shows a TLS/certificate error (tls-san?)"
  detail "$(printf '%s\n' "$agent_log" | grep -iE 'x509|certificate|tls' | tail -2)"
else
  ok "k3s-agent-1 log has no TLS/certificate errors"
fi

if kctl get clusterrole landscape-node-reader >/dev/null 2>&1; then
  verbs="$(kctl get clusterrole landscape-node-reader -o jsonpath='{.rules[*].verbs}' 2>/dev/null)"
  case "$verbs" in
    *get*list* | *list*get*) ok "landscape-node-reader ClusterRole grants get/list" ;;
    *) note "landscape-node-reader verbs are '${verbs:-none}'" ;;
  esac
else
  bad "landscape-node-reader ClusterRole missing (placement table cannot read nodes)"
fi

hdr "Workloads"

sts_out="$(kctl -n "$NS" get statefulsets --no-headers 2>&1)"
sts_total="$(printf '%s\n' "$sts_out" | grep -c '[a-z]')"
if [ "$sts_total" = "7" ]; then
  ok "7 StatefulSets present"
else
  bad "$sts_total StatefulSets present, expected 7"
fi

sts_not_ready="$(printf '%s\n' "$sts_out" | awk '{ split($2, r, "/"); if (r[1] != r[2]) print $1 " " $2 }')"
if [ -z "$sts_not_ready" ]; then
  ok "every StatefulSet is fully ready"
else
  bad "StatefulSets not fully ready:"
  printf '%s\n' "$sts_not_ready" | while read -r line; do detail "$line"; done
fi

hpa_total="$(kctl -n "$NS" get hpa --no-headers 2>/dev/null | grep -c '[a-z]')"
if [ "$hpa_total" = "5" ]; then
  ok "5 HPAs present"
else
  note "$hpa_total HPAs present, expected 5"
fi

spread="$(kctl -n "$NS" get pods -o jsonpath='{range .items[*]}{.spec.nodeName}{"\n"}{end}' 2>/dev/null | sort -u | grep -c '^k3s-agent')"
if [ "$spread" -ge 3 ] 2>/dev/null; then
  ok "lab pods are spread across all 3 workers"
elif [ "$spread" -ge 1 ] 2>/dev/null; then
  note "lab pods run on $spread of 3 workers"
else
  bad "no lab pods scheduled on the workers"
fi

hdr "Host-bound persistence"

if [ -z "${DATA_DIR:-}" ] && [ -f .env ]; then
  DATA_DIR="$(grep -E '^DATA_DIR=' .env | tail -1 | cut -d= -f2- | tr -d '\r"' | tr -d "'")"
fi
DATA_DIR="${DATA_DIR%/}"

if [ -n "${DATA_DIR:-}" ] && [ -d "$DATA_DIR/kubernetes" ]; then
  ok "data root exists: $DATA_DIR/kubernetes"
  for dir in k3s k3s/log k3s/cni k3s/kubelet k3s-config \
    k3s-agent-1/log k3s-agent-1/node k3s-agent-2/log k3s-agent-2/node \
    k3s-agent-3/log k3s-agent-3/node shared kube kubewall; do
    if [ -d "$DATA_DIR/kubernetes/$dir" ]; then
      ok "bind directory present: kubernetes/$dir"
    else
      bad "bind directory missing: kubernetes/$dir"
    fi
  done
  if [ -s "$DATA_DIR/kubernetes/k3s-config/k3s.yaml" ]; then
    ok "server kubeconfig persisted under kubernetes/k3s-config"
  else
    bad "server kubeconfig missing under kubernetes/k3s-config"
  fi
  if [ -s "$DATA_DIR/kubernetes/kube/config" ]; then
    ok "bootstrap wrote kubernetes/kube/config"
    case "$(uname -s)" in
      MINGW* | MSYS* | CYGWIN*) ;;
      *) [ "$(stat -c '%a' "$DATA_DIR/kubernetes/kube/config" 2>/dev/null)" = "600" ] && ok "kube/config is mode 600" || note "kube/config mode is $(stat -c '%a' "$DATA_DIR/kubernetes/kube/config" 2>/dev/null)" ;;
    esac
  else
    bad "kubernetes/kube/config missing (bootstrap did not finish)"
  fi
  if find "$DATA_DIR/kubernetes/shared" -type f 2>/dev/null | grep -q .; then
    ok "database state files exist under kubernetes/shared"
  else
    note "kubernetes/shared has no files yet (database may not have written state)"
  fi
else
  note "DATA_DIR not resolved, skipping host directory checks"
fi

hdr "Dashboard over each worker ingress"

for port in $DASH_PORTS; do
  code="$(fetch "$port" "/" "$tmpdir/dash-$port.html")"
  if [ "$code" = "200" ] && grep -q 'Kubernetes Landscape Control Room' "$tmpdir/dash-$port.html"; then
    ok "http://127.0.0.1:$port/ serves the dashboard"
  else
    bad "http://127.0.0.1:$port/ returned ${code:-no-response} without the dashboard"
  fi
done

code="$(fetch "$STATUS_PORT" "/health" "$tmpdir/health.json")"
if [ "$code" = "200" ] && grep -q '"ok":true' "$tmpdir/health.json"; then
  ok "GET /health answers ok"
else
  bad "GET /health returned ${code:-no-response}"
fi

code="$(fetch "$STATUS_PORT" "/api/status" "$tmpdir/status.json")"
if [ "$code" = "200" ]; then
  ok "GET /api/status returns 200"
  if grep -q '"nodes":{"error"' "$tmpdir/status.json"; then
    bad "status payload reports a node error: $(grep -o '"nodes":{"error":"[^"]*"' "$tmpdir/status.json" | head -1)"
  else
    node_payload="$(grep -o '"podCount":[^,}]*' "$tmpdir/status.json" | wc -l | tr -d ' ')"
    if [ "$node_payload" = "4" ]; then
      ok "status payload carries all 4 nodes with podCount"
    else
      bad "status payload has $node_payload nodes with podCount, expected 4"
    fi
    if grep -q '"control-plane"' "$tmpdir/status.json"; then
      ok "node roles include control-plane"
    else
      bad "node roles missing control-plane"
    fi
    if grep -q '"podCount":null' "$tmpdir/status.json"; then
      note "podCount is null for at least one node (pods unreadable at request time)"
    fi
    if grep -q 'k3s-agent-3' "$tmpdir/status.json"; then
      ok "agent nodes appear in the payload"
    else
      bad "agent nodes are missing from the payload"
    fi
  fi
  if grep -q '"database":{"error"' "$tmpdir/status.json"; then
    bad "status payload reports a database error"
  else
    ok "database state is included in the payload"
  fi
else
  bad "GET /api/status returned ${code:-no-response}"
fi

hdr "Management UIs"

code="$(fetch "$HEADLAMP_PORT" "/" "$tmpdir/headlamp.html")"
case "$code" in
  2* | 3*) ok "Headlamp answers on 127.0.0.1:$HEADLAMP_PORT (${code})" ;;
  *) bad "Headlamp returned ${code:-no-response} on port $HEADLAMP_PORT" ;;
esac

code="$(fetch "$KUBEWALL_PORT" "/" "$tmpdir/kubewall.html")"
case "$code" in
  2* | 3*) ok "KubeWall answers on 127.0.0.1:$KUBEWALL_PORT (${code})" ;;
  *) bad "KubeWall returned ${code:-no-response} on port $KUBEWALL_PORT" ;;
esac

hdr "Summary"
printf '  %s passed, %s failed, %s warnings\n' "$pass" "$fail" "$warn"
if [ "$fail" -gt 0 ]; then
  printf '\nSome checks failed. Inspect:\n'
  printf '  docker compose -f kubernetes.yml ps -a\n'
  printf '  docker compose -f kubernetes.yml logs --tail=50 k3s k3s-agent-1 lab-bootstrap\n'
  printf '  docker compose -f kubernetes.yml exec k3s kubectl -n %s get pods,sts,hpa\n' "$NS"
  exit 1
fi
exit 0
