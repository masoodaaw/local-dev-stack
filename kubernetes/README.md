# Kubernetes landscape lab (CKA practice environment)

This is an isolated K3s landscape for learning Kubernetes and rehearsing CKA-style tasks. It runs as a single Compose service on its own Docker network (`kubernetes-lab`, `172.31.240.0/24`), separate from the other Compose services. The control room is at **http://localhost:18080/** when the default port is used, and it appears as the **Kubernetes lab** tab in the existing container dashboard.

## What gets deployed

Every request walks the same chain that a real edge platform uses, and each hop is a normal Kubernetes workload with its own probes, resource requests and (where useful) an HPA:

| Layer | Kubernetes resource | What it demonstrates |
| --- | --- | --- |
| Entry | Traefik `Ingress` (`ingressClassName: traefik`) | K3s bundled ingress controller, no TLS or auth |
| Gateway | `StatefulSet` gateway + HPA 1–3 | request counter, in-flight requests, p95 latency |
| Load balancer | `StatefulSet` loadbalancer + HPA 1–3 | round-robin across CDN **pod IPs** resolved from a headless Service with DNS SRV, per-pod distribution |
| CDN | `StatefulSet` cdn + HPA 1–3 | 15 s GET cache, hit ratio, bytes saved |
| UI | `StatefulSet` ui + HPA 1–5 | serves the control room, proxies `/api/*` |
| API | `StatefulSet` api + HPA 1–5, dedicated ServiceAccount | reads cluster state, runs scoped control actions |
| Database | `StatefulSet` database, 2 pods, `volumeClaimTemplates` | primary + replica, ordered pod names, per-pod PVC |
| Shared state | `PersistentVolumeClaim` landscape-shared | primary marker and rotating backups, mounted by database and API pods |
| Traffic | `StatefulSet` traffic, scaled 0–3 | bounded CPU load generator through the full chain |

Every workload is a `StatefulSet` with `podManagementPolicy: Parallel`, so pods keep stable, readable names (`gateway-0`, `loadbalancer-1`, `cdn-0`, `ui-2`, `api-0`, `database-1`) across restarts, and a headless Service gives each one a DNS name such as `api-0.api-headless`. Namespace quotas are not used, but **NetworkPolicies** default-deny ingress and only allow Traefik and the traffic generator into the gateway, gateway into the load balancer, load balancer into the CDN, CDN into the UI, UI into the API, and API/database peers into the database.

## Start on Linux

From the repository root:

```sh
docker compose -f kubernetes.yml up -d
```

Open `http://localhost:18080/`. The Compose file binds the lab to **loopback by default**. To reach it from another machine, forward the port over SSH rather than publishing it:

```sh
ssh -L 18080:127.0.0.1:18080 user@linux-host
```

If you really must expose it on the LAN, set `K8S_LAB_PORT=18080` (this publishes on all interfaces) and put it behind a firewall — the lab has no login.

The first start pulls `node:22-alpine` and the K3s component images, and it takes a minute or two for Traefik, metrics-server, the local-path provisioner and all pods to become ready. The manifest expects the default K3s Traefik ingress class, metrics-server, the network-policy controller and the `local-path` storage class; it is written for the pinned K3s version in `kubernetes.yml`, not for an existing shared cluster.

## Host persistence (no data in the container layer)

All state is bind-mounted from the Linux host, the same idea as the bind mounts used by the other Compose files:

```text
./kubernetes/data/k3s   -> /var/lib/rancher/k3s   (K3s state, containerd, local-path volumes)
```

The database pods use `volumeClaimTemplates` (one PVC per pod) and the shared `landscape-shared` PVC for the primary marker and backups. The local-path provisioner stores both under `./kubernetes/data/k3s/storage`, so `docker compose down` and `up` keep the counter, the replica data and the backups. Deleting `./kubernetes/data` is a full reset and cannot be undone.

## Simulation walkthrough

### 1. Autoscaling from traffic

1. Open the control room and leave the **autoscaling** table visible.
2. Press **Low load**. The traffic StatefulSet scales to 1 pod (4 workers); watch the API and UI HPAs move from 1 to 2–3 pods within roughly 30–90 seconds.
3. Press **High load**. Traffic goes to 3 pods and UI/API can reach their 5-pod maximum.
4. Press **Off**. CPU falls, but Kubernetes deliberately waits (default 300 s stabilisation window) before scaling down, so pods linger for several minutes. That delay is a real behaviour worth recognising.
5. Watch it from a terminal: `docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get hpa -w`.

If the HPA reports `<unknown>`, metrics-server is still warming up or the pod has no CPU request; every workload here has one.

### 2. Load balancer and CDN usage

