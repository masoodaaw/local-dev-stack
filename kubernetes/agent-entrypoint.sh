#!/bin/sh
# Start the k3s agent with a fixed node name. /etc/rancher/node is bind-mounted
# so the local node password survives container recreates.
set -e

name="${1:?usage: agent-entrypoint.sh <node-name>}"
shift

if [ -x /bin/k3s ]; then
  k3s_bin=/bin/k3s
elif [ -x /usr/local/bin/k3s ]; then
  k3s_bin=/usr/local/bin/k3s
else
  k3s_bin=k3s
fi

echo "agent-entrypoint: exec ${k3s_bin} agent --node-name=${name}"
exec "$k3s_bin" agent --node-name="$name" "$@"
