#!/bin/sh
# Generate a self-signed TLS cert for KubeWall so SSE works when the UI is
# opened via a LAN hostname (e.g. https://masood-hp:18085/), not only localhost.
set -e

certs_dir="${1:-/certs}"
hosts="${KUBEWALL_TLS_HOSTS:-localhost,masood-hp,127.0.0.1}"

mkdir -p "$certs_dir"
cd "$certs_dir"

if [ -f tls.crt ] && [ -f tls.key ]; then
  echo "kubewall-certs: tls.crt already present, skipping"
  exit 0
fi

apk add --no-cache openssl >/dev/null

san=""
old_ifs=$IFS
IFS=,
for host in $hosts; do
  host=$(echo "$host" | tr -d ' ')
  [ -n "$host" ] || continue
  case "$host" in
    *:*) continue ;; # skip IPv6 literals for simplicity
    *[!0-9.]* ) san="${san}DNS:${host}," ;;
    *) san="${san}IP:${host}," ;;
  esac
done
IFS=$old_ifs
san="${san%,}"
[ -n "$san" ] || san="DNS:localhost,IP:127.0.0.1"

echo "kubewall-certs: generating self-signed cert SANs=$san"
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=kubewall-lab" \
  -addext "subjectAltName=${san}"
chmod 600 tls.key
chmod 644 tls.crt
echo "kubewall-certs: wrote $certs_dir/tls.crt"
