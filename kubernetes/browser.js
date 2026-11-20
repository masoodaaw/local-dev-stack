'use strict';

const element = id => document.getElementById(id);
let busy = false;

function row(values) {
  const result = document.createElement('tr');
  for (const value of values) {
    const cell = document.createElement('td');
    cell.textContent = String(value ?? '—');
    result.appendChild(cell);
  }
  return result;
}

function replicaText(deployments, name) {
  const deployment = deployments.find(item => item.metadata.name === name);
  return deployment ? `${deployment.status.readyReplicas || 0} / ${deployment.spec.replicas}` : 'Unavailable';
}

function hpaCpu(hpas, name) {
  const hpa = hpas.find(item => item.metadata.name === name);
  if (!hpa) return { target: '—', current: '—', range: '—' };
  const find = list => list?.find(item => item.type === 'Resource' && item.resource.name === 'cpu')?.resource;
  const current = find(hpa.status?.currentMetrics)?.current?.averageUtilization;
  const target = find(hpa.spec?.metrics)?.target?.averageUtilization;
  return { target: target == null ? '—' : `${target}%`, current: current == null ? 'Pending' : `${current}%`, range: `${hpa.spec.minReplicas}–${hpa.spec.maxReplicas}` };
}

function render(status) {
  const deployments = status.deployments.data?.items || [];
  const hpas = status.hpas.data?.items || [];
  const pods = status.pods.data?.items || [];
  const metrics = status.metrics.data?.items || [];
  const gateway = status.gateway.data || {};
  const loadbalancer = status.loadbalancer.data || {};
  const cdn = status.cdn.data || {};
  const database = status.database.data || {};

  const distribution = (loadbalancer.distribution || []).map(item => `${item.pod}: ${item.requests}`).join(' · ') || 'No samples yet';
  element('components').replaceChildren(
    row(['Gateway', replicaText(deployments, 'gateway'), gateway.requestsPerSecond ?? '—', gateway.inFlight ?? '—', `p95 ${gateway.latencyP95Ms ?? 0} ms`]),
    row(['Load balancer', replicaText(deployments, 'loadbalancer'), loadbalancer.requestsPerSecond ?? '—', loadbalancer.inFlight ?? '—', distribution]),
    row(['CDN', replicaText(deployments, 'cdn'), cdn.requestsPerSecond ?? '—', cdn.inFlight ?? '—', `${cdn.hitRatio ?? 0}% cache hit · ${cdn.entries ?? 0} objects`]),
    row(['UI', replicaText(deployments, 'ui'), '—', '—', `${pods.filter(pod => pod.metadata.name.startsWith('ui-')).length} pod(s) reporting`]),
    row(['API', replicaText(deployments, 'api'), '—', '—', `${pods.filter(pod => pod.metadata.name.startsWith('api-')).length} pod(s) reporting`])
  );

  element('workloads').replaceChildren(...['gateway', 'loadbalancer', 'cdn', 'ui', 'api'].map(name => {
    const cpu = hpaCpu(hpas, name);
    return row([name.toUpperCase(), replicaText(deployments, name), cpu.target, cpu.current, cpu.range]);
  }));

  const traffic = deployments.find(item => item.metadata.name === 'traffic');
  const level = traffic ? traffic.spec.replicas : 0;
  const labels = ['off', 'low', 'medium', 'high'];
  element('traffic-state').textContent = traffic
    ? `Traffic generator: ${labels[level] || level} load · ${traffic.status.readyReplicas || 0} of ${level} generator pod(s) ready`
    : 'Traffic generator state unavailable';

  element('counter').textContent = database.counter ?? '—';
  element('touches').textContent = database.touches ?? '—';
  element('database-primary').textContent = database.activePod ? `${database.activePod} (${database.role})` : '—';
  if (status.database.error) {
    element('database-status').textContent = `Database unavailable: ${status.database.error}`;
  } else {
    const backups = status.backups.data?.count ?? 0;
    const failover = database.failover ? ' · automatic failover just promoted this replica' : '';
    element('database-status').textContent = `Primary ${database.activePod} responding · epoch ${database.epoch} · ${backups} backup(s) on the host volume${failover}`;
  }

  element('pods').replaceChildren(...(pods.length ? pods.map(pod => {
    const containers = pod.status.containerStatuses || [];
    const podMetric = metrics.find(item => item.metadata.name === pod.metadata.name);
    return row([
      pod.metadata.name,
      pod.status.phase,
      `${containers.filter(item => item.ready).length} / ${pod.spec.containers.length}`,
      containers.reduce((sum, item) => sum + item.restartCount, 0),
      podMetric ? podMetric.containers.map(item => item.usage.cpu).join(', ') : 'Pending'
    ]);
  }) : [row(['No pods reported', '—', '—', '—', '—'])]));

  const events = status.events.data?.items || [];
  if (events.length) {
    element('events').replaceChildren(...events.map(event => {
      const item = document.createElement('li');
      const name = document.createElement('span');
      name.textContent = event.involvedObject?.name || '—';
      const reason = document.createElement('span');
      reason.className = 'reason';
      reason.textContent = event.reason || event.type || 'Event';
      const message = document.createElement('span');
      message.textContent = event.message || '';
      const time = document.createElement('time');
      time.textContent = event.lastTimestamp ? new Date(event.lastTimestamp).toLocaleTimeString() : '';
      item.append(name, reason, message, time);
      return item;
    }));
  } else {
    const item = document.createElement('li');
    item.className = 'empty';
    item.textContent = 'No recent lab events.';
    element('events').replaceChildren(item);
  }

  const errors = Object.entries(status).filter(([, value]) => value.error).map(([name, value]) => `${name}: ${value.error}`);
  element('alert').hidden = !errors.length;
  element('alert').textContent = errors.join(' | ');
  element('connection').textContent = 'Connected';
  element('connection-dot').className = 'dot live';
  element('updated').textContent = `Updated ${new Date().toLocaleTimeString()}`;
}

