'use strict';

const fs = require('node:fs');
const path = require('node:path');
const directory = __dirname;
const architecture = path.join(directory, '..', 'kubernetes-architecture.svg');
const files = ['app.js', 'security.js', 'index.html', 'app.css', 'browser.js'];
const assets = [['architecture.svg', architecture]];

function build() {
  const resources = fs.readFileSync(path.join(directory, 'resources.yaml'), 'utf8').trimEnd();
  const entries = [
    ...files.map(file => `  ${file}: ${JSON.stringify(fs.readFileSync(path.join(directory, file), 'utf8'))}`),
    ...assets.map(([name, source]) => `  ${name}: ${JSON.stringify(fs.readFileSync(source, 'utf8'))}`)
  ].join('\n');
  return `${resources}\n---\napiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: landscape-app\n  namespace: landscape-lab\ndata:\n${entries}\n`;
}

if (require.main === module) fs.writeFileSync(path.join(directory, 'landscape.yaml'), build());
module.exports = { build, files, assets };
