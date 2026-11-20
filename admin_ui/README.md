# Container Dashboard

From the repository root, start only the dashboard:

```powershell
docker compose -f linux-containers.yml up -d --no-deps dashboard
```

Open http://localhost:8080. The existing external `dev-network` network must
exist, as required by the rest of the Compose stack. To use another port, set
`DASHBOARD_PORT` in your environment or Compose `.env` file before starting it.

The `./admin_ui/html` host directory is bind-mounted read-only at
`/usr/share/nginx/html`. The dashboard declares no named or anonymous volumes,
does not mount the Docker socket, and needs no image rebuild for site changes.
Reload the browser after editing the files.
The dashboard requests its local CSS and JavaScript with a new URL on each
page load. Its HTML cache metadata does not replace server-side cache headers,
so browsers or intermediaries may still cache the HTML response.

Bootstrap, Bootstrap Icons, and fonts load from external CDNs and require
internet access. The service list is maintained in `html/app.js`; update it when
changing services or published ports in `linux-containers.yml`.

Links use the dashboard's current hostname and the services' published host
ports. Database tools connect using Compose service names such as `postgres`,
`mariadb`, and `redis`, not the browser hostname. Use your existing service
credentials; this site does not store or display passwords.

This is a static directory, not a live health monitor or reverse proxy. Services
must be started separately. Internal-only services and services without a web UI
are listed without fabricated browser links. API destinations are labeled as
such. The existing Pub/Sub mapping forwards host port 8085 to container port
8080, although its command listens on 8085; that service needs a separate fix
before it is reachable through the published port.

The dashboard adds no authentication. Keep its published port on a trusted
development network, or restrict access using your host firewall.
