import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

export class ArtifactError extends Error {
  constructor(code) { super(code); this.name = 'ArtifactError'; }
}
export const sanitized = error => error instanceof ArtifactError ? error : new ArtifactError('INPUT_UNREADABLE');
export function check(condition, code) { if (!condition) throw new ArtifactError(code); }
export const digest = (bytes, algorithm = 'sha256', encoding = 'hex') => createHash(algorithm).update(bytes).digest(encoding);
export const integrity = bytes => 'sha512-' + digest(bytes, 'sha512', 'base64');
export const json = bytes => JSON.parse(bytes.toString());
export const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
export function relative(value) {
  check(typeof value === 'string' && value.length > 0 && value.length < 1024 &&
    value.split('/').every(s => /^[A-Za-z0-9_@.+-]+$/.test(s) && !['.', '..', '__proto__', 'constructor', 'prototype'].includes(s)), 'INVALID_PATH');
  return value;
}
export function packageName(value) {
  relative(value);
  check(/^(?:@[a-z0-9._-]+\/)?[a-z0-9._-]+$/.test(value), 'INVALID_PACKAGE_NAME');
  return value;
}
export function shape(object, keys) {
  check(object && typeof object === 'object' && !Array.isArray(object) &&
    equal(Object.keys(object).sort(), [...keys].sort()), 'INVALID_SCHEMA');
}
export function hashes(files) {
  check(files && typeof files === 'object' && !Array.isArray(files) && Object.keys(files).length > 0, 'INVALID_FILE_MANIFEST');
  for (const [file, hash] of Object.entries(files)) {
    relative(file);
    check(!file.split('/').includes('node_modules') && /^[a-f0-9]{64}$/.test(hash), 'INVALID_FILE_MANIFEST');
    for (let parent = path.posix.dirname(file); parent !== '.'; parent = path.posix.dirname(parent))
      check(!Object.hasOwn(files, parent), 'FILE_DIRECTORY_COLLISION');
  }
}
export async function approvedRoot(value) {
  check(typeof value === 'string' && path.isAbsolute(value), 'ABSOLUTE_ROOT_REQUIRED');
  check((await lstat(value)).isDirectory(), 'INVALID_ROOT');
  return realpath(value);
}
// Check every segment before reading. No symlink (including an in-root link) is accepted.
// Approved roots and files must remain quiescent during the check (no concurrent writers).
export async function inside(root, name, directory = false) {
  relative(name);
  let current = root;
  const parts = name.split('/');
  for (let i = 0; i < parts.length; i++) {
    current = path.join(current, parts[i]);
    const stat = await lstat(current);
    check(!stat.isSymbolicLink() && (i < parts.length - 1 || directory ? stat.isDirectory() : stat.isFile()), 'UNSAFE_FILE_TYPE');
  }
  return current;
}
export async function bytes(root, name) {
  const file = await inside(root, name);
  check((await lstat(file)).size <= 64 * 1024 * 1024, 'FILE_TOO_LARGE');
  return readFile(file);
}
export const readJson = async (root, name) => json(await bytes(root, name));
export async function walk(root, prefix = '', excludeDependencies = false) {
  const result = {};
  for (const entry of (await readdir(root)).sort()) {
    relative(entry);
    if (!prefix && excludeDependencies && entry === 'node_modules') continue;
    const file = path.join(root, entry), stat = await lstat(file), name = prefix + entry;
    if (stat.isDirectory()) {
      const children = await walk(file, name + '/');
      check(Object.keys(children).length > 0, 'EXTRA_EMPTY_DIRECTORY');
      Object.assign(result, children);
    } else {
      check(stat.isFile() && !stat.isSymbolicLink(), 'UNSAFE_FILE_TYPE');
      check(stat.size <= 64 * 1024 * 1024, 'FILE_TOO_LARGE');
      result[name] = digest(await readFile(file));
    }
  }
  return result;
}
export const fileHashes = files => Object.fromEntries([...files].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([name, data]) => [name, digest(data)]));
export function compareFiles(actual, expected) {
  hashes(expected);
  check(equal(Object.keys(actual).sort(), Object.keys(expected).sort()), 'FILE_SET_MISMATCH');
  for (const [file, hash] of Object.entries(expected)) check(actual[file] === hash, 'FILE_HASH_MISMATCH');
}
function field(block, start, end) {
  const buffer = block.subarray(start, end), zero = buffer.indexOf(0);
  if (zero >= 0) check(buffer.subarray(zero).every(b => b === 0), 'INVALID_TAR_FIELD');
  const value = buffer.subarray(0, zero < 0 ? buffer.length : zero);
  check(value.every(b => b >= 32 && b < 127), 'INVALID_TAR_FIELD');
  return value.toString('ascii');
}
function octal(block, start, end) {
  const value = block.subarray(start, end).toString('ascii').replace(/[\0 ]+$/g, '').trim();
  check(/^[0-7]+$/.test(value), 'INVALID_TAR_NUMBER');
  return parseInt(value, 8);
}
// Deliberately narrow npm ustar reader: no extraction, links, PAX/GNU extensions,
// duplicate paths or special files. Unsupported archives require explicit review.
export function archiveFiles(archive) {
  const tar = gunzipSync(archive, { maxOutputLength: 128 * 1024 * 1024 });
  check(tar.length % 512 === 0, 'INVALID_TAR_LENGTH');
  const files = new Map(), directories = new Set();
  let offset = 0, ended = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(b => b === 0)) {
      check(tar.length - offset >= 1024 && tar.subarray(offset).every(b => b === 0), 'INVALID_TAR_END');
      ended = true; break;
    }
    const sum = [...header].reduce((n, b, i) => n + (i >= 148 && i < 156 ? 32 : b), 0);
    check(octal(header, 148, 156) === sum, 'INVALID_TAR_CHECKSUM');
    check(['ustar', 'ustar '].includes(field(header, 257, 263)), 'UNSUPPORTED_TAR_FORMAT');
    check(field(header, 157, 257) === '', 'TAR_LINK_REJECTED');
    const prefix = field(header, 345, 500), base = field(header, 0, 100);
    const name = (prefix ? prefix + '/' : '') + base;
    const type = header[156], size = octal(header, 124, 136);
    check(type === 0 || type === 48 || type === 53, 'TAR_TYPE_REJECTED');
    check(name.startsWith('package/'), 'TAR_ROOT_REJECTED');
    const file = name.slice(8).replace(type === 53 ? /\/$/ : /$^/, '');
    if (file) relative(file); else check(type === 53, 'TAR_ROOT_REJECTED');
    check(!file.split('/').includes('node_modules'), 'BUNDLED_DEPENDENCIES_REJECTED');
    check(!files.has(file) && !directories.has(file), 'DUPLICATE_TAR_PATH');
    check(size <= 64 * 1024 * 1024 && offset + 512 + size <= tar.length, 'INVALID_TAR_SIZE');
    if (type === 53) { check(size === 0, 'INVALID_TAR_DIRECTORY'); directories.add(file); }
    else files.set(file, tar.subarray(offset + 512, offset + 512 + size));
    const end = offset + 512 + size, next = offset + 512 + Math.ceil(size / 512) * 512;
    check(tar.subarray(end, next).every(b => b === 0), 'INVALID_TAR_PADDING');
    offset = next;
  }
  check(ended && files.size > 0, 'INVALID_TAR_END');
  hashes(fileHashes(files));
  for (const dir of directories) check(!files.has(dir) && [...files.keys()].some(f => !dir || f.startsWith(dir + '/')), 'INVALID_TAR_DIRECTORY');
  return files;
}
export function runtimeDependencies(metadata) {
  packageName(metadata.name);
  check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(metadata.version), 'INVALID_VERSION');
  for (const field of ['optionalDependencies', 'peerDependencies', 'bundledDependencies', 'bundleDependencies'])
    check(!metadata[field] || Object.keys(metadata[field]).length === 0, 'UNSUPPORTED_DEPENDENCY_KIND');
  for (const [name, version] of Object.entries(metadata.dependencies ?? {})) {
    packageName(name);
    check(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version), 'NON_EXACT_RUNTIME_DEPENDENCY');
  }
  return metadata.dependencies ?? {};
}
export function archiveRecord(data) {
  return { sha256: digest(data), sha512: digest(data, 'sha512'), integrity: integrity(data), files: fileHashes(archiveFiles(data)) };
}
