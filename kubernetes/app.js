'use strict';

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');
const dns = require('node:dns');
const crypto = require('node:crypto');
const { isSameOriginMutation, isLabPod } = require('./security');

const role = process.env.ROLE || 'ui';
const port = Number(process.env.PORT || 8080);
const namespace = 'landscape-lab';
const label = encodeURIComponent('app.kubernetes.io/part-of=landscape-lab');
const serviceAccount = '/var/run/secrets/kubernetes.io/serviceaccount';
const podName = process.env.POD_NAME || process.env.HOSTNAME || 'local';
const nodeName = process.env.NODE_NAME || '';
const podOrdinalMatch = podName.match(/^(?:gateway|loadbalancer|cdn|ui|api|database|traffic)-(\d+)$/);
const podOrdinal = podOrdinalMatch ? podOrdinalMatch[1] : '';
const sharedDirectory = process.env.SHARED_DIR || '/shared';
const dataDirectory = process.env.DATA_DIR || '/data';
const componentTimeout = Number(process.env.UPSTREAM_TIMEOUT_MS || 20000);
const hopByHop = new Set(['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);

let workCalls = 0;

function headerValue(value) {
  return Array.isArray(value) ? value.join(',') : String(value);
}

function pickTraceHeaders(headers = {}) {
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    const name = key.toLowerCase();
    if (value === undefined) continue;
    if (name === 'x-landscape-path' || name === 'x-cdn-cache' || name.startsWith('x-served-by-')) {
      out[name] = headerValue(value);
    }
  }
  return out;
}

// Identity + hop chain for scaled StatefulSet pods. Proxies forward upstream
// x-served-by-* / x-landscape-path and append this pod so the browser sees the full path.
function responseHeaders(upstream = {}, extra = {}) {
  const trace = pickTraceHeaders(upstream);
  const prior = trace['x-landscape-path'];
  return {
    ...trace,
    'x-pod-name': podName,
    'x-pod-role': role,
    ...(podOrdinal !== '' ? { 'x-pod-ordinal': podOrdinal } : {}),
    ...(nodeName ? { 'x-pod-node': nodeName } : {}),
    [`x-served-by-${role}`]: podName,
    'x-landscape-path': prior ? `${prior},${podName}` : podName,
    ...extra
  };
}

function send(response, status, value, type = 'application/json; charset=utf-8', headers = {}, upstream = {}) {
  response.writeHead(status, {
    'content-type': type,
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...responseHeaders(upstream, headers)
  });
  response.end(typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
}

function request(options, body) {
  return new Promise((resolve, reject) => {
    const transport = options.protocol === 'https:' ? https : http;
    const outgoing = transport.request({ timeout: componentTimeout, ...options }, incoming => {
      const chunks = [];
      let size = 0;
      incoming.on('data', chunk => {
        size += chunk.length;
        if (size > 4000000) outgoing.destroy(new Error('Response too large'));
        else chunks.push(chunk);
      });
      incoming.on('end', () => resolve({ status: incoming.statusCode, data: Buffer.concat(chunks).toString('utf8'), headers: incoming.headers }));
    });
    outgoing.on('timeout', () => outgoing.destroy(new Error('Request timed out')));
    outgoing.on('error', reject);
    if (body !== undefined) outgoing.write(body);
    outgoing.end();
  });
}

async function kube(target, method = 'GET', body) {
  const token = fs.readFileSync(`${serviceAccount}/token`, 'utf8');
  const ca = fs.readFileSync(`${serviceAccount}/ca.crt`);
  const result = await request({
    protocol: 'https:',
    hostname: process.env.KUBERNETES_SERVICE_HOST,
    port: process.env.KUBERNETES_SERVICE_PORT || 443,
    path: target,
    method,
    ca,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/merge-patch+json' } : {}) }
  }, body && JSON.stringify(body));
  if (result.status < 200 || result.status >= 300) throw new Error(`Kubernetes API ${result.status}: ${result.data.slice(0, 300)}`);
  return JSON.parse(result.data);
}

async function internal(hostname, target, method = 'GET', headers = {}, body, timeout = 8000) {
  return request({ protocol: 'http:', hostname, port: 8080, path: target, method, headers, timeout }, body);
}

async function readBody(requestObject, limit = 65536) {
  const chunks = [];
  let size = 0;
  for await (const chunk of requestObject) {
    size += chunk.length;
    if (size > limit) throw new Error('Request body too large');
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

function spendCpu() {
  crypto.pbkdf2Sync('landscape-lab', 'bounded-work', 20000, 32, 'sha256');
}

function createStats() {
  const startedAt = Date.now();
  const latencies = [];
  const seconds = new Map();
  let total = 0;
  let inFlight = 0;
  let errors = 0;
  return {
    begin() {
      total += 1;
      inFlight += 1;
      const second = Math.floor(Date.now() / 1000);
      seconds.set(second, (seconds.get(second) || 0) + 1);
      if (seconds.size > 130) for (const key of seconds.keys()) if (key < second - 120) seconds.delete(key);
    },
    end(milliseconds, ok) {
      inFlight = Math.max(0, inFlight - 1);
      if (!ok) errors += 1;
      latencies.push(milliseconds);
      if (latencies.length > 200) latencies.shift();
    },
    snapshot() {
      const now = Math.floor(Date.now() / 1000);
      let recent = 0;
      for (const [second, count] of seconds) if (second > now - 5) recent += count;
      const sorted = [...latencies].sort((left, right) => left - right);
      return {
        pod: podName,
        totalRequests: total,
        inFlight,
        errors,
        requestsPerSecond: Math.round((recent / 5) * 10) / 10,
        latencyP95Ms: sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0,
        uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000)
      };
    }
  };
}

async function relay(requestObject, options) {
  const body = requestObject.method === 'GET' || requestObject.method === 'HEAD' ? undefined : await readBody(requestObject);
  const headers = {};
  for (const [name, value] of Object.entries(requestObject.headers)) {
    if (!hopByHop.has(name) && value !== undefined) headers[name] = value;
  }
  return request({
    protocol: 'http:',
    hostname: options.hostname,
    port: options.port || 8080,
    path: requestObject.url,
    method: requestObject.method,
    headers,
    timeout: options.timeout || componentTimeout
  }, body);
}

async function proxy(requestObject, response, stats, options) {
  stats.begin();
  const startedAt = Date.now();
  let ok = false;
  try {
    const result = await relay(requestObject, options);
    ok = result.status < 500;
    send(response, result.status, result.data, result.headers['content-type'] || 'application/octet-stream', {
      'cache-control': result.headers['cache-control'] || 'no-store',
      'x-cdn-cache': result.headers['x-cdn-cache'] || 'BYPASS'
    }, result.headers);
    return result.status;
  } catch (error) {
    send(response, 502, { error: `Upstream ${options.hostname} unavailable: ${error.message}` });
    return 502;
  } finally {
    stats.end(Date.now() - startedAt, ok);
  }
}

function createGateway(stats) {
  return (requestObject, response) => {
    const target = new URL(requestObject.url, 'http://lab').pathname;
    if (target === '/health') return send(response, 200, { ok: true, role, pod: podName });
    if (target === '/_gateway/stats') return send(response, 200, { role: 'gateway', upstream: 'loadbalancer', ...stats.snapshot() });
    return proxy(requestObject, response, stats, { hostname: 'loadbalancer' });
  };
}

async function resolveBackends(service) {
  try {
    const records = await dns.promises.resolveSrv(`_http._tcp.${service}.${namespace}.svc.cluster.local`);
    if (records.length) return records.map(record => ({ hostname: record.name.replace(/\.$/, ''), port: record.port }));
  } catch {}
  return [{ hostname: service, port: 8080 }];
}

function createLoadBalancer(stats) {
  let backends = [];
  let refreshedAt = 0;
  let cursor = 0;
  const usage = new Map();
  async function pool() {
    if (!backends.length || Date.now() - refreshedAt > 5000) {
      backends = await resolveBackends('cdn-headless');
      refreshedAt = Date.now();
    }
    return backends;
  }
  return async (requestObject, response) => {
    const target = new URL(requestObject.url, 'http://lab').pathname;
    if (target === '/health') return send(response, 200, { ok: true, role, pod: podName });
    if (target === '/_lb/stats') {
      const available = await pool();
      return send(response, 200, {
        role: 'loadbalancer',
        algorithm: 'round-robin',
        backends: available.map(item => item.hostname),
        distribution: [...usage.entries()].map(([hostname, requests]) => ({ pod: hostname, requests })),
        ...stats.snapshot()
      });
    }
    const available = await pool();
    const backend = available[cursor++ % available.length];
    usage.set(backend.hostname, (usage.get(backend.hostname) || 0) + 1);
    const status = await proxy(requestObject, response, stats, { hostname: backend.hostname, port: backend.port });
    if (status === 502) {
      backends = [];
      refreshedAt = 0;
    }
    return status;
  };
}

function createCdn(stats) {
  const cache = new Map();
  const ttl = 15000;
  let hits = 0;
  let misses = 0;
  let bytesSaved = 0;
  return async (requestObject, response) => {
    const target = new URL(requestObject.url, 'http://lab').pathname;
    if (target === '/health') return send(response, 200, { ok: true, role, pod: podName });
    if (target === '/_cdn/stats') {
      const lookups = hits + misses;
      return send(response, 200, {
        role: 'cdn',
        ttlSeconds: ttl / 1000,
        entries: cache.size,
        hits,
        misses,
        hitRatio: lookups ? Math.round((hits / lookups) * 100) : 0,
        bytesSaved,
        ...stats.snapshot()
      });
    }
    const cacheable = requestObject.method === 'GET' && !target.startsWith('/api/') && target !== '/work' && !target.startsWith('/_');
    if (cacheable) {
      const entry = cache.get(requestObject.url);
      if (entry && entry.expires > Date.now()) {
        hits += 1;
        bytesSaved += entry.size;
        send(response, 200, entry.data, entry.type, { 'cache-control': 'no-store', 'x-cdn-cache': 'HIT' }, entry.headers || {});
        return 200;
      }
      misses += 1;
    }
    stats.begin();
    const startedAt = Date.now();
    let ok = false;
    try {
      const result = await relay(requestObject, { hostname: 'ui' });
      ok = result.status < 500;
      const type = result.headers['content-type'] || 'application/octet-stream';
      if (cacheable && result.status === 200) {
        cache.set(requestObject.url, {
          data: result.data,
          type,
          expires: Date.now() + ttl,
          size: Buffer.byteLength(result.data),
          headers: pickTraceHeaders(result.headers)
        });
        if (cache.size > 50) cache.delete(cache.keys().next().value);
      }
      send(response, result.status, result.data, type, { 'cache-control': 'no-store', 'x-cdn-cache': 'MISS' }, result.headers);
      return result.status;
    } catch (error) {
      send(response, 502, { error: `UI unavailable: ${error.message}` });
      return 502;
    } finally {
      stats.end(Date.now() - startedAt, ok);
    }
  };
}

function createUi() {
  const assets = {
    '/': ['index.html', 'text/html; charset=utf-8'],
    '/index.html': ['index.html', 'text/html; charset=utf-8'],
    '/app.css': ['app.css', 'text/css; charset=utf-8'],
    '/browser.js': ['browser.js', 'text/javascript; charset=utf-8'],
    '/architecture.svg': ['architecture.svg', 'image/svg+xml; charset=utf-8']
  };
  return async (requestObject, response) => {
    const target = new URL(requestObject.url, 'http://lab').pathname;
    if (target === '/health') return send(response, 200, { ok: true, role, pod: podName });
    if (requestObject.method === 'GET' && assets[target]) {
      const [file, type] = assets[target];
      return send(response, 200, fs.readFileSync(path.join('/app', file)), type, { 'cache-control': 'no-store' });
    }
    try {
      const body = requestObject.method === 'GET' || requestObject.method === 'HEAD' ? undefined : await readBody(requestObject);
      const result = await internal('api', requestObject.url, requestObject.method, {
        host: requestObject.headers.host || '',
        origin: requestObject.headers.origin || '',
        'content-type': requestObject.headers['content-type'] || ''
      }, body, target === '/api/status' ? 20000 : 8000);
      send(response, result.status, result.data, result.headers['content-type'] || 'application/json; charset=utf-8', {}, result.headers);
      return result.status;
    } catch (error) {
      send(response, 502, { error: `API unavailable: ${error.message}` });
      return 502;
    }
  };
}

function readShared(name, fallback) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(sharedDirectory, name), 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function primaryName() {
  const marker = readShared('primary.json', { primary: 'database-0' });
  return typeof marker.primary === 'string' ? marker.primary : 'database-0';
}

function listBackups() {
  const directory = path.join(sharedDirectory, 'backups');
  let names = [];
  try {
    names = fs.readdirSync(directory).filter(name => name.endsWith('.json') && name !== 'latest.json').sort();
  } catch {}
  return { count: names.length, latest: names.length ? names[names.length - 1] : null };
}

async function promoteReplica(current, clients = {}) {
  const kubeClient = clients.kube || kube;
  const internalClient = clients.internal || internal;
  let pods;
  try {
    pods = await kubeClient(`/api/v1/namespaces/${namespace}/pods?labelSelector=${label}`);
  } catch {
    return null;
  }
  const candidates = (pods.items || []).filter(pod => /^database-/.test(pod.metadata.name) && pod.metadata.name !== current && pod.status?.phase === 'Running' && (pod.status.containerStatuses || []).some(item => item.name === 'database' && item.ready));
  for (const pod of candidates) {
    try {
      const result = await internalClient(`${pod.metadata.name}.database`, '/promote', 'POST', {}, undefined, 4000);
      if (result.status === 200) return pod.metadata.name;
    } catch {}
  }
  return null;
}

async function dbRequest(target, method = 'GET', attempt = 0, clients = {}) {
  const internalClient = clients.internal || internal;
  const active = primaryName();
  try {
    const result = await internalClient(`${active}.database`, target, method, {}, undefined, 5000);
    if (result.status < 200 || result.status >= 300) {
      const error = new Error(`Database HTTP ${result.status}: ${result.data.slice(0, 200)}`);
      error.status = result.status;
      throw error;
    }
    return { data: JSON.parse(result.data), pod: active, failover: attempt > 0 };
  } catch (error) {
    if (attempt > 0 || error.status === 409) throw error;
    const promoted = await promoteReplica(active, clients);
    if (!promoted) throw error;
    return dbRequest(target, method, attempt + 1, clients);
  }
}

async function componentStats(hostname, target, client = internal) {
  const result = await client(hostname, target, 'GET', {}, undefined, 4000);
  if (result.status !== 200) throw new Error(`${hostname} HTTP ${result.status}`);
  return JSON.parse(result.data);
}

async function collectStatus(clients = {}) {
  const kubeClient = clients.kube || kube;
  const internalClient = clients.internal || internal;
  const apps = `/apis/apps/v1/namespaces/${namespace}`;
  const core = `/api/v1/namespaces/${namespace}`;
  const tasks = {
    statefulsets: () => kubeClient(`${apps}/statefulsets?labelSelector=${label}`),
    nodes: async () => {
      const data = await kubeClient('/api/v1/nodes');
      return {
        items: (data.items || []).map(node => ({
          name: node.metadata.name,
          roles: Object.keys(node.metadata.labels || {})
            .filter(key => key.startsWith('node-role.kubernetes.io/'))
            .map(key => key.slice('node-role.kubernetes.io/'.length))
            .sort(),
          taints: (node.spec?.taints || []).map(taint => ({ key: taint.key, value: taint.value || '', effect: taint.effect })),
          unschedulable: Boolean(node.spec?.unschedulable)
        }))
      };
    },
    pods: () => kubeClient(`${core}/pods?labelSelector=${label}`),
    hpas: () => kubeClient(`/apis/autoscaling/v2/namespaces/${namespace}/horizontalpodautoscalers?labelSelector=${label}`),
    metrics: () => kubeClient(`/apis/metrics.k8s.io/v1beta1/namespaces/${namespace}/pods?labelSelector=${label}`),
    events: async () => {
      const data = await kubeClient(`${core}/events?limit=60`);
      data.items = data.items
        .filter(event => !event.involvedObject?.name || isLabPod(event.involvedObject.name) || event.involvedObject.name === 'database' || event.involvedObject.name === 'traffic')
        .sort((left, right) => String(right.lastTimestamp || right.eventTime || '').localeCompare(String(left.lastTimestamp || left.eventTime || '')))
        .slice(0, 12);
      return data;
    },
    gateway: () => componentStats('gateway', '/_gateway/stats', internalClient),
    loadbalancer: () => componentStats('loadbalancer', '/_lb/stats', internalClient),
    cdn: () => componentStats('cdn', '/_cdn/stats', internalClient),
    database: async () => {
      const result = await dbRequest('/state', 'GET', 0, { internal: internalClient });
      return { ...result.data, activePod: result.pod, failover: result.failover };
    },
    backups: () => listBackups()
  };
  const entries = await Promise.all(Object.entries(tasks).map(async ([name, task]) => {
    try {
      return [name, { data: await task() }];
    } catch (error) {
      return [name, { error: error.message }];
    }
  }));
  const result = Object.fromEntries(entries);
  const counts = new Map();
  let podsKnown = false;
  if (result.pods.data) {
    podsKnown = true;
    result.pods.data.items = result.pods.data.items.filter(pod => isLabPod(pod.metadata.name));
    for (const pod of result.pods.data.items) {
      const node = pod.spec?.nodeName;
      if (node) counts.set(node, (counts.get(node) || 0) + 1);
    }
  }
  if (result.nodes.data) {
    result.nodes.data.items = result.nodes.data.items.map(node => ({
      ...node,
      podCount: podsKnown ? counts.get(node.name) || 0 : null
    }));
  }
  return result;
}

const controls = {
  '/api/traffic': async (data, clients) => {
    if (!data || !Number.isInteger(data.level) || data.level < 0 || data.level > 3) {
      const error = new Error('level must be an integer between 0 and 3');
      error.status = 400;
      throw error;
    }
    await (clients.kube || kube)(`/apis/apps/v1/namespaces/${namespace}/statefulsets/traffic/scale`, 'PATCH', { spec: { replicas: data.level } });
    return { level: data.level };
  },
  '/api/database/increment': async (data, clients) => {
    const result = await dbRequest('/increment', 'POST', 0, clients);
    return { ...result.data, activePod: result.pod };
  },
  '/api/database/backup': async (data, clients) => {
    const result = await dbRequest('/backup', 'POST', 0, clients);
    return result.data;
  },
  '/api/database/restore': async (data, clients) => {
    const result = await dbRequest('/restore', 'POST', 0, clients);
    return result.data;
  },
  '/api/database/failover': async () => {
    await kube(`/api/v1/namespaces/${namespace}/pods/database-0`, 'DELETE');
    return { message: 'Primary pod deletion requested. The API fails over to the replica and promotes it.' };
  },
  '/api/database/scale': async (data, clients) => {
    if (!data || ![0, 2].includes(data.replicas)) {
      const error = new Error('replicas must be 0 (disaster) or 2 (recover)');
      error.status = 400;
      throw error;
    }
    await (clients.kube || kube)(`/apis/apps/v1/namespaces/${namespace}/statefulsets/database/scale`, 'PATCH', { spec: { replicas: data.replicas } });
    return { replicas: data.replicas };
  }
};

async function apiHandler(requestObject, response, clients = { kube, internal }) {
  const target = new URL(requestObject.url, 'http://lab').pathname;
  if (requestObject.method === 'GET' && target === '/health') return send(response, 200, { ok: true, role, pod: podName });
  if (requestObject.method === 'GET' && target === '/work') {
    spendCpu();
    workCalls += 1;
    if (workCalls % 20 === 0) dbRequest('/touch', 'POST', 0, clients).catch(() => {});
    return send(response, 200, { ok: true });
  }
  if (requestObject.method === 'GET' && target === '/api/status') return send(response, 200, await collectStatus(clients));
  const control = controls[target];
  if (requestObject.method !== 'POST' || !control) return send(response, 404, { error: 'Not found' });
  if (!isSameOriginMutation(requestObject)) return send(response, 403, { error: 'Same-origin JSON request required' });
  let data;
  try {
    const body = await readBody(requestObject);
    data = JSON.parse(body.toString('utf8') || '{}');
  } catch {
    return send(response, 400, { error: 'Invalid JSON body' });
  }
  try {
    return send(response, 200, await control(data, clients));
  } catch (error) {
    return send(response, error.status || 503, { error: error.message });
  }
}

function persistState(file, state) {
  const temporary = `${file}.tmp`;
  const descriptor = fs.openSync(temporary, 'w');
  try {
    fs.writeFileSync(descriptor, JSON.stringify(state));
    fs.fsyncSync(descriptor);
  } finally {
    fs.closeSync(descriptor);
  }
  fs.renameSync(temporary, file);
}

function createDatabaseHandler(directory, options = {}) {
  const shared = options.sharedDirectory || sharedDirectory;
  const name = options.podName || podName;
  const file = path.join(directory, 'state.json');
  const markerFile = path.join(shared, 'primary.json');
  fs.mkdirSync(directory, { recursive: true });

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!Number.isSafeInteger(parsed.counter) || parsed.counter < 0) throw new Error('Invalid persisted database state');
      return { counter: parsed.counter, touches: Number.isSafeInteger(parsed.touches) ? parsed.touches : 0 };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      return { counter: 0, touches: 0 };
    }
  }

  let state = load();

  function readMarker() {
    try {
      const parsed = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
      if (parsed && typeof parsed.primary === 'string') return { primary: parsed.primary, epoch: Number(parsed.epoch) || 1 };
    } catch {}
    return { primary: 'database-0', epoch: 1 };
  }

  function writeMarker(primary, epoch) {
    fs.mkdirSync(shared, { recursive: true });
    fs.writeFileSync(markerFile, JSON.stringify({ primary, epoch }));
  }

  if (!fs.existsSync(markerFile) && name === 'database-0') writeMarker('database-0', 1);

  const isPrimary = () => readMarker().primary === name;
  const details = () => ({ ...state, pod: name, role: isPrimary() ? 'primary' : 'replica', primary: isPrimary(), primaryPod: readMarker().primary, epoch: readMarker().epoch });

  function save() {
    persistState(file, state);
  }

  function handler(requestObject, response) {
    if (requestObject.method === 'GET' && (requestObject.url === '/health' || requestObject.url === '/state')) return send(response, 200, details());
    if (requestObject.method === 'POST' && requestObject.url === '/promote') {
      if (!isPrimary()) writeMarker(name, readMarker().epoch + 1);
      return send(response, 200, details());
    }
    if (requestObject.method === 'POST' && requestObject.url === '/replicate') return send(response, 409, { error: 'Push replication is not used; replicas pull from the primary' });
    if (requestObject.method === 'POST' && requestObject.url === '/backup') {
      if (!isPrimary()) return send(response, 409, { error: 'Only the primary accepts backups', primary: readMarker().primary });
      const directoryPath = path.join(shared, 'backups');
      fs.mkdirSync(directoryPath, { recursive: true });
      const snapshot = { ...state, createdAt: new Date().toISOString(), pod: name, epoch: readMarker().epoch };
      const stamp = snapshot.createdAt.replace(/[:.]/g, '-');
      fs.writeFileSync(path.join(directoryPath, `${stamp}.json`), JSON.stringify(snapshot));
      fs.writeFileSync(path.join(directoryPath, 'latest.json'), JSON.stringify(snapshot));
      const files = fs.readdirSync(directoryPath).filter(item => item !== 'latest.json' && item.endsWith('.json')).sort();
      for (const item of files.slice(0, Math.max(0, files.length - 10))) fs.rmSync(path.join(directoryPath, item), { force: true });
      return send(response, 200, { ...state, backup: `${stamp}.json` });
    }
    if (requestObject.method === 'POST' && requestObject.url === '/restore') {
      if (!isPrimary()) return send(response, 409, { error: 'Only the primary can restore', primary: readMarker().primary });
      let snapshot;
      try {
        snapshot = JSON.parse(fs.readFileSync(path.join(shared, 'backups', 'latest.json'), 'utf8'));
      } catch {
        return send(response, 404, { error: 'No backup exists yet; take a backup first' });
      }
      state = { counter: snapshot.counter, touches: snapshot.touches || 0 };
      save();
      return send(response, 200, { ...state, restoredFrom: snapshot.createdAt || 'latest.json' });
    }
    if (requestObject.method === 'POST' && (requestObject.url === '/increment' || requestObject.url === '/touch')) {
      if (!isPrimary()) return send(response, 409, { error: 'Replica is read-only', primary: readMarker().primary });
      if (requestObject.url === '/increment') {
        if (state.counter >= Number.MAX_SAFE_INTEGER) return send(response, 409, { error: 'Counter limit reached' });
        state = { ...state, counter: state.counter + 1 };
      } else {
        state = { ...state, touches: state.touches + 1 };
      }
      save();
      return send(response, 200, details());
    }
    return send(response, 404, { error: 'Not found' });
  }

  handler.adopt = remote => {
    if (isPrimary() || !remote || !Number.isSafeInteger(remote.counter)) return;
    if (remote.counter >= state.counter) {
      state = { counter: remote.counter, touches: Number.isSafeInteger(remote.touches) ? remote.touches : state.touches };
      save();
    }
  };
  handler.role = isPrimary;
  return handler;
}

