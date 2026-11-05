import { createHash } from 'node:crypto';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
async function files(dir, prefix = '') {
  const result = {};
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    if (['node_modules', 'dist', 'provenance.json'].includes(entry.name) && !prefix) continue;
    const relative = prefix + entry.name, absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(result, await files(absolute, relative + '/'));
    else if (entry.isFile()) result[relative] = hash(await readFile(absolute));
    else throw Error('Unsupported source entry');
  }
  return result;
}
const sources = await files(root);
const artifactFiles = {};
for (const name of ['package.json', 'LICENSE', 'README.md', 'PROVENANCE.md']) artifactFiles[name] = hash(await readFile(path.join(root, name)));
for (const name of (await readdir(path.join(root, 'dist'))).sort()) {
  if (!/^[a-z-]+\.(js|d\.ts)$/.test(name)) throw Error('Unexpected build output');
  artifactFiles['dist/' + name] = hash(await readFile(path.join(root, 'dist', name)));
}
await writeFile(path.join(root, 'provenance.json'), JSON.stringify({ schemaVersion: '1.0',
  sourceTreeSha256: hash(JSON.stringify(sources)), sourceFiles: sources, artifactFiles }, null, 2) + '\n');
