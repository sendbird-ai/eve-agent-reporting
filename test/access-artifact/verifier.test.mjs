import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rename, rm, rmdir, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync, gunzipSync } from 'node:zlib';
import { archiveFiles, digest, walk } from '../../scripts/access-artifact/core.mjs';
import { prepare } from '../../scripts/access-artifact/prepare.mjs';
import { validateBaseline, verify } from '../../scripts/access-artifact/verify.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const run = (bin, args, cwd = root) => {
  const env = { ...process.env, npm_config_cache: process.env.ACCESS_TEST_CACHE ?? path.join(temporary, 'cache') };
  delete env.NODE_TEST_CONTEXT;
  return execFileSync(bin, args, { cwd, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, env });
};
let temporary, config, baseline, baselineBytes, consumer;
const installed = 'node_modules/@bshaan77/agent-access';
before(async () => {
  temporary = process.env.ACCESS_TEST_OUTPUT ?? await mkdtemp(path.join(tmpdir(), 'access-verifier-'));
  await mkdir(temporary, { recursive: true });
  const archiveRoot = process.env.ACCESS_TEST_ARCHIVE_ROOT ?? temporary;
  const archive = process.env.ACCESS_TEST_ARCHIVE ?? 'bshaan77-agent-access-0.1.0.tgz';
  if (!process.env.ACCESS_TEST_ARCHIVE) run('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temporary], path.join(root, 'packages/access'));
  const dep = 'zod-4.6.7.tgz';
  if (process.env.ACCESS_TEST_DEPENDENCY) await cp(process.env.ACCESS_TEST_DEPENDENCY, path.join(temporary, dep));
  else run('npm', ['pack', 'zod@4.6.7', '--ignore-scripts', '--pack-destination', temporary]);
  // Put both input archives under one approved root without touching the original.
  await cp(path.join(archiveRoot, archive), path.join(temporary, 'agent-access.tgz'));
  const recordedBaseline = JSON.parse(await readFile(path.join(root, 'artifacts/access/0.1.0/baseline.json')));
  const sourceCommit = process.env.ACCESS_TEST_SOURCE_COMMIT ?? recordedBaseline.source.commit;
  const preparation = { sourceRoot: root, sourceCommit, artifactRoot: temporary, archive: 'agent-access.tgz', dependencyArchives: [dep] };
  baseline = await prepare(preparation);
  assert.deepEqual(baseline, recordedBaseline, 'archive and source must reproduce the single committed baseline');
  assert.deepEqual(baseline, await prepare(preparation), 'baseline must reproduce byte-for-byte');
  baselineBytes = Buffer.from(JSON.stringify(baseline, null, 2) + '\n');
  await writeFile(path.join(temporary, 'baseline.json'), baselineBytes);
  for (const name of ['support', 'operations']) {
    const directory = path.join(temporary, name);
    await mkdir(path.join(directory, 'vendor'), { recursive: true });
    for (const file of ['package.json', 'package-lock.json'])
      await cp(path.join(root, 'test/access-artifact/fixtures', name, file), path.join(directory, file));
    await cp(path.join(temporary, 'agent-access.tgz'), path.join(directory, 'vendor/agent-access.tgz'));
    run('npm', ['ci', '--ignore-scripts', '--no-audit', '--no-fund'], directory);
  }
  consumer = path.join(temporary, 'support');
  config = { baselineRoot: temporary, baseline: 'baseline.json', baselineSha256: digest(baselineBytes),
    artifactRoot: temporary, archive: 'agent-access.tgz', consumerRoot: consumer, dependencyPath: 'vendor/agent-access.tgz' };
});
after(async () => { if (!process.env.ACCESS_TEST_OUTPUT && temporary) await rm(temporary, { recursive: true, force: true }); });

async function mutateFile(file, change, callback = () => verify(config)) {
  const original = await readFile(file);
  try { await writeFile(file, change(original)); await assert.rejects(callback); }
  finally { await writeFile(file, original); }
}
async function mutateJson(file, change, callback) {
  return mutateFile(file, original => { const value = JSON.parse(original); change(value); return JSON.stringify(value); }, callback);
}

test('two locked isolated consumers: nested/deduplicated resolution, exact files, runtime suite and declarations', async () => {
  for (const name of ['support', 'operations']) {
    const directory = path.join(temporary, name), options = { ...config, consumerRoot: directory };
    const before = await walk(directory);
    const result = await verify(options);
    assert.equal(result.verified, true); assert.equal(result.deploymentVerified, false);
    assert.deepEqual(await walk(directory), before, 'verification must not write');
    const expectedLocation = name === 'support' ? installed + '/node_modules/zod' : 'node_modules/zod';
    const parentVersion = name === 'support' ? '4.6.6' : '4.6.7';
    assert.deepEqual(result.runtimeDependencies, [{ name: 'zod', version: '4.6.7', location: expectedLocation }]);
    // Execute actual installed exports, not repository imports. Resolve Zod through Node.
    const smoke = `import assert from 'node:assert/strict'; import {createRequire} from 'node:module';
      import {evaluate, AgentPolicySchema} from '@bshaan77/agent-access';
      import {createEveHostGuards} from '@bshaan77/agent-access/eve';
      const require=createRequire(new URL('./${installed}/package.json',import.meta.url));
      assert.equal(require('zod/package.json').version,'4.6.7');
      assert.equal(require.resolve('zod/package.json'),new URL('./${expectedLocation}/package.json',import.meta.url).pathname);
      const parentRequire=createRequire(import.meta.url);
      assert.equal(parentRequire('zod/package.json').version,'${parentVersion}');
      assert.equal(evaluate({}, {}, Date.now()).outcome,'deny');
      assert.equal(AgentPolicySchema.safeParse({}).success,false); assert.equal(typeof createEveHostGuards,'function');`;
    await writeFile(path.join(directory, 'smoke.mjs'), smoke);
    run(process.execPath, ['smoke.mjs'], directory);
    await mkdir(path.join(directory, 'test'), { recursive: true });
    for (const file of await readdir(path.join(root, 'packages/access/test'))) {
      const content = (await readFile(path.join(root, 'packages/access/test', file), 'utf8'))
        .replaceAll("'../dist/index.js'", "'@bshaan77/agent-access'").replaceAll("'../dist/eve.js'", "'@bshaan77/agent-access/eve'");
      await writeFile(path.join(directory, 'test', file), content);
    }
    const suite = run(process.execPath, ['--test', '--test-reporter=tap', ...(await readdir(path.join(directory, 'test'))).filter(f => f.endsWith('.test.mjs')).map(f => 'test/' + f)], directory);
    assert.match(suite, /# fail 0/); assert.match(suite, /# pass 92/);
    await writeFile(path.join(temporary, name + '-installed-tests.log'), suite);
    await writeFile(path.join(directory, 'contract.mts'), `import {AgentPolicySchema, type AgentPolicy} from '@bshaan77/agent-access';
import {createEveHostGuards} from '@bshaan77/agent-access/eve';
const policy: AgentPolicy = AgentPolicySchema.parse({}); void [policy, createEveHostGuards];`);
    run(process.execPath, [path.join(root, 'packages/access/node_modules/typescript/bin/tsc'), '--noEmit', '--strict', '--skipLibCheck', 'false', '--target', 'ES2022', '--module', 'NodeNext', '--moduleResolution', 'NodeNext', 'contract.mts'], directory);
    const cli = run(process.execPath, [path.join(root, 'scripts/access-artifact/verify.mjs'), options.baselineRoot,
      options.baseline, options.baselineSha256, options.artifactRoot, options.archive, options.consumerRoot, options.dependencyPath]);
    assert.equal(JSON.parse(cli).verified, true);
  }
});

for (const file of ['dist/index.js', 'dist/index.d.ts', 'LICENSE', 'README.md', 'PROVENANCE.md', 'provenance.json', 'package.json', 'node_modules/zod/index.js']) {
  test('reject modified installed ' + file, () => mutateFile(path.join(consumer, installed, file), b => Buffer.concat([b, Buffer.from('\nchanged\n')])));
}
for (const file of ['dist/eve.js', 'LICENSE']) test('reject missing installed ' + file, async () => {
  const original = path.join(consumer, installed, file), saved = path.join(temporary, 'saved-file');
  await rename(original, saved);
  try { await assert.rejects(verify(config)); } finally { await rename(saved, original); }
});
for (const extra of ['extra.js', 'node_modules/rogue/file.js', 'dist/node_modules/file.js']) test('reject extra installed ' + extra, async () => {
  const filename = path.join(consumer, installed, extra);
  await mkdir(path.dirname(filename), { recursive: true }); await writeFile(filename, 'extra');
  try { await assert.rejects(verify(config)); } finally {
    await rm(extra.startsWith('node_modules/') ? path.join(consumer, installed, 'node_modules/rogue') : extra.startsWith('dist/node_modules/') ? path.dirname(filename) : filename, { recursive: true });
  }
});
test('reject extra empty directory', async () => {
  const dir = path.join(consumer, installed, 'empty'); await mkdir(dir);
  try { await assert.rejects(verify(config), /EXTRA_EMPTY_DIRECTORY/); } finally { await rm(dir, { recursive: true }); }
});
for (const [label, edit] of [
  ['registry fallback', p => p.dependencies['@bshaan77/agent-access'] = '0.1.0'],
  ['linked folder', p => p.dependencies['@bshaan77/agent-access'] = 'file:vendor/access'],
  ['absolute file', p => p.dependencies['@bshaan77/agent-access'] = 'file:/tmp/access.tgz'],
  ['missing declaration', p => delete p.dependencies['@bshaan77/agent-access']],
]) test('reject declaration ' + label, () => mutateJson(path.join(consumer, 'package.json'), edit));
for (const field of ['resolved', 'integrity', 'version', 'license', 'link', 'dependencies']) test('reject lock ' + field, () => mutateJson(path.join(consumer, 'package-lock.json'), p => {
  p.packages[installed][field] = field === 'link' ? true : field === 'dependencies' ? { zod: '4.6.6' } : 'wrong';
}));
for (const field of ['resolved', 'integrity', 'version']) test('reject transitive lock ' + field, () => mutateJson(path.join(consumer, 'package-lock.json'), p => { p.packages[installed + '/node_modules/zod'][field] = 'wrong'; }));
test('reject mismatched lock root declaration', () => mutateJson(path.join(consumer, 'package-lock.json'), p => { p.packages[''].dependencies['@bshaan77/agent-access'] = '0.1.0'; }));
test('reject lock v2 until explicitly supported', () => mutateJson(path.join(consumer, 'package-lock.json'), p => { p.lockfileVersion = 2; }));
test('reject archive modification', () => mutateFile(path.join(temporary, 'agent-access.tgz'), b => Buffer.concat([b, Buffer.from('changed')])));
test('reject vendored archive mismatch', () => mutateFile(path.join(consumer, 'vendor/agent-access.tgz'), b => Buffer.concat([b, Buffer.from('changed')])));
test('reject changed trusted baseline without new approval', () => mutateFile(path.join(temporary, 'baseline.json'), b => Buffer.concat([b, Buffer.from(' ')])));

for (const [label, edit] of [
  ['version', p => p.metadata.version = '9.0.0'],
  ['license', p => p.metadata.license = 'UNLICENSED'],
  ['origin', p => p.source.repository = 'git+https://github.com/example-org/example-repo.git'],
  ['source tree', p => p.source.sourceTreeSha256 = '0'.repeat(64)],
  ['archive', p => { p.sha256 = '0'.repeat(64); }],
  ['missing file', p => delete p.files['dist/index.js']],
  ['extra file', p => p.files['extra.js'] = '0'.repeat(64)],
  ['parent traversal', p => p.files['../outside'] = '0'.repeat(64)],
  ['absolute', p => p.files['/outside'] = '0'.repeat(64)],
  ['windows path', p => p.files['C:\\outside'] = '0'.repeat(64)],
  ['double slash', p => p.files['dist//outside'] = '0'.repeat(64)],
  ['dot', p => p.files['dist/./outside'] = '0'.repeat(64)],
  ['file ancestor', p => p.files['dist'] = '0'.repeat(64)],
  ['node_modules path', p => p.files['node_modules/outside'] = '0'.repeat(64)],
  ['wrong transitive version', p => p.dependencies['zod@4.6.7'].version = '4.6.6'],
]) test('reject approved but inconsistent baseline: ' + label, async () => {
  const modified = structuredClone(baseline); edit(modified);
  const text = JSON.stringify(modified); await writeFile(path.join(temporary, 'invalid-baseline.json'), text);
  await assert.rejects(verify({ ...config, baseline: 'invalid-baseline.json', baselineSha256: digest(text) }));
});

for (const file of [installed, installed + '/dist', installed + '/dist/index.js', installed + '/node_modules/zod', 'vendor/agent-access.tgz', 'package-lock.json']) test('reject symlink ' + file, async () => {
  const original = path.join(consumer, file), saved = path.join(temporary, 'saved-link-target');
  await rename(original, saved); await symlink(saved, original);
  try { await assert.rejects(verify(config), /UNSAFE_FILE_TYPE/); } finally { await rm(original); await rename(saved, original); }
});
for (const value of ['../outside', '/outside', 'vendor/../../outside.tgz', 'vendor\\outside.tgz', './vendor/agent-access.tgz']) test('reject caller path ' + value, async () => {
  await assert.rejects(verify({ ...config, dependencyPath: value }), /INVALID_PATH/);
  await assert.rejects(verify({ ...config, baseline: value }), /INVALID_PATH/);
  await assert.rejects(verify({ ...config, archive: value }), /INVALID_PATH/);
});
test('reject fallback to a parent outside approved root', async () => {
  const dep = path.join(consumer, installed, 'node_modules/zod'), saved = path.join(temporary, 'saved-zod');
  await rename(dep, saved);
  try { await assert.rejects(verify(config)); } finally { await rename(saved, dep); }
});
test('reject missing dependency baseline and invalid commit', async () => {
  const modified = structuredClone(baseline); modified.dependencies = {};
  assert.throws(() => validateBaseline(modified), /MISSING_DEPENDENCY_BASELINE/);
  await assert.rejects(prepare({ sourceRoot: root, sourceCommit: '0'.repeat(40), artifactRoot: temporary, archive: 'agent-access.tgz' }));
});
// Produce tiny adversarial tar archives in memory. No extraction or external reads.
function tar(entries) {
  const blocks = [];
  for (const { name, type = '0', body = '', link = '' } of entries) {
    const header = Buffer.alloc(512), data = Buffer.from(body);
    header.write(name, 0, 100); header.write('0000644\0', 100); header.write('0000000\0', 108); header.write('0000000\0', 116);
    header.write(data.length.toString(8).padStart(11, '0') + '\0', 124); header.write('00000000000\0', 136);
    header.fill(32, 148, 156); header.write(type, 156); header.write(link, 157); header.write('ustar\0', 257);
    header.write([...header].reduce((a,b) => a+b,0).toString(8).padStart(6,'0') + '\0 ', 148);
    blocks.push(header, data, Buffer.alloc((512 - data.length % 512) % 512));
  }
  return gzipSync(Buffer.concat([...blocks, Buffer.alloc(1024)]));
}
for (const [label, entries] of [
  ['parent traversal', [{ name:'package/../outside' }]], ['absolute', [{ name:'/outside' }]],
  ['wrong root', [{ name:'other/file' }]], ['symlink', [{ name:'package/link',type:'2',link:'/outside' }]],
  ['hardlink', [{ name:'package/link',type:'1',link:'package/file' }]], ['pax', [{ name:'package/file',type:'x' }]],
  ['device', [{ name:'package/file',type:'3' }]], ['duplicate', [{name:'package/file'},{name:'package/file'}]],
  ['file directory collision', [{name:'package/dir'},{name:'package/dir/file'}]],
  ['directory file collision', [{name:'package/dir/',type:'5'},{name:'package/dir'}]],
  ['bundled modules', [{name:'package/node_modules/file'}]], ['empty directory', [{name:'package/dir/',type:'5'}]],
]) test('reject hostile tar ' + label, () => assert.throws(() => archiveFiles(tar(entries))));
test('parse minimal normal ustar and reject truncated data/checksum', () => {
  assert.equal(archiveFiles(tar([{name:'package/file',body:'okay'}])).get('file').toString(),'okay');
  assert.throws(() => archiveFiles(Buffer.from('not gzip')));
  const valid = gunzipSync(tar([{name:'package/file',body:'okay'}]));
  assert.throws(() => archiveFiles(gzipSync(valid.subarray(0, 512))));
  valid[0] ^= 1;
  assert.throws(() => archiveFiles(gzipSync(valid)), /INVALID_TAR_CHECKSUM/);
});

test('sanitized API and CLI failures never print caller paths or file content', async () => {
  await assert.rejects(verify({ ...config, baseline: 'missing-private-input.json' }), error => error.message === 'INPUT_UNREADABLE');
  try {
    run(process.execPath, [path.join(root, 'scripts/access-artifact/verify.mjs'), temporary, 'missing-private-input.json',
      config.baselineSha256, temporary, config.archive, consumer, config.dependencyPath]);
    assert.fail('CLI must fail');
  } catch (error) {
    assert.equal(error.status, 1);
    assert.equal(error.stdout, '');
    assert.equal(error.stderr, 'Access artifact verification failed; approved baseline, archive, lock and installed files must match.\n');
  }
});

test('deduplicated exact runtime resolution stays bounded by the approved root', async () => {
  const rootDep = path.join(consumer, 'node_modules/zod'), nestedDep = path.join(consumer, installed, 'node_modules/zod');
  const saved = path.join(temporary, 'saved-parent-zod'), lockPath = path.join(consumer, 'package-lock.json');
  const originalLock = await readFile(lockPath), lock = JSON.parse(originalLock);
  await rename(rootDep, saved); await rename(nestedDep, rootDep);
  lock.packages['node_modules/zod'] = lock.packages[installed + '/node_modules/zod'];
  delete lock.packages[installed + '/node_modules/zod'];
  try {
    await rmdir(path.dirname(nestedDep));
    await writeFile(lockPath, JSON.stringify(lock));
    const result = await verify(config);
    assert.deepEqual(result.runtimeDependencies, [{ name: 'zod', version: '4.6.7', location: 'node_modules/zod' }]);
    assert.equal(run(process.execPath, ['--input-type=module', '-e', `import {createRequire} from 'node:module';
      const r=createRequire(process.cwd()+'/${installed}/package.json'); console.log(r.resolve('zod/package.json'));`], consumer).trim(), rootDep + '/package.json');
  } finally {
    await mkdir(path.dirname(nestedDep), { recursive: true }); await rename(rootDep, nestedDep); await rename(saved, rootDep); await writeFile(lockPath, originalLock);
  }
});
test('preparation rejects a different existing source revision and missing baseline approval', async () => {
  const previous = run('git', ['rev-parse', baseline.source.commit + '^']).trim();
  await assert.rejects(prepare({ sourceRoot: root, sourceCommit: previous, artifactRoot: temporary, archive: 'agent-access.tgz', dependencyArchives: ['zod-4.6.7.tgz'] }), /SOURCE_FILE_SET_MISMATCH/);
  await assert.rejects(verify({ ...config, baselineSha256: '' }), /APPROVED_BASELINE_HASH_REQUIRED/);
});
