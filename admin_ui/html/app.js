"use strict";

const groups = [
  { name: "Management & administration", icon: "sliders", services: [
    { id: "dashboard", container: "dev-dashboard", name: "Service directory", note: "Nginx", self: true, links: [[null, "/", "Directory"]] },
    { id: "Portainer.io", container: "portainer", name: "Containers Admin", note: "Portainer.io", ports: [9443], links: [[9443, "/", "Containers Admin", "https"]] },
    { id: "adminer", container: "dev-adminer", name: "Adminer", note: "SQL database administration", ports: [8088], links: [[8088, "/", "Open Adminer"]] },
    { id: "pgadmin", container: "dev-pgadmin", name: "pgAdmin", note: "PostgreSQL administration", ports: [5050], links: [[5050, "/", "Open pgAdmin"]] },
    { id: "redis-insight", container: "dev-redis-insight", name: "Redis Insight", note: "Redis browser", ports: [5540], links: [[5540, "/", "Open Redis Insight"]] },
    { id: "kafka-ui", container: "dev-kafka-ui", name: "Kafka UI", note: "Kafka cluster administration", ports: [8082], links: [[8082, "/", "Open Kafka UI"]] },
    { id: "mailpit", container: "dev-mailpit", name: "Mailpit", note: "Captured email; SMTP on port 1025", ports: [8025, 1025], links: [[8025, "/", "Open inbox"]] },
    { id: "keycloak", container: "dev-keycloak", name: "Keycloak", note: "Identity & access management", ports: [8089], links: [[8089, "/admin/", "Admin console"], [8089, "/realms/master/account/", "Account"]] },
    { id: "infisical", container: "dev-infisical-proxy", name: "Infisical", note: "HTTPS secrets / env / password store for local projects; uses shared postgres (db infisical) + redis DB 1; accept self-signed cert", ports: [8443], links: [[8443, "/", "Open Infisical", "https"]] },
    { id: "sonarqube", container: "dev-sonarqube", name: "SonarQube", note: "Code quality & security", ports: [9000], links: [[9000, "/", "Open SonarQube"]] }
  ] },
  { name: "Observability", icon: "activity", services: [
    { id: "grafana", container: "dev-grafana", name: "Grafana", note: "Dashboards & log exploration", ports: [3000], links: [[3000, "/dashboards", "Dashboards"], [3000, "/explore", "Explore"]] },
    { id: "prometheus", container: "dev-prometheus", name: "Prometheus", note: "Metrics & scrape targets", ports: [9091], links: [[9091, "/", "Query"], [9091, "/targets", "Targets"]] },
    { id: "jaeger", container: "dev-jaeger", name: "Jaeger", note: "Distributed tracing", ports: [16686], links: [[16686, "/", "Search traces"]] },
    { id: "loki", container: "dev-loki", name: "Loki", note: "Log API; browse logs in Grafana Explore", ports: [3100], links: [[3100, "/ready", "Readiness (API)"]] },
    { id: "otel-collector", container: "dev-otel-collector", name: "OpenTelemetry Collector", note: "OTLP gRPC 4317; HTTP 4318; Fluentd 24224", ports: [4317, 4318, 24224, 8889], links: [[8889, "/metrics", "Metrics (API)"]] },
    { id: "cadvisor", container: "dev-cadvisor", name: "cAdvisor", note: "Internal only: cadvisor:8080; metrics available in Prometheus" },
    { id: "docker-socket-proxy", container: "dev-docker-socket-proxy", name: "Docker socket proxy", note: "Internal only: docker-socket-proxy:2375" },
    { id: "container-status-exporter", container: "dev-container-status-exporter", name: "Container status exporter", note: "Internal metrics exporter; no published web interface" }
  ] },
  { name: "Databases & storage", icon: "database", services: [
    { id: "postgres", container: "dev-postgres", name: "PostgreSQL", note: "Database: devdb; pgvector enabled", ports: [5432], links: [[5050, "/", "Manage in pgAdmin"], [8088, "/?pgsql=postgres&db=devdb", "Adminer"]] },
    { id: "sqlserver", container: "dev-sqlserver", name: "SQL Server", note: "SQL client required; no bundled web UI", ports: [1433] },
    { id: "mongodb", container: "dev-mongodb", name: "MongoDB", note: "MongoDB client required; no bundled web UI", ports: [27017] },
    { id: "mariadb", container: "dev-mariadb", name: "MariaDB", note: "Database: devdb", ports: [3306], links: [[8088, "/?server=mariadb&db=devdb", "Manage in Adminer"]] },
    { id: "redis", container: "dev-redis", name: "Redis", note: "Connect from Redis Insight to redis:6379", ports: [6379], links: [[5540, "/", "Manage in Redis Insight"]] },
    { id: "redis-audit", container: "dev-redis-audit", name: "Redis audit", note: "Background command logger; no web interface" },
    { id: "audit-log-permissions", container: "dev-audit-log-permissions", name: "Audit log permissions", note: "Background permission helper; no web interface" }
  ] },
  { name: "Cloud emulators", icon: "cloud", services: [
    { id: "cosmos-emulator", container: "dev-cosmos", name: "Cosmos DB emulator", note: "Data Explorer on 1234; gateway on 8081; direct ports 10251-10255", ports: [1234, 8081], links: [[1234, "/", "Data Explorer"]] },
    { id: "localstack-aws", container: "dev-local-aws", name: "LocalStack AWS", note: "AWS gateway 4566; service ports 4510-4559", ports: [4566], links: [[4566, "/_localstack/health", "Health (API)"]] },
    { id: "azurite", container: "dev-azurite", name: "Azurite", note: "Blob 10000; Queue 10001; Table 10002. Storage client required", ports: [10000, 10001, 10002] },
    { id: "localgcp-official", container: "dev-local-gcp", name: "Datastore emulator", note: "Datastore API; no bundled web UI", ports: [8095] },
    { id: "gcp-firestore", container: "dev-gcp-firestore", name: "Firestore emulator", note: "Firestore API; no bundled web UI", ports: [8090] },
    { id: "gcp-pubsub", container: "dev-gcp-pubsub", name: "Pub/Sub emulator", note: "Port mismatch: host 8085 forwards to 8080, but emulator listens on 8085", ports: [8085] }
  ] },
  { name: "Messaging", icon: "diagram-3", services: [
    { id: "kafka-1", container: "dev-kafka-1", name: "Kafka broker 1", note: "Kafka protocol", ports: [9092], links: [[8082, "/", "Manage in Kafka UI"]] },
    { id: "kafka-2", container: "dev-kafka-2", name: "Kafka broker 2", note: "Kafka protocol", ports: [9093], links: [[8082, "/", "Manage in Kafka UI"]] },
    { id: "rabbitmq-1", container: "dev-rabbitmq-1", name: "RabbitMQ node 1", note: "AMQP 5672; management 15672", ports: [5672, 15672], links: [[15672, "/", "Management console"]] },
    { id: "rabbitmq-2", container: "dev-rabbitmq-2", name: "RabbitMQ node 2", note: "AMQP only; management port not published", ports: [5673] },
    { id: "rabbitmq-3", container: "dev-rabbitmq-3", name: "RabbitMQ node 3", note: "AMQP only; management port not published", ports: [5674] }
  ] },
  { name: "Initialization", icon: "gear", services: [
    { id: "init-sonar-permissions", container: "init-sonar-perms", name: "SonarQube permissions", note: "For dev-sonarqube. One-shot before SonarQube starts: chown data/extensions/logs/temp under DATA_DIR to uid 1000 so the SonarQube process can write. Without this, SonarQube often crash-loops on permission errors." },
    { id: "init-cosmos-permissions", container: "init-cosmos-perms", name: "Cosmos DB permissions", note: "For dev-cosmos. One-shot before the Cosmos emulator starts: remove stale PID/socket lock files and chmod 700 on DATA_DIR/cosmos. Prevents boot failures after unclean shutdowns." },
    { id: "init-postgres-config", container: "init-postgres-config", name: "Postgres config copy", note: "For dev-postgres. One-shot on compose up: copies repo init-sonar-db.sql into DATA_DIR so Postgres can mount it at /docker-entrypoint-initdb.d (creates the SonarQube DB/user on first empty data dir). Keeps runtime mounts independent of a fixed checkout path." },
    { id: "init-otel-config", container: "init-otel-config", name: "OTel config copy", note: "For dev-otel-collector. One-shot on compose up: copies repo otel-config.yaml into DATA_DIR. The collector bind-mounts that file as its pipeline config (OTLP, Fluentd, Loki, Jaeger, audit log tails)." },
    { id: "init-prom-wal", container: "init-prom-wal", name: "Prometheus WAL + config", note: "For dev-prometheus. One-shot before Prometheus starts: clears corrupted WAL/chunks_head under DATA_DIR/prometheus (avoids crash loops after forced stops) and copies repo prometheus.yml into DATA_DIR for the scrape config bind mount." },
    { id: "init-container-status-exporter-config", container: "init-container-status-exporter-config", name: "Telegraf config copy", note: "For dev-container-status-exporter. One-shot on compose up: copies repo telegraf-docker-status.conf into DATA_DIR. Telegraf mounts it as telegraf.conf to scrape Docker status via the socket proxy." },
    { id: "init-grafana-config", container: "init-grafana-config", name: "Grafana config copy", note: "For dev-grafana. One-shot on compose up: copies repo grafana/provisioning (datasources + dashboard providers) and grafana/dashboards into DATA_DIR/grafana. Grafana mounts those paths read-only; persistent grafana.db stays in DATA_DIR/grafana." },
    { id: "init-loki-config", container: "init-loki-config", name: "Loki config copy", note: "For dev-loki. One-shot on compose up: copies repo loki-config.yaml into DATA_DIR. Loki mounts it as /etc/loki/config.yaml; chunk/index data remains under DATA_DIR/loki." },
    { id: "init-dashboard-config", container: "init-dashboard-config", name: "Dashboard UI copy", note: "For dev-dashboard. One-shot on compose up: copies repo admin_ui/html (this directory UI) into DATA_DIR/admin_ui/html. Nginx serves that copy so the UI survives reboots without depending on a fixed repo path—re-run after editing app.js to refresh." },
    { id: "init-infisical-db", container: "init-infisical-db", name: "Infisical database", note: "For dev-infisical. One-shot before Infisical starts: creates database \"infisical\" on shared dev-postgres (owned by DEV_USER) if missing. Fresh volumes also get it from init-sonar-db.sql." },
    { id: "init-infisical-config", container: "init-infisical-config", name: "Infisical config copy", note: "For dev-infisical-proxy. One-shot on compose up (linux-containers.yml): copies repo infisical/nginx.conf and certs.sh into DATA_DIR/infisical." },
    { id: "init-infisical-certs", container: "init-infisical-certs", name: "Infisical TLS certs", note: "For dev-infisical-proxy. One-shot before the HTTPS proxy starts: generates a self-signed TLS cert under DATA_DIR/infisical/certs (SANs from INFISICAL_TLS_HOSTS). Infisical is HTTPS-only on host port 8443." },
    { id: "init-k3s-sysctl", container: "init-k3s-sysctl", name: "K3s host sysctl", note: "For kubernetes-lab-k3s and all k3s-agent-* nodes. One-shot before the lab starts: raises host fs.inotify max_user_instances/watches (and writes /etc/sysctl.d). Default Linux limits are too low for multi-node k3s + the rest of the stack; without this, agent containerd CRI fails with “too many open files” and port 18080 resets connections." },
    { id: "init-k3s-config", container: "init-k3s-config", name: "K3s landscape copy", note: "For kubernetes-lab-k3s. One-shot on compose up: copies repo kubernetes/landscape.yaml into DATA_DIR. The server mounts it into K3s auto-deploy manifests so the landscape-lab workloads are applied; keeps the manifest path stable across checkout moves." },
    { id: "init-k3s-agent-config", container: "init-k3s-agent-config", name: "K3s agent entrypoint copy", note: "For kubernetes-lab-k3s-agent-1/2/3. One-shot on compose up: copies repo kubernetes/agent-entrypoint.sh into DATA_DIR. Each agent mounts that script as /agent-entrypoint.sh to start k3s-agent with a fixed node name." },
    { id: "init-kubewall-certs-config", container: "init-kubewall-certs-config", name: "KubeWall certs script copy", note: "For kubernetes-lab-kubewall-certs. One-shot on compose up: copies repo kubernetes/kubewall-certs.sh into DATA_DIR so the cert generator container can run without a fixed checkout path." },
    { id: "kubewall-certs", container: "kubernetes-lab-kubewall-certs", name: "KubeWall TLS certs", note: "For kubernetes-lab-kubewall. One-shot before KubeWall starts: runs kubewall-certs.sh to write a self-signed TLS cert/key under DATA_DIR/kubernetes/kubewall/certs. KubeWall needs HTTPS for Server-Sent Events (cluster data streams stay empty over plain HTTP)." }
  ] }
  ,
  { name: "Web apps", icon: "globe2", services: [
    { id: "nginx-proxy-manager", container: "nginx-proxy-manager", name: "Nginx Proxy Manager", note: "Proxy hosts, SSL (Let's Encrypt), redirects; public HTTP/HTTPS on 80/443 (web-apps.yml)", ports: [81, 80, 443], links: [[81, "/", "Open admin UI"]] },
    { id: "ddns-updater", container: "ddns-updater", name: "DDNS updater", note: "dynv6 dynamic DNS via ddclient; no web interface" },
    { id: "default-app", container: "default-app", name: "Default site", note: "Fallback static site; forward hostname to default-app:80 in NPM" },
    { id: "site1-app", container: "web-apps-site1-app-1", name: "Site 1", note: "Static site (2 replicas); forward to site1-app:80 in NPM" },
    { id: "site2-app", container: "web-apps-site2-app-1", name: "Site 2", note: "Static site; forward to site2-app:80 in NPM" }
  ] },
  { name: "MyEyeRx", icon: "eyeglasses", services: [
    { id: "myeyerx-prod-web-1", container: "myeyerx-prod-web-1", name: "MyEyeRx prod UI 1", note: "Same-origin · NPM MyEyeRx.app / → myeyerx-prod-web:4080 · /api /up /rails → myeyerx-prod-api:4080" },
    { id: "myeyerx-prod-web-2", container: "myeyerx-prod-web-2", name: "MyEyeRx prod UI 2", note: "Scale-set · alias myeyerx-prod-web:4080" },
    { id: "myeyerx-prod-api-1", container: "myeyerx-prod-api-1", name: "MyEyeRx prod API 1", note: "Public via MyEyeRx.app/api · LAN-only api.MyEyeRx.app (NPM Access List) · alias myeyerx-prod-api:4080 · DB MyEyeRx" },
    { id: "myeyerx-prod-api-2", container: "myeyerx-prod-api-2", name: "MyEyeRx prod API 2", note: "Scale-set · alias myeyerx-prod-api:4080" },
    { id: "myeyerx-prod-api-3", container: "myeyerx-prod-api-3", name: "MyEyeRx prod API 3", note: "Scale-set · alias myeyerx-prod-api:4080" },
    { id: "myeyerx-dev-web", container: "myeyerx-dev-web", name: "MyEyeRx dev UI", note: "Same-origin · NPM dev.MyEyeRx.app / → web · /api → myeyerx-dev-api:4080" },
    { id: "myeyerx-dev-api", container: "myeyerx-dev-api", name: "MyEyeRx dev API", note: "Internal via dev.MyEyeRx.app/api · DB myeyerx_dev" },
    { id: "myeyerx-qa-web", container: "myeyerx-qa-web", name: "MyEyeRx QA UI", note: "Same-origin · NPM qa.MyEyeRx.app / → web · /api → myeyerx-qa-api:4080" },
    { id: "myeyerx-qa-api", container: "myeyerx-qa-api", name: "MyEyeRx QA API", note: "Internal via qa.MyEyeRx.app/api · DB myeyerx_qa" }
  ] },
  { name: "Kubernetes lab", icon: "hexagon", services: [
    { id: "k8s-landscape", container: "k8s-k3s", name: "Kubernetes landscape", note: "K3s lab: 1 server + 3 agent nodes; gateway, load balancer, CDN, UI, API, database + DR", ports: [18080], links: [[18080, "/", "Open control room"], [18080, "/architecture.svg", "Architecture"]] },
    { id: "k8s-landscape-alt", container: "k8s-agent", name: "Kubernetes landscape (worker ingress)", note: "Same control room through k3s-agent-2 (18081) or k3s-agent-3 (18082)", ports: [18081, 18082], links: [[18081, "/", "Via k3s-agent-2"], [18082, "/", "Via k3s-agent-3"]] },
    { id: "k8s-gateway", container: "k8s-k3s", name: "Gateway stats", note: "Request rate, in-flight and p95 latency (JSON API)", ports: [18080], links: [[18080, "/_gateway/stats", "Gateway stats (API)"]] },
    { id: "k8s-loadbalancer", container: "k8s-k3s", name: "Load balancer stats", note: "Round-robin distribution across CDN pods (JSON API)", ports: [18080], links: [[18080, "/_lb/stats", "LB stats (API)"]] },
    { id: "k8s-cdn", container: "k8s-k3s", name: "CDN stats", note: "Cache hits, hit ratio and object count (JSON API)", ports: [18080], links: [[18080, "/_cdn/stats", "CDN stats (API)"]] },
    { id: "k8s-status", container: "k8s-k3s", name: "Cluster status", note: "Pods, HPAs, metrics, events and database state (JSON API)", ports: [18080], links: [[18080, "/api/status", "Cluster status (API)"]] },
    { id: "k8s-headlamp", container: "k8s-headlamp", name: "Headlamp", note: "Kubernetes web UI on the lab kubeconfig (18084)", ports: [18084], links: [[18084, "/", "Open Headlamp"]] },
    { id: "k8s-kubewall", container: "k8s-kubewall", name: "KubeWall", note: "Multi-cluster dashboard (HTTPS on 18085; accept self-signed cert)", ports: [18085], links: [[18085, "/", "Open KubeWall", "https"]] },
    { id: "k8s-kubectl", container: "k8s-k3s", name: "kubectl access", note: "API server on 127.0.0.1:16443; run docker compose exec k3s kubectl get nodes", ports: [16443] }
  ] }
];

