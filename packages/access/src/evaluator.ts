import { DecisionRequestSchema, EvidenceSchema, type AgentGrant, type Decision, type DecisionRequest,
  type DenyReason, type Evidence, type PrincipalSnapshot, type ResourceRef } from './schemas.js';
import { canonical, covers, digestRequest, fresh, identityFreshness, LIMITS, localDeny, parseBounded,
  principalEpoch, same, validClock } from './common.js';
import { delegationAllows, delegationExpiry, type VerifiedDelegation } from './delegation.js';

const unique = <T>(items: T[], key: (item: T) => string) => new Set(items.map(key)).size === items.length;

/** Pure evaluation of TRUSTED host evidence. A JSON request cannot establish that evidence's authenticity. */
export function evaluate(requestInput: unknown, evidenceInput: unknown, now: number,
  delegation?: VerifiedDelegation): Decision {
  let r: DecisionRequest, e: Evidence;
  try {
    r = parseBounded(DecisionRequestSchema, requestInput);
    e = parseBounded(EvidenceSchema, evidenceInput);
  } catch { return localDeny('INVALID_REQUEST', now); }
  const deny = (reason: DenyReason) => localDeny(reason, now, r, e.audit?.decisionId);
  if (!validClock(now)) return deny('INVALID_REQUEST');
  const expiries = [now + LIMITS.decisionMs];
  const track = (time: string) => { expiries.push(Date.parse(time)); };
  const checkFresh = (f: import('./schemas.js').Freshness, age: number) => {
    track(f.validUntil); return fresh(f, now, age);
  };
  if (!unique(r.resources, v => v.corpusId + ':' + v.resourceId) ||
    !unique(e.sources, v => canonical(v.resource)) || !unique(e.recipients, v => v.principal.subjectId)) return deny('INVALID_REQUEST');
  const m = e.machine, p = r.principal;
  if (m.tenantId !== p.tenantId || m.agentId !== r.agentId || m.environment !== r.environment) return deny('AGENT_SCOPE_MISMATCH');
  if (m.registrationEpoch !== m.currentRegistrationEpoch || !checkFresh(m.freshness, LIMITS.policyMs)) return deny('UNAUTHENTICATED_CLIENT');
  if (!m.actions.includes(r.action)) return deny('ACTION_DENIED');
  if (!same(p, e.actor.principal)) return deny('IDENTITY_UNKNOWN');
  function snapshotReason(s: PrincipalSnapshot): DenyReason | undefined {
    const sp = s.principal;
    if (sp.tenantId !== p.tenantId) return 'IDENTITY_UNKNOWN';
    if (s.revoked || s.currentPrincipalEpoch !== principalEpoch(sp) ||
      s.currentMappingEpoch !== (sp.kind === 'human' ? sp.mappingEpoch : null)) return 'REVOKED';
    if (!checkFresh(s.authority, LIMITS.policyMs) || !checkFresh(identityFreshness(sp), LIMITS.identityMs)) return 'IDENTITY_STALE';
    if (!s.complete || !unique(s.groups, g => g.groupId)) return 'MEMBERSHIP_INCOMPLETE';
    if (s.groups.some(g => !checkFresh(g.membership, LIMITS.identityMs))) return 'MEMBERSHIP_STALE';
    return undefined;
  }
  const actorReason = snapshotReason(e.actor);
  if (actorReason) return deny(actorReason);
  const policy = e.policy;
  if (!policy) return deny('POLICY_MISSING');
  if (policy.tenantId !== p.tenantId || policy.agentId !== r.agentId || policy.environment !== r.environment) return deny('AGENT_SCOPE_MISMATCH');
  if (!unique(policy.grants, g => g.grantId) || !unique(policy.corpora, c => c.approvalId) ||
    !unique(policy.approvedGroups, g => g.groupId) || policy.approvedGroups.some(g => g.tenantId !== p.tenantId)) return deny('INVALID_REQUEST');
  if (policy.epoch !== e.currentPolicyEpoch) return deny('REVOKED');
  if (!checkFresh(policy.freshness, LIMITS.policyMs) || !checkFresh(e.currentPolicy, LIMITS.policyMs)) return deny('POLICY_STALE');
  if (r.expectedPolicyVersion && r.expectedPolicyVersion !== policy.version) return deny('VERSION_MISMATCH');
  const dest = e.destination, destId = dest.bindingId;
  if (r.delegationId && !delegationAllows(delegation, r, destId, now)) return deny('INVALID_DELEGATION');
  if (!r.delegationId && delegation) return deny('INVALID_DELEGATION');
  expiries.push(delegationExpiry(delegation));
  if (p.kind === 'workload') {
    const w = e.workload;
    if (!w || !w.active || !policy.workloadPolicyIds.includes(w.workloadPolicyId) || w.workloadPolicyId !== p.workloadPolicyId ||
      w.subjectId !== p.subjectId || w.registrationEpoch !== p.registrationEpoch || w.agentId !== r.agentId ||
      w.environment !== r.environment || w.purposeId !== p.purposeId || w.jobId !== p.jobId || r.jobId !== p.jobId ||
      !same(w.recipientSubjectIds, r.recipientSubjectIds) || !w.scope.actions.includes('agent.use') || !covers(w.scope, r, destId) ||
      !checkFresh(w.freshness, LIMITS.identityMs)) return deny('ACTION_DENIED');
  } else if (e.workload) return deny('INVALID_REQUEST');

  if (!same(dest.destination, r.destination) || !same(dest.recipientSubjectIds, r.recipientSubjectIds)) return deny('DESTINATION_DENIED');
  if (!e.provenance.complete || e.provenance.manifestId !== r.provenanceManifestId ||
    !same(e.provenance.resources, r.resources) || !checkFresh(e.provenance.freshness, LIMITS.policyMs)) return deny('PROVENANCE_UNKNOWN');
  if (!same(e.sources.map(s => s.resource), r.resources)) return deny('PROVENANCE_UNKNOWN');
  for (const s of e.sources) {
    if (s.subjectId !== p.subjectId || s.principalEpoch !== principalEpoch(p) || s.agentId !== r.agentId) return deny('RESOURCE_DENIED');
    if (!s.authorized) return deny(s.credentialMode === 'personal' ? 'PERSONAL_AUTH_REQUIRED' : 'RESOURCE_DENIED');
    if (!checkFresh(s.freshness, LIMITS.policyMs)) return deny('RESOURCE_DENIED');
  }
  if (['tool.invoke', 'developer.invoke'].includes(r.action) && !r.toolId) return deny('INVALID_REQUEST');
  if (r.destination.kind === 'none') {
    if (r.recipientSubjectIds.length || ['delivery.send', 'artifact.create', 'artifact.open'].includes(r.action) || dest.classification !== 'none') return deny('DESTINATION_DENIED');
  } else {
    if (!policy.destinationBindingIds.includes(destId) || !dest.internal || dest.external || dest.shared || dest.pendingShare) return deny('DESTINATION_DENIED');
    if (!dest.complete) return deny('MEMBERSHIP_INCOMPLETE');
    if (!checkFresh(dest.freshness, LIMITS.membershipMs)) return deny('MEMBERSHIP_STALE');
    if (!r.recipientSubjectIds.length) return deny('RECIPIENT_DENIED');
    if (r.destination.kind === 'private-response' && (dest.classification !== 'dm' ||
      !same(r.recipientSubjectIds, [r.destination.subjectId]))) return deny('DESTINATION_DENIED');
    if (r.destination.kind === 'channel' && (!['dm', 'group-dm', 'private-channel'].includes(dest.classification) ||
      r.destination.audienceEvidenceId !== dest.evidenceId ||
      (dest.classification === 'dm' && r.recipientSubjectIds.length !== 1))) return deny('DESTINATION_DENIED');
    if (r.destination.kind === 'artifact' && (r.destination.audienceBindingId !== destId ||
      dest.classification !== 'artifact' || !dest.equivalentArtifactAcl)) return deny('ARTIFACT_ACL_UNSUPPORTED');
  }
  if (r.action === 'artifact.open' && !same(r.recipientSubjectIds, [p.subjectId])) return deny('RECIPIENT_DENIED');
  if ((r.action === 'artifact.create' || r.action === 'artifact.open') && r.destination.kind !== 'artifact') return deny('DESTINATION_DENIED');
  if (!same(e.recipients.map(s => s.principal.subjectId), r.recipientSubjectIds)) return deny('RECIPIENT_DENIED');
  for (const recipient of e.recipients) {
    const reason = snapshotReason(recipient);
    if (reason || (recipient.principal.subjectId === p.subjectId && !same(recipient, e.actor))) return deny('RECIPIENT_DENIED');
    // Workload recipients require a separately evaluated registered delivery path.
    if (recipient.principal.kind !== 'human') return deny('RECIPIENT_DENIED');
  }
  const used = new Set<string>();
  const groupAllowed = (s: PrincipalSnapshot, groupId: string) => s.groups.some(g => g.groupId === groupId) &&
    policy.approvedGroups.some(g => g.groupId === groupId && g.status === 'approved');
  const granteeMatches = (g: AgentGrant, s: PrincipalSnapshot) => g.grantee.kind === 'group' ?
    s.principal.kind === 'human' && groupAllowed(s, g.grantee.groupId) :
    g.grantee.kind === s.principal.kind && g.grantee.subjectId === s.principal.subjectId;
  function entitlement(s: PrincipalSnapshot, op: DecisionRequest, resource?: ResourceRef): DenyReason | undefined {
    const unit = { ...op, resources: resource ? [resource] : [] };
    const scoped = policy!.grants.filter(g => granteeMatches(g, s) && covers(g.scope, unit, destId));
    if (scoped.some(g => g.status === 'revoked')) return 'REVOKED';
    const active = scoped.filter(g => g.status === 'active' && Date.parse(g.approvedAt) <= now &&
      Date.parse(g.expiresAt) > now && Date.parse(g.expiresAt) > Date.parse(g.approvedAt));
    if (!active.length) return resource ? 'RESOURCE_DENIED' : 'ACTION_DENIED';
    for (const grant of active) {
      const approval = resource && policy!.corpora.find(c => grant.corpusApprovalIds.includes(c.approvalId) &&
        c.status === 'approved' && c.corpusId === resource.corpusId && c.resourceIds.includes(resource.resourceId) &&
        c.sourceRevision === resource.sourceRevision && Date.parse(c.validUntil) > now &&
        (op.destination.kind === 'none' || c.allowedDestinationIds.includes(destId)) &&
        (c.audience.subjectIds.includes(s.principal.subjectId) || c.audience.groupIds.some(id => groupAllowed(s, id))) &&
        (c.additions === 'approved-dynamic-group' || c.reviewedSubjectIds.includes(s.principal.subjectId)));
      if (resource && !approval) continue;
      used.add(grant.grantId); track(grant.expiresAt);
      if (approval) track(approval.validUntil);
      return undefined;
    }
    return 'CORPUS_APPROVAL_REQUIRED';
  }
  const role = r.action === 'access.admin' ? policy.administratorSubjectIds : r.action === 'audit.read' ? policy.auditorSubjectIds : undefined;
  if (role && (p.kind !== 'human' || !role.includes(p.subjectId))) return deny('ACTION_DENIED');
  if (!['access.admin', 'audit.read', 'artifact.open'].includes(r.action)) {
    const reason = entitlement(e.actor, { ...r, action: 'agent.use', resources: [], toolId: undefined, destination: { kind: 'none' } });
    if (reason) return deny(reason);
  }
  for (const resource of r.resources.length ? r.resources : [undefined]) {
    const reason = entitlement(e.actor, r, resource);
    if (reason) return deny(reason);
    if (r.action === 'artifact.create') {
      const send = entitlement(e.actor, { ...r, action: 'delivery.send' }, resource);
      if (send) return deny(send);
    }
    for (const recipient of e.recipients) {
      const reason = entitlement(recipient, { ...r, action: r.action === 'artifact.open' ? 'artifact.open' : 'delivery.send', toolId: undefined }, resource);
      if (reason) return deny('RECIPIENT_DENIED');
    }
  }
  const digest = digestRequest(r);
  if (!e.audit || e.audit.requestDigest !== digest) return deny('AUDIT_UNAVAILABLE');
  const expires = Math.min(...expiries);
  if (expires <= now) return deny('INVALID_REQUEST');
  return { schemaVersion: '1.0', decisionId: e.audit.decisionId, requestDigest: digest,
    policyVersion: policy.version, policyEpoch: policy.epoch, principalEpoch: principalEpoch(p),
    evaluatedAt: new Date(now).toISOString(), validUntil: new Date(expires).toISOString(),
    identity: identityFreshness(p), policy: policy.freshness,
    membership: r.destination.kind === 'none' ? null : dest.freshness, auditReceiptId: e.audit.receiptId,
    outcome: 'allow', reason: 'ALLOW', matchedGrantIds: [...used].sort() };
}
