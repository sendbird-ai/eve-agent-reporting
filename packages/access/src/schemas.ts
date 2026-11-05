import { z } from 'zod';

// The schemas are authoritative. Types and installed declarations derive from them.
export const IdSchema = z.string().min(1).max(160).regex(/^[A-Za-z0-9._:/@+-]+$/);
export const TimeSchema = z.string().datetime({ offset: false }).refine(v => Number.isFinite(Date.parse(v)));
const ids = () => z.array(IdSchema).max(256).refine(v => new Set(v).size === v.length);
const list = <T extends z.ZodTypeAny>(s: T) => z.array(s).max(256);
const obj = <T extends z.ZodRawShape>(s: T) => z.object(s).strict();
export const FreshnessSchema = obj({ observedAt: TimeSchema, validUntil: TimeSchema, revision: IdSchema });
export const HumanPrincipalSchema = obj({
  kind: z.literal('human'), tenantId: IdSchema, subjectId: IdSchema,
  providerSubjectId: IdSchema,
  channelIdentity: obj({ workspaceId: IdSchema, userId: IdSchema }),
  mappingEpoch: IdSchema, identityEpoch: IdSchema, lifecycle: z.literal('active'), identity: FreshnessSchema,
});
export const WorkloadPrincipalSchema = obj({
  kind: z.literal('workload'), tenantId: IdSchema, subjectId: IdSchema,
  workloadPolicyId: IdSchema, registrationEpoch: IdSchema, jobId: IdSchema,
  purposeId: IdSchema, registration: FreshnessSchema,
});
export const PrincipalSchema = z.discriminatedUnion('kind', [HumanPrincipalSchema, WorkloadPrincipalSchema]);
export const ActionSchema = z.enum(['agent.use', 'corpus.retrieve', 'context.read', 'tool.invoke',
  'developer.invoke', 'delivery.send', 'artifact.create', 'artifact.open', 'access.admin', 'audit.read']);
export const EnvironmentSchema = z.enum(['fixture', 'preview', 'production']);
export const ResourceRefSchema = obj({ corpusId: IdSchema, resourceId: IdSchema, sourceRevision: IdSchema });
export const DestinationSchema = z.discriminatedUnion('kind', [
  obj({ kind: z.literal('none') }),
  obj({ kind: z.literal('private-response'), subjectId: IdSchema }),
  obj({ kind: z.literal('channel'), workspaceId: IdSchema, conversationId: IdSchema, audienceEvidenceId: IdSchema }),
  obj({ kind: z.literal('artifact'), storeId: IdSchema, artifactId: IdSchema, revision: IdSchema, audienceBindingId: IdSchema }),
]);
export const ScopeSchema = obj({ actions: z.array(ActionSchema).max(10).refine(v => new Set(v).size === v.length),
  resourceIds: ids(), corpusIds: ids(), destinationIds: ids(), toolIds: ids() });
export const DelegationClaimsSchema = obj({
  schemaVersion: z.literal('1.0'), issuer: IdSchema, audience: IdSchema,
  tenantId: IdSchema, subjectId: IdSchema, principalEpoch: IdSchema, mappingEpoch: IdSchema.optional(),
  initiatorId: IdSchema, fromAgentId: IdSchema, toAgentId: IdSchema, machineClientId: IdSchema,
  parentId: IdSchema.optional(), chainId: IdSchema, depth: z.number().int().min(1).max(8),
  scope: ScopeSchema, runId: IdSchema, jobId: IdSchema.optional(),
  requestDigest: IdSchema, jti: IdSchema, issuedAt: TimeSchema, notBefore: TimeSchema, expiresAt: TimeSchema,
});
export const DecisionRequestSchema = obj({
  schemaVersion: z.literal('1.0'), requestId: IdSchema, agentId: IdSchema, environment: EnvironmentSchema,
  principal: PrincipalSchema, delegationId: IdSchema.optional(), action: ActionSchema, toolId: IdSchema.optional(),
  resources: list(ResourceRefSchema), destination: DestinationSchema, recipientSubjectIds: ids(),
  provenanceManifestId: IdSchema, runId: IdSchema, sessionId: IdSchema.optional(), jobId: IdSchema.optional(),
  expectedPolicyVersion: IdSchema.optional(),
});
export const GranteeSchema = z.discriminatedUnion('kind', [
  obj({ kind: z.literal('group'), groupId: IdSchema }),
  obj({ kind: z.literal('human'), subjectId: IdSchema }),
  obj({ kind: z.literal('workload'), subjectId: IdSchema }),
]);
export const AgentGrantSchema = obj({
  grantId: IdSchema, grantee: GranteeSchema, scope: ScopeSchema, corpusApprovalIds: ids(),
  approvedBySubjectId: IdSchema, approvedAt: TimeSchema, expiresAt: TimeSchema, status: z.enum(['active', 'revoked']),
});
export const CorpusApprovalSchema = obj({
  approvalId: IdSchema, corpusId: IdSchema, resourceIds: ids(), sourceRevision: IdSchema,
  ownerApprovalEvidenceId: IdSchema, audience: obj({ groupIds: ids(), subjectIds: ids() }),
  additions: z.enum(['review-each-addition', 'approved-dynamic-group']),
  reviewedMembershipRevision: IdSchema, reviewedSubjectIds: ids(), allowedDestinationIds: ids(),
  validUntil: TimeSchema, status: z.enum(['approved', 'withdrawn']),
});
export const AgentPolicySchema = obj({
  schemaVersion: z.literal('1.0'), tenantId: IdSchema, agentId: IdSchema, environment: EnvironmentSchema,
  version: IdSchema, epoch: IdSchema, freshness: FreshnessSchema,
  approvedGroups: list(obj({ tenantId: IdSchema, groupId: IdSchema, approvalEvidenceId: IdSchema, status: z.enum(['approved', 'withdrawn']) })),
  grants: list(AgentGrantSchema), corpora: list(CorpusApprovalSchema), destinationBindingIds: ids(),
  administratorSubjectIds: ids(), auditorSubjectIds: ids(), workloadPolicyIds: ids(),
});
export const DenyReasonSchema = z.enum(['INVALID_REQUEST', 'UNSUPPORTED_VERSION', 'UNAUTHENTICATED_CLIENT',
  'AGENT_SCOPE_MISMATCH', 'IDENTITY_UNKNOWN', 'IDENTITY_INACTIVE', 'IDENTITY_STALE', 'INVALID_DELEGATION',
  'REPLAY', 'POLICY_MISSING', 'POLICY_STALE', 'VERSION_MISMATCH', 'REVOKED', 'ACTION_DENIED',
  'RESOURCE_DENIED', 'CORPUS_APPROVAL_REQUIRED', 'PROVENANCE_UNKNOWN', 'DESTINATION_DENIED',
  'RECIPIENT_DENIED', 'MEMBERSHIP_INCOMPLETE', 'MEMBERSHIP_STALE', 'SERVICE_UNAVAILABLE',
  'PERSONAL_AUTH_REQUIRED', 'ARTIFACT_ACL_UNSUPPORTED', 'AUDIT_UNAVAILABLE']);
