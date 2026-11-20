#!/usr/bin/env bash
set -euo pipefail

REPO_DIR="/opt/repos/local-dev-stack"
DATA_DIR="/opt/dev-data"
OWNER_UID="${SUDO_UID:-1000}"
OWNER_GID="${SUDO_GID:-1000}"

echo "=== Initializing Multi-Site Docker Stack ==="
echo "Repo directory : $REPO_DIR"
echo "Data directory : $DATA_DIR"
echo "Target owner   : $OWNER_UID:$OWNER_GID"

# 1. Create directory structures
sudo mkdir -p \
  "$REPO_DIR/nginx/conf.d" \
  "$REPO_DIR/default-site" \
  "$DATA_DIR/ddclient" \
  "$DATA_DIR/nginx/logs" \
  "$DATA_DIR/certbot/conf" \
  "$DATA_DIR/certbot/www" \
  "$DATA_DIR/certbot/logs" \
  "$DATA_DIR/site1-data" \
  "$DATA_DIR/site2-data"

# 2. Create .env shortcut for web-apps.yml
if [ ! -f "$REPO_DIR/.env" ]; then
  cat << 'EOF' | sudo tee "$REPO_DIR/.env" > /dev/null
COMPOSE_FILE=web-apps.yml
EOF
fi

# 3. Create Nginx shared SSL parameters
if [ ! -f "$REPO_DIR/nginx/ssl-params.conf" ]; then
  cat << 'EOF' | sudo tee "$REPO_DIR/nginx/ssl-params.conf" > /dev/null
ssl_protocols TLSv1.2 TLSv1.3;
ssl_prefer_server_ciphers off;
ssl_session_cache shared:SSL:10m;
ssl_session_timeout 1d;
EOF
fi

# 4. Create starter HTTP Nginx config (use before issuing initial SSL certs)
if [ ! -f "$REPO_DIR/nginx/conf.d/sites.conf" ]; then
  cat << 'EOF' | sudo tee "$REPO_DIR/nginx/conf.d/sites.conf" > /dev/null
resolver 127.0.0.11 valid=10s;

# Default catch-all server for unconfigured domains
server {
    listen 80 default_server;
    listen [::]:80 default_server;
    server_name _;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        set $upstream_default http://default-app:80;
        proxy_pass $upstream_default;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
EOF
fi

# 5. Create user-friendly default fallback webpage
if [ ! -f "$REPO_DIR/default-site/index.html" ]; then
  cat << 'EOF' | sudo tee "$REPO_DIR/default-site/index.html" > /dev/null
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Site Not Configured</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            background-color: #0f172a;
            color: #f8fafc;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
            margin: 0;
            text-align: center;
        }
        .card {
            background: #1e293b;
            padding: 2.5rem;
            border-radius: 12px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            max-width: 480px;
            margin: 1rem;
        }
        h1 { margin-top: 0; color: #38bdf8; font-size: 1.75rem; }
        p { color: #cbd5e1; line-height: 1.6; }
        .badge {
            display: inline-block;
            background: #334155;
            color: #94a3b8;
            padding: 0.25rem 0.75rem;
            border-radius: 999px;
            font-size: 0.85rem;
            margin-top: 1rem;
        }
    </style>
</head>
<body>
    <div class="card">
        <h1>Nothing Hosted Here Yet</h1>
        <p>This domain is active and connected to our server, but no website or service has been assigned to this address yet.</p>
        <p>Please check the URL or check back soon!</p>
        <div class="badge">Status: Server Online</div>
    </div>
</body>
</html>
EOF
fi

# 6. Create placeholder index.html files for Site 1 and Site 2
if [ ! -f "$DATA_DIR/site1-data/index.html" ]; then
  echo "<h1>Site 1 Online (Load Balanced)</h1>" | sudo tee "$DATA_DIR/site1-data/index.html" > /dev/null
fi

if [ ! -f "$DATA_DIR/site2-data/index.html" ]; then
  echo "<h1>Site 2 Online</h1>" | sudo tee "$DATA_DIR/site2-data/index.html" > /dev/null
fi

# 7. Create starter ddclient.conf
if [ ! -f "$DATA_DIR/ddclient/ddclient.conf" ]; then
  cat << 'EOF' | sudo tee "$DATA_DIR/ddclient/ddclient.conf" > /dev/null
daemon=300
syslog=yes
ssl=yes
use=web, web=checkip.dyndns.com/

# Replace with your DNS provider settings
protocol=cloudflare
zone=domainA.com
ttl=1
login=token
password=YOUR_CLOUDFLARE_API_TOKEN
domainA.com, *.domainA.com
EOF
fi

# 8. Create starter cloudflare.ini for Certbot DNS-01 wildcard certs
if [ ! -f "$DATA_DIR/certbot/cloudflare.ini" ]; then
  cat << 'EOF' | sudo tee "$DATA_DIR/certbot/cloudflare.ini" > /dev/null
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN
EOF
fi

# 9. Set ownership and strict permissions on secrets
sudo chown -R "$OWNER_UID:$OWNER_GID" "$REPO_DIR" "$DATA_DIR"
chmod 600 "$DATA_DIR/certbot/cloudflare.ini" "$DATA_DIR/ddclient/ddclient.conf"

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Save your compose file to: $REPO_DIR/web-apps.yml"
echo "2. Add your API tokens to: $DATA_DIR/ddclient/ddclient.conf and $DATA_DIR/certbot/cloudflare.ini"
echo "3. Issue wildcard certs: cd $REPO_DIR && docker compose run --rm certbot certonly --dns-cloudflare --dns-cloudflare-credentials /cloudflare.ini -d domainA.com -d '*.domainA.com'"
echo "4. Update $REPO_DIR/nginx/conf.d/sites.conf with your HTTPS server blocks"
echo "5. Start the stack: cd $REPO_DIR && docker compose -f web-apps.yml up -d"

