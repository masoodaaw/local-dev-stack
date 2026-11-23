"use strict";

const groups = [
  { name: "Management & administration", icon: "sliders", services: [
    { id: "dashboard", container: "dev-dashboard", name: "Service directory", note: "Nginx", self: true, links: [[null, "/", "Directory"]] },
    { id: "adminer", container: "dev-adminer", name: "Adminer", note: "SQL database administration", ports: [8088], links: [[8088, "/", "Open Adminer"]] },
    { id: "pgadmin", container: "dev-pgadmin", name: "pgAdmin", note: "PostgreSQL administration", ports: [5050], links: [[5050, "/", "Open pgAdmin"]] },
    { id: "redis-insight", container: "dev-redis-insight", name: "Redis Insight", note: "Redis browser", ports: [5540], links: [[5540, "/", "Open Redis Insight"]] },
    { id: "kafka-ui", container: "dev-kafka-ui", name: "Kafka UI", note: "Kafka cluster administration", ports: [8082], links: [[8082, "/", "Open Kafka UI"]] },
    { id: "mailpit", container: "dev-mailpit", name: "Mailpit", note: "Captured email; SMTP on port 1025", ports: [8025, 1025], links: [[8025, "/", "Open inbox"]] },
    { id: "keycloak", container: "dev-keycloak", name: "Keycloak", note: "Identity & access management", ports: [8089], links: [[8089, "/admin/", "Admin console"], [8089, "/realms/master/account/", "Account"]] },
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
    { id: "init-sonar-permissions", container: "init-sonar-perms", name: "SonarQube permissions", note: "One-shot initialization; no web interface" },
    { id: "init-cosmos-permissions", container: "init-cosmos-perms", name: "Cosmos DB permissions", note: "One-shot initialization; no web interface" },
    { id: "init-prom-wal", container: "init-prom-wal", name: "Prometheus WAL initialization", note: "One-shot initialization; no web interface" }
  ] }
  ,
  { name: "Kubernetes lab", icon: "hexagon", services: [
    { id: "k8s-landscape", container: "k8s-k3s", name: "Kubernetes landscape", note: "K3s lab: 1 server + 3 agent nodes; gateway, load balancer, CDN, UI, API, database + DR", ports: [18080], links: [[18080, "/", "Open control room"], [18080, "/architecture.svg", "Architecture"]] },
    { id: "k8s-landscape-alt", container: "k8s-agent", name: "Kubernetes landscape (worker ingress)", note: "Same control room through k3s-agent-2 (18081) or k3s-agent-3 (18082)", ports: [18081, 18082], links: [[18081, "/", "Via k3s-agent-2"], [18082, "/", "Via k3s-agent-3"]] },
    { id: "k8s-gateway", container: "k8s-k3s", name: "Gateway stats", note: "Request rate, in-flight and p95 latency (JSON API)", ports: [18080], links: [[18080, "/_gateway/stats", "Gateway stats (API)"]] },
    { id: "k8s-loadbalancer", container: "k8s-k3s", name: "Load balancer stats", note: "Round-robin distribution across CDN pods (JSON API)", ports: [18080], links: [[18080, "/_lb/stats", "LB stats (API)"]] },
    { id: "k8s-cdn", container: "k8s-k3s", name: "CDN stats", note: "Cache hits, hit ratio and object count (JSON API)", ports: [18080], links: [[18080, "/_cdn/stats", "CDN stats (API)"]] },
    { id: "k8s-status", container: "k8s-k3s", name: "Cluster status", note: "Pods, HPAs, metrics, events and database state (JSON API)", ports: [18080], links: [[18080, "/api/status", "Cluster status (API)"]] },
    { id: "k8s-headlamp", container: "k8s-headlamp", name: "Headlamp", note: "Kubernetes web UI on the lab kubeconfig (18084)", ports: [18084], links: [[18084, "/", "Open Headlamp"]] },
    { id: "k8s-kubewall", container: "k8s-kubewall", name: "KubeWall", note: "Multi-cluster dashboard (HTTPS on 18085; accept self-signed cert)", ports: [18085], links: [[18085, "/", "Open KubeWall (use https://)"]] },
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

function serviceUrl(port, path) {
  const url = new URL(location.href);
  if (port !== null) {
    url.protocol = "http:";
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
      for (const [port, path, label] of service.links || []) {
        const link = element("a", "destination", label);
        link.href = serviceUrl(port, path);
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