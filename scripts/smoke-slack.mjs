import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
const exec = promisify(execFile);
const artifacts = resolve(process.argv[2] ?? '.artifacts');
const manifest = JSON.parse(await readFile(join(artifacts, 'manifest.json'), 'utf8'));
const pkg = manifest.packages.find((p) => p.name === '@bshaan77/eve-agent-slack');
assert.ok(pkg, 'Pack the candidate first');
const tarball = join(artifacts, pkg.filename);
assert.equal(createHash('sha256').update(await readFile(tarball)).digest('hex'), pkg.sha256);
const temporary = await mkdtemp(join(tmpdir(), 'slack-installed-'));
async function run(command, args, cwd) {
  try { return await exec(command, args, { cwd, maxBuffer: 20000000, env: process.env }); }
  catch (error) { throw new Error(`${command} failed: ${error.stdout ?? ''}\n${error.stderr ?? ''}`); }
}
async function texts(root) {
  let result = '';
  for (const entry of await readdir(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) result += await texts(path);
    else if (/\.(json|js|mjs|md)$/.test(entry.name)) result += await readFile(path, 'utf8');
  }
  return result;
}
async function manifests(root) {
  const found = [];
  for (const entry of await readdir(root, { withFileTypes: true }).catch(() => [])) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) found.push(...await manifests(path));
    else if (entry.name === 'compiled-agent-manifest.json') found.push(JSON.parse(await readFile(path, 'utf8')));
  }
  return found;
}
function instructionText(instructions) {
  return Array.isArray(instructions) ? instructions.map((entry) => entry.content).join('\n') : instructions?.markdown ?? '';
}
const results = [];
try {
  for (const [name, version, roles, expected] of [
    ['support', '0.23.0', ['U123'], 'technical'],
    ['operations', '0.66.2', [], 'plain'],
  ]) {
    const root = join(temporary, name);
    await mkdir(join(root, 'agent/channels'), { recursive: true });
    await mkdir(join(root, 'agent/instructions'), { recursive: true });
    await mkdir(join(root, 'agent/subagents/research/instructions'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({
      name: `example-${name}`, private: true, type: 'module',
      dependencies: { eve: version, '@bshaan77/eve-agent-slack': `file:${tarball}`, typescript: '^5.7.0', '@types/node': '^22.0.0' },
    }));
    await run('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], root);
    const prompt = await readFile(join(root, 'node_modules/@bshaan77/eve-agent-slack/prompts/slack.md'), 'utf8');
    for (const path of ['agent/instructions/shared-slack.md', 'agent/subagents/research/instructions/shared-slack.md'])
      await writeFile(join(root, path), prompt);
    await writeFile(join(root, 'agent/instructions.md'), 'Delegate research with an explicit conversation brief.');
    await writeFile(join(root, 'agent/subagents/research/instructions.md'), 'Research only the requested scope.');
    await writeFile(join(root, 'agent/agent.ts'), "import {defineAgent} from 'eve'; export default defineAgent({model:'openai/gpt-5.4'});");
    await writeFile(join(root, 'agent/subagents/research/agent.ts'), "import {defineAgent} from 'eve'; export default defineAgent({model:'openai/gpt-5.4',description:'Research the supplied request'});");
    await cp('examples/slack-consumer/adapter.ts', join(root, 'adapter.ts'));
    await writeFile(join(root, 'agent/channels/slack.ts'), `import {slackChannel} from 'eve/channels/slack';
import {prepareSlackTurn} from '../../adapter';
export default slackChannel({
  credentials: {botToken: async () => {throw new Error('Supply host credentials');}},
  onAppMention: (ctx, message) => prepareSlackTurn(ctx, message, ${JSON.stringify(roles)}),
  onDirectMessage: (ctx, message) => prepareSlackTurn(ctx, message, ${JSON.stringify(roles)}),
});`);
    await writeFile(join(root, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'ESNext', moduleResolution: 'Bundler', strict: true, skipLibCheck: true, noEmit: true }, include: ['adapter.ts', 'agent/**/*.ts'] }));
    await run('npx', ['tsc', '--noEmit'], root);
    await writeFile(join(root, 'verify.mjs'), `import assert from 'node:assert/strict';
import {createSlackDirectory, renderSlackAnswer} from '@bshaan77/eve-agent-slack';
const directory = createSlackDirectory({technicalUserIds:${JSON.stringify(roles)},read:async(op)=>op==='conversations.info'?{ok:true,channel:{id:'D123',is_im:true,is_ext_shared:false,user:'U123'}}:{ok:true,user:{id:'U123',deleted:false,is_bot:false}}});
assert.equal((await directory.audience('D123')).detail,${JSON.stringify(expected)});
assert.equal(renderSlackAnswer({lead:'No supported change to report.',findings:[],caveats:['Limited coverage']}).status,'ready');`);
    await run(process.execPath, ['verify.mjs'], root);
    await run('npx', ['eve', 'build', ...(version === '0.23.0' ? [] : ['--skip-sandbox-prewarm'])], root);
    // SDK versions place the compiled manifest in different build snapshot directories.
    const candidates = [...await manifests(join(root, '.eve')), ...await manifests(join(root, '.output'))];
    const compiled = candidates.find((manifest) => manifest.subagents?.some((agent) => agent.name === 'research'));
    assert.ok(compiled, 'Compiled root/specialist manifest missing');
    assert.ok(instructionText(compiled.instructions).includes(prompt.trim()), 'Root did not load the installed prompt');
    const research = compiled.subagents.find((agent) => agent.name === 'research');
    assert.ok(instructionText(research?.agent.instructions).includes(prompt.trim()), 'Specialist did not load the installed prompt');
    const output = await texts(join(root, '.output'));
    assert.ok(output.includes('Slack conversation behavior'), 'Packaged instructions missing in compiled output');
    assert.ok(output.includes('research'), 'Specialist missing in compiled output');
    // Prove real generated files match the installed prompt. Host CI must keep checking these.
    for (const path of ['agent/instructions/shared-slack.md', 'agent/subagents/research/instructions/shared-slack.md'])
      assert.equal(await readFile(join(root, path), 'utf8'), prompt);
    results.push({ consumer: name, eve: version, compiled: true, packagedPromptSha256: createHash('sha256').update(prompt).digest('hex'), expectedAudience: expected, liveSlack: false, modelBehaviorEvaluated: false });
  }
  await writeFile(join(artifacts, 'slack-installed-smoke.json'), JSON.stringify({ node: process.version, package: pkg.name, version: pkg.version, sha256: pkg.sha256, consumers: results }, null, 2) + '\n');
  console.log(JSON.stringify({ consumers: results }));
} finally {
  if (process.env.KEEP_SMOKE_FIXTURES) console.log(`Fixture path: ${temporary}`);
  else await rm(temporary, { recursive: true, force: true });
}