async function refresh() {
  try {
    const response = await fetch('/api/status', { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    element('connection').textContent = 'Disconnected';
    element('connection-dot').className = 'dot failed';
    element('alert').hidden = false;
    element('alert').textContent = `Status unavailable: ${error.message}`;
  }
}

async function command(path, body = {}) {
  if (busy) return false;
  busy = true;
  document.querySelectorAll('button').forEach(button => { button.disabled = true; });
  try {
    const response = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || `HTTP ${response.status}`);
    await refresh();
    return true;
  } catch (error) {
    element('alert').hidden = false;
    element('alert').textContent = `Action failed: ${error.message}`;
    return false;
  } finally {
    busy = false;
    document.querySelectorAll('button').forEach(button => { button.disabled = false; });
  }
}

element('traffic-off').addEventListener('click', () => command('/api/traffic', { level: 0 }));
element('traffic-low').addEventListener('click', () => command('/api/traffic', { level: 1 }));
element('traffic-high').addEventListener('click', () => command('/api/traffic', { level: 3 }));
element('increment').addEventListener('click', () => command('/api/database/increment'));
element('backup').addEventListener('click', () => command('/api/database/backup'));
element('restore').addEventListener('click', () => { if (confirm('Restore the latest backup? Newer writes will be rolled back.')) command('/api/database/restore'); });
element('failover').addEventListener('click', () => { if (confirm('Delete the primary database pod? The replica will be promoted automatically.')) command('/api/database/failover'); });
element('disaster').addEventListener('click', () => { if (confirm('Scale the database StatefulSet to zero? All database access stops until recovery.')) command('/api/database/scale', { replicas: 0 }); });
element('recover').addEventListener('click', async () => {
  if (!confirm('Scale the database back to two pods and restore the latest backup?')) return;
  if (await command('/api/database/scale', { replicas: 2 })) await command('/api/database/restore');
});
refresh();
setInterval(refresh, 5000);
