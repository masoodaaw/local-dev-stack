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
|  * Redis & CosmosDB                                              * Grafana & Sonar  |
+-------------------------------------------------------------------------------------+



An all-in-one, single-command Docker Compose environment providing local infrastructure for enterprise application development. Run databases, cloud emulators, event streaming clusters, code quality analyzers, and OpenTelemetry observability locally without cloud costs or complex manual setups.

## 📦 What's Included

- **Databases:** PostgreSQL 16 (with `pgvector`), SQL Server 2022, MongoDB 7.0, MariaDB 11, Azure Cosmos DB Emulator, Redis 7.
- **Cloud Emulators:** AWS LocalStack, Azure Storage (Azurite), GCP Pub/Sub, GCP Firestore.
- **Event Streaming & Queues:** Apache Kafka Cluster (2-node KRaft), RabbitMQ Cluster (3-node HA).
- **Code Analysis & Observability:** SonarQube Community, OpenTelemetry Collector, Jaeger Tracing, Prometheus, Grafana.
- **Management GUIs:** Adminer, pgAdmin 4, Redis Insight, Kafka UI, RabbitMQ Management.

---

## ⚡ Quick Start

### 1. Prerequisites

- Docker Desktop (with WSL2 enabled on Windows)
- At least 16 GB RAM allocated to Docker

### 2. Initialization

### 3. Add an `.env.example` File

copy .env.example to .env


#### On Windows (PowerShell):

```powershell
# Create the external shared Docker network
docker network create dev-network


# Launch the stack
docker compose -f compose-file-name.yaml up -d
````

## 🛠️ Accessing Management Dashboards

Once the container stack is running (`docker compose up -d`), you can access all pre-configured management UIs and observability dashboards directly from your host browser:

| Service            | Host URL                                         | Default Credentials                                     | Description / Purpose                                                                           |
| :----------------- | :----------------------------------------------- | :------------------------------------------------------ | :---------------------------------------------------------------------------------------------- |
| **Adminer**        | [http://localhost:8088](http://localhost:8088)   | N/A                                                     | Lightweight database management UI for PostgreSQL, SQL Server, and MariaDB.                     |
| **pgAdmin 4**      | [http://localhost:5050](http://localhost:5050)   | `admin@dev.local.com` / `YourPassword`                  | Full-featured PostgreSQL & `pgvector` management dashboard.                                     |
| **Redis Insight**  | [http://localhost:5540](http://localhost:5540)   | N/A                                                     | Visual key-value inspector and memory performance profiler for Redis (`dev-redis:6379`).        |
| **Kafka UI**       | [http://localhost:8082](http://localhost:8082)   | Pre-configured                                          | Real-time topic, partition, consumer group, and message inspector for the 2-node Kafka cluster. |
| **RabbitMQ UI**    | [http://localhost:15672](http://localhost:15672) | `devuser` / `YourPassword`                              | Management console for monitoring queues, exchanges, and bindings across the 3-node HA cluster. |
| **SonarQube**      | [http://localhost:9000](http://localhost:9000)   | `admin` / `admin` _(Prompted to change on first login)_ | Code quality analysis, vulnerability scanning, and technical debt reporting.                    |
| **Jaeger Tracing** | [http://localhost:16686](http://localhost:16686) | N/A                                                     | Distributed tracing UI for searching spans and visualizing OpenTelemetry trace propagation.     |
| **Grafana**        | [http://localhost:3000](http://localhost:3000)   | `admin` / `YourPassword`                                | Observability dashboard platform for system metrics and telemetry visualization.                |
| **Prometheus**     | [http://localhost:9091](http://localhost:9091)   | N/A                                                     | Metrics collector and PromQL query console.                                                     |

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
