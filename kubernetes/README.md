# Kubernetes landscape lab (CKA practice environment)

This is an isolated K3s landscape for learning Kubernetes and rehearsing CKA-style tasks. It runs as one server, three agents, a one-shot bootstrap job and two management UIs on its own Docker network (`kubernetes-lab`, `172.31.240.0/24`), separate from the other Compose services. The control room is at **http://localhost:18080/** when the default port is used, and it appears as the **Kubernetes lab** tab in the existing container dashboard.

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
| Shared state | `hostPath` `/shared` on every worker | primary marker and rotating backups, shared by database and API pods across nodes |
| Traffic | `StatefulSet` traffic, scaled 0–3 | bounded CPU load generator through the full chain |

Every workload is a `StatefulSet` with `podManagementPolicy: Parallel`, so pods keep stable, readable names (`gateway-0`, `loadbalancer-1`, `cdn-0`, `ui-2`, `api-0`, `database-1`) across restarts, and a headless Service gives each one a DNS name such as `api-0.api-headless`. Namespace quotas are not used, but **NetworkPolicies** default-deny ingress and only allow Traefik and the traffic generator into the gateway, gateway into the load balancer, load balancer into the CDN, CDN into the UI, UI into the API, and API/database peers into the database.

## Start on Linux

`DATA_DIR` comes from `.env`, exactly like the other Compose files. Compose creates the missing host directories itself, so a fresh checkout needs no manual `mkdir`; only the read-only `landscape.yaml` file bind is strict, because a missing manifest should fail loudly. From the repository root:

```sh
docker compose -f kubernetes.yml up -d
```

`lab-bootstrap` is a one-shot service that runs after the server and gates the two UIs. It waits until the server has written `/etc/rancher/k3s/k3s.yaml` (persisted at `${DATA_DIR}/kubernetes/k3s-config`), sets `${DATA_DIR}/kubernetes/shared` to uid 1000 for the database and API pods, then writes `${DATA_DIR}/kubernetes/kube/config` with the API address retargeted from `https://127.0.0.1:6443` to `https://k3s:6443`. The three agents and both UIs declare `depends_on: lab-bootstrap: condition: service_completed_successfully`, so no node joins before `/shared` is writable and neither UI starts with a missing kubeconfig.

Check it with:

```sh
docker compose -f kubernetes.yml ps -a
docker compose -f kubernetes.yml logs lab-bootstrap
```

If the bootstrap exits 1, the server never produced a kubeconfig within 5 minutes — inspect `docker compose -f kubernetes.yml logs k3s`. The job is idempotent; re-run it with `docker compose -f kubernetes.yml up -d --force-recreate lab-bootstrap` (then `restart headlamp kubewall` if they were already running).

Open `http://localhost:18080/`. The Compose file binds the lab to **loopback by default**. To reach it from another machine, forward the port over SSH rather than publishing it:

```sh
ssh -L 18080:127.0.0.1:18080 user@linux-host
```

If you really must expose it on the LAN, set `K8S_LAB_PORT=18080` (this publishes on all interfaces) and put it behind a firewall — the lab has no login.

The first start pulls four K3s containers, `node:22-alpine` for the workloads, and the two UI images; it takes a few minutes for Traefik, metrics-server, the local-path provisioner and all pods to become ready. The manifest expects the default K3s Traefik ingress class, metrics-server, the network-policy controller and the `local-path` storage class; it is written for the pinned K3s version in `kubernetes.yml`, not for an existing shared cluster.

## Cluster topology

| Compose service | K3s node | Role |
| --- | --- | --- |
| `k3s` | `k3s-server` | control plane, tainted `k3s.io/lab-control-plane=true:NoSchedule` |
| `k3s-agent-1` | `k3s-agent-1` | worker, publishes the ingress on `127.0.0.1:18080` |
| `k3s-agent-2` | `k3s-agent-2` | worker |
| `k3s-agent-3` | `k3s-agent-3` | worker |

