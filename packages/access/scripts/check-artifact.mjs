import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, writeFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.resolve(process.argv[2] ?? await mkdtemp(path.join(tmpdir(), 'access-artifact-')));
assert.ok(!output.startsWith(root), 'Artifact output must be outside source package');
await mkdir(output, { recursive: true });
const staging = await mkdtemp(path.join(tmpdir(), 'access-install-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const exec = (bin, args, cwd = root) => execFileSync(bin, args, { cwd, encoding: 'utf8',
  env: { ...process.env, npm_config_cache: path.join(staging, 'cache') }, maxBuffer: 8 * 1024 * 1024 });
async function walk(dir, prefix = '') {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules') continue;
    if (entry.isDirectory()) result.push(...await walk(path.join(dir, entry.name), prefix + entry.name + '/'));
    else { assert.ok(entry.isFile(), 'No symlinks in artifact'); result.push(prefix + entry.name); }
  }
  return result.sort();
}
// Generic public-content checks; callers may supply additional private deny patterns OUTSIDE
// the repository. This supplements manual review and is not a complete secret detector.
const patterns = [/\b(?!SHA-)[A-Z]{2,8}-\d{2,}\b/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:ghp|gho)_[A-Za-z0-9]{20,}/,
  /https?:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+)/i];
if (process.argv[3]) for (const pattern of JSON.parse(await readFile(process.argv[3], 'utf8'))) patterns.push(new RegExp(pattern, 'i'));
function scan(content, label) {
  for (const pattern of patterns) assert.ok(!pattern.test(content), 'Public content check failed: ' + label);
}
try {
  for (const file of await walk(root)) {
    scan(await readFile(path.join(root, file), 'utf8'), file);
  }
  const pack = JSON.parse(exec('npm', ['pack', '--json', '--pack-destination', output]));
  assert.equal(pack.length, 1);
  const archive = path.join(output, pack[0].filename);
  const checksum = hash(await readFile(archive));
  exec('tar', ['-xzf', archive, '-C', staging]);
  const unpacked = path.join(staging, 'package');
  const manifestText = await readFile(path.join(unpacked, 'provenance.json'), 'utf8');
  const manifest = JSON.parse(manifestText);
  const files = await walk(unpacked);
  assert.deepEqual(files, [...Object.keys(manifest.artifactFiles), 'provenance.json'].sort());
  assert.ok(files.includes('dist/index.d.ts') && files.includes('dist/eve.d.ts') && files.includes('LICENSE'));
  assert.ok(files.every(f => f.startsWith('dist/') || ['package.json', 'README.md', 'PROVENANCE.md', 'LICENSE', 'provenance.json'].includes(f)));
  for (const file of files) scan(await readFile(path.join(unpacked, file), 'utf8'), file);
  const verify = async dir => {
    const actual = await walk(dir);
    if (JSON.stringify(actual) !== JSON.stringify(files)) return false;
    for (const [file, expected] of Object.entries(manifest.artifactFiles)) if (hash(await readFile(path.join(dir, file))) !== expected) return false;
    return hash(await readFile(path.join(dir, 'provenance.json'))) === hash(manifestText);
  };
  assert.ok(await verify(unpacked));
  const consumer = path.join(staging, 'consumer'); await mkdir(consumer);
  await writeFile(path.join(consumer, 'package.json'), JSON.stringify({ private: true, type: 'module',
    dependencies: { '@bshaan77/agent-access': 'file:' + archive, zod: '4.6.6' } }));
  exec('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], consumer);
  const installed = path.join(consumer, 'node_modules/@bshaan77/agent-access');
  assert.ok(await verify(installed));
  const require = createRequire(path.join(installed, 'package.json'));
  assert.equal(require('zod/package.json').version, '4.6.7');
  assert.equal(JSON.parse(await readFile(path.join(consumer, 'node_modules/zod/package.json'), 'utf8')).version, '4.6.6');
  await mkdir(path.join(consumer, 'test'));
  for (const file of await readdir(path.join(root, 'test'))) {
    const content = (await readFile(path.join(root, 'test', file), 'utf8'))
      .replaceAll("'../dist/index.js'", "'@bshaan77/agent-access'")
      .replaceAll("'../dist/eve.js'", "'@bshaan77/agent-access/eve'");
    await writeFile(path.join(consumer, 'test', file), content);
  }
  const tests = exec(process.execPath, ['--test', ... (await readdir(path.join(consumer, 'test'))).filter(f => f.endsWith('.test.mjs')).map(f => 'test/' + f)], consumer);
  await writeFile(path.join(output, 'installed-tests.log'), tests);
  await writeFile(path.join(consumer, 'contract.mts'), `import { AgentPolicySchema, DecisionRequestSchema, evaluate, createAccessHost, type AgentPolicy, type Decision } from '@bshaan77/agent-access';
import { createEveHostGuards } from '@bshaan77/agent-access/eve';
const policy: AgentPolicy = AgentPolicySchema.parse({});
const decision: Decision = evaluate(DecisionRequestSchema.parse({}), {}, Date.now());
void [policy, decision, createAccessHost, createEveHostGuards];\n`);
  exec(process.execPath, [path.join(root, 'node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'contract.mts'], consumer);
  const target = path.join(installed, 'dist/evaluator.js'), original = await readFile(target);
  await writeFile(target, Buffer.concat([original, Buffer.from('\n// synthetic drift\n')]));
  assert.equal(await verify(installed), false, 'Must detect installed-file tampering');
  await writeFile(target, original); assert.ok(await verify(installed));
  await writeFile(path.join(output, pack[0].filename + '.sha256'), checksum + '  ' + pack[0].filename + '\n');
  await writeFile(path.join(output, pack[0].filename + '.files.json'), manifestText);
  await writeFile(path.join(output, 'artifact-result.json'), JSON.stringify({ archive, sha256: checksum,
    sourceTreeSha256: manifest.sourceTreeSha256, files, installedTests: 'PASS', declarations: 'PASS',
    tamperDetection: 'PASS', runtimeDependency: 'zod@4.6.7', parentDependency: 'zod@4.6.6', neutrality: 'PASS (pattern scan plus manual review required)' }, null, 2) + '\n');
  console.log(JSON.stringify({ archive, sha256: checksum, packedFiles: files.length,
    checks: 'PASS neutrality, exact files, installed suite, declarations, dependency isolation, tamper detection' }));
} finally { await rm(staging, { recursive: true, force: true }); }
