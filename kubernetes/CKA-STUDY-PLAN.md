# CKA detailed study plan (mapped to this lab)

Target: **Certified Kubernetes Administrator (CKA)** — 2-hour, hands-on, terminal exam.  
Curriculum weights (current CNCF): Troubleshooting **30%** · Cluster Architecture **25%** · Services & Networking **20%** · Workloads & Scheduling **15%** · Storage **10%**.  
Exam tracks recent Kubernetes (see [LF CKA page](https://training.linuxfoundation.org/certification/certified-kubernetes-administrator-cka/) for the exact version).

Companion files:

- Drills and graded exercises: [`CKA-STUDY-GUIDE.md`](./CKA-STUDY-GUIDE.md)
- Lab topology and ops: [`README.md`](./README.md)
- Manifests you will break/fix: `landscape.yaml` (auto-applied by K3s) / `resources.yaml` (source twin)

---

## 0. How to use this plan

| Rule | Why |
| --- | --- |
| Practice **in the terminal only** (no GUI for drills) | Matches the exam surface |
| Prefer **imperative + `--dry-run=client -o yaml`** then edit | Speed under time pressure |
| Always confirm **context/namespace** first | Multi-cluster exam traps |
| Spend ~**40% of weekly time on troubleshooting** | Heaviest domain (30%) |
| Do **kubeadm/etcd/HA on separate VMs** | This lab is K3s, not kubeadm |

Daily shell helper (from repo root on the Linux host):

```sh
K() { docker compose -f kubernetes.yml exec -T k3s kubectl -n landscape-lab "$@"; }
KA() { docker compose -f kubernetes.yml exec -T k3s kubectl "$@"; }
```

UI (optional, for exploration — not for timed drills):

| URL | Use |
| --- | --- |
| http://127.0.0.1:18080/ | Control room (full request chain, HPA, failover) |
| http://127.0.0.1:18084/ | Headlamp |
| https://127.0.0.1:18085/ | KubeWall (HTTPS / self-signed; accept the browser warning) |

---

## 1. Feature map: what lives in *this* lab

Study every object until you can explain it without opening YAML.

### Cluster topology (`kubernetes.yml`)

| Piece | Feature you learn |
| --- | --- |
| `k3s-server` + taint `k3s.io/lab-control-plane=true:NoSchedule` | Control plane isolation, taints/tolerations |
| `k3s-agent-1..3` | Multi-node scheduling, drain/cordon, node failure |
| Ingress published on workers (`18080`/`18081`/`18082`) | Why SVCLB/hostPort needs untainted nodes |
| Traefik + metrics-server + local-path (K3s add-ons) | Ingress controller, HPA metrics, dynamic PVC |
| Headlamp / KubeWall | Optional observability; exam is still kubectl |

### Workloads (`landscape-lab` namespace)

| Object | CKA features |
| --- | --- |
| StatefulSets: `gateway`, `loadbalancer`, `cdn`, `ui`, `api`, `traffic`, `database` | Controllers, stable identity, rollouts, self-healing |
| `podManagementPolicy: Parallel` | Ordered vs parallel StatefulSet behaviour |
| Probes on every app container | liveness / readiness / startup |
| CPU requests + limits | Scheduling, HPA targets, QoS |
| `topologySpreadConstraints` on hostname | Soft anti-affinity / spread |
| HPA ×5 (`gateway`…`api`) | autoscaling/v2, metrics-server |
| `traffic` scaled 0–3 | Generate load for HPA drills |

### Networking

| Object | CKA features |
| --- | --- |
| ClusterIP Services (`gateway`, `ui`, `api`, …) | Service → Endpoints/EndpointSlices |
| Headless Services (`*-headless`, `database`, `cdn-headless`) | DNS A/SRV, direct pod IPs |
| Ingress `landscape` → `gateway:8080` | Ingress rules, ingressClassName |
| NetworkPolicies (default-deny + allow chain) | Pod selectors, ports, namespace isolation |
| CoreDNS (K3s) | `*.svc.cluster.local` resolution |

### Storage

| Object | CKA features |
| --- | --- |
| `database` `volumeClaimTemplates` | StatefulSet + PVC per ordinal |
| StorageClass `local-path` | Dynamic provisioning |
| `/shared` hostPath on agents | Node-local shared state (know vs PVC) |

### Security / API

| Object | CKA features |
| --- | --- |
| SA `landscape-controller` | Pod identity |
| Role + RoleBinding (namespace) | Least-privilege RBAC |
| ClusterRole `landscape-node-reader` | Cluster-scoped reads |
| ConfigMap `landscape-app` | Volume projection of app code |

### Gaps — practice **outside** this lab (2 VMs: Multipass/Vagrant/cloud)

| Gap | Why | Practice |
| --- | --- | --- |
| `kubeadm init` / `join` / `upgrade` | Exam expects kubeadm | Fresh Ubuntu VMs |
| etcd snapshot save/restore | Control-plane backup | On kubeadm control plane |
| Static Pod manifests under `/etc/kubernetes/manifests` | Control-plane troubleshooting | Break/restore `etcd.yaml` etc. |
| HA control plane (stacked etcd) | Architecture 25% | 3 control-plane VMs (optional but valuable) |
| **Gateway API** | Now in networking curriculum | Install gateway controller + HTTPRoute lab |
| Helm / Kustomize install of components | Architecture competency | Helm install metrics-server / ingress; kustomize overlay |
| CNI / CSI / CRI concepts | Extension interfaces | Read docs + identify what K3s uses (containerd, flannel/traefik stack) |
| Deployments (lab uses StatefulSets) | Classic rollout/undo questions | Create Deployments beside the lab |

---

## 1b. What to add to *this* lab (deeper practice)

Add these as manifests under a **`sandbox`** (or `practice`) namespace so you can break things without wrecking `landscape-lab`. Keep kubeadm/etcd/HA on separate VMs.

| Add | Why (CKA gap) | Minimal shape |
| --- | --- | --- |
| **Deployment + ReplicaSet** | Exam loves Deployments/rollout/undo; lab is mostly StatefulSets | `nginx` Deployment, 3 replicas, rollingUpdate |
| **Job + CronJob** | Batch workloads | Job that writes to a PVC; CronJob every minute |
| **DaemonSet** | Per-node agents | Fluent Bit / busybox logging DS on workers only |
| **NodePort / LoadBalancer Service** | Service types beyond ClusterIP | Expose practice Deployment as NodePort on agents |
| **Gateway API** | Now in CKA networking | Install Gateway CRDs + `Gateway` + `HTTPRoute` → `ui` or `gateway` |
| **LimitRange + ResourceQuota** | Admission / tenancy | Quota on the `sandbox` namespace |
| **PodDisruptionBudget** | Availability during drain | PDB `minAvailable: 1` on practice Deployment or `ui` |
| **PriorityClass** | Scheduling under pressure | Low/high priority practice Pods |
| **Init container + sidecar** | Robust Pod design | Init waits for DNS; sidecar tails logs |
| **EmptyDir + projected volumes** | Volume types | projected ConfigMap + Secret + SA token |
| **Second StorageClass** | Storage variety | Another SC (even local-path twin) with different reclaim |
| **NetworkPolicy egress** | Lab mostly has ingress deny | Deny egress except DNS + target Service |
| **Ingress TLS** | Ingress depth | Self-signed Secret + TLS host on Traefik |
| **Helm release** | Architecture competency | `helm install` a demo chart into `sandbox` |
| **Kustomize overlay** | Architecture competency | Overlay that patches image/replicas |
| **Simple CRD** (optional) | CRDs / operators | Tiny CRD + a Job/controller that uses it |
| **`sandbox` namespace** | Safe break/fix | All throwaway objects live here |

### Suggested order to add them

1. `sandbox` NS + Deployment + NodePort  
2. Job / CronJob + PDB  
3. DaemonSet + egress NetworkPolicy  
4. LimitRange / ResourceQuota  
5. Ingress TLS  
6. Helm + Kustomize demo  
7. Gateway API  
8. Parallel: kubeadm VM lab (etcd, static Pods, upgrade)

### Task list — lab additions

Work top to bottom; keep everything in `sandbox` unless noted.

- [ ] **sandbox namespace** — safe break/fix practice objects  
- [ ] **Deployment + ReplicaSet** — nginx (or similar), 3 replicas, rollingUpdate  
- [ ] **NodePort / LoadBalancer Service** — expose the practice Deployment on agents  
- [ ] **Job** — one-shot work (e.g. write a file to a PVC)  
- [ ] **CronJob** — schedule every minute (then suspend when idle)  
- [ ] **PodDisruptionBudget** — `minAvailable: 1` on the practice Deployment  
- [ ] **DaemonSet** — worker-only (tolerate lab taints as needed; skip control plane)  
- [ ] **Egress NetworkPolicy** — deny egress except DNS + allowed Services  
- [ ] **LimitRange + ResourceQuota** — on `sandbox`  
- [ ] **Init container + sidecar** — DNS wait init; log/sidecar pattern  
- [ ] **emptyDir + projected volumes** — ConfigMap + Secret + SA token  
- [ ] **PriorityClass** — low vs high priority demo Pods  
- [ ] **Second StorageClass** — different reclaim policy + practice PVC  
- [ ] **Ingress TLS** — self-signed Secret + TLS host on Traefik  
- [ ] **Helm demo release** — install a chart into `sandbox`  
- [ ] **Kustomize overlay** — patch image/replicas for the practice Deployment  
- [ ] **Gateway API** — CRDs + `Gateway` + `HTTPRoute` → `ui` or `gateway`  
- [ ] **Optional CRD** — tiny CRD (+ Job/controller) for operators practice  
- [ ] **Docs** — link new manifests from README / this study plan  

---

## 1c. Features checklist (learn in detail)

### Troubleshooting (30%)

- [ ] Pod phases: Pending, Running, Succeeded, Failed, Unknown  
- [ ] Ready vs Running; probe failures  
- [ ] `CrashLoopBackOff`, `ImagePullBackOff`, `ErrImagePull`, OOMKilled  
- [ ] Events timeline; previous container logs  
- [ ] Service with no Endpoints; DNS failure; NetworkPolicy drops  
- [ ] Node NotReady; kubelet / container runtime symptoms  
- [ ] `kubectl top` when metrics-server is missing or present  

### Cluster architecture (25%)

- [ ] Control plane: API server, scheduler, controller-manager, etcd  
- [ ] kubeadm cluster lifecycle; upgrades  
- [ ] RBAC: Role/ClusterRole, Binding, SA, `auth can-i`  
- [ ] Helm install/upgrade/rollback; Kustomize build/apply  
- [ ] CRI (containerd), CNI, CSI  
- [ ] CRDs and operators (install + use one)  
- [ ] Taints on control plane; worker join  

### Services & networking (20%)

- [ ] Pod-to-Pod connectivity  
- [ ] ClusterIP / NodePort / LoadBalancer  
- [ ] Endpoints / EndpointSlices  
- [ ] CoreDNS (`svc.cluster.local`, headless A/SRV)  
- [ ] Ingress controllers and Ingress resources  
- [ ] **Gateway API** (`Gateway`, `HTTPRoute`)  
- [ ] NetworkPolicy ingress **and** egress  
- [ ] kube-proxy behaviour (conceptual)  

### Workloads & scheduling (15%)

- [ ] Pod, Deployment, StatefulSet, DaemonSet, Job, CronJob  
- [ ] Rolling update / undo / history  
- [ ] ConfigMap & Secret (env + volume)  
- [ ] Probes: liveness, readiness, startup  
- [ ] Requests/limits, QoS  
- [ ] HPA (CPU)  
- [ ] Affinity / anti-affinity / topologySpread  
- [ ] Taints/tolerations, cordon/drain  
- [ ] PDB, PriorityClass  
- [ ] Init containers / sidecars  

### Storage (10%)

- [ ] emptyDir, hostPath, PVC  
- [ ] PV / PVC / StorageClass  
- [ ] Access modes RWO / ROX / RWX  
- [ ] Reclaim Delete vs Retain  
- [ ] StatefulSet `volumeClaimTemplates`  

---

## 1d. Commands to memorize

### Context & discovery

```sh
kubectl config get-contexts
kubectl config use-context <ctx>
kubectl cluster-info
kubectl get nodes -o wide
kubectl api-resources | head
kubectl explain pod.spec.containers --recursive | less
```

### Speed generators (exam muscle memory)

```sh
kubectl run web --image=nginx --dry-run=client -o yaml
kubectl create deployment web --image=nginx --replicas=3 --dry-run=client -o yaml
kubectl expose deployment web --port=80 --target-port=80 --dry-run=client -o yaml
kubectl create service nodeport web --tcp=80:80 --dry-run=client -o yaml
kubectl create configmap cfg --from-literal=k=v --dry-run=client -o yaml
kubectl create secret generic sec --from-literal=p=s3cret --dry-run=client -o yaml
kubectl create job j --image=busybox --dry-run=client -o yaml -- echo ok
kubectl create cronjob c --image=busybox --schedule="*/1 * * * *" --dry-run=client -o yaml -- echo ok
kubectl create ingress web --rule="app.local/=web:80" --dry-run=client -o yaml
kubectl create role r --verb=get,list --resource=pods --dry-run=client -o yaml
kubectl create rolebinding rb --role=r --serviceaccount=default:sa --dry-run=client -o yaml
kubectl create quota q --hard=pods=10,requests.cpu=2 --dry-run=client -o yaml
kubectl create pdb web --min-available=1 --selector=app=web --dry-run=client -o yaml
```

### Inspect / filter

```sh
kubectl get pods -A -o wide --sort-by=.metadata.creationTimestamp
kubectl get pods --field-selector=status.phase!=Running -A
kubectl get events -A --sort-by=.lastTimestamp | tail -30
kubectl get pods -l app=api -o jsonpath='{range .items[*]}{.metadata.name}{" "}{.status.podIP}{"\n"}{end}'
kubectl get endpointslices -n landscape-lab
kubectl top nodes
kubectl top pods -n landscape-lab
```

### Operate / change

```sh
kubectl apply -f x.yaml
kubectl delete -f x.yaml
kubectl scale deployment/web --replicas=5
kubectl set image deployment/web nginx=nginx:1.27
kubectl rollout status deployment/web
kubectl rollout history deployment/web
kubectl rollout undo deployment/web
kubectl label / annotate / taint …
kubectl cordon <node>
kubectl drain <node> --ignore-daemonsets --delete-emptydir-data
kubectl uncordon <node>
```

### Debug

```sh
kubectl describe pod <p> -n <ns>
kubectl logs <p> -c <c> --previous
kubectl exec -it <p> -- sh
kubectl debug <p> -it --image=busybox --target=<c>
kubectl run tmp --rm -it --image=busybox --restart=Never -- nslookup kubernetes
kubectl auth can-i list pods --as=system:serviceaccount:landscape-lab:landscape-controller
kubectl auth can-i --list --as=system:serviceaccount:ns:sa
```

### This lab’s shortcuts

```sh
K()  { docker compose -f kubernetes.yml exec -T k3s kubectl -n landscape-lab "$@"; }
KA() { docker compose -f kubernetes.yml exec -T k3s kubectl "$@"; }

K get sts,svc,ing,hpa,netpol,pvc
K describe ingress landscape
KA get nodes -o wide
KA -n kube-system get pods
```

### kubeadm / etcd (practice VMs only)

```sh
kubeadm init
kubeadm join …
kubeadm upgrade plan
kubeadm upgrade apply …
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd.db --write-out=table
crictl ps
```

### Helm / Kustomize

```sh
helm repo add <name> <url>
helm install <release> <chart> -n <ns> --create-namespace
helm list -A
helm upgrade <release> <chart>
helm rollback <release> 1
kustomize build . | kubectl apply -f -
kubectl apply -k .
```

Useful practice aliases (verify in the exam before relying on them):

```sh
alias k=kubectl
export do='--dry-run=client -o yaml'
export now='--force --grace-period=0'
# example: k create deploy web --image=nginx $do > web.yaml
```

---

## 2. Prerequisites (3–5 days before Week 1)

- [ ] Lab healthy: 4 nodes Ready, control room loads, `K get pods` all Ready  
- [ ] Memorise: `get`, `describe`, `logs`, `exec`, `apply`, `delete`, `explain`  
- [ ] Bookmark docs (exam allows kubernetes.io + github.com/kubernetes):  
  - [kubectl quick reference](https://kubernetes.io/docs/reference/kubectl/quick-reference/)  
  - [NetworkPolicy](https://kubernetes.io/docs/concepts/services-networking/network-policies/)  
  - [PV/PVC](https://kubernetes.io/docs/concepts/storage/persistent-volumes/)  
  - [HPA](https://kubernetes.io/docs/tasks/run-application/horizontal-pod-autoscale/)  
  - [RBAC](https://kubernetes.io/docs/reference/access-authn-authz/rbac/)  
  - [kubeadm upgrade](https://kubernetes.io/docs/tasks/administer-cluster/kubeadm/kubeadm-upgrade/)  
  - [Gateway API](https://gateway-api.sigs.k8s.io/)  
- [ ] Skim CNCF curriculum PDF: https://github.com/cncf/curriculum  

---

## 3. Eight-week schedule

Assume **8–12 hours/week**. Scale weeks, don’t skip troubleshooting.

### Week 1 — kubectl fluency & workload basics (Workloads 15%)

**Goals:** Create/edit objects fast; understand Pod lifecycle and controllers.

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | Contexts, namespaces, `explain`, jsonpath | `KA get nodes -o wide`; `K get all`; explore `landscape-lab` |
| 2 | Pods vs Deployments vs StatefulSets | Compare `K get deploy,sts -A`; create a throwaway Deployment |
| 3 | Imperative generators + dry-run | Create deploy/svc/cm/secret via dry-run; apply; delete |
| 4 | Scale & image change | Guide exercises 1–2; `K scale sts/ui`; `rollout status/undo` |
| 5 | Labels/selectors | Change a Service selector (break), observe Endpoints, fix |

**Exit check:** Create a Deployment + Service from scratch in &lt;5 minutes without notes.

---

### Week 2 — Services, DNS, Ingress (Networking 20%)

**Goals:** Trace a request from browser → Ingress → Service → Pod.

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | ClusterIP + EndpointSlices | `K get svc,endpointslices`; map `gateway` |
| 2 | Headless + DNS | `nslookup` `cdn-headless`, `database` from a debug Pod |
| 3 | Ingress | Describe Ingress `landscape`; delete & recreate; hit :18080 |
| 4 | NetworkPolicy | Prove default-deny; curl from wrong labels fails; fix |
| 5 | Full chain | High load in UI; watch `/_lb/stats`; kill a `cdn` pod |

**Exit check:** Explain why `database` is headless and why Traefik pods run on agents, not `k3s-server`.

**Add:** 2 hours Gateway API tutorial (external cluster or kind) — HTTPRoute → Service.

---

### Week 3 — Config, Secrets, probes, resources (Workloads)

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | ConfigMaps as volumes | Delete `landscape-app`, watch `ContainerCreating`, restore |
| 2 | Secrets | Create secret; mount as env and as volume; rotate key |
| 3 | Probes | Break readiness on `ui`; see Ready=false, endpoints drop; fix |
| 4 | Startup probe | Guide exercise 3 on `api` |
| 5 | Requests/limits | Raise `ui` CPU request; observe scheduling/HPA behaviour |

**Exit check:** Diagnose Ready vs Running in under 2 minutes from `describe` alone.

---

### Week 4 — Scheduling, taints, HPA (Workloads + multi-node)

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | Taints/tolerations | Describe `k3s-server` taint; add lab taint on agent-2 |
| 2 | Cordon/drain | Drain `k3s-agent-3`; watch reschedule; uncordon |
| 3 | Spread / affinity | Scale `ui` to 3; verify hostname spread |
| 4 | HPA | Low/High load in UI; `K get hpa -w`; `K top pods` |
| 5 | FailedScheduling | Impossible CPU request; read events |

**Exit check:** Drain a worker and restore capacity with no lasting downtime to :18080.

---

### Week 5 — Storage & StatefulSets (Storage 10%)

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | SC / PVC / PV | `K get sc,pvc,pv`; bind path for `database-0` |
| 2 | volumeClaimTemplates | Delete `database-1`; same name + same PVC returns |
| 3 | Access modes / reclaim | Create test PVC; Delete vs Retain discussion |
| 4 | hostPath vs PVC | Inspect `/shared` primary marker vs DB PVC data |
| 5 | DR story | Guide exercises 7–8 (failover + backup/restore) |

**Exit check:** Draw PV ← PVC ← Pod and say what happens if the worker node dies (local-path).

---

### Week 6 — RBAC & cluster architecture (Architecture 25%)

**In lab (RBAC / APIs):**

| Day | Focus | Lab |
| --- | --- | --- |
| 1 | Role / RoleBinding | Read `landscape-controller` rules; `auth can-i --list --as=...` |
| 2 | Least privilege | Guide exercise 9 |
| 3 | ClusterRole | Why node list needs cluster scope |
| 4–5 | **kubeadm lab (VMs)** | `kubeadm init`, join worker, upgrade plan, etcd snapshot |

**kubeadm checklist (external):**

```text
[ ] kubeadm init + worker join
[ ] kubectl get cs / control-plane pods in kube-system
[ ] etcdctl snapshot save + status
[ ] Move static Pod manifest aside → kubelet restores it
[ ] kubeadm upgrade plan (read output; upgrade in throwaway lab if possible)
[ ] Helm install something; kustomize build | apply
[ ] Identify CRI (containerd), CNI, CSI in your cluster
```

**Exit check:** Pass a 30-minute RBAC + kubeadm verbal/lab quiz without the guide.

---

### Week 7 — Troubleshooting under time pressure (30%)

Work in **25-minute timed blocks**. Use only kubectl + docs.

| Day | Scenarios (from guide + invent your own) |
| --- | --- |
| 1 | CrashLoopBackOff, ImagePullBackOff, OOM |
| 2 | Service selector / DNS / NetworkPolicy blocks |
| 3 | Volume mount / ConfigMap missing / PVC Pending |
| 4 | Node NotReady / drain stuck / taint blocks |
| 5 | Mixed mock: 4 broken apps, fix in 40 minutes |

**Algorithm to memorise:**

```text
kubectl get … → describe → events → logs → logs --previous → exec/debug → auth can-i
```

**Exit check:** Fix 3 random breaks in 25 minutes with ≥2 correct.

---

### Week 8 — Mock exams & weak spots

| Day | Activity |
| --- | --- |
| 1 | killer.sh or KodeKloud mock #1 (score + review every miss) |
| 2 | Re-drill weakest domain only |
| 3 | Mock #2 |
| 4 | kubeadm/etcd/Gateway API gaps only |
| 5 | Light review + sleep; exam logistics |

Book the exam when mock scores are consistently **≥75%** with time left.

---

## 4. Weekly rhythm (template)

```text
2× 90 min  — new features + lab drills
1× 60 min  — kubectl speed (dry-run generators)
1× 90 min  — troubleshooting timed set
1× 60 min  — docs bookmark walk (read, don’t scroll randomly)
Weekend     — one graded exercise from CKA-STUDY-GUIDE.md
```

---

## 5. Exam-day tactics

1. Read **all** questions; mark hard ones; do easy first.  
2. `kubectl config get-contexts` / `use-context` every time you switch.  
3. Generate YAML; don’t hand-type long manifests.  
4. Verify with `get`/`describe` before moving on.  
5. Leave **10 minutes** for final checks.  
6. Allowed: kubernetes.io docs + kubernetes GitHub. Practise finding pages fast.

---

## 6. Suggested extras (after CKA or if you have time)

| Path | Why |
| --- | --- |
| CKAD | App-centric (Deployments, Jobs, probes) — overlaps Week 1–3 |
| CKS | Security hardening after you can admin a cluster |
| Gateway API deep dive | Growing weight in networking questions |

---

## 7. Progress tracker

Copy and check off:

```text
Week 1 kubectl / controllers     [ ]
Week 2 Services / Ingress / NP   [ ]
Week 3 Config / probes / resources [ ]
Week 4 Schedule / HPA / drain    [ ]
Week 5 Storage / STS / DR        [ ]
Week 6 RBAC + kubeadm VMs        [ ]
Week 7 Timed troubleshooting     [ ]
Week 8 Mocks ≥75%                [ ]

Lab additions
  sandbox NS + Deployment + NodePort [ ]
  Job / CronJob + PDB                [ ]
  DaemonSet + egress NetworkPolicy   [ ]
  LimitRange / ResourceQuota         [ ]
  Ingress TLS                        [ ]
  Helm + Kustomize demo              [ ]
  Gateway API                        [ ]

External
  Gateway API mini-lab               [ ]
  etcd snapshot restore once         [ ]
  kubeadm init/join/upgrade          [ ]
```

When all boxes are checked and mocks are solid, sit the exam.
