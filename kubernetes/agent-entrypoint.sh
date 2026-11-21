#!/bin/sh
# Drop this agent's stale node-password Secret, then start k3s agent.
# K3s stores the hash in kube-system/<name>.node-password.k3s. /etc/rancher/node
# is bind-mounted so a recreate keeps or freshly creates the local password;
# deleting the Secret lets either case register successfully.
#
# Use plain `kubectl` (symlink to the k3s multicall binary). `k3s kubectl ...`
# becomes `kubectl kubectl ...` when argv0 resolution already selects kubectl.
set -e

name="${1:?usage: agent-entrypoint.sh <node-name>}"
shift

echo "agent-entrypoint: starting for node=${name}"

export KUBECONFIG=/kubeconfig/config
export KUBECACHEDIR=/tmp/kube-cache
mkdir -p "$KUBECACHEDIR"

# Prefer the multicall symlinks shipped in the rancher/k3s image.
if [ -x /bin/kubectl ]; then
  kubectl_bin=/bin/kubectl
elif [ -x /usr/local/bin/kubectl ]; then
  kubectl_bin=/usr/local/bin/kubectl
else
  kubectl_bin=kubectl
fi

if [ -x /bin/k3s ]; then
  k3s_bin=/bin/k3s
elif [ -x /usr/local/bin/k3s ]; then
  k3s_bin=/usr/local/bin/k3s
else
  k3s_bin=k3s
fi

clear_secret() {
  "$kubectl_bin" --request-timeout=5s --cache-dir="$KUBECACHEDIR" \
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

echo "agent-entrypoint: exec ${k3s_bin} agent --node-name=${name}"
exec "$k3s_bin" agent --node-name="$name" "$@"
