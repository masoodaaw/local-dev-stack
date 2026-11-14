# Web apps stack: setup and operations

![Web apps architecture](./web-apps-architecture.svg)

This guide describes [web-apps.yml](./web-apps.yml). The gateway currently
serves the [default site](./default-site/) for all HTTP requests and for HTTPS
requests. `site1-app` (two replicas) and `site2-app` run on `dev-network`, but
the current [Nginx configuration](./nginx/conf.d/sites.conf) does **not** route
requests to them. Add server blocks before expecting those sites to work.

The current HTTPS certificate is for `myhomeworksheets.com`, not every domain
served by the fallback. Other domains need their own matching certificates to
avoid browser certificate warnings. HTTP is not automatically redirected to HTTPS.

## 1. Prerequisites

- Docker Engine and Docker Compose 2.23.1 or later.
- A domain or dynv6 hostname under your control, a dynv6 HTTP token, and a
  reachable public IPv4 address. The DynDNS API used here updates IPv4 only,
  not AAAA records. Remove or correctly configure any AAAA record separately.
- Router access to forward TCP ports 80 and 443 to the Docker host. Reserve
  the host's LAN IP so the forwarding rules remain valid.
- Ports 80 and 443 available on the host. A firewall, ISP restrictions, CGNAT,
  or a second router can prevent inbound access even when DNS is correct.

This host has other Docker services published on host ports. Only forward the
ports you intend to expose; Docker-published ports can bypass ordinary UFW
rules. Review the host's Docker and firewall configuration before exposing it
to the internet.

## 2. Configure directories and environment

From the repository root, copy `.env.example` to `.env` **only if `.env`
does not already exist**, and edit it. Set `DATA_DIR` to an absolute path on
the Docker host. `REPO_DIR` is optional and defaults to this Compose file's
directory; set it to the absolute repository path if the web assets live there
but Compose runs from a different location.

The updater settings in `.env` are:

```dotenv
DDCLIENT_DAEMON=300
DDCLIENT_SYSLOG=no
DDCLIENT_SSL=yes
DDCLIENT_USEV4=webv4
DDCLIENT_WEBV4=https://api.ipify.org/
DDCLIENT_PROTOCOL=dyndns2
DDCLIENT_SERVER=dynv6.com
DDCLIENT_LOGIN=none
DYNV6_ZONE=your-zone.dynv6.net
DYNV6_TOKEN=your-http-token
```

Replace the zone and token with your own values. `DDCLIENT_DAEMON` is the check
interval in seconds; ddclient updates when the address changes. Keep `.env`
private. Compose renders the token into a config stored on the Docker host;
Docker administrators can read it, and `docker compose config` prints it.
Some Compose versions warn that config UID, GID and mode are unsupported outside
Swarm. Verify the mounted file is private on your installation.

Create these directories under `DATA_DIR` before starting: `nginx/logs`,
`certbot/conf`, `certbot/www`, `site1-data`, and `site2-data`. The certificate
manager must be able to write to both `certbot` directories. The bind mounts
use `create_host_path: false`; Compose will fail if the sources do not exist.
Add content to the site directories as needed. Ensure the repository's
`default-site`, `nginx/conf.d`, and `nginx/ssl-params.conf` exist too.

Create the shared network if it does not already exist:

```bash
docker network inspect dev-network >/dev/null 2>&1 || docker network create dev-network
```

## 3. Set up dynv6 and DNS

