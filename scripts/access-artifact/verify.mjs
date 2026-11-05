import path from 'node:path';
import { lstat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { approvedRoot, archiveFiles, bytes, check, compareFiles, digest, equal, fileHashes, hashes, inside, integrity, json, packageName, readJson, relative, runtimeDependencies, shape, walk, sanitized } from './core.mjs';

function record(value) {
  check(/^[a-f0-9]{64}$/.test(value.sha256) && /^[a-f0-9]{128}$/.test(value.sha512) &&
    value.integrity === 'sha512-' + Buffer.from(value.sha512, 'hex').toString('base64'), 'INVALID_ARCHIVE_DIGEST');
  hashes(value.files);
  check(value.files['package.json'] && value.files.LICENSE, 'REQUIRED_FILE_MISSING');
}
export function validateBaseline(baseline) {
  shape(baseline, ['schemaVersion', 'source', 'toolchain', 'metadata', 'sha256', 'sha512', 'integrity', 'files', 'dependencies']);
  check(baseline.schemaVersion === 1, 'BASELINE_VERSION_MISMATCH');
  record(baseline);
  shape(baseline.source, ['commit', 'repository', 'directory', 'sourceTreeSha256']);
  check(/^[a-f0-9]{40}$/.test(baseline.source.commit) && /^[a-f0-9]{64}$/.test(baseline.source.sourceTreeSha256), 'INVALID_SOURCE');
  relative(baseline.source.directory);
  shape(baseline.metadata, ['name', 'version', 'license', 'repository', 'engines', 'exports', 'dependencies']);
  runtimeDependencies(baseline.metadata);
  check(baseline.metadata.repository?.url === baseline.source.repository &&
    baseline.metadata.repository?.directory === baseline.source.directory && baseline.metadata.license === 'MIT', 'UPSTREAM_METADATA_MISMATCH');
  check(baseline.files['provenance.json'] && baseline.files['dist/index.js'] && baseline.files['dist/index.d.ts'] &&
    baseline.files['dist/eve.js'] && baseline.files['dist/eve.d.ts'] && baseline.files['README.md'] && baseline.files['PROVENANCE.md'], 'REQUIRED_FILE_MISSING');
  shape(baseline.toolchain, ['node', 'npm']);
  check(baseline.toolchain.node === 'v24.22.2' && baseline.toolchain.npm === '10.9.2', 'UNSUPPORTED_TOOLCHAIN');
  check(baseline.dependencies && typeof baseline.dependencies === 'object' && !Array.isArray(baseline.dependencies), 'INVALID_DEPENDENCIES');
  const reached = new Set();
  function visit(pkg) {
    for (const [name, version] of Object.entries(runtimeDependencies(pkg))) {
      const key = name + '@' + version, dep = baseline.dependencies[key];
      check(dep, 'MISSING_DEPENDENCY_BASELINE');
      if (reached.has(key)) continue;
      reached.add(key);
      shape(dep, ['name', 'version', 'license', 'dependencies', 'resolved', 'sha256', 'sha512', 'integrity', 'files']);
      check(dep.name === name && dep.version === version && typeof dep.license === 'string' &&
        typeof dep.resolved === 'string' && dep.resolved.startsWith('https://registry.npmjs.org/'), 'DEPENDENCY_METADATA_MISMATCH');
      record(dep); visit(dep);
    }
  }
  visit(baseline.metadata);
  check(reached.size === Object.keys(baseline.dependencies).length, 'EXTRA_DEPENDENCY_BASELINE');
  return baseline;
}
function verifyLockEntry(entry, expected, resolved) {
  check(entry && !entry.link && entry.version === expected.version && entry.resolved === resolved &&
    entry.integrity === expected.integrity && entry.license === expected.license &&
    equal(entry.dependencies ?? {}, expected.dependencies ?? {}), 'LOCK_RESOLUTION_MISMATCH');
}
// No imports from installed code, child processes, writes, network, installs or extraction.
// Roots are supplied by trusted callers, never taken from manifest contents.
async function verifyInternal({ baselineRoot, baseline: baselinePath, baselineSha256, artifactRoot, archive,
  consumerRoot, dependencyPath }) {
  check(/^[a-f0-9]{64}$/.test(baselineSha256), 'APPROVED_BASELINE_HASH_REQUIRED');
  baselineRoot = await approvedRoot(baselineRoot);
  const baselineBytes = await bytes(baselineRoot, baselinePath);
  check(digest(baselineBytes) === baselineSha256, 'BASELINE_HASH_MISMATCH');
  const baseline = validateBaseline(json(baselineBytes));
  check(process.version === baseline.toolchain.node, 'NODE_VERSION_MISMATCH');
  artifactRoot = await approvedRoot(artifactRoot); consumerRoot = await approvedRoot(consumerRoot);
  const data = await bytes(artifactRoot, archive);
  check(digest(data) === baseline.sha256 && digest(data, 'sha512') === baseline.sha512 && integrity(data) === baseline.integrity, 'ARCHIVE_HASH_MISMATCH');
  const files = archiveFiles(data);
  compareFiles(fileHashes(files), baseline.files);
  const pkg = json(files.get('package.json'));
  for (const [field, expected] of Object.entries(baseline.metadata)) check(equal(pkg[field], expected), 'PACKAGE_METADATA_MISMATCH');
  check(pkg.license === 'MIT' && files.get('LICENSE').toString().includes('MIT License'), 'LICENSE_MISMATCH');
  const provenance = json(files.get('provenance.json'));
  check(provenance.schemaVersion === '1.0' && provenance.sourceTreeSha256 === baseline.source.sourceTreeSha256 &&
    digest(JSON.stringify(provenance.sourceFiles)) === baseline.source.sourceTreeSha256, 'SOURCE_TREE_HASH_MISMATCH');
  hashes(provenance.sourceFiles);
  compareFiles(Object.fromEntries(Object.entries(baseline.files).filter(([f]) => f !== 'provenance.json')), provenance.artifactFiles);
  relative(dependencyPath); check(dependencyPath.endsWith('.tgz'), 'TARBALL_DEPENDENCY_REQUIRED');
  const declared = 'file:' + dependencyPath, name = packageName(baseline.metadata.name);
  const consumer = await readJson(consumerRoot, 'package.json'), lock = await readJson(consumerRoot, 'package-lock.json');
  check(consumer.dependencies?.[name] === declared && !consumer.devDependencies?.[name] && !consumer.optionalDependencies?.[name], 'DECLARED_DEPENDENCY_MISMATCH');
  check(lock.lockfileVersion === 3 && lock.packages && lock.packages['']?.dependencies?.[name] === declared, 'LOCK_DECLARATION_MISMATCH');
  // A caller cannot point at an external archive and leave a different vendored copy behind.
  check(digest(await bytes(consumerRoot, dependencyPath), 'sha512') === baseline.sha512, 'VENDORED_ARCHIVE_MISMATCH');
  const location = 'node_modules/' + name;
  verifyLockEntry(lock.packages[location], { ...baseline.metadata, integrity: baseline.integrity }, declared);
  await inside(consumerRoot, location, true);
  compareFiles(await walk(path.join(consumerRoot, location), '', true), baseline.files);
  const installed = await readJson(consumerRoot, location + '/package.json');
  for (const [field, expected] of Object.entries(baseline.metadata)) check(equal(installed[field], expected), 'INSTALLED_METADATA_MISMATCH');
  const visited = new Set(), resolutions = [];
  async function visit(pkg, from) {
    for (const [depName, version] of Object.entries(runtimeDependencies(pkg))) {
      const expected = baseline.dependencies[depName + '@' + version];
      let current = from, target;
      while (true) {
        if (path.posix.basename(current) !== 'node_modules') {
          const candidate = (current ? current + '/' : '') + 'node_modules/' + depName;
          // lstat traversal is bounded: validate each existing ancestor before any deeper read.
          try { await inside(consumerRoot, candidate, true); target = candidate; break; }
          catch (error) { if (error.code !== 'ENOENT') throw error; }
        }
        if (!current) break;
        current = path.posix.dirname(current); if (current === '.') current = '';
      }
      check(target, 'DEPENDENCY_NOT_INSTALLED_IN_ROOT');
      verifyLockEntry(lock.packages[target], expected, expected.resolved);
      check(!(await lstat(path.join(consumerRoot, target))).isSymbolicLink(), 'UNSAFE_FILE_TYPE');
      const key = target + '@' + version;
      if (visited.has(key)) continue;
      visited.add(key);
      compareFiles(await walk(path.join(consumerRoot, target), '', true), expected.files);
      const dep = await readJson(consumerRoot, target + '/package.json');
      check(dep.name === depName && dep.version === version && dep.license === expected.license &&
        equal(runtimeDependencies(dep), expected.dependencies), 'INSTALLED_DEPENDENCY_MISMATCH');
      resolutions.push({ name: depName, version, location: target });
      await visit(dep, target);
    }
  }
  await visit(installed, location);
  // Nested dependency trees are the only permitted extra directories. Reject stale,
  // shadowing or untracked packages even if not reached by the dependency graph.
  async function checkNested(packageLocation) {
    const nodeModules = packageLocation + '/node_modules';
    try { await inside(consumerRoot, nodeModules, true); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    const { readdir } = await import('node:fs/promises');
    const entries = await readdir(path.join(consumerRoot, nodeModules));
    check(entries.length > 0, 'EXTRA_EMPTY_DIRECTORY');
    for (const entry of entries) {
      relative(entry);
      const names = entry.startsWith('@') ? (await readdir(await inside(consumerRoot, nodeModules + '/' + entry, true))).map(n => entry + '/' + relative(n)) : [entry];
      check(names.length > 0, 'EXTRA_EMPTY_DIRECTORY');
      for (const depName of names) {
        const target = nodeModules + '/' + depName;
        check(resolutions.some(r => r.location === target), 'EXTRA_INSTALLED_DEPENDENCY');
        await checkNested(target);
      }
    }
  }
  await checkNested(location);
  for (const resolution of resolutions) await checkNested(resolution.location);
  return { verified: true, sourceCommit: baseline.source.commit, name, version: baseline.metadata.version,
    archiveSha512: baseline.sha512, integrity: baseline.integrity, baselineSha256, runtimeDependencies: resolutions,
    deploymentVerified: false };
}
export async function verify(options) {
  try { return await verifyInternal(options); } catch (error) { throw sanitized(error); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    check(process.argv.length === 9, 'USAGE');
    const [baselineRoot, baseline, baselineSha256, artifactRoot, archive, consumerRoot, dependencyPath] = process.argv.slice(2);
    console.log(JSON.stringify(await verify({ baselineRoot, baseline, baselineSha256, artifactRoot, archive, consumerRoot, dependencyPath })));
  } catch { console.error('Access artifact verification failed; approved baseline, archive, lock and installed files must match.'); process.exitCode = 1; }
}
