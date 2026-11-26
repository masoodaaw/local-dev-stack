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
  "$REPO_DIR/default-site" \
  "$DATA_DIR/ddclient" \
  "$DATA_DIR/nginx-proxy-manager/data" \
  "$DATA_DIR/nginx-proxy-manager/letsencrypt" \
  "$DATA_DIR/site1-data" \
  "$DATA_DIR/site2-data"

# 2. Create .env shortcut for web-apps.yml
if [ ! -f "$REPO_DIR/.env" ]; then
  cat << 'EOF' | sudo tee "$REPO_DIR/.env" > /dev/null
COMPOSE_FILE=web-apps.yml
EOF
fi

# 3. Create user-friendly default fallback webpage
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

# 4. Create placeholder index.html files for Site 1 and Site 2
if [ ! -f "$DATA_DIR/site1-data/index.html" ]; then
  echo "<h1>Site 1 Online (Load Balanced)</h1>" | sudo tee "$DATA_DIR/site1-data/index.html" > /dev/null
fi

if [ ! -f "$DATA_DIR/site2-data/index.html" ]; then
  echo "<h1>Site 2 Online</h1>" | sudo tee "$DATA_DIR/site2-data/index.html" > /dev/null
fi

# 5. Create starter ddclient.conf (unused by Compose; active config comes from .env)
if [ ! -f "$DATA_DIR/ddclient/ddclient.conf" ]; then
  cat << 'EOF' | sudo tee "$DATA_DIR/ddclient/ddclient.conf" > /dev/null
# Placeholder only. web-apps.yml renders ddclient config from .env.
daemon=300
syslog=yes
ssl=yes
EOF
fi

# 6. Set ownership
sudo chown -R "$OWNER_UID:$OWNER_GID" "$REPO_DIR" "$DATA_DIR"
chmod 600 "$DATA_DIR/ddclient/ddclient.conf" 2>/dev/null || true

echo ""
echo "=== Setup Complete ==="
echo "Next steps:"
echo "1. Configure DYNV6_* in $REPO_DIR/.env"
echo "2. Ensure docker network exists: docker network create dev-network"
echo "3. Start the stack: cd $REPO_DIR && docker compose -f web-apps.yml up -d"
echo "4. Open Nginx Proxy Manager at http://127.0.0.1:81 (admin@example.com / changeme)"
echo "5. Add Proxy Hosts pointing at default-app:80, site1-app:80, or site2-app:80"

