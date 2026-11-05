import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createDelegationVerifier, evaluate, digestRequest } from '../dist/index.js';
import { fixture, NOW, iso, bind } from './fixture.mjs';

// Offline authenticated gateway fixture. Production key custody/issuer verification belongs
// to the private host; the component does not ship a signing service or test bypass.
const fixtureMaterial = Buffer.from('offline-authentication-fixture');
const mac = value => createHmac('sha256', fixtureMaterial).update(value).digest();
const tokenFor = chain => { const payload = Buffer.from(JSON.stringify(chain)).toString('base64url'); return payload + '.' + mac(payload).toString('base64url'); };
const signal = () => new AbortController().signal;
function setup() {
  const f = fixture(); f.request.delegationId = 'delegation-one'; bind(f);
  const c = { schemaVersion: '1.0', issuer: 'gateway-one', audience: 'support-assistant:fixture', tenantId: 'tenant-fixture',
    subjectId: 'person-a', principalEpoch: 'identity-one', mappingEpoch: 'mapping-one', initiatorId: 'person-a',
    fromAgentId: 'research-assistant', toAgentId: 'support-assistant', machineClientId: 'machine-one',
    chainId: 'chain-one', depth: 1, scope: structuredClone(f.evidence.policy.grants[0].scope),
    runId: 'run-one', requestDigest: digestRequest(f.request), jti: 'delegation-one',
    issuedAt: iso(NOW), notBefore: iso(NOW), expiresAt: iso(NOW + 4000) };
  const consumed = new Set();
  const config = { issuer: c.issuer, audience: c.audience, edges: [{ fromAgentId: c.fromAgentId,
    toAgentId: c.toAgentId, machineClientId: c.machineClientId, issuer: c.issuer, audience: c.audience }] };
  const ports = {
    async authenticate(token) {
      const [payload, signature] = token.split('.'); const received = Buffer.from(signature ?? '', 'base64url');
      if (received.length !== 32 || !timingSafeEqual(received, mac(payload))) throw Error('unauthenticated');
      return JSON.parse(Buffer.from(payload, 'base64url').toString());
    },
    async consume({ issuer, audience, jti }) {
      const key = JSON.stringify([issuer, audience, jti]); if (consumed.has(key)) return false;
      consumed.add(key); return true;
    },
  };
  const verify = (...args) => createDelegationVerifier(config, ports)(...args);
  const check = (claims = [c], request = f.request, now = NOW) => verify(tokenFor(claims), request, f.evidence.destination.bindingId, 'machine-one', now, signal());
  return { f, c, config, ports, check, verify };
}
test('authenticated delegation binds original human, exact request and expiry; replay denies', async () => {
  const { f, check } = setup(); const d = await check(); assert.equal(d.ok, true);
  const allowed = evaluate(f.request, f.evidence, NOW, d.handle); assert.equal(allowed.outcome, 'allow');
  assert.equal(Date.parse(allowed.validUntil), NOW + 4000);
  assert.equal((await check()).reason, 'REPLAY');
  assert.equal(evaluate(f.request, f.evidence, NOW + 4000, d.handle).reason, 'INVALID_DELEGATION');
});
test('type assertion or caller claims cannot manufacture verified authority', () => {
  const { f, c } = setup();
  for (const handle of [{}, c, Object.freeze({ claims: [c] })]) assert.equal(evaluate(f.request, f.evidence, NOW, handle).reason, 'INVALID_DELEGATION');
});
test('tampered authentication and oversized raw token deny before consume', async () => {
  const { f, c, verify } = setup();
  const token = tokenFor([c]);
  assert.equal((await verify('X' + token.slice(1), f.request, 'private-destination-one', 'machine-one', NOW, signal())).reason, 'INVALID_DELEGATION');
  assert.equal((await verify('x'.repeat(8193), f.request, 'private-destination-one', 'machine-one', NOW, signal())).reason, 'INVALID_DELEGATION');
});
const invalid = [
  ['issuer', c => c.issuer = 'other-issuer'], ['audience', c => c.audience = 'other:fixture'],
  ['tenant', c => c.tenantId = 'other-tenant'], ['original human', c => c.subjectId = 'person-b'],
  ['initiator', c => c.initiatorId = 'person-b'], ['mapping epoch', c => c.mappingEpoch = 'mapping-two'],
  ['principal epoch', c => c.principalEpoch = 'identity-two'], ['callee', c => c.toAgentId = 'other-assistant'],
  ['caller edge', c => c.fromAgentId = 'other-assistant'], ['machine binding', c => c.machineClientId = 'machine-two'],
  ['run', c => c.runId = 'run-two'], ['job', c => c.jobId = 'job-two'],
  ['digest', c => c.requestDigest = 'changed'], ['token identifier', c => c.jti = 'changed'],
  ['future', c => c.issuedAt = iso(NOW + 1)], ['not yet valid', c => c.notBefore = iso(NOW + 1)],
  ['expired', c => c.expiresAt = iso(NOW)], ['unbounded lifetime', c => c.expiresAt = iso(NOW + 60001)],
  ['tool scope', c => c.scope.destinationIds = []], ['missing scope', c => delete c.scope],
  ['unknown field', c => c.authorized = true], ['unsupported version', c => c.schemaVersion = '2.0'],
  ['depth', c => c.depth = 9], ['missing ancestor', c => c.parentId = 'parent-one'],
];
for (const [name, mutate] of invalid) test('delegation rejects ' + name, async () => {
  const { c, check } = setup(); mutate(c); assert.equal((await check()).reason, 'INVALID_DELEGATION');
});
test('child scope intersects every authenticated ancestor and cannot broaden', async () => {
  const { c, check, config } = setup();
  const parent = { ...structuredClone(c), jti: 'parent-one', audience: 'research-assistant:fixture', fromAgentId: 'router-assistant', toAgentId: 'research-assistant', machineClientId: 'machine-parent' };
  c.parentId = parent.jti; c.depth = 2;
  config.edges.push({ fromAgentId: parent.fromAgentId, toAgentId: parent.toAgentId, machineClientId: parent.machineClientId, issuer: parent.issuer, audience: parent.audience });
  assert.equal((await check([parent, c])).ok, true);
  parent.scope.corpusIds = ['corpus-two']; assert.equal((await check([parent, c])).reason, 'INVALID_DELEGATION');
});
test('verified scope does not grant callee rights or survive modified request', async () => {
  const { f, check } = setup(); const result = await check(); assert.equal(result.ok, true);
  f.evidence.policy.grants = []; assert.equal(evaluate(f.request, f.evidence, NOW, result.handle).reason, 'ACTION_DENIED');
  f.request.runId = 'run-two'; assert.equal(evaluate(f.request, f.evidence, NOW, result.handle).reason, 'INVALID_DELEGATION');
});
test('atomic concurrent replay consumption permits only one verifier', async () => {
  const { check } = setup(); const results = await Promise.all([check(), check()]);
  assert.equal(results.filter(r => r.ok).length, 1); assert.equal(results.filter(r => r.reason === 'REPLAY').length, 1);
});
test('chain depth defaults to three and a trusted host can select a stricter limit', async () => {
  const { c, check, config } = setup();
  const leaf = structuredClone(c), chain = [];
  for (let i = 1; i <= 4; i++) {
    const item = { ...structuredClone(leaf), jti: i === 4 ? leaf.jti : 'ancestor-' + i,
      depth: i, fromAgentId: 'agent-' + (i - 1), toAgentId: i === 4 ? leaf.toAgentId : 'agent-' + i };
    if (i > 1) item.parentId = chain[i - 2].jti;
    chain.push(item);
    config.edges.push({ fromAgentId: item.fromAgentId, toAgentId: item.toAgentId, machineClientId: item.machineClientId, issuer: item.issuer, audience: item.audience });
  }
  assert.equal((await check(chain)).reason, 'INVALID_DELEGATION');
  config.maxDepth = 4; assert.equal((await check(chain)).ok, true);
  const other = setup(); other.config.maxDepth = 1;
  const parent = { ...structuredClone(other.c), jti: 'parent-one', toAgentId: other.c.fromAgentId, fromAgentId: 'router-assistant' };
  other.c.parentId = parent.jti; other.c.depth = 2;
  other.config.edges.push({ fromAgentId: parent.fromAgentId, toAgentId: parent.toAgentId, machineClientId: parent.machineClientId, issuer: parent.issuer, audience: parent.audience });
  assert.equal((await other.check([parent, other.c])).reason, 'INVALID_DELEGATION');
});
