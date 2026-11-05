import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, DecisionSchema, AgentPolicySchema, DecisionRequestSchema, parseBounded } from '../dist/index.js';
import { fixture, NOW, iso, freshness, bind, setDestination } from './fixture.mjs';

const decide = f => evaluate(f.request, f.evidence, NOW);
const deny = (f, reason) => { const d = decide(f); assert.equal(d.outcome, 'deny'); if (reason) assert.equal(d.reason, reason); assert.equal(d.evaluatedAt, d.validUntil); };
test('two independent host configurations use identical evaluator and bounded evidence', () => {
  const configs = [{}, { agent: 'research-assistant', subject: 'person-b', corpus: 'corpus-two', resource: 'resource-two', destination: 'private-destination-two' }];
  for (const config of configs) {
    const f = fixture(config), d = decide(f);
    assert.equal(d.outcome, 'allow'); assert.ok(DecisionSchema.safeParse(d).success);
    assert.equal(Date.parse(d.validUntil), NOW + 5000); assert.equal(d.auditReceiptId, 'audit-one');
  }
  const one = fixture(), two = fixture(configs[1]);
  deny({ request: one.request, evidence: two.evidence }, 'AGENT_SCOPE_MISMATCH');
});
const mutations = [
  ['approved registry and employment grant nothing', f => f.evidence.policy.grants = [], 'ACTION_DENIED'],
  ['missing policy', f => f.evidence.policy = null, 'POLICY_MISSING'],
  ['policy epoch invalidation', f => f.evidence.currentPolicyEpoch = 'policy-two', 'REVOKED'],
  ['principal epoch invalidation', f => f.evidence.actor.currentPrincipalEpoch = 'identity-two', 'REVOKED'],
  ['mapping reuse', f => f.evidence.actor.currentMappingEpoch = 'mapping-two', 'REVOKED'],
  ['revocation overrides direct exception', f => f.evidence.actor.revoked = true, 'REVOKED'],
  ['machine revoked', f => f.evidence.machine.currentRegistrationEpoch = 'client-two', 'UNAUTHENTICATED_CLIENT'],
  ['machine cannot choose agent', f => f.request.agentId = 'other-assistant', 'AGENT_SCOPE_MISMATCH'],
  ['machine cannot choose environment', f => f.request.environment = 'production', 'AGENT_SCOPE_MISMATCH'],
  ['request text cannot choose actor', f => f.request.principal.subjectId = 'person-b', 'IDENTITY_UNKNOWN'],
  ['policy version precondition', f => f.request.expectedPolicyVersion = 'fixture-v0', 'VERSION_MISMATCH'],
  ['stale identity', f => f.evidence.actor.principal.identity = freshness(120000, NOW - 120001), 'IDENTITY_UNKNOWN'],
  ['stale authoritative epoch observation', f => f.evidence.actor.authority = freshness(15000, NOW - 15001), 'IDENTITY_STALE'],
  ['future evidence', f => f.evidence.currentPolicy = freshness(15000, NOW + 1), 'POLICY_STALE'],
  ['sliding policy expiry disallowed', f => f.evidence.policy.freshness.validUntil = iso(NOW + 15001), 'POLICY_STALE'],
  ['missing complete groups', f => f.evidence.actor.complete = false, 'MEMBERSHIP_INCOMPLETE'],
  ['stale group membership', f => f.evidence.actor.groups[0].membership = freshness(120000, NOW - 120001), 'MEMBERSHIP_STALE'],
  ['no personal-to-shared fallback', f => f.evidence.sources[0].authorized = false, 'PERSONAL_AUTH_REQUIRED'],
  ['source stale', f => f.evidence.sources[0].freshness = freshness(15000, NOW - 15001), 'RESOURCE_DENIED'],
  ['source authority bound to original human', f => f.evidence.sources[0].subjectId = 'person-b', 'RESOURCE_DENIED'],
  ['source authority bound to current epoch', f => f.evidence.sources[0].principalEpoch = 'old', 'RESOURCE_DENIED'],
  ['source authority bound to exact agent', f => f.evidence.sources[0].agentId = 'research-assistant', 'RESOURCE_DENIED'],
  ['missing source proof', f => f.evidence.sources = [], 'PROVENANCE_UNKNOWN'],
  ['unknown provenance', f => f.evidence.provenance.complete = false, 'PROVENANCE_UNKNOWN'],
  ['provenance cannot hide another corpus', f => f.evidence.provenance.resources.push({ corpusId: 'corpus-two', resourceId: 'resource-two', sourceRevision: 'source-one' }), 'PROVENANCE_UNKNOWN'],
  ['unknown resource', f => { f.request.resources[0].resourceId = 'resource-two'; }, 'RESOURCE_DENIED'],
  ['withdrawn owner approval', f => f.evidence.policy.corpora[0].status = 'withdrawn', 'CORPUS_APPROVAL_REQUIRED'],
  ['expired owner approval', f => f.evidence.policy.corpora[0].validUntil = iso(NOW), 'CORPUS_APPROVAL_REQUIRED'],
  ['changed source revision needs approval', f => f.evidence.policy.corpora[0].sourceRevision = 'source-two', 'CORPUS_APPROVAL_REQUIRED'],
  ['destination binding alone grants nothing', f => f.evidence.policy.grants[0].scope.destinationIds = [], 'RESOURCE_DENIED'],
  ['incomplete audience', f => f.evidence.destination.complete = false, 'MEMBERSHIP_INCOMPLETE'],
  ['stale audience', f => f.evidence.destination.freshness = freshness(5000, NOW - 5001), 'MEMBERSHIP_STALE'],
  ['external audience', f => f.evidence.destination.external = true, 'DESTINATION_DENIED'],
  ['pending shared audience', f => f.evidence.destination.pendingShare = true, 'DESTINATION_DENIED'],
  ['missing audit', f => f.evidence.audit = null, 'AUDIT_UNAVAILABLE'],
  ['audit binds actual request', f => f.evidence.audit.requestDigest = 'different', 'AUDIT_UNAVAILABLE'],
  ['inactive principal is not a valid security object', f => f.request.principal.lifecycle = 'inactive', 'INVALID_REQUEST'],
  ['unknown fields deny', f => f.evidence.actor.modelClaim = true, 'INVALID_REQUEST'],
  ['unsupported version', f => f.request.schemaVersion = '2.0', 'INVALID_REQUEST'],
  ['bot principal', f => f.request.principal.kind = 'bot', 'INVALID_REQUEST'],
  ['duplicate grants', f => f.evidence.policy.grants.push(structuredClone(f.evidence.policy.grants[0])), 'INVALID_REQUEST'],
  ['unknown destination union', f => f.request.destination = { kind: 'public-link' }, 'INVALID_REQUEST'],
];
for (const [name, mutate, reason] of mutations) test(name, () => { const f = fixture(); mutate(f); deny(f, reason); });