1. Create a zone at [dynv6](https://dynv6.com/) and obtain an HTTP token
   authorized for that zone. Set `DYNV6_ZONE` to the exact zone name and
   `DYNV6_TOKEN` to the token in `.env`.
2. Start the updater and inspect its logs:

   ```bash
   docker compose -f web-apps.yml up -d ddns-updater
   docker compose -f web-apps.yml logs -f ddns-updater
   ```

3. Check that the zone's A record resolves to your current public IPv4
   address. Public DNS propagation may take time. Disable any other updater
   for that same zone to avoid conflicting updates.
4. If using a custom domain such as `myhomeworksheets.com`, make sure its
   **authoritative DNS** actually uses the record updated by dynv6. Either
   delegate the domain/zone to dynv6 according to its instructions, or use a
   supported CNAME for a subdomain pointing at the dynv6 hostname. A regular
   CNAME generally cannot be used at the zone apex; use delegation or your
   DNS provider's documented apex alias/flattening instead. Updating an
   unrelated dynv6 zone does not automatically update your custom domain.

When changing updater values, recreate the container to refresh its rendered
configuration:

```bash
docker compose -f web-apps.yml up -d --force-recreate ddns-updater
```

## 4. Forward traffic and start HTTP

Forward TCP 80 and 443 on the router to the Docker host's LAN IP and matching
ports. On this host the last observed LAN address was `192.168.254.88`; confirm
it has not changed. If another router sits upstream, it may need forwarding too.
Do not enable a disabled host firewall without first accounting for existing
remote access and Docker forwarding rules.

The checked-in HTTPS server block requires existing certificate files. On a
fresh installation, back up [sites.conf](./nginx/conf.d/sites.conf), temporarily
remove its **HTTPS** server block, and leave the HTTP challenge location intact.
Then start the stack:

```bash
docker compose -f web-apps.yml up -d
docker compose -f web-apps.yml ps
```

Check `http://your-domain/` from a device outside your network, such as a
phone on cellular. A successful traceroute only confirms an IP route; it does
not prove TCP ports are open. Some routers do not support testing their public
address from inside the LAN (NAT loopback).

## 5. Issue and install an HTTPS certificate

The commands below use the currently configured domain. Replace the domain
and certificate paths consistently if using another domain, and update the
HTTPS Nginx block accordingly. HTTP-01 requires public port 80 throughout
issuance and renewal.

```bash
docker exec certbot acme.sh --issue --server letsencrypt --webroot /var/www/certbot -d myhomeworksheets.com
docker exec certbot mkdir -p /acme.sh/live/myhomeworksheets.com
docker exec certbot acme.sh --install-cert -d myhomeworksheets.com --ecc \
  --key-file /acme.sh/live/myhomeworksheets.com/privkey.pem \
  --fullchain-file /acme.sh/live/myhomeworksheets.com/fullchain.pem \
  --reloadcmd 'kill -HUP 1'
```

Restore the HTTPS server block, confirm its certificate paths and hostname,
then validate and reload Nginx:

```bash
docker exec nginx-gateway nginx -t
docker exec nginx-gateway nginx -s reload
```

Visit `https://myhomeworksheets.com/` from outside the network. The certificate
manager's scheduler renews certificates and the reload hook signals Nginx via
the gateway's shared process namespace. If the gateway is recreated outside
Compose, recreate `certbot` too. Keep certificate and account data in
`DATA_DIR/certbot/conf` private and backed up.

## 6. Operations and troubleshooting

```bash
docker compose -f web-apps.yml ps
docker compose -f web-apps.yml logs --tail=100 ddns-updater nginx-gateway certbot
docker exec certbot acme.sh --list
docker exec nginx-gateway nginx -t
```

- **DNS wrong:** check the dynv6 zone, token, updater logs and which DNS
  provider is authoritative for the requested hostname.
- **HTTP unreachable:** check router forwarding, host LAN IP, upstream NAT,
  ISP restrictions and firewall. Test from outside the LAN.
- **HTTPS connection fails:** verify port 443 forwarding and that Nginx has
  loaded a valid TLS server block and certificate.
- **Certificate warning:** ensure the requested hostname is included in the
  certificate; the fallback site does not provide a valid certificate for
  arbitrary domains.
- **ACME renewal fails:** check public port 80, DNS, shared webroot permissions,
  `certbot` logs, and the certificate expiry. The gateway must stay running.
- **Site 1 or 2 not shown:** add matching Nginx routing and certificates;
  starting those containers alone does not publish or route them.