const hostname = location.hostname || "localhost";
const directory = document.querySelector("#directory");
const search = document.querySelector("#search");
const categories = document.querySelector("#categories");
let selectedCategory = "";
const services = groups.flatMap(group => group.services);
document.querySelector("#hostname").textContent = hostname;
document.querySelector("#service-count").textContent = services.length;
document.querySelector("#web-count").textContent = new Set(services.flatMap(service => (service.links || []).map(([port, path]) => `${port}${path}`))).size;

function element(tag, className, text) {
  const node = document.createElement(tag);
  node.className = className;
  if (text) node.textContent = text;
  return node;
}

function serviceUrl(port, path, scheme = "http") {
  const url = new URL(location.href);
  if (port !== null) {
    url.protocol = `${scheme}:`;
    url.port = String(port);
  }
  return new URL(path, url.origin).href;
}

async function copyEndpoint(endpoint, button) {
  try {
    if (navigator.clipboard && globalThis.isSecureContext) {
      await navigator.clipboard.writeText(endpoint);
    } else {
      const field = element("textarea", "visually-hidden");
      field.value = endpoint;
      document.body.append(field);
      field.select();
      const copied = document.execCommand("copy");
      field.remove();
      button.focus();
      if (!copied) throw new Error("Clipboard unavailable");
    }
    document.querySelector("#copy-status").textContent = `Copied ${endpoint}`;
  } catch {
    document.querySelector("#copy-status").textContent = `Could not copy ${endpoint}`;
  }
}

