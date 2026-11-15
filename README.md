# 🚀 Universal Local Dev Infrastructure Stack

[![Docker Compose](https://img.shields.io/badge/Docker%20Compose-v2%2B-blue?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](https://github.com/masoodaaw/local-dev-stack/pulls)
[![GitHub stars](https://img.shields.io/github/stars/masoodaaw/local-dev-stack?style=social)](https://github.com/masoodaaw/local-dev-stack/stargazers)

## 📐 Network & Stack Architecture

````text
               +-------------------------------------------------------+
               |                  HOST MACHINE                         |
               |                                                       |
               |   [ Browser UIs / Dev IDEs (.NET, Angular, Java) ]    |
               +---------------------------+---------------------------+
                                           |
                                 (Host Port Mappings)
                                           |
+------------------------------------------v------------------------------------------+
|  Docker Network: dev-network                                                        |
|                                                                                     |
|  [ Datastores ]         [ Messaging ]         [ Emulators ]      [ Observability ]  |
|  * PostgreSQL/pgvector  * Kafka Cluster       * AWS LocalStack   * OTel Collector   |
|  * SQL Server 2022      * RabbitMQ HA Cluster * Azure Azurite    * Jaeger Tracing   |
|  * MongoDB & MariaDB                          * GCP PubSub/DS    * Prometheus       |
|  * Redis & CosmosDB                                              * Loki, Grafana, Sonar |
+-------------------------------------------------------------------------------------+



An all-in-one Docker Compose environment providing local infrastructure for enterprise application development. Run databases, cloud emulators, event streaming clusters, code quality tools, and OpenTelemetry observability locally. This stack is intended for local development, not production deployment.

## 📦 What's Included

- **Databases:** PostgreSQL 16 (with `pgvector`), SQL Server 2022, MongoDB 7.0, MariaDB 11, Azure Cosmos DB Emulator, Redis 7.
- **Cloud Emulators:** AWS LocalStack, Azure Storage (Azurite), GCP Pub/Sub, GCP Firestore.
- **Event Streaming & Queues:** Apache Kafka Cluster (2-node KRaft), RabbitMQ Cluster (3-node HA).
- **Code Analysis & Observability:** SonarQube Community, OpenTelemetry Collector, Jaeger Tracing, Prometheus, Loki, and Grafana. Compose container stdout/stderr logs flow through the Collector into Loki. Grafana provisions the Loki, Prometheus, and Jaeger data sources and a Container Logs dashboard.
- **Management GUIs:** Adminer, pgAdmin 4, Redis Insight, Kafka UI, RabbitMQ Management.

---

## ⚡ Quick Start

### 1. Prerequisites

- Docker Desktop (with WSL2 enabled on Windows)
- At least 16 GB RAM allocated to Docker

### 2. Configure the environment

From the repository root, create your local environment file and edit it:

```powershell
Copy-Item .env.example .env
notepad .env
```

Set `DATA_DIR` to an absolute path on your machine. The path in `.env.example` is only an example. Change `DEV_PASS` from the sample value before starting the stack. Keep `.env` private; it is excluded from Git.

### 3. Create the shared Docker network and start the stack

Compose expects an external Docker network named `dev-network`. Create it once on the Docker host, then start the stack:

```powershell
docker network inspect dev-network *> $null
if ($LASTEXITCODE -ne 0) { docker network create dev-network }

docker compose -f local-containers.yml up -d
docker compose -f local-containers.yml ps
```

Docker Desktop with Compose v2 is required. Allocate at least 16 GB RAM to Docker for the full stack; SonarQube and Cosmos DB Emulator are resource-intensive. Host ports must be available. Compose persists service data under `DATA_DIR`.

To stop the stack without deleting persisted data:

```powershell
docker compose -f local-containers.yml down
```

### Linux stack: host directories for image volumes

`linux-containers.yml` bind-mounts the following image-declared paths under
`DATA_DIR`. Create each directory before starting or recreating the affected
service; `create_host_path: false` prevents Compose from creating them.

| Service | Host directory under `DATA_DIR` | Container path |
|---|---|---|
| `mongodb` | `mongodb-configdb` | `/data/configdb` |
| `redis-audit` | `redis-audit-data` | `/data` |
| `audit-log-permissions` | `audit-log-permissions-data` | `/data` |
| `kafka-1` | `kafka-1-secrets`, `kafka-1-config`, `kafka-1-data` | `/etc/kafka/secrets`, `/mnt/shared/config`, `/var/lib/kafka/data` |
| `kafka-2` | `kafka-2-secrets`, `kafka-2-config`, `kafka-2-data` | `/etc/kafka/secrets`, `/mnt/shared/config`, `/var/lib/kafka/data` |
| `jaeger` | `jaeger-tmp` | `/tmp` |
| `sonarqube` | `sonarqube-temp` | `/opt/sonarqube/temp` |

On Linux, set `DATA_DIR` in the shell to the same absolute path used in
`.env`, then create the directories:

```bash
export DATA_DIR=/absolute/path/to/data
mkdir -p "$DATA_DIR"/mongodb-configdb "$DATA_DIR"/redis-audit-data \
  "$DATA_DIR"/audit-log-permissions-data "$DATA_DIR"/kafka-1-secrets \
  "$DATA_DIR"/kafka-1-config "$DATA_DIR"/kafka-1-data \
  "$DATA_DIR"/kafka-2-secrets "$DATA_DIR"/kafka-2-config \
  "$DATA_DIR"/kafka-2-data "$DATA_DIR"/jaeger-tmp "$DATA_DIR"/sonarqube-temp
chmod 700 "$DATA_DIR"/kafka-1-secrets "$DATA_DIR"/kafka-2-secrets
chmod 1777 "$DATA_DIR"/jaeger-tmp
chmod 770 "$DATA_DIR"/sonarqube-temp
```

The configured Kafka containers run as root. The MongoDB entrypoint runs as
root and adjusts ownership of `mongodb-configdb`; Jaeger runs as UID `10001`
and needs a writable temporary directory. Ensure parent directories are
traversable by the relevant container users. The SonarQube permission initializer
sets ownership of `sonarqube-temp` to UID and GID `1000`. The audit helpers do not
currently use their `/data` directories. Kafka's active log directories remain
in `kafka-1` and `kafka-2`, and MongoDB's main database remains in `mongodb`;
do not replace or delete those directories.

**Existing deployments:** a bind mount hides the previous anonymous volume;
Compose does not copy its contents into the host directory. Plan for downtime
and stop the affected services:

```bash
docker compose -f linux-containers.yml stop mongodb redis-audit \
  audit-log-permissions kafka-1 kafka-2 jaeger sonarqube
```

Back up any data, inspect every old volume, and copy any contents that must be
retained into its matching empty host directory with ownership and permissions
preserved. For example, after
stopping `dev-mongodb`, copy its config data with
`docker cp -a dev-mongodb:/data/configdb/. "$DATA_DIR/mongodb-configdb/"`.
Repeat for each mount in the table if it contains data; do not overwrite
existing files. Containers must still exist for `docker cp`; do not remove them
first. Verify the copied data and permissions, including mode `1777` on
`jaeger-tmp`. Run SonarQube's initializer (which recursively changes ownership
of its four mounted directories), then recreate only the affected services:

```bash
docker compose -f linux-containers.yml run --rm --no-deps init-sonar-permissions
docker compose -f linux-containers.yml up -d --no-deps mongodb redis-audit \
  audit-log-permissions kafka-1 kafka-2 jaeger sonarqube
docker inspect dev-mongodb dev-redis-audit dev-audit-log-permissions \
  dev-kafka-1 dev-kafka-2 dev-jaeger dev-sonarqube --format '{{.Name}} {{json .Mounts}}'
```

Keep the old Docker volumes until the migrated services have been checked and
backed up. Jaeger's `/tmp` is temporary; do not assume traces are persisted
there.

### Portainer host bind migration

The Linux Compose file has an optional `portainer` profile. It uses
`${DATA_DIR}/portainer` for `/data` and the existing Docker socket bind.
Access to that socket gives Portainer administrative control of Docker.
The profile keeps ordinary stack startup from conflicting with an existing
standalone Portainer container.

For an existing standalone container named `portainer` using the named volume
`portainer_data`, schedule downtime and back up the volume first. Set
`DATA_DIR` in the shell to the same absolute path used in `.env`. Create a
private directory with the first two commands below, or if it already exists,
verify it is empty and private before skipping `mkdir`. Then stop Portainer
and copy the volume using a read-only source mount:

```bash
export DATA_DIR=/absolute/path/to/data
mkdir -m 700 "$DATA_DIR/portainer"
docker stop portainer
docker run --rm --network none \
  --mount type=volume,source=portainer_data,target=/source,readonly \
  --mount type=bind,source="$DATA_DIR/portainer",target=/target \
  --entrypoint sh alpine:latest -c 'cp -a /source/. /target/ && chmod 700 /target'
```

Verify the copy and backup before proceeding. The original container must be
renamed because Compose cannot create another container with the same name.
Disable its automatic restart so it cannot conflict after a Docker restart:

```bash
docker update --restart=no portainer
docker rename portainer portainer-before-bind
docker compose -f linux-containers.yml --profile portainer up -d --no-deps portainer
docker inspect portainer --format '{{json .Mounts}}'
```

Confirm Portainer works and retains its configuration before removing the old
container or volume. To roll back, stop and rename the new container, rename
`portainer-before-bind` back to `portainer`, restore its `always` restart
policy, and start it. The original `portainer_data` volume remains untouched.
For a fresh deployment, create the private host directory before starting the
profile; no volume copy or rename is needed.

### dynv6 dynamic DNS (web-apps stack)

For the complete setup and troubleshooting guide, see
[Web apps setup and operations](./WEB-APPS-HOWTO.md) and its
[architecture diagram](./web-apps-architecture.svg).

The `ddns-updater` service in `web-apps.yml` runs ddclient in a container.
The web-apps stack uses this repository as its default `REPO_DIR`; set
`REPO_DIR` in `.env` only if its web assets live elsewhere.
In the repository's `.env`, configure the ddclient settings, dynv6 zone name
and HTTP token:

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

Compose 2.23.1 or later interpolates these values into a configuration mounted
for ddclient; no setup script is needed. The daemon interval is in seconds.
The settings above are the defaults when omitted, except the zone and token,
which must be supplied. Enter a zone name without whitespace and an HTTP token
without quotes or line breaks. `DDCLIENT_USEV4` and `DDCLIENT_WEBV4` configure
IPv4 discovery; strategies requiring additional ddclient options are not
configured by this service. Keep `.env` private; users with Docker access can
also read the generated configuration. Compose stores its generated config on
the Docker host. Some Compose versions warn that config ownership and mode
are unsupported outside Swarm; verify the generated file is accessible only
to the container user on your installation. Create `${DATA_DIR}/ddclient` before
starting the updater: it is bind-mounted at `/config` and is not created by
Compose. The active configuration comes from Compose, while the cache remains
ephemeral under `/tmp`; existing files in the host directory are not used by
the current command. Remove obsolete files containing credentials when no longer needed.

With the defaults, the updater checks the public IPv4 address every 300 seconds and updates
dynv6 when it changes. Dynv6's DynDNS API is IPv4-only; it does not update
AAAA records. Start and inspect just the updater without the other web services:

```bash
docker compose -f web-apps.yml up -d ddns-updater
docker compose -f web-apps.yml logs -f ddns-updater
```

After changing `.env`, force recreation so Compose replaces the mounted config:

```bash
docker compose -f web-apps.yml up -d --force-recreate ddns-updater
```

`docker compose config` includes the token in its output; avoid sharing it.

Disable any existing host or router updater for the same zone to avoid
duplicate updates. No host ddclient installation is needed.

### HTTPS for the default web site

The gateway serves the default site for configured hostnames. Set its
hostnames and certificate directory names in the ignored `.env` file.
Each hostname must be included in the certificate served for it. Forward TCP
ports 80 and 443 to the Docker host; port 80 must stay reachable for HTTP-01
certificate issuance and renewal. See the [web apps setup guide](./WEB-APPS-HOWTO.md)
for certificate installation and operations.

## 🛠️ Accessing Management Dashboards

Once the container stack is running, open the management UIs and dashboards from your host browser:

| Service            | Host URL                 | Default Credentials                                     | Description / Purpose                                                                           |
| :----------------- | :----------------------- | :------------------------------------------------------ | :---------------------------------------------------------------------------------------------- |
| **Adminer**        | [http://localhost:8088]  | use [dev-mariadb] as hostname when logging in to aminer | Lightweight database management UI for PostgreSQL, SQL Server, and MariaDB.                     |
| **pgAdmin 4**      | [http://localhost:5050]  | `DEV_EMAIL` / `DEV_PASS` from `.env`, for db use `DEV_USER`/`DEV_PASS` | Full-featured PostgreSQL & `pgvector` management dashboard.                                     |
| **Redis Insight**  | [http://localhost:5540]  | N/A                                                     | Visual key-value inspector and memory performance profiler for Redis (`dev-redis:6379`).        |
| **Kafka UI**       | [http://localhost:8082]  | Pre-configured                                          | Real-time topic, partition, consumer group, and message inspector for the 2-node Kafka cluster. |
| **RabbitMQ UI**    | [http://localhost:15672] | `DEV_USER` / `DEV_PASS` from `.env`                      | Management console for monitoring queues, exchanges, and bindings across the 3-node cluster. |
| **SonarQube**      | [http://localhost:9000]  | `admin` / `admin` _(Prompted to change on first login)_ | Code quality analysis, vulnerability scanning, and technical debt reporting.                    |
| **Jaeger Tracing** | [http://localhost:16686] | N/A                                                     | Distributed tracing UI for searching spans and visualizing OpenTelemetry trace propagation.     |
| **Grafana**        | [http://localhost:3000]  | `admin` / `DEV_PASS` from `.env`                         | Explore logs, metrics, and traces; Loki, Prometheus, and Jaeger are provisioned as data sources. |
| **Loki**           | [http://localhost:3100]  | N/A                                                     | Log storage and query API used by Grafana.                                                      |
| **Prometheus**     | [http://localhost:9091]  | N/A                                                     | Metrics collector and PromQL query console.                                                     |
| **Container Logs** | [Open dashboard](http://localhost:3000/d/container-logs/container-logs) | Sign in to Grafana first | Per-container log-volume, error, warning, and info charts, plus detailed log lines. |
| **Database Audit** | [Open dashboard](http://localhost:3000/d/database-audit/database-audit) | Sign in to Grafana first | Separate PostgreSQL, MariaDB, and Redis activity streams and per-service volume. |
| **Database Audit** | [Open dashboard](http://localhost:3000/d/database-audit/database-audit) | Sign in to Grafana first | Separate PostgreSQL, MariaDB, and Redis activity logs and per-service volume. |
| **Service Activity** | [Open dashboard](http://localhost:3000/d/service-activity/service-activity) | Sign in to Grafana first | RabbitMQ, Kafka, MongoDB, and Cosmos emulator log activity and error-like lines. |
| **Infrastructure Usage** | [Open dashboard](http://localhost:3000/d/infrastructure-usage/infrastructure-usage) | Sign in to Grafana first | Per-container CPU, memory, filesystem, network, and replica counts. |
| **Container Status** | [Open dashboard](http://localhost:3000/d/container-status/container-status) | Sign in to Grafana first | State badge and service name for every container in the `dev-containers` project. |
---

## Observability and Container Logs

Compose services send stdout and stderr through Docker's Fluentd logging driver to the OpenTelemetry Collector on port `24224`. The Collector maps each Compose container tag to the OpenTelemetry `service.name` attribute, sends logs to Loki, and routes traces to Jaeger. Prometheus scrapes Collector metrics. Grafana provisions Loki, Prometheus, and Jaeger as data sources and loads the Container Logs dashboard from `grafana/dashboards/container-logs.json`.

The Container Logs dashboard has separate time-series panels for total log volume, errors, warnings, and info, grouped by service, plus a detailed log viewer. Severity panels use case-insensitive text matching against log lines because container services emit different formats; treat these counts as best-effort rather than authoritative severity classification. LocalStack containers it creates through the Docker socket are not Compose services and are not covered by these logging settings.

In Grafana, open **Explore**, select **Loki**, and try these LogQL queries:

```logql
{service_name=~".+"}
{service_name="dev-kafka-ui"}
{service_name=~".+"} |~ "(?i)\\b(error|err|fatal|critical)\\b"
```

The first query shows logs from all services, the second filters to one Compose service, and the third searches for common error-level text. Adjust the dashboard time range if a service has not emitted logs recently.

The **Messaging and Document Service Activity** dashboard groups collected RabbitMQ, Kafka, MongoDB, and Cosmos emulator container logs. It charts log volume and error-like lines, with separate log panels for each service group. These are operational container logs, not complete audit records: broker logs do not include every published/consumed message body, MongoDB Community does not emit a full CRUD audit trail by default, and Cosmos emulator container logs do not guarantee request-level audit events. Use application instrumentation or service-specific audit facilities when complete activity records are required.

The **Infrastructure Usage** dashboard uses cAdvisor metrics scraped by Prometheus to show CPU, memory, filesystem read/write throughput, network throughput, observed container counts, and Docker VM filesystem usage percentage. Container metrics are grouped by Compose service and container; replicas are shown separately and counted under their service. cAdvisor requires privileged access to Docker's Linux container metadata. On Docker Desktop for Windows, container metrics are for the Linux VM, not total Windows host usage. The disk percentage panel reports block devices visible inside that VM; it is not per-container volume capacity or the Windows drive percentage. Filesystem I/O is throughput, not storage capacity, and does not reliably break down `${DATA_DIR}` bind-mounted usage. For a remote scale set, deploy an exporter on each host and configure Prometheus service discovery/scraping for those hosts; this local dashboard does not automatically discover remote scale-set instances.

The **Container Status** dashboard uses Telegraf's Docker input through the Docker socket proxy to list all containers, including stopped containers, in the `dev-containers` project. The proxy allows read-only container inspection and denies POST operations. State polling includes `created`, `restarting`, `running`, `removing`, `paused`, `exited`, and `dead`. The dashboard shows the current Docker state per container and refreshes every 10 seconds; it is not a historical event timeline.

## Database Activity Logs

The **Database Audit Logs** dashboard is a separate view for file-based activity streams. PostgreSQL writes JSON statement and connection logs under its data directory; MariaDB writes its general query log there; a Redis MONITOR sidecar writes command activity to `${DATA_DIR}/redis-audit`. The Collector tails these files and sends them to Loki with `log.type=database_audit` metadata. Each database has its own log panel.

This is intended for local development and troubleshooting, not compliance-grade audit retention. Full statement/command logging may capture sensitive values, increase disk usage, and affect performance. Redis MONITOR in particular can significantly reduce throughput. Protect the `DATA_DIR` and Grafana/Loki access, and stop or disable the corresponding audit logging when it is not needed. PostgreSQL rotates logs by age/size and Redis rotates its activity file; review and manage MariaDB general-log growth in `${DATA_DIR}/mariadb/audit.log`.

Full native audit files are not enabled for every database in this stack: MongoDB Community does not provide MongoDB Enterprise's audit facility, SQL Server native `.sqlaudit` files need a SQL Server-aware exporter rather than the text file receiver, and the Cosmos emulator does not expose request-level audit records as a supported text file in this configuration. These engines' ordinary container logs continue through the existing stdout/stderr path.

---

## 🤝 Contributing

Contributions are what make the open-source community an incredible place to learn, inspire, and create! Any contributions you make to expand, optimize, or improve this stack are **greatly appreciated**.

### How to Contribute

1. **Fork the Repository:** Click the **Fork** button at the top right of this repository to create your own copy.
2. **Clone your Fork:**
   ```bash
   git clone [https://github.com/masoodaaw/local-dev-stack.git](https://github.com/masoodaaw/local-dev-stack.git)
   cd local-dev-stack
   ```

Make Your Changes:

1. Add new container services to docker-compose.yml.
2. Ensure host ports do not conflict with existing services.
3. Add corresponding persistent data paths using ${DATA_DIR} variable syntax.
4. Verify all added environment variables are defined with defaults in .env.

Test Your Changes: 5. Verify that the full stack initializes cleanly and without port collisions:

```
docker compose up -d --force-recreate
docker ps
git commit -m "feat: add clickhouse analytics container"
git push origin feature/add-new-container
```

6. Open a Pull Request (PR): Navigate to the original repository on GitHub and click Compare & pull request. Provide a clear description of the new service, port mappings, and use cases!

Reporting Issues & Suggesting Services
Found a bug, port conflict, or want to suggest a new service (e.g., Keycloak, ClickHouse, Mailpit)? Please open an Issue on GitHub!
````
