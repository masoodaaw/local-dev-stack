'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { isSameOriginMutation, isLabPod } = require('./security');
const { createDatabaseHandler, apiHandler, collectStatus } = require('./app');
const { build } = require('./build');

function response() {
  return { writeHead(status) { this.status = status; }, end(body) { try { this.body = JSON.parse(body); } catch { this.body = body; } } };
}

function mutation(origin, host, contentType = 'application/json') {
  return { headers: { origin, host, 'content-type': contentType } };
}

function invoke(url, body, clients) {
  const request = Readable.from([JSON.stringify(body)]);
  Object.assign(request, { method: 'POST', url, headers: { host: 'localhost:18080', origin: 'http://localhost:18080', 'content-type': 'application/json' } });
  const result = response();
  return apiHandler(request, result, clients).then(() => result);
}

test('mutations require a matching loopback origin and JSON', () => {
  assert.equal(isSameOriginMutation(mutation('http://localhost:18080', 'localhost:18080')), true);
  assert.equal(isSameOriginMutation(mutation('http://127.0.0.1:18080', '127.0.0.1:18080')), true);
  assert.equal(isSameOriginMutation(mutation('http://[::1]:18080', '[::1]:18080')), true);
  assert.equal(isSameOriginMutation(mutation('http://evil.example', 'localhost:18080')), false);
  assert.equal(isSameOriginMutation(mutation('http://localhost:18080', 'localhost:18080', 'text/plain')), false);
  assert.equal(isLabPod('database-0'), true);
  assert.equal(isLabPod('loadbalancer-abc'), true);
  assert.equal(isLabPod('unrelated-0'), false);
});

test('control routes reject cross-origin requests and unknown operations', async () => {
  const forbidden = response();
  await apiHandler({ method: 'POST', url: '/api/database/failover', headers: { host: 'localhost:18080', origin: 'http://evil.test', 'content-type': 'application/json' } }, forbidden);
  assert.equal(forbidden.status, 403);
  const unknown = response();
  await apiHandler({ method: 'POST', url: '/api/not-a-control', headers: {} }, unknown);
  assert.equal(unknown.status, 404);
});

test('traffic levels validate and patch only the traffic scale', async () => {
  const calls = [];
  const clients = {
    kube: async (...arguments_) => { calls.push(arguments_); return {}; },
    internal: async (...arguments_) => { calls.push(arguments_); return { status: 200, data: '{"counter":3,"touches":9,"role":"primary","primary":true}' }; }
  };
  assert.equal((await invoke('/api/traffic', { level: 2 }, clients)).status, 200);
  assert.equal((await invoke('/api/traffic', { level: 9 }, clients)).status, 400);
  assert.equal((await invoke('/api/traffic', { level: '1' }, clients)).status, 400);
  assert.deepEqual(calls[0], ['/apis/apps/v1/namespaces/landscape-lab/statefulsets/traffic/scale', 'PATCH', { spec: { replicas: 2 } }]);
  assert.equal(calls.length, 1);
  const scaled = await invoke('/api/database/scale', { replicas: 0 }, clients);
  assert.equal(scaled.status, 200);
  assert.deepEqual(calls[1], ['/apis/apps/v1/namespaces/landscape-lab/statefulsets/database/scale', 'PATCH', { spec: { replicas: 0 } }]);
  assert.equal((await invoke('/api/database/scale', { replicas: 1 }, clients)).status, 400);
});

test('database primary/replica lifecycle, backup and restore', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'landscape-'));
  const shared = path.join(base, 'shared');
  const call = (handler, method, url) => {
    const result = response();
    handler({ method, url }, result);
    return result;
  };
  try {
    const primary = createDatabaseHandler(path.join(base, 'database-0'), { sharedDirectory: shared, podName: 'database-0' });
    const replica = createDatabaseHandler(path.join(base, 'database-1'), { sharedDirectory: shared, podName: 'database-1' });
    assert.equal(call(replica, 'POST', '/increment').status, 409);
    assert.equal(call(primary, 'POST', '/increment').body.counter, 1);
    assert.equal(call(primary, 'POST', '/backup').status, 200);
    assert.ok(fs.existsSync(path.join(shared, 'backups', 'latest.json')));
    assert.equal(call(primary, 'POST', '/increment').body.counter, 2);
    assert.equal(call(primary, 'POST', '/restore').body.counter, 1);
    replica.adopt({ counter: 7, touches: 4 });
    assert.equal(call(replica, 'GET', '/state').body.counter, 7);
    primary.adopt({ counter: 99, touches: 0 });
    assert.equal(call(primary, 'GET', '/state').body.counter, 1);
    const promoted = call(replica, 'POST', '/promote');
    assert.equal(promoted.status, 200);
    assert.equal(promoted.body.role, 'primary');
    assert.equal(call(primary, 'POST', '/increment').status, 409);
    assert.equal(call(replica, 'POST', '/increment').body.counter, 8);
    const reopened = createDatabaseHandler(path.join(base, 'database-1'), { sharedDirectory: shared, podName: 'database-1' });
    assert.equal(call(reopened, 'GET', '/state').body.counter, 8);
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
});