for (const name of ["All categories", ...groups.map(group => group.name)]) {
  const item = element("li", "nav-item");
  const link = element("a", "nav-link", name);
  link.href = "#directory";
  if (name === "All categories") {
    link.classList.add("active");
    link.setAttribute("aria-current", "page");
  }
  link.addEventListener("click", event => {
    event.preventDefault();
    selectedCategory = name === "All categories" ? "" : name;
    for (const tab of categories.querySelectorAll(".nav-link")) {
      const active = tab === link;
      tab.classList.toggle("active", active);
      if (active) tab.setAttribute("aria-current", "page");
      else tab.removeAttribute("aria-current");
    }
    render();
  });
  item.append(link);
  categories.append(item);
}

function render() {
  directory.replaceChildren();
  const query = search.value.trim().toLowerCase();
  let visibleCount = 0;
  for (const group of groups) {
    if (selectedCategory && selectedCategory !== group.name) continue;
    const matches = group.services.filter(service => `${service.id} ${service.container} ${service.name} ${service.note} ${(service.ports || []).join(" ")} ${group.name}`.toLowerCase().includes(query));
    if (!matches.length) continue;
    visibleCount += matches.length;
    const section = element("section", "service-section");
    const heading = element("div", "section-heading");
    const icon = element("i", `bi bi-${group.icon}`);
    icon.setAttribute("aria-hidden", "true");
    heading.append(icon, element("h2", "", group.name), element("span", "section-count", String(matches.length)));
    section.append(heading);
    const grid = element("div", "service-grid");
    for (const service of matches) {
      const row = element("article", "card service-card");
      row.dataset.service = service.id;
      const details = element("div", "");
      details.append(element("div", "service-name", service.name), element("div", "container-name", service.container), element("div", "service-note", service.note));
      const endpoints = element("div", "endpoints");
      const addresses = service.self ? [location.host] : (service.ports || []).map(port => `${hostname}:${port}`);
      for (const address of addresses) {
        const line = element("div", "endpoint-line");
        const button = element("button", "copy-button");
        button.type = "button";
        button.title = `Copy ${address}`;
        button.setAttribute("aria-label", button.title);
        const copyIcon = element("i", "bi bi-copy");
        copyIcon.setAttribute("aria-hidden", "true");
        button.append(copyIcon);
        button.addEventListener("click", () => copyEndpoint(address, button));
        line.append(element("span", "", address), button);
        endpoints.append(line);
      }
      const destinations = element("div", "destinations");
      for (const [port, path, label, scheme] of service.links || []) {
        const link = element("a", "destination", label);
        link.href = serviceUrl(port, path, scheme || "http");
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.setAttribute("aria-label", `${service.name}: ${label} (opens in new tab)`);
        const arrow = element("i", "bi bi-arrow-up-right");
        arrow.setAttribute("aria-hidden", "true");
        link.append(arrow);
        destinations.append(link);
      }
      if (!service.links) destinations.append(element("span", "endpoint-type", addresses.length ? "Client connection" : "Internal service"));
      row.append(details, endpoints, destinations);
      grid.append(row);
    }
    section.append(grid);
    directory.append(section);
  }
  document.querySelector("#results").textContent = `${visibleCount} of ${services.length} services`;
  document.querySelector("#empty").hidden = visibleCount > 0;
}

search.addEventListener("input", render);
render();