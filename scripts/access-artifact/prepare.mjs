import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { approvedRoot, archiveFiles, archiveRecord, bytes, check, compareFiles, digest, equal, fileHashes, integrity, json, relative, runtimeDependencies, hashes, sanitized } from './core.mjs';

export const TOOLCHAIN = { node: 'v24.22.2', npm: '10.9.2' };
export function toolchain() {
  check(process.version === TOOLCHAIN.node, 'NODE_VERSION_MISMATCH');
  const npm = execFileSync('npm', ['--version'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  check(npm === TOOLCHAIN.npm, 'NPM_VERSION_MISMATCH');
}
export function metadata(pkg) {
  runtimeDependencies(pkg);
  const result = {};
  for (const key of ['name', 'version', 'license', 'repository', 'engines', 'exports', 'dependencies']) {
    check(pkg[key] !== undefined, 'REQUIRED_METADATA_MISSING'); result[key] = pkg[key];
  }
  check(typeof pkg.license === 'string' && pkg.repository?.type === 'git' &&
    typeof pkg.repository.url === 'string' && pkg.repository.url.startsWith('git+https://github.com/') &&
    typeof pkg.repository.directory === 'string', 'INVALID_UPSTREAM_METADATA');
  relative(pkg.repository.directory);
  return result;
}
// Preparation is a separate trust-establishment step. It emits to stdout; it never
// fetches, installs, extracts, edits a consumer, or overwrites an approved archive.
async function prepareInternal({ sourceRoot, sourceCommit, artifactRoot, archive, dependencyArchives = [] }) {
  toolchain();
  sourceRoot = await approvedRoot(sourceRoot); artifactRoot = await approvedRoot(artifactRoot);
  check(/^[a-f0-9]{40}$/.test(sourceCommit), 'INVALID_SOURCE_COMMIT');
  const git = args => execFileSync('git', ['--no-replace-objects', ...args], {
    cwd: sourceRoot, maxBuffer: 64 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  check(git(['rev-parse', sourceCommit + '^{commit}']).toString().trim() === sourceCommit, 'SOURCE_COMMIT_MISMATCH');
  const data = await bytes(artifactRoot, archive), files = archiveFiles(data);
  const pkg = json(files.get('package.json')), meta = metadata(pkg), directory = meta.repository.directory;
  const provenance = json(files.get('provenance.json'));
  check(provenance.schemaVersion === '1.0', 'PROVENANCE_VERSION_MISMATCH');
  hashes(provenance.sourceFiles);
  check(digest(JSON.stringify(provenance.sourceFiles)) === provenance.sourceTreeSha256, 'SOURCE_TREE_HASH_MISMATCH');
  const tracked = git(['ls-tree', '-r', '--name-only', sourceCommit, '--', directory]).toString().trim().split('\n');
  check(equal(tracked.sort(), Object.keys(provenance.sourceFiles).map(f => directory + '/' + relative(f)).sort()), 'SOURCE_FILE_SET_MISMATCH');
  for (const [file, hash] of Object.entries(provenance.sourceFiles)) {
    const sourcePath = directory + '/' + relative(file);
    check(digest(git(['show', sourceCommit + ':' + sourcePath])) === hash, 'COMMITTED_SOURCE_MISMATCH');
    check(digest(await bytes(sourceRoot, sourcePath)) === hash, 'WORKTREE_SOURCE_MISMATCH');
  }
  const artifactHashes = fileHashes(files);
  compareFiles(Object.fromEntries(Object.entries(artifactHashes).filter(([f]) => f !== 'provenance.json')), provenance.artifactFiles);
  for (const [file, hash] of Object.entries(artifactHashes))
    check(digest(await bytes(sourceRoot, directory + '/' + file)) === hash, 'BUILT_ARTIFACT_MISMATCH');
  check(files.get('LICENSE')?.toString().includes('MIT License') && pkg.license === 'MIT', 'LICENSE_MISMATCH');
  const lock = json(git(['show', sourceCommit + ':' + directory + '/package-lock.json']));
  check(lock.lockfileVersion === 3, 'UNSUPPORTED_LOCKFILE');
  const supplied = new Map();
  for (const filename of dependencyArchives) {
    const data = await bytes(artifactRoot, filename), files = archiveFiles(data), pkg = json(files.get('package.json'));
    runtimeDependencies(pkg);
    const key = pkg.name + '@' + pkg.version;
    check(!supplied.has(key), 'DUPLICATE_DEPENDENCY_ARCHIVE');
    supplied.set(key, { data, pkg, files });
  }
  const dependencies = {};
  function visit(pkg) {
    for (const [name, version] of Object.entries(runtimeDependencies(pkg))) {
      const key = name + '@' + version;
      if (Object.hasOwn(dependencies, key)) continue;
      const suppliedArchive = supplied.get(key), pinned = lock.packages['node_modules/' + name];
      check(suppliedArchive && pinned?.version === version && !pinned.link &&
        pinned.integrity === integrity(suppliedArchive.data), 'DEPENDENCY_ARCHIVE_MISMATCH');
      check(typeof pinned.resolved === 'string' && pinned.resolved.startsWith('https://registry.npmjs.org/'), 'DEPENDENCY_ORIGIN_MISMATCH');
      const { pkg: dep, data, files } = suppliedArchive;
      check(typeof dep.license === 'string' && files.has('LICENSE'), 'DEPENDENCY_LICENSE_MISSING');
      dependencies[key] = { name, version, license: dep.license, dependencies: runtimeDependencies(dep), resolved: pinned.resolved, ...archiveRecord(data) };
      visit(dep);
    }
  }
  visit(pkg);
  check(supplied.size === Object.keys(dependencies).length, 'EXTRA_DEPENDENCY_ARCHIVE');
  return { schemaVersion: 1, source: { commit: sourceCommit, repository: meta.repository.url, directory,
    sourceTreeSha256: provenance.sourceTreeSha256 }, toolchain: TOOLCHAIN, metadata: meta,
    ...archiveRecord(data), dependencies };
}
export async function prepare(options) {
  try { return await prepareInternal(options); } catch (error) { throw sanitized(error); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const [sourceRoot, sourceCommit, artifactRoot, archive, ...dependencyArchives] = process.argv.slice(2);
    console.log(JSON.stringify(await prepare({ sourceRoot, sourceCommit, artifactRoot, archive, dependencyArchives }), null, 2));
  } catch { console.error('Access baseline preparation failed; inspect approved inputs and toolchain.'); process.exitCode = 1; }
}
