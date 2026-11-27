#!/bin/sh
# Generate a self-signed TLS cert for Infisical (HTTPS-only secrets UI).
set -e

certs_dir="${1:-/certs}"
hosts="${INFISICAL_TLS_HOSTS:-localhost,127.0.0.1}"

mkdir -p "$certs_dir"
cd "$certs_dir"

if [ -f tls.crt ] && [ -f tls.key ]; then
  echo "infisical-certs: tls.crt already present, skipping"
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
    *:*) continue ;;
    *[!0-9.]* ) san="${san}DNS:${host}," ;;
    *) san="${san}IP:${host}," ;;
  esac
done
IFS=$old_ifs
san="${san%,}"
[ -n "$san" ] || san="DNS:localhost,IP:127.0.0.1"

echo "infisical-certs: generating self-signed cert SANs=$san"
openssl req -x509 -newkey rsa:2048 -nodes -days 3650 \
  -keyout tls.key -out tls.crt \
  -subj "/CN=infisical-local" \
  -addext "subjectAltName=${san}"
chmod 600 tls.key
chmod 644 tls.crt
echo "infisical-certs: wrote $certs_dir/tls.crt"
