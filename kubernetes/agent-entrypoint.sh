#!/bin/sh
# Drop this agent's stale node-password Secret, then start k3s agent.
# K3s stores the hash in kube-system/<name>.node-password.k3s (not only the
# legacy server cred file). /etc/rancher/node is bind-mounted so a recreate
# keeps or freshly creates the local password; deleting the Secret lets either
# case register successfully.
set -e

name="${1:?usage: agent-entrypoint.sh <node-name>}"
shift

export KUBECONFIG=/kubeconfig/config

i=0
while [ "$i" -lt 90 ]; do
  if [ -s "$KUBECONFIG" ] && k3s kubectl get --raw=/readyz >/dev/null 2>&1; then
    break
  fi
  i=$((i + 1))
  sleep 2
done

if k3s kubectl get --raw=/readyz >/dev/null 2>&1; then
  k3s kubectl delete secret -n kube-system "${name}.node-password.k3s" --ignore-not-found=true
  echo "agent-entrypoint: cleared kube-system/${name}.node-password.k3s (if present)"
else
  echo "agent-entrypoint: warning: API not ready; starting agent without clearing node-password Secret" >&2
fi

exec k3s agent --node-name="$name" "$@"