const decisionFields = {
  schemaVersion: z.literal('1.0'), decisionId: IdSchema, requestDigest: IdSchema,
  policyVersion: IdSchema.nullable(), policyEpoch: IdSchema.nullable(), principalEpoch: IdSchema.nullable(),
  evaluatedAt: TimeSchema, validUntil: TimeSchema, identity: FreshnessSchema.nullable(),
  policy: FreshnessSchema.nullable(), membership: FreshnessSchema.nullable(), auditReceiptId: IdSchema.nullable(),
};
export const DecisionSchema = z.discriminatedUnion('outcome', [
  obj({ ...decisionFields, outcome: z.literal('allow'), reason: z.literal('ALLOW'), matchedGrantIds: ids() }),
  obj({ ...decisionFields, outcome: z.literal('deny'), reason: DenyReasonSchema }),
]);
export const PrincipalSnapshotSchema = obj({
  principal: PrincipalSchema, complete: z.boolean(), revoked: z.boolean(),
  currentPrincipalEpoch: IdSchema, currentMappingEpoch: IdSchema.nullable(), authority: FreshnessSchema,
  groups: list(obj({ groupId: IdSchema, membership: FreshnessSchema })),
});
export const WorkloadRegistrationSchema = obj({
  workloadPolicyId: IdSchema, subjectId: IdSchema, agentId: IdSchema, environment: EnvironmentSchema,
  registrationEpoch: IdSchema, purposeId: IdSchema, jobId: IdSchema, ownerApprovalEvidenceId: IdSchema,
  scope: ScopeSchema, recipientSubjectIds: ids(), freshness: FreshnessSchema, active: z.boolean(),
});
export const EvidenceSchema = obj({
  machine: obj({ clientId: IdSchema, tenantId: IdSchema, agentId: IdSchema, environment: EnvironmentSchema,
    actions: z.array(ActionSchema).max(10), registrationEpoch: IdSchema, currentRegistrationEpoch: IdSchema, freshness: FreshnessSchema }),
  actor: PrincipalSnapshotSchema, recipients: list(PrincipalSnapshotSchema),
  policy: AgentPolicySchema.nullable(), currentPolicyEpoch: IdSchema.nullable(), currentPolicy: FreshnessSchema,
  provenance: obj({ manifestId: IdSchema, complete: z.boolean(), resources: list(ResourceRefSchema), freshness: FreshnessSchema }),
  sources: list(obj({ resource: ResourceRefSchema, authorized: z.boolean(), credentialMode: z.enum(['personal', 'approved-shared']),
    subjectId: IdSchema, principalEpoch: IdSchema, agentId: IdSchema,
    credentialIdentityId: IdSchema, authorizationEvidenceId: IdSchema, freshness: FreshnessSchema })),
  destination: obj({ destination: DestinationSchema, bindingId: IdSchema, recipientSubjectIds: ids(),
    evidenceId: IdSchema,
    complete: z.boolean(), internal: z.boolean(), external: z.boolean(), shared: z.boolean(), pendingShare: z.boolean(),
    classification: z.enum(['none', 'dm', 'group-dm', 'private-channel', 'public-channel', 'artifact']),
    equivalentArtifactAcl: z.boolean(), freshness: FreshnessSchema }),
  workload: WorkloadRegistrationSchema.nullable(),
  audit: obj({ decisionId: IdSchema, requestDigest: IdSchema, receiptId: IdSchema }).nullable(),
});
export type Freshness = z.infer<typeof FreshnessSchema>;
export type Principal = z.infer<typeof PrincipalSchema>;
export type HumanPrincipal = z.infer<typeof HumanPrincipalSchema>;
export type WorkloadPrincipal = z.infer<typeof WorkloadPrincipalSchema>;
export type Action = z.infer<typeof ActionSchema>;
export type ResourceRef = z.infer<typeof ResourceRefSchema>;
export type Destination = z.infer<typeof DestinationSchema>;
export type Scope = z.infer<typeof ScopeSchema>;
export type DelegationClaims = z.infer<typeof DelegationClaimsSchema>;
export type DecisionRequest = z.infer<typeof DecisionRequestSchema>;
export type AgentPolicy = z.infer<typeof AgentPolicySchema>;
export type AgentGrant = z.infer<typeof AgentGrantSchema>;
export type CorpusApproval = z.infer<typeof CorpusApprovalSchema>;
export type Decision = z.infer<typeof DecisionSchema>;
export type DenyReason = z.infer<typeof DenyReasonSchema>;
export type PrincipalSnapshot = z.infer<typeof PrincipalSnapshotSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
