#!/bin/sh
# Clear this agent's stale server-side node password, then start k3s agent.
# /etc/rancher/node is bind-mounted so a recreate keeps (or freshly creates) the
# local password; wiping the matching server entry lets either case join.
set -e

name="${1:?usage: agent-entrypoint.sh <node-name>}"
shift

cred_dir=/server-cred
passwd_file="${cred_dir}/node-passwd"
lock_dir="${cred_dir}/node-passwd.lock"

if [ -f "$passwd_file" ]; then
  i=0
  while [ "$i" -lt 50 ]; do
    if mkdir "$lock_dir" 2>/dev/null; then
      # Keep every line that is not this agent (format: name,password).
      grep -v "^${name}," "$passwd_file" > /tmp/node-passwd || true
      cat /tmp/node-passwd > "$passwd_file"
      rmdir "$lock_dir"
      break
    fi
    i=$((i + 1))
    # Stale lock from a killed agent: drop it and retry.
    if [ "$i" -eq 40 ]; then
      rmdir "$lock_dir" 2>/dev/null || true
    fi
    sleep 0.25
  done
fi

exec k3s agent --node-name="$name" "$@"
