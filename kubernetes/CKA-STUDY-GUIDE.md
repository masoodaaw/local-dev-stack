# CKA study guide built on this lab

The Certified Kubernetes Administrator exam is a **hands-on, two-hour, performance-based test**: you are dropped into a terminal and must solve real tasks against live clusters. Nobody asks you to define a Pod; they ask you to fix one. This guide maps the official domains onto the landscape in this folder and gives drills you can run against it.

Official sources: [CNCF CKA page](https://www.cncf.io/training/certification/cka/), [CNCF curriculum repository](https://github.com/cncf/curriculum). Domain weights below are the ones CNCF publishes today.

| Domain | Weight | What it really tests |
| --- | --- | --- |
| Troubleshooting | 30% | Diagnosing Pods, Services, nodes and control-plane components under time pressure |
| Cluster Architecture, Installation & Configuration | 25% | RBAC, kubeadm, upgrades, etcd, HA, Helm/Kustomize, CRDs/operators |
| Services & Networking | 20% | Service types, DNS, NetworkPolicy, Ingress/Gateway routing |
| Workloads & Scheduling | 15% | Deployments and rollouts, ConfigMaps/Secrets, autoscaling, affinity/taints, resource limits |
| Storage | 10% | StorageClass, PV/PVC, access modes, reclaim policies, mounting into Pods |

## What this lab can and cannot teach

This single-node K3s cluster is excellent for the workload, networking, storage, RBAC and troubleshooting domains, because it runs the real controllers and the real API server. It is **not** a kubeadm cluster: control-plane static Pods, `kubeadm upgrade`, etcd snapshots and multi-node HA need their own VMs. Do those drills in a throwaway VM pair (Vagrant, Multipass, cloud instances) rather than compromising this lab.

| CKA topic | Where it lives here |
| --- | --- |
| StatefulSets, probes, resource requests/limits | `gateway`, `loadbalancer`, `cdn`, `ui`, `api`, `traffic` |
| StatefulSet, ordered identity, per-pod PVC | `database` (2 pods, `volumeClaimTemplates`) |
| HorizontalPodAutoscaler and metrics-server | five HPAs driving pod counts from live CPU |
| Service types, headless Service, DNS SRV | `cdn-headless`, `database` (headless), `ui`, `api` |
| Ingress | `landscape` Ingress → `gateway` Service |
| NetworkPolicy default-deny and allow rules | seven policies in `resources.yaml` |
| RBAC Role/RoleBinding and least privilege | `landscape-controller` ServiceAccount |
| ConfigMap volume projection | `landscape-app` ConfigMap mounted at `/app` |
| StorageClass, dynamic provisioning, PVC | `local-path`, `landscape-shared` claim, DB claims |
| Rollouts, rollbacks, self-healing | `kubectl rollout` and StatefulSet recreation |
| Observability and events | `kubectl top`, `describe`, `logs`, `get events` |

## Command toolkit to memorise

Speed matters more than elegance. Learn the imperative generators and `--dry-run=client -o yaml`, then edit.

```sh
# context and cluster
kubectl config get-contexts
kubectl config use-context <name>
kubectl cluster-info
kubectl get nodes -o wide

# generate YAML fast
kubectl create deployment web --image=nginx --dry-run=client -o yaml > web.yaml
kubectl create service clusterip web --tcp=80:80 --dry-run=client -o yaml
kubectl create configmap app --from-literal=KEY=value --dry-run=client -o yaml
kubectl create secret generic app --from-literal=password=s3cret --dry-run=client -o yaml
kubectl create job once --image=busybox --dry-run=client -o yaml -- sh -c 'echo hi'
kubectl create cronjob every --image=busybox --schedule='*/1 * * * *' --dry-run=client -o yaml
kubectl create ingress web --rule='host/path=svc:80' --dry-run=client -o yaml
kubectl create role reader --verb=get,list --resource=pods --dry-run=client -o yaml
kubectl create rolebinding reader --role=reader --serviceaccount=default:app --dry-run=client -o yaml

# inspect and filter
kubectl get pods -A -o wide --sort-by=.metadata.creationTimestamp
kubectl get pods -l app=api -o jsonpath='{.items[*].status.podIP}'
kubectl get events -A --sort-by=.lastTimestamp | tail -20
kubectl get pods --field-selector=status.phase!=Running -A
kubectl explain deployment.spec.strategy --recursive | head -40

# operate
kubectl scale statefulset/api --replicas=3
kubectl set image statefulset/ui ui=node:22-alpine
kubectl rollout status statefulset/ui
kubectl rollout undo statefulset/ui --to-revision=1
kubectl exec -it pod -- sh
kubectl run tmp --rm -it --image=busybox --restart=Never -- sh
kubectl debug pod/api-xxxx --image=busybox -it --target=api
kubectl cp pod:/path ./local
kubectl drain node01 --ignore-daemonsets --delete-emptydir-data
kubectl cordon node01
```

Useful aliases for practice (do **not** rely on them in the exam environment until you verify they exist):

```sh
alias k=kubectl
export do='--dry-run=client -o yaml'
export now='--force --grace-period=0'
```

## Domain drills against this landscape

Set a shell variable first:

```sh
K() { docker compose -f kubernetes.yml exec k3s kubectl -n landscape-lab "$@"; }
```

### Workloads & scheduling (15%)

1. Scale `api` to 4 pods, then back to 1. `K scale statefulset/api --replicas=4`.
2. Set a rolling-update strategy with `maxSurge: 1`, `maxUnavailable: 0` and confirm pods are replaced one at a time.
3. Break a readiness probe on purpose (`path: /nope`), watch the Pod stay `Running` but never `Ready`, and see the Service endpoints drop it. Then fix it.
4. Change `ui`'s CPU request to `250m` and watch the HPA target percentage change behaviour.
5. Add a node affinity or `topologySpreadConstraints` block; on a single node, reason about why it stays schedulable.
6. Create a separate Deployment with a deliberately impossible resource request (`cpu: 64`) and inspect the `FailedScheduling` event.

### Services & networking (20%)

1. `K get endpointslices` and explain why `database` is headless.
2. Resolve `cdn-headless` from a Pod: `K run tmp --rm -it --image=busybox --restart=Never -- nslookup cdn-headless`.
3. Create a temporary Pod in `default` and try to curl `http://gateway.landscape-lab:8080/health`; the NetworkPolicy should block it. Then add a policy that allows only that Pod's labels.
4. Delete the Ingress and recreate it from an imperative command; verify the dashboard still loads through Traefik.
5. Inspect the round-robin distribution on `/_lb/stats` while traffic is high, then kill one CDN pod and watch the load balancer re-resolve SRV records.

### Storage (10%)

1. `K get pvc,pv` and match each claim to its `local-path` volume and host directory.
2. Create a third PVC, mount it into a temporary Pod, write a file, delete the Pod, recreate it and confirm the file survived.
3. Change a test PVC's reclaim policy behaviour by deleting the claim and observing whether the PV is retained (local-path defaults to `Delete`; explain the difference from `Retain`).
4. Put the `database` StatefulSet's claim in `ReadWriteOnce` versus `ReadWriteMany` terms and explain why RWO still works for two Pods on one node.

### Troubleshooting (30%)

1. `K describe pod database-1` after `K delete pod database-1`; follow the event timeline from `ContainerCreating` to `Ready` and identify the volume attach step.
2. Make a Pod `CrashLoopBackOff` by overriding the command with `["sleep"]`, then read `K logs` and `K logs --previous`.
3. Make an image pull fail with a fake tag; identify `ErrImagePull`/`ImagePullBackOff` in events and describe the fix.
4. Delete the `landscape-app` ConfigMap, restart `ui`, and observe the pods hang in `ContainerCreating` because their volume cannot be mounted. Recreate it from `landscape.yaml`.
5. Point `api` at a non-existent database service name and trace the failure from UI error to API logs to DNS.
6. `K top pods` while traffic is high; identify the CPU hogs and explain HPA behaviour from the metrics.

### Cluster architecture, installation & configuration (25%)

1. Write a Role that can only `get` and `list` ConfigMaps, bind it to a ServiceAccount, and verify with `kubectl auth can-i`.
2. Inspect the existing Role and explain every rule (why `resourceNames` is used, why there is no Secret access).
3. Use `kubectl auth can-i --list --as=system:serviceaccount:landscape-lab:landscape-controller`.
4. On a separate VM pair: `kubeadm init`, join a worker, take an etcd snapshot, delete a static Pod manifest and watch the kubelet restore it, then `kubeadm upgrade plan`.
5. Back up and restore etcd (on the kubeadm VMs, not here):

```sh
ETCDCTL_API=3 etcdctl snapshot save /tmp/etcd.db \
  --endpoints=https://127.0.0.1:2379 \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key
ETCDCTL_API=3 etcdctl snapshot status /tmp/etcd.db --write-out=table
```

## Ten graded exercises

Work without looking at the README until you are stuck; each has an objective check.

1. **Scale on demand.** Make `ui` run exactly 3 replicas without editing YAML, then restore HPA control. *Check:* `K get deploy ui` shows 3, then HPA reclaims it.
2. **Zero-downtime rollout.** Give `ui` a `maxUnavailable: 0` strategy and change an environment variable. *Check:* no request failures while `K rollout status` completes.
3. **Probe the probes.** Add a startup probe to `api` with a 30-second budget and prove the Pod becomes Ready only after it passes.
4. **Break and fix DNS.** Change `cdn`'s Service selector to a label no Pod has, observe UI failures, then fix it. *Check:* dashboard loads again.
5. **NetworkPolicy.** Allow only Pods labelled `app=loadbalancer` to reach `cdn` on port 8080, and prove a `busybox` Pod in the same namespace cannot.
6. **StatefulSet identity.** Delete `database-1` and confirm it returns with the same name and the same PVC. *Check:* `K get pvc` shows the same claim bound.
7. **Failover.** Record the counter, trigger failover, and explain the observed RPO from the replica sync interval.
8. **Disaster recovery.** Take a backup, advance the counter, scale to zero, restore, and state the exact RPO and observed RTO in seconds.
9. **RBAC lockdown.** Create a ServiceAccount that can read Pods in `landscape-lab` but not delete them; verify both outcomes with `auth can-i`.
10. **Ingress surgery.** Move the dashboard to a `/lab` path prefix and make the UI serve it. *Check:* `http://localhost:18080/lab` renders and assets still load.

## Suggested eight-week plan

| Week | Focus | Lab work |
| --- | --- | --- |
| 1 | kubectl fluency, Pods, Deployments | Exercises 1–2, command toolkit repetition |
| 2 | Services, DNS, Ingress | Exercises 4, 10; trace the full request chain |
| 3 | ConfigMaps, Secrets, probes, resources | Exercise 3; break and repair every workload |
| 4 | Scheduling, affinity, taints, HPA | Drills in Workloads; read HPA algorithm docs |
| 5 | Storage, PV/PVC, StatefulSets | Exercises 6, 8; storage drills |
| 6 | RBAC and cluster architecture | Exercise 9; kubeadm + etcd on VMs |
| 7 | Troubleshooting under time pressure | All troubleshooting drills, 25-minute timed sets |
| 8 | Full mock exams | killer.sh-style practice tests, then review every miss |

## Exam tactics

- Read all tasks first; do the quick wins, then return to the long ones.
- Use the exam's documented context switching; never assume `kubectl` points at the right cluster.
- Generate YAML with `--dry-run=client -o yaml` and edit, instead of typing manifests from scratch.
- When a Pod misbehaves: `describe` → events → `logs` → `logs --previous` → `exec`/`debug`.
- Watch the clock: two hours disappears. Leave 10 minutes to verify.
- Bookmark the docs pages you use most: `kubectl` cheat sheet, NetworkPolicy, PVC/StorageClass, HPA, RBAC, kubeadm upgrade.
- Practise in a terminal with no GUI and no autocomplete assistance; that is the exam surface.

## Official links

- CKA certification: <https://www.cncf.io/training/certification/cka/>
- Curriculum PDFs and source: <https://github.com/cncf/curriculum>
- Kubernetes documentation: <https://kubernetes.io/docs/>
- kubectl quick reference: <https://kubernetes.io/docs/reference/kubectl/quick-reference/>
- Tasks and tutorials: <https://kubernetes.io/docs/tasks/>