test('stale identity even when actor and request are identical', () => {
  const f = fixture(); f.request.principal.identity = freshness(120000, NOW - 120001);
  f.evidence.actor.principal = structuredClone(f.request.principal); deny(f, 'IDENTITY_STALE');
});
test('no partial-grant cross product for resource/corpus/destination/tool', () => {
  const f = fixture(), g = f.evidence.policy.grants[0];
  const partial = structuredClone(g); partial.grantId = 'grant-two';
  g.scope.destinationIds = []; partial.scope.corpusIds = ['corpus-two'];
  f.evidence.policy.grants.push(partial); deny(f, 'RESOURCE_DENIED');
  f.request.action = 'tool.invoke'; f.request.toolId = 'read-record';
  g.scope.destinationIds = ['private-destination-one']; g.scope.toolIds = [];
  partial.scope.toolIds = ['read-record']; deny(f, 'RESOURCE_DENIED');
});
test('mixed source output requires a complete grant for each source', () => {
  const f = fixture(); const second = { corpusId: 'corpus-two', resourceId: 'resource-two', sourceRevision: 'source-one' };
  f.request.resources.push(second); f.evidence.provenance.resources = structuredClone(f.request.resources);
  f.evidence.sources.push({ ...f.evidence.sources[0], resource: second }); bind(f); deny(f, 'RESOURCE_DENIED');
});
test('owner approval gates additions; dynamic membership is explicit and never overrides removal', () => {
  const f = fixture(), c = f.evidence.policy.corpora[0];
  f.evidence.policy.grants[0].grantee = { kind: 'group', groupId: 'group-alpha' };
  c.audience = { groupIds: ['group-alpha'], subjectIds: [] }; c.reviewedSubjectIds = [];
  deny(f, 'CORPUS_APPROVAL_REQUIRED'); c.reviewedSubjectIds = ['person-a'];
  assert.equal(decide(f).outcome, 'allow'); c.reviewedSubjectIds = []; c.additions = 'approved-dynamic-group';
  assert.equal(decide(f).outcome, 'allow'); f.evidence.actor.groups = []; f.evidence.recipients[0].groups = [];
  deny(f, 'ACTION_DENIED');
});
test('one unentitled actual recipient denies the whole private channel', () => {
  const f = fixture(); setDestination(f, { kind: 'channel', workspaceId: 'workspace-fixture', conversationId: 'channel-one', audienceEvidenceId: 'audience-one' }, 'private-channel');
  f.request.action = 'delivery.send'; f.request.recipientSubjectIds.push('person-b');
  f.evidence.destination.recipientSubjectIds.push('person-b');
  const b = fixture({ subject: 'person-b' }).evidence.actor;
  f.evidence.recipients.push(b); bind(f); deny(f, 'RECIPIENT_DENIED');
  f.evidence.destination.classification = 'public-channel'; deny(f, 'DESTINATION_DENIED');
});
test('artifact create/open require equivalent ACLs and actual viewer checks', () => {
  const f = fixture(); setDestination(f, { kind: 'artifact', storeId: 'store-one', artifactId: 'artifact-one', revision: 'revision-one', audienceBindingId: 'private-destination-one' }, 'artifact');
  f.request.action = 'artifact.create'; bind(f); deny(f, 'ARTIFACT_ACL_UNSUPPORTED');
  f.evidence.destination.equivalentArtifactAcl = true; assert.equal(decide(f).outcome, 'allow');
  f.request.action = 'artifact.open'; bind(f); assert.equal(decide(f).outcome, 'allow');
  f.evidence.policy.grants[0].scope.actions = ['delivery.send']; deny(f, 'RESOURCE_DENIED');
});
test('admin and audit require both a designated role and a separate explicit capability', () => {
  for (const [action, role] of [['access.admin', 'administratorSubjectIds'], ['audit.read', 'auditorSubjectIds']]) {
    const f = fixture(); f.request.action = action; f.request.resources = []; f.evidence.machine.actions = [...f.evidence.machine.actions, action];
    f.evidence.provenance.resources = []; f.evidence.sources = []; f.request.destination = { kind: 'none' };
    f.request.recipientSubjectIds = []; f.evidence.recipients = [];
    Object.assign(f.evidence.destination, { destination: { kind: 'none' }, recipientSubjectIds: [], classification: 'none' }); bind(f);
    deny(f, 'ACTION_DENIED'); f.evidence.policy[role] = ['person-a']; deny(f, 'ACTION_DENIED');
    f.evidence.policy.grants[0].scope.actions = [action]; assert.equal(decide(f).outcome, 'allow');
  }
});
test('revoked matching grant overrides another active grant', () => {
  const f = fixture(); f.evidence.policy.grants.push({ ...structuredClone(f.evidence.policy.grants[0]), grantId: 'revoked-one', status: 'revoked' }); deny(f, 'REVOKED');
});
test('malformed input, wildcard and oversized collections fail closed without throwing', () => {
  for (const v of [null, {}, [], 'bad', { ...fixture().request, unknown: true }]) assert.equal(evaluate(v, {}, NOW).outcome, 'deny');
  const f = fixture(); f.evidence.policy.grants[0].scope.resourceIds = ['*']; deny(f, 'INVALID_REQUEST');
  assert.throws(() => parseBounded(DecisionRequestSchema, { ...fixture().request, resources: Array(257).fill(fixture().request.resources[0]) }));
  assert.equal(AgentPolicySchema.safeParse({ ...fixture().evidence.policy, grants: Array(257).fill({}) }).success, false);
  assert.equal(evaluate(fixture().request, fixture().evidence, NaN).outcome, 'deny');
});
