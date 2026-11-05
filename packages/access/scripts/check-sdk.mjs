import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Authenticate the exact inspected archives. These checks inspect shipped declarations;
// they do not prove automatic runtime interception or consumer route coverage.
const pins = {
  '0.27.2': 'bc62c7d77725cbc481acff002639eafe3042bcb29403acb8fb586a1d2f8df7dd8e1e59527470c625c734eb6d2ecf58dd6d6ce73fcbba50aece983e9ca2ca9384',
  '0.66.2': '18fbdf97bf2cb502e873133b32ae81ce98b0968a22a1f6f9efb3ab86dc8bc7bc194af80f83f2fac1d751653c8891b54b868658598be77ad027c14f87e38f27ed',
};
const input = process.argv[2];
if (!input) throw Error('Usage: npm run check:sdk -- /path/to/exact-archives');
const staging = await mkdtemp(path.join(tmpdir(), 'access-sdk-'));
try {
  for (const [version, sha512] of Object.entries(pins)) {
    const archive = path.resolve(input, 'eve-' + version + '.tgz');
    assert.equal(createHash('sha512').update(await readFile(archive)).digest('hex'), sha512);
    execFileSync('tar', ['-xzf', archive, '-C', staging]);
    const root = path.join(staging, 'package');
    const read = relative => readFile(path.join(root, relative), 'utf8');
    assert.equal(JSON.parse(await read('package.json')).version, version);
    assert.match(await read('dist/src/public/definitions/extension.d.ts'), /defineExtension/);
    assert.match(await read('dist/src/public/definitions/hook.d.ts'), /observe-only/);
    assert.match(await read('dist/src/public/definitions/hook.d.ts'), /durably recorded/);
    const remote = await read('dist/src/public/definitions/remote-agent.d.ts');
    const channel = await read(version === '0.27.2' ? 'dist/src/public/channels/eve.d.ts' : 'dist/src/eve-channel/types.d.ts');
    assert.equal(/readonly forwardPrincipal\?/.test(remote), version === '0.66.2');
    assert.equal(/readonly trustedForwarders\?/.test(channel), version === '0.66.2');
    console.log('PASS exact Eve ' + version + ': authenticated archive and declaration boundary inspection');
    await rm(root, { recursive: true });
  }
} finally { await rm(staging, { recursive: true, force: true }); }
