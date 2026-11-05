import { digestRequest } from '../dist/index.js';

export const NOW = Date.parse('2030-01-01T00:00:00Z');
export const iso = n => new Date(n).toISOString();
export const freshness = (ttl = 15000, now = NOW) => ({ observedAt: iso(now), validUntil: iso(now + ttl), revision: 'revision-one' });
export function fixture({ agent = 'support-assistant', subject = 'person-a', corpus = 'corpus-one', resource = 'resource-one', destination = 'private-destination-one' } = {}) {
  const actor = { principal: { kind: 'human', tenantId: 'tenant-fixture', subjectId: subject,
    providerSubjectId: 'provider-' + subject, channelIdentity: { workspaceId: 'workspace-fixture', userId: 'user-' + subject },
    mappingEpoch: 'mapping-one', identityEpoch: 'identity-one', lifecycle: 'active', identity: freshness(120000) },
    complete: true, revoked: false, currentPrincipalEpoch: 'identity-one', currentMappingEpoch: 'mapping-one',
    authority: freshness(), groups: [{ groupId: 'group-alpha', membership: freshness(120000) }] };
  const ref = { corpusId: corpus, resourceId: resource, sourceRevision: 'source-one' };
  const request = { schemaVersion: '1.0', requestId: 'request-one', agentId: agent, environment: 'fixture',
    principal: structuredClone(actor.principal), action: 'corpus.retrieve', resources: [ref],
    destination: { kind: 'private-response', subjectId: subject }, recipientSubjectIds: [subject],
    provenanceManifestId: 'manifest-one', runId: 'run-one' };
  const scope = { actions: ['agent.use', 'corpus.retrieve', 'context.read', 'tool.invoke', 'developer.invoke', 'delivery.send',
    'artifact.create', 'artifact.open'], resourceIds: [resource], corpusIds: [corpus], destinationIds: [destination], toolIds: ['read-record'] };
  const policy = { schemaVersion: '1.0', tenantId: 'tenant-fixture', agentId: agent, environment: 'fixture',
    version: 'fixture-v1', epoch: 'policy-one', freshness: freshness(),
    approvedGroups: [{ tenantId: 'tenant-fixture', groupId: 'group-alpha', approvalEvidenceId: 'group-approval', status: 'approved' }],
    grants: [{ grantId: 'grant-one', grantee: { kind: 'human', subjectId: subject }, scope,
      corpusApprovalIds: ['approval-one'], approvedBySubjectId: 'owner-one', approvedAt: iso(NOW - 1000), expiresAt: iso(NOW + 60000), status: 'active' }],
    corpora: [{ approvalId: 'approval-one', corpusId: corpus, resourceIds: [resource], sourceRevision: 'source-one',
      ownerApprovalEvidenceId: 'owner-evidence-one', audience: { groupIds: [], subjectIds: [subject] },
      additions: 'review-each-addition', reviewedMembershipRevision: 'revision-one', reviewedSubjectIds: [subject],
      allowedDestinationIds: [destination], validUntil: iso(NOW + 60000), status: 'approved' }],
    destinationBindingIds: [destination], administratorSubjectIds: [], auditorSubjectIds: [], workloadPolicyIds: [] };
  const evidence = { machine: { clientId: 'machine-one', tenantId: 'tenant-fixture', agentId: agent, environment: 'fixture',
    actions: scope.actions, registrationEpoch: 'client-one', currentRegistrationEpoch: 'client-one', freshness: freshness() },
    actor, recipients: [structuredClone(actor)], policy, currentPolicyEpoch: 'policy-one', currentPolicy: freshness(),
    provenance: { manifestId: 'manifest-one', complete: true, resources: [ref], freshness: freshness() },
    sources: [{ resource: ref, authorized: true, credentialMode: 'personal', credentialIdentityId: 'personal-one',
      subjectId: subject, principalEpoch: 'identity-one', agentId: agent,
      authorizationEvidenceId: 'source-authorization-one', freshness: freshness() }],
    destination: { destination: structuredClone(request.destination), bindingId: destination, recipientSubjectIds: [subject],
      evidenceId: 'audience-one',
      complete: true, internal: true, external: false, shared: false, pendingShare: false, classification: 'dm',
      equivalentArtifactAcl: false, freshness: freshness(5000) }, workload: null,
    audit: { decisionId: 'decision-one', requestDigest: digestRequest(request), receiptId: 'audit-one' } };
  return { request, evidence };
}
export function bind(f) { f.evidence.audit.requestDigest = digestRequest(f.request); return f; }
export function setDestination(f, destination, classification) {
  f.request.destination = destination;
  f.evidence.destination.destination = structuredClone(destination);
  f.evidence.destination.classification = classification;
  return bind(f);
}