The **Component usage** table shows requests/sec, in-flight requests, p95 latency and the round-robin distribution across CDN pod IPs (resolved from the `cdn-headless` Service via DNS SRV). The raw JSON endpoints are `/_gateway/stats`, `/_lb/stats` and `/_cdn/stats`. Because the CDN caches GETs for 15 seconds, repeatedly loading the dashboard raises the cache hit ratio; API traffic always bypasses the cache.

### 3. Primary failure and automatic failover

1. Press **Add to counter** a few times.
2. Press **Simulate primary failure**. The API deletes `database-0`, notices the primary is gone, and calls `/promote` on the ready replica. `database-1` writes itself into the shared `primary.json` marker and starts accepting writes.
3. The counter keeps working and the primary pod name changes. Because the replica pulls the primary every 2 seconds, at most about 2 seconds of writes can be lost — that is the **RPO** of this design.
4. StatefulSet recreates `database-0`; it reads the marker, sees it is no longer primary and becomes a replica. This is asynchronous replication with manual-style promotion logic, not a production database.

### 4. Total loss and disaster recovery

1. Press **Back up now** to snapshot the counter onto the shared PVC (last 10 snapshots are kept).
2. Add a few more counts so the live counter is ahead of the backup.
3. Press **Simulate total DB loss**. The StatefulSet is scaled to 0; API and UI report the database as unavailable.
4. Press **Recover from backup**. The StatefulSet is scaled back to 2 and the latest snapshot is restored; the counter rolls back to the snapshot value. That gap is the **RPO**; the time between loss and a working database is the **RTO**.
5. Inspect what happened with `kubectl get pods`, `kubectl get pvc` and `kubectl get events --sort-by=.lastTimestamp`.

### 5. Rolling updates and rollback practice

```sh
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab rollout restart statefulset/api
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab rollout status statefulset/api
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab set image statefulset/ui ui=node:22-alpine
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab rollout undo statefulset/ui
```

Changing the ConfigMap does not restart Node processes by itself; after applying a new manifest, restart the affected workloads with a normal rollout.

## Routes

| Method and path | Purpose |
| --- | --- |
| `GET /` | Control room dashboard |
| `GET /app.css`, `/browser.js`, `/architecture.svg` | Dashboard assets and the architecture diagram |
| `GET /api/status` | Workloads, HPAs, pods, metrics, events, component stats, database state |
| `POST /api/traffic` | JSON `{"level":0..3}`; scales the traffic generator |
| `POST /api/database/increment` | Persisted counter increment |
| `POST /api/database/backup` | Snapshot the primary to the shared PVC |
| `POST /api/database/restore` | Restore the latest snapshot |
| `POST /api/database/failover` | Delete `database-0` so the replica is promoted |
| `POST /api/database/scale` | JSON `{"replicas":0}` for total loss or `{"replicas":2}` to recover |
| `GET /work` | CPU work used by the generator, through every hop |
| `GET /health` | Probe endpoint of each component |
| `GET /_gateway/stats`, `/_lb/stats`, `/_cdn/stats` | Per-component usage JSON |

Mutations require `Content-Type: application/json` and a matching loopback `Origin` and `Host`. This is CSRF hardening, **not authentication**: a non-browser client can forge headers, so do not expose the port publicly.

## Security and isolation

Only API pods receive the `landscape-controller` service-account token. Its namespace Role can list pods, StatefulSets, HPAs and pod metrics, list events, delete `database-0`, and patch the scale of the `traffic` StatefulSet and the `database` StatefulSet. It cannot read Secrets or change other workloads. No kubeconfig, cluster-admin token or secret is exposed to the browser.

NetworkPolicies isolate the layers inside the namespace, and the whole cluster lives on the dedicated `kubernetes-lab` Docker network. Egress is not restricted; the host and cluster administrators remain trusted.

## Inspection on the Linux host

```sh
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get statefulsets,pods,hpa,svc,pvc
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab top pods
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab describe hpa ui
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get events --sort-by=.lastTimestamp
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab logs statefulset/api --tail=50
```

## Development and offline checks

Edit `resources.yaml` and the application assets, then regenerate the single deployed file and run the Node.js tests from the repository root:

```sh
node kubernetes/build.js
node --check kubernetes/app.js
node --check kubernetes/browser.js
node --test kubernetes/test.js
```

No npm packages and no Docker are needed for these checks. They do not prove real networking, scheduling, PVC durability or HPA behaviour; only the running cluster does.

See [CKA-STUDY-GUIDE.md](CKA-STUDY-GUIDE.md) for exam domains, command drills and exercises mapped onto this landscape, and the root [`kubernetes-architecture.svg`](../kubernetes-architecture.svg) for the diagram.