test('status payload describes nodes with roles, taints and lab pod counts', async () => {
  const clients = {
    kube: async target => {
      if (target === '/api/v1/nodes') {
        return { items: [
          { metadata: { name: 'k3s-server', labels: { 'node-role.kubernetes.io/control-plane': '' } }, spec: { taints: [{ key: 'k3s.io/lab-control-plane', value: 'true', effect: 'NoSchedule' }] } },
          { metadata: { name: 'k3s-agent-1', labels: {} }, spec: {} },
          { metadata: { name: 'k3s-agent-2', labels: {} }, spec: { unschedulable: true } }
        ] };
      }
      if (target.startsWith('/api/v1/namespaces/landscape-lab/pods?')) {
        return { items: [
          { metadata: { name: 'api-0' }, spec: { nodeName: 'k3s-agent-1' } },
          { metadata: { name: 'database-0' }, spec: { nodeName: 'k3s-agent-1' } },
          { metadata: { name: 'noise-0' }, spec: { nodeName: 'k3s-agent-1' } }
        ] };
      }
      throw new Error('not available');
    },
    internal: async () => { throw new Error('not available'); }
  };
  const status = await collectStatus(clients);
  assert.deepEqual(
    status.nodes.data.items.map(node => [node.name, node.roles, node.taints, node.podCount, node.unschedulable]),
    [
      ['k3s-server', ['control-plane'], [{ key: 'k3s.io/lab-control-plane', value: 'true', effect: 'NoSchedule' }], 0, false],
      ['k3s-agent-1', [], [], 2, false],
      ['k3s-agent-2', [], [], 0, true]
    ]
  );
});

test('generated manifest embeds exact assets and the full landscape', () => {
  const manifest = fs.readFileSync(path.join(__dirname, 'landscape.yaml'), 'utf8');
  assert.equal(manifest, build(), 'Run node kubernetes/build.js after changing a source file');
  const expected = [
    ...['app.js', 'security.js', 'index.html', 'app.css', 'browser.js'].map(file => [file, path.join(__dirname, file)]),
    ['architecture.svg', path.join(__dirname, '..', 'kubernetes-architecture.svg')]
  ];
  for (const [file, source] of expected) {
    const line = manifest.split('\n').find(entry => entry.startsWith(`  ${file}: `));
    assert.ok(line, `Missing ConfigMap asset ${file}`);
    assert.equal(JSON.parse(line.slice(line.indexOf(': ') + 2)), fs.readFileSync(source, 'utf8'));
  }
  assert.equal((manifest.match(/^kind: Deployment$/gm) || []).length, 0);
  assert.equal((manifest.match(/^kind: StatefulSet$/gm) || []).length, 7);
  assert.equal((manifest.match(/^kind: HorizontalPodAutoscaler$/gm) || []).length, 5);
  assert.equal((manifest.match(/^kind: NetworkPolicy$/gm) || []).length, 7);
  assert.equal((manifest.match(/^kind: Service$/gm) || []).length, 12);
  assert.equal((manifest.match(/^kind: Ingress$/gm) || []).length, 1);
  assert.match(manifest, /kind: Ingress[\s\S]*?name: gateway[\s\S]*?number: 8080/);
  assert.match(manifest, /resourceNames: \["database-0"\]\s+verbs: \["delete"\]/);
  assert.match(manifest, /resources: \["statefulsets\/scale"\]\s+resourceNames: \["database", "traffic"\]\s+verbs: \["patch"\]/);
  assert.match(manifest, /kind: StatefulSet[\s\S]*?replicas: 2[\s\S]*?storageClassName: local-path/);
  assert.doesNotMatch(manifest, /claimName: landscape-shared/);
  assert.equal((manifest.match(/path: \/shared, type: Directory/g) || []).length, 2);
  assert.equal((manifest.match(/topologyKey: kubernetes\.io\/hostname/g) || []).length, 7);
  assert.match(manifest, /name: cdn-headless[\s\S]*?clusterIP: None/);
  const NL = String.fromCharCode(10);
  const lf = manifest.split(String.fromCharCode(13) + NL).join(NL);
  for (const name of ['gateway', 'loadbalancer', 'cdn', 'ui', 'api', 'traffic']) {
    const begin = lf.indexOf('kind: StatefulSet' + NL + 'metadata:' + NL + '  name: ' + name + NL);
    assert.ok(begin >= 0, 'Missing StatefulSet ' + name);
    const block = lf.slice(begin, lf.indexOf(NL + '---', begin));
    assert.ok(block.includes('serviceName: ' + name + '-headless'), name + ' serviceName');
    assert.ok(block.includes('podManagementPolicy: Parallel'), name + ' podManagementPolicy');
  }
  assert.equal((manifest.match(/^kind: ClusterRole$/gm) || []).length, 1);
  assert.equal((manifest.match(/^kind: ClusterRoleBinding$/gm) || []).length, 1);
  assert.match(manifest, /kind: ClusterRole\b[\s\S]*?resources: \["nodes"\]\s+verbs: \["get", "list"\]/);
  assert.doesNotMatch(manifest, /resources: \["(?:secrets|pods\/exec|nodes\/proxy)"\]/);
  assert.doesNotMatch(manifest, /hostNetwork: true/);
});