async function replicaSync(database) {
  const marker = readShared('primary.json', { primary: 'database-0' });
  if (marker.primary === podName || podName === 'local') return;
  try {
    const result = await internal(`${marker.primary}.database`, '/state', 'GET', {}, undefined, 2000);
    if (result.status === 200) database.adopt(JSON.parse(result.data));
  } catch {}
}

async function trafficLoop() {
  while (true) {
    try {
      await internal('gateway', `/work?source=traffic&t=${Date.now()}`);
    } catch (error) {
      console.error('Traffic request failed:', error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 15));
  }
}

function start() {
  if (role === 'traffic') {
    for (let worker = 0; worker < 4; worker += 1) trafficLoop();
    return;
  }
  let handler;
  if (role === 'database') {
    handler = createDatabaseHandler(dataDirectory);
    setInterval(() => replicaSync(handler).catch(error => console.error('Replica sync failed:', error.message)), 2000).unref();
  } else if (role === 'api') {
    handler = apiHandler;
  } else if (role === 'gateway') {
    handler = createGateway(createStats());
  } else if (role === 'loadbalancer') {
    handler = createLoadBalancer(createStats());
  } else if (role === 'cdn') {
    handler = createCdn(createStats());
  } else {
    handler = createUi();
  }
  http.createServer((requestObject, response) => {
    Promise.resolve().then(() => handler(requestObject, response)).catch(error => {
      console.error(error);
      if (!response.headersSent) send(response, 503, { error: error.message });
      else response.destroy();
    });
  }).listen(port, '0.0.0.0', () => console.log(`${role} ${podName} listening on ${port}`));
}

if (require.main === module) start();
module.exports = {
  apiHandler,
  collectStatus,
  createCdn,
  createDatabaseHandler,
  createGateway,
  createLoadBalancer,
  createUi,
  dbRequest,
  listBackups,
  primaryName,
  resolveBackends,
  spendCpu
};