Every service pins its container name, so `docker ps` shows fixed names instead of generated `<project>-<service>-1` ones: `kubernetes-lab-k3s`, `kubernetes-lab-k3s-agent-1`, `kubernetes-lab-k3s-agent-2`, `kubernetes-lab-k3s-agent-3`, `kubernetes-lab-bootstrap`, `kubernetes-lab-headlamp`, `kubernetes-lab-kubewall`. The lab pods keep their StatefulSet ordinal names (`gateway-0`, `ui-0`, `api-0`, `database-0`, `database-1`, ...); only the K3s add-ons (`coredns-*`, `traefik-*`, `svclb-traefik-*`, `metrics-server-*`, `local-path-provisioner-*`) carry controller-generated suffixes, and those cannot be renamed.

Agents join with `K3S_URL=https://k3s:6443` and a shared `K3S_LAB_TOKEN` (defaults to a fixed lab token in `kubernetes.yml`; set `K3S_LAB_TOKEN` in `.env` to change it). The server certificate carries `--tls-san=k3s`, so agents verify it by name. The control plane is tainted and every workload carries a `topologySpreadConstraints` rule on `kubernetes.io/hostname` that matches the shared `app.kubernetes.io/part-of: landscape-lab` label, so the seven lab pods and their HPA replicas (up to 5 for `ui`/`api`) spread across the three workers.

`kubectl` runs inside the server container; it is the only service that publishes the API:

```sh
docker compose -f kubernetes.yml exec k3s kubectl get nodes -o wide
```

The ingress is published from the workers, not the control plane: the control plane is tainted and the `svclb-traefik` host-port pods do not tolerate the lab taint. Each worker exposes the same Traefik entry point on a different loopback port — `k3s-agent-1` on 18080, `k3s-agent-2` on 18081, `k3s-agent-3` on 18082 — so if one worker stops you can switch to another port; whichever worker is up load-balances across the running Traefik pods. Override them with `K8S_LAB_PORT`, `K8S_LAB_PORT_2` and `K8S_LAB_PORT_3`.

## Management UIs

