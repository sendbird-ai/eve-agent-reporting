import test from 'node:test';
import assert from 'node:assert/strict';
import { createAccessHost, createAccessClient, evaluate, AccessDeniedError, BOUNDARY_ACTIONS } from '../dist/index.js';
import { createEveHostGuards, EVE_HOST_GUARD_MATRIX } from '../dist/eve.js';
import { fixture, NOW, iso, bind, freshness } from './fixture.mjs';

test('client validates authenticated response and current epochs', async () => {
  const f = fixture(), events = [];
  const bindings = { current: async () => ({ policyVersion: 'fixture-v1', policyEpoch: 'policy-one', principalEpoch: 'identity-one', validUntil: iso(NOW + 5000) }),
    decideAuthenticated: async () => evaluate(f.request, f.evidence, NOW), clock: () => NOW, recordDenial: d => events.push(d) };
  const client = createAccessClient(bindings); assert.equal((await client(f.request)).outcome, 'allow');
  for (const mutation of [d => delete d.auditReceiptId, d => d.policyEpoch = 'old', d => d.requestDigest = 'tampered',
    d => d.validUntil = iso(NOW + 16000), d => d.membership = null, d => d.identity = null,
    d => d.policy = null, d => d.matchedGrantIds = [], d => d.evaluatedAt = iso(NOW + 1), d => d.unknown = true]) {
    bindings.decideAuthenticated = async () => { const d = evaluate(f.request, f.evidence, NOW); mutation(d); return d; };
    assert.equal((await client(f.request)).outcome, 'deny');
  }
  assert.ok(events.every(e => Object.keys(e).sort().join(',') === 'reason,requestDigest'));
});
test('client does not reuse a positive decision during service/epoch outage or timeout', async () => {
  const f = fixture(); let unavailable = false;
  const bindings = { current: async () => { if (unavailable) throw Error('private detail'); return { policyVersion: 'fixture-v1', policyEpoch: 'policy-one', principalEpoch: 'identity-one', validUntil: iso(NOW + 5000) }; },
    decideAuthenticated: async () => evaluate(f.request, f.evidence, NOW), clock: () => NOW, recordDenial() {} };
  const client = createAccessClient(bindings, 5); assert.equal((await client(f.request)).outcome, 'allow');
  unavailable = true; assert.equal((await client(f.request)).reason, 'SERVICE_UNAVAILABLE');
  unavailable = false; bindings.decideAuthenticated = () => new Promise(() => {});
  assert.equal((await client(f.request)).reason, 'SERVICE_UNAVAILABLE');
});
test('host denies before side effects and rechecks before every buffered output, retry and resume', async () => {
  const f = fixture(); let calls = 0, effects = 0; const outcomes = [];
  const bindings = { resolve: async () => { calls++; return f; }, clock: () => NOW, recordDenial() {}, recordOutcome: async (...args) => outcomes.push(args) };
  const host = createAccessHost(bindings);
  await host.run('retrieval', {}, {}, async () => { effects++; }); assert.equal(effects, 1);
  f.evidence.currentPolicyEpoch = 'revoked';
  await assert.rejects(host.run('retrieval', {}, {}, async () => { effects++; }), AccessDeniedError);
  assert.equal(effects, 1); assert.equal(calls, 2); assert.deepEqual(outcomes, [['decision-one', 'confirmed']]);
});
test('all host boundary names require their dedicated action before execution', async () => {
  for (const boundary of Object.keys(BOUNDARY_ACTIONS).filter(k => k !== 'retrieval')) {
    const f = fixture(); let effect = false;
    const host = createAccessHost({ resolve: async () => f, clock: () => NOW, recordDenial() {}, recordOutcome: async () => {} });
    await assert.rejects(host.run(boundary, {}, {}, async () => { effect = true; }), AccessDeniedError);
    assert.equal(effect, false);
  }
});
test('host timeout and malformed resolution fail closed; no raw error is exposed', async () => {
  for (const resolve of [async () => { throw Error('private-provider-error'); }, async () => ({}), () => new Promise(() => {})]) {
    const host = createAccessHost({ resolve, clock: () => NOW, recordDenial() {}, recordOutcome: async () => {} }, 5);
    const d = await host.authorize('retrieval', {}, {}); assert.equal(d.outcome, 'deny'); assert.equal(JSON.stringify(d).includes('private-provider'), false);
  }
});
test('uncertain effects are not retried and outcomes are audited', async () => {
  const f = fixture(), outcomes = []; let effects = 0;
  const host = createAccessHost({ resolve: async () => f, clock: () => NOW, recordDenial() {}, recordOutcome: async (_, status) => outcomes.push(status) });
  await assert.rejects(host.run('retrieval', {}, {}, async () => { effects++; throw Error('uncertain'); }), /OPERATION_OUTCOME_UNKNOWN/);
  assert.equal(effects, 1); assert.deepEqual(outcomes, ['unknown']);
});
test('explicit SDK-independent adapters deny unsupported versions and guard buffered sends on both matrix entries', async () => {
  for (const version of Object.keys(EVE_HOST_GUARD_MATRIX)) {
    const f = fixture(); f.request.action = 'delivery.send'; bind(f); let sends = 0;
    const guards = createEveHostGuards(version, { resolve: async () => f, clock: () => NOW, recordDenial() {}, recordOutcome: async () => {} });
    await guards.releaseBuffered({}, {}, async () => { sends++; });
    f.evidence.destination.complete = false;
    await assert.rejects(guards.releaseBuffered({}, {}, async () => { sends++; }), AccessDeniedError);
    assert.equal(sends, 1);
  }
  assert.throws(() => createEveHostGuards('0.99.0', {}), /UNSUPPORTED_RUNTIME/);
});
test('registered workload scope/purpose/job and exact recipients constrain queued execution', () => {
  const f = fixture(), p = { kind: 'workload', tenantId: 'tenant-fixture', subjectId: 'workload-one', workloadPolicyId: 'workload-policy-one',
    registrationEpoch: 'registration-one', jobId: 'job-one', purposeId: 'purpose-one', registration: freshness(120000) };
  f.request.principal = p; f.request.jobId = p.jobId; f.request.action = 'delivery.send';
  f.evidence.actor = { principal: p, complete: true, revoked: false, currentPrincipalEpoch: p.registrationEpoch,
    currentMappingEpoch: null, authority: freshness(), groups: [] };
  Object.assign(f.evidence.sources[0], { subjectId: p.subjectId, principalEpoch: p.registrationEpoch });
  const g = structuredClone(f.evidence.policy.grants[0]); g.grantId = 'workload-grant'; g.grantee = { kind: 'workload', subjectId: p.subjectId };
  f.evidence.policy.grants.push(g); f.evidence.policy.workloadPolicyIds = [p.workloadPolicyId];
  f.evidence.policy.corpora[0].audience.subjectIds.push(p.subjectId); f.evidence.policy.corpora[0].reviewedSubjectIds.push(p.subjectId);
  f.evidence.workload = { workloadPolicyId: p.workloadPolicyId, subjectId: p.subjectId, agentId: f.request.agentId, environment: f.request.environment,
    registrationEpoch: p.registrationEpoch, purposeId: p.purposeId, jobId: p.jobId, ownerApprovalEvidenceId: 'workload-owner-one',
    scope: structuredClone(g.scope), recipientSubjectIds: ['person-a'], freshness: freshness(120000), active: true };
  bind(f); assert.equal(evaluate(f.request, f.evidence, NOW).outcome, 'allow');
  for (const [key, value] of [['purposeId', 'other'], ['jobId', 'other'], ['recipientSubjectIds', ['person-b']], ['active', false]]) {
    const changed = structuredClone(f); changed.evidence.workload[key] = value;
    assert.equal(evaluate(changed.request, changed.evidence, NOW).outcome, 'deny');
  }
  f.evidence.actor.revoked = true; assert.equal(evaluate(f.request, f.evidence, NOW).reason, 'REVOKED');
});
test('invalid finite and throwing clocks produce sanitized denial throughout core, host and client', async () => {
  for (const clock of [() => Number.MAX_VALUE, () => -Number.MAX_VALUE, () => Infinity, () => NaN, () => { throw Error('clock-private-detail'); }]) {
    const f = fixture(); let now; try { now = clock(); } catch { now = NaN; }
    const d = evaluate(f.request, f.evidence, now); assert.equal(d.outcome, 'deny'); assert.ok(!Number.isNaN(Date.parse(d.evaluatedAt)));
    const host = createAccessHost({ resolve: async () => f, clock, recordDenial() {}, recordOutcome: async () => {} });
    assert.equal((await host.authorize('retrieval', {}, {})).outcome, 'deny');
    const client = createAccessClient({ current: async () => { throw Error('unavailable'); }, decideAuthenticated: async () => {}, clock, recordDenial() {} });
    assert.equal((await client(f.request)).outcome, 'deny');
  }
});
