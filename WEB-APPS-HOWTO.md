# Web apps stack: setup and operations

![Web apps architecture](./web-apps-architecture.svg)

This guide describes [web-apps.yml](./web-apps.yml). [Nginx Proxy Manager](https://nginxproxymanager.com/)
terminates HTTP/HTTPS and lets you manage proxy hosts (vhosts), SSL certificates,
redirects, and streams from a web UI. `default-app`, `site1-app` (two replicas),
and `site2-app` run on the Docker network; point Proxy Hosts at them by service
name (for example `default-app:80`).

## 1. Prerequisites

- Docker Engine and Docker Compose 2.23.1 or later.
- A dynv6 zone and its HTTP token, and a reachable public IPv4 address. The
  configured DynDNS API updates IPv4 only, not AAAA records.
- Router access to forward TCP ports 80 and 443 to the Docker host. Reserve
  the host LAN address so forwarding remains valid.
- Ports 80 and 443 available on the host. A firewall, ISP restrictions, CGNAT,
  or a second router can prevent inbound access.

This host has other Docker services published on host ports. Only forward the
ports you intend to expose; Docker-published ports can bypass ordinary UFW
rules. Review Docker and firewall exposure before making the host public.

## 2. Configure environment and storage

Copy `.env.example` to `.env` only if `.env` does not already exist. Set
`DATA_DIR` to an absolute path on the Docker host. `REPO_DIR` is optional and
defaults to this Compose file's directory.

Configure the updater and Proxy Manager settings in `.env`:

```dotenv
DDCLIENT_DAEMON=300
DDCLIENT_SYSLOG=no
DDCLIENT_SSL=yes
DDCLIENT_USEV4=webv4
DDCLIENT_WEBV4=https://api.ipify.org/
DDCLIENT_PROTOCOL=dyndns2
DDCLIENT_SERVER=dynv6.com
DDCLIENT_LOGIN=none
DYNV6_ZONE=your-zone.dynv6.net, *.your-zone.dynv6.net
DYNV6_TOKEN=your-http-token

NPM_ADMIN_PORT=127.0.0.1:81
# NPM_DISABLE_IPV6=true
# TZ=UTC
```

Keep `.env` and backups private (`chmod 600 .env`). Compose renders the dynv6
token into a config stored on the Docker host; Docker administrators can read
it, and `docker compose config` prints it.

Create these directories under `DATA_DIR` before starting: `ddclient`,
`nginx-proxy-manager/data`, `nginx-proxy-manager/letsencrypt`, `site1-data`,
and `site2-data`. Bind mounts use `create_host_path: false`; Compose fails if
sources are absent. Ensure `default-site/` exists under the repo.

Or run the setup helper:

```bash
sudo ./web-apps-setup.sh
```

Create the shared network if it does not exist:

```bash
docker network inspect dev-network >/dev/null 2>&1 || docker network create dev-network
```

## 3. Configure dynv6

1. Create a zone at [dynv6](https://dynv6.com/) and create an HTTP token
   authorized for it.
2. Set `DYNV6_ZONE` to the exact records to update. Include each apex
   explicitly as well as wildcard records if both are needed; a wildcard does
   not cover the apex. Separate multiple records with commas.
3. Set `DYNV6_TOKEN` in `.env`, then start and inspect the updater:

   ```bash
   docker compose -f web-apps.yml up -d ddns-updater
   docker compose -f web-apps.yml logs -f ddns-updater
   ```

4. Verify each apex A record resolves to the current public IPv4. Disable any
   competing updater for the same records.
5. For a custom domain, ensure its authoritative DNS actually uses the record
   dynv6 updates. Delegate the zone to dynv6 or use a supported CNAME for a
   subdomain. A regular CNAME generally cannot be used at a zone apex; use
   delegation or your DNS provider's documented apex alias/flattening option.

When changing updater values, recreate the container to refresh its rendered
configuration:

```bash
docker compose -f web-apps.yml up -d --force-recreate ddns-updater
```

## 4. Start Nginx Proxy Manager and add hosts

Forward TCP 80 and 443 to the Docker host's LAN IP. Port 80 must stay
reachable for Let's Encrypt HTTP-01 challenges.

```bash
docker compose -f web-apps.yml up -d
docker compose -f web-apps.yml ps
```

Open the admin UI at [http://127.0.0.1:81](http://127.0.0.1:81) (or the host
binding in `NPM_ADMIN_PORT`). First login defaults:

| Field    | Value               |
| :------- | :------------------ |
| Email    | `admin@example.com` |
| Password | `changeme`          |

Change the password immediately after first login.

### Add a Proxy Host

1. **Hosts → Proxy Hosts → Add Proxy Host**
2. **Domain Names:** your public hostname(s)
3. **Scheme / Forward Hostname / Port:** `http` / `default-app` / `80`
   (or `site1-app` / `site2-app`)
4. Enable **Block Common Exploits** and **Websockets Support** as needed
5. On the **SSL** tab, request a new Let's Encrypt certificate (or use an
   existing one), enable **Force SSL**

Docker DNS resolves service names on `dev-network`, so use the Compose service
name as the forward hostname — not `localhost` or a host IP.

Example mappings:

| Domain                    | Forward to      |
| :------------------------ | :-------------- |
| apex / catch-all site     | `default-app:80` |
| site 1 content            | `site1-app:80`   |
| site 2 content            | `site2-app:80`   |

`site1-app` has two replicas; Docker's built-in DNS round-robins that service
name across both containers.

## 5. Replace the placeholder sites

The web containers serve static files from `default-site/`,
`DATA_DIR/site1-data`, and `DATA_DIR/site2-data`. Replace site content with
the built output of your Angular or React app, or replace a site service with
your own image and update the Proxy Host forward target. For an SPA using
history-based routes, configure its site container's Nginx fallback
(for example `try_files $uri $uri/ /index.html`). Preserve the `/` health
endpoint or update the Compose health check if your replacement image lacks
`wget` or does not serve `/`.

## 6. Monitoring, backups, and updates

Web container stdout/stderr is forwarded through the existing Fluent Forward
collector to Loki. In Grafana, use the Container Logs dashboard or Explore
with `{service_name="nginx-proxy-manager"}`; substitute `ddns-updater` or a
site service name for other logs.

Back up `${DATA_DIR}/nginx-proxy-manager` (SQLite DB, custom Nginx snippets,
and Let's Encrypt material), site content, and `.env` to an access-controlled,
encrypted, off-host location:

```bash
umask 077
tar -C "$DATA_DIR" -czf /secure/backup/web-apps-npm.tar.gz nginx-proxy-manager
```

Images are pinned by digest in Compose. Review and test new versions, then
deliberately update digests to receive security fixes; digest pins do not
update automatically.

## 7. Operations and troubleshooting

```bash
docker compose -f web-apps.yml ps
docker compose -f web-apps.yml logs --tail=100 ddns-updater nginx-proxy-manager
```

- **DNS wrong:** check the dynv6 zone, token, updater logs, and authoritative
  DNS for the hostname.
- **HTTP unreachable:** check router forwarding, host LAN IP, upstream NAT,
  ISP restrictions, and firewall. Test from outside the LAN.
- **Admin UI unreachable:** confirm `NPM_ADMIN_PORT` and that you are on the
  host (loopback binding) or have adjusted the publish address.
- **HTTPS / ACME fails:** verify public TCP 80, DNS A records, and the SSL
  request in the Proxy Manager UI.
- **Site app not shown:** create a Proxy Host that forwards to the service;
  starting a site container alone does not publish or route it.
- **Old nginx-gateway/certbot still running:** stop and remove them after
  switching — they previously owned ports 80/443.
