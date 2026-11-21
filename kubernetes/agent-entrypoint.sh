#!/bin/sh
# Drop this agent's stale node-password Secret, then start k3s agent.
# K3s stores the hash in kube-system/<name>.node-password.k3s. /etc/rancher/node
# is bind-mounted so a recreate keeps or freshly creates the local password;
# deleting the Secret lets either case register successfully.
set -e

name="${1:?usage: agent-entrypoint.sh <node-name>}"
shift

echo "agent-entrypoint: starting for node=${name}"

export KUBECONFIG=/kubeconfig/config
export KUBECACHEDIR=/tmp/kube-cache
mkdir -p "$KUBECACHEDIR"

clear_secret() {
  k3s kubectl --request-timeout=5s --cache-dir="$KUBECACHEDIR" \
    delete secret -n kube-system "${name}.node-password.k3s" --ignore-not-found=true
}

if [ ! -s "$KUBECONFIG" ]; then
  echo "agent-entrypoint: warning: missing or empty $KUBECONFIG; starting agent without clearing Secret" >&2
else
  i=0
  while [ "$i" -lt 30 ]; do
    if clear_secret; then
      echo "agent-entrypoint: cleared kube-system/${name}.node-password.k3s (if present)"
      break
    fi
    i=$((i + 1))
    echo "agent-entrypoint: API not ready for Secret delete (attempt ${i}/30)"
    sleep 2
  done
  if [ "$i" -ge 30 ]; then
    echo "agent-entrypoint: warning: giving up on Secret delete; starting agent anyway" >&2
  fi
fi

echo "agent-entrypoint: exec k3s agent --node-name=${name}"
exec k3s agent --node-name="$name" "$@"