| UI | Container | Port (loopback) | Notes |
| --- | --- | --- | --- |
| [Headlamp](https://headlamp.dev/) | `headlamp` | `127.0.0.1:18084` | `ghcr.io/headlamp-k8s/headlamp:v0.46.0` started with `-kubeconfig=/kubeconfig/config`; `${DATA_DIR}/kubernetes/kube` is mounted at `/kubeconfig` |
| [KubeWall](https://github.com/kubewall/kubewall) | `kubewall` | `127.0.0.1:18085` | `ghcr.io/kubewall/kubewall:0.0.23` with `${DATA_DIR}/kubernetes/kube` at `/.kube` and its state in `/.kubewall` |

Every image is pinned to a version tag (`rancher/k3s:v1.31.6-k3s1`, `headlamp:v0.46.0`, `kubewall:0.0.23`), so a fresh `docker compose up` resolves the same images. Both UIs mount `${DATA_DIR}/kubernetes/kube` (containing `config`) read-only and reach the API at `https://k3s:6443` over the lab network. That file is the cluster-admin kubeconfig, so **neither UI has authentication** — they are bound to loopback, exactly like the rest of the lab; do not publish them. Override the ports with `HEADLAMP_PORT` / `KUBEWALL_PORT`. The control room links both, and the main container dashboard lists them too.

If you change cluster credentials or the API port, re-run the bootstrap (`up -d --force-recreate lab-bootstrap`) and then `restart headlamp kubewall`.

## Host persistence (no data in the container layer)

All state is bind-mounted from the Linux host, the same idea as the bind mounts used by the other Compose files:

```text
${DATA_DIR}/kubernetes/k3s             -> /var/lib/rancher/k3s   (server: API state, manifests, TLS)
${DATA_DIR}/kubernetes/k3s-agent-1..3  -> /var/lib/rancher/k3s   (each agent: containerd, local-path PV directories)
${DATA_DIR}/kubernetes/<node>/log      -> /var/log                (per node; overrides the image VOLUME)
${DATA_DIR}/kubernetes/<node>/cni      -> /var/lib/cni            (per node; overrides the image VOLUME)
${DATA_DIR}/kubernetes/<node>/kubelet  -> /var/lib/kubelet        (per node; overrides the image VOLUME)
${DATA_DIR}/kubernetes/shared          -> /shared                 (bind-mounted into every agent)
${DATA_DIR}/kubernetes/k3s-config      -> /etc/rancher/k3s        (server: admin kubeconfig)
${DATA_DIR}/kubernetes/kube/config     -> /kubeconfig/config and /.kube/config (read-only, the two UIs)
${DATA_DIR}/kubernetes/kubewall        -> /.kubewall              (KubeWall state)
./kubernetes/landscape.yaml            -> .../manifests/landscape.yaml   (read-only, from the repo)
```

All of them use the long bind syntax, so Docker creates missing directories on first start; only the `landscape.yaml` file bind is strict, because a missing manifest should fail loudly.

The database pods use `volumeClaimTemplates` (one `local-path` PVC per pod, bound to the worker that scheduled it) for their data. The shared primary marker and backups cannot use a `ReadWriteOnce` local-path claim once the two database pods and up to five API pods can land on different workers, so `/shared` is a `hostPath` volume that all three agents bind to the same host directory; `lab-bootstrap` gives that directory to uid 1000 on every start. `docker compose down` and `up` keep the counter, the replica data and the backups. Deleting `${DATA_DIR}/kubernetes/k3s*` and `${DATA_DIR}/kubernetes/shared` is a full reset and cannot be undone. Because `local-path` PVs are node-bound, a database pod whose worker is removed cannot reschedule elsewhere until that worker returns or you delete its PVC.

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

1. Press **Back up now** to snapshot the counter onto the shared host directory (last 10 snapshots are kept).
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
| `POST /api/database/backup` | Snapshot the primary to the shared host directory |
| `POST /api/database/restore` | Restore the latest snapshot |
| `POST /api/database/failover` | Delete `database-0` so the replica is promoted |
| `POST /api/database/scale` | JSON `{"replicas":0}` for total loss or `{"replicas":2}` to recover |
| `GET /work` | CPU work used by the generator, through every hop |
| `GET /health` | Probe endpoint of each component |
| `GET /_gateway/stats`, `/_lb/stats`, `/_cdn/stats` | Per-component usage JSON |

Mutations require `Content-Type: application/json` and a matching loopback `Origin` and `Host`. This is CSRF hardening, **not authentication**: a non-browser client can forge headers, so do not expose the port publicly.

## Security and isolation

Only API pods receive the `landscape-controller` service-account token. Its namespace Role can list pods, StatefulSets, HPAs and pod metrics, list events, delete `database-0`, and patch the scale of the `traffic` StatefulSet and the `database` StatefulSet; a single cluster-scoped ClusterRole adds read-only `get`/`list` on nodes for the placement table. It cannot read Secrets or change other workloads. No kubeconfig, cluster-admin token or secret is exposed to the browser.

NetworkPolicies isolate the layers inside the namespace, and the whole cluster lives on the dedicated `kubernetes-lab` Docker network. Egress is not restricted; the host and cluster administrators remain trusted.

## Inspection on the Linux host

```sh
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get statefulsets,pods,hpa,svc,pvc
docker compose -f kubernetes.yml exec k3s kubectl get nodes -o wide
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get pods -o wide
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab top pods
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab describe hpa ui
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab get events --sort-by=.lastTimestamp
docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab logs statefulset/api --tail=50
```

### Smoke test

`kubernetes/smoke.sh` runs every live check in one read-only pass: compose service states, the bootstrap exit code, four Ready nodes, the control-plane taint, agent TLS errors, the `landscape-node-reader` ClusterRole, StatefulSet and HPA readiness, worker spread, the host bind directories, the dashboard on each worker ingress, the `/api/status` node payload, and both management UIs. It never scales, deletes or restarts anything.

```sh
bash kubernetes/smoke.sh
```

It prints one `PASS`/`FAIL`/`WARN` line per assertion and exits non-zero if anything fails. Override the published ports with `DASH_PORTS="18080 18081 18082"`, `HEADLAMP_PORT_NUM`, `KUBEWALL_PORT_NUM` or `STATUS_PORT` when they differ from the defaults.

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
