import { z } from 'zod';
import { DelegationClaimsSchema, IdSchema, type DecisionRequest, type DelegationClaims, type DenyReason } from './schemas.js';
import { covers, digestRequest, LIMITS, parseBounded, principalEpoch, scopeSubset, validClock } from './common.js';

declare const verified: unique symbol;
export interface VerifiedDelegation { readonly [verified]: true }
const handles = new WeakMap<object, { claims: DelegationClaims[]; digest: string; destinationId: string }>();
const ConfigSchema = z.object({ issuer: IdSchema, audience: IdSchema,
  maxDepth: z.number().int().min(1).max(8).default(3),
  edges: z.array(z.object({ fromAgentId: IdSchema, toAgentId: IdSchema, machineClientId: IdSchema,
    issuer: IdSchema, audience: IdSchema }).strict()).min(1).max(64),
}).strict();
export interface DelegationPorts {
  /** Authenticate EVERY returned ancestor and leaf via private gateway/signature verification.
   * Never return decoded, unauthenticated token JSON. Root-to-leaf order, max eight. */
  authenticate(token: string, signal: AbortSignal): Promise<unknown>;
  /** Durable, atomic insert-if-absent across all workers; false means already consumed. */
  consume(input: { issuer: string; audience: string; jti: string; expiresAt: string }, signal: AbortSignal): Promise<boolean>;
}
export type DelegationResult = { ok: true; handle: VerifiedDelegation } | { ok: false; reason: DenyReason };

function validChain(chain: DelegationClaims[], request: DecisionRequest, destinationId: string, now: number): boolean {
  const leaf = chain.at(-1);
  if (!leaf || leaf.jti !== request.delegationId || leaf.requestDigest !== digestRequest(request) || leaf.toAgentId !== request.agentId) return false;
  const p = request.principal;
  const jtIs = new Set<string>();
  return chain.every((c, i) => {
    const parent = chain[i - 1];
    const issued = Date.parse(c.issuedAt), start = Date.parse(c.notBefore), end = Date.parse(c.expiresAt);
    if (jtIs.has(c.jti)) return false;
    jtIs.add(c.jti);
    if (c.tenantId !== p.tenantId || c.subjectId !== p.subjectId || c.initiatorId !== p.subjectId ||
      c.principalEpoch !== principalEpoch(p) || c.mappingEpoch !== (p.kind === 'human' ? p.mappingEpoch : undefined) ||
      c.runId !== request.runId || c.jobId !== request.jobId || c.depth !== i + 1 ||
      issued > now || start > now || now >= end || issued > start || end <= start || end - issued > LIMITS.delegationMs ||
      !covers(c.scope, request, destinationId)) return false;
    return parent ? c.parentId === parent.jti && c.chainId === parent.chainId && c.fromAgentId === parent.toAgentId &&
      scopeSubset(c.scope, parent.scope) && issued >= Date.parse(parent.issuedAt) && end <= Date.parse(parent.expiresAt) : !c.parentId;
  });
}

export function createDelegationVerifier(configuration: unknown, ports: DelegationPorts) {
  const config = parseBounded(ConfigSchema, configuration);
  return async (token: unknown, request: DecisionRequest, destinationId: string, machineClientId: string,
    now: number, signal: AbortSignal): Promise<DelegationResult> => {
    try {
      if (typeof token !== 'string' || !token.length || token.length > 8192 || !validClock(now)) return { ok: false, reason: 'INVALID_DELEGATION' };
      const chain = parseBounded(z.array(DelegationClaimsSchema).min(1).max(8), await ports.authenticate(token, signal));
      if (signal.aborted || chain.length > config.maxDepth || !validChain(chain, request, destinationId, now) || chain.at(-1)!.issuer !== config.issuer ||
        chain.at(-1)!.audience !== config.audience || chain.some(c => !config.edges.some(e => e.fromAgentId === c.fromAgentId &&
          e.toAgentId === c.toAgentId && e.machineClientId === c.machineClientId && e.issuer === c.issuer && e.audience === c.audience)) ||
        chain.at(-1)!.machineClientId !== machineClientId) return { ok: false, reason: 'INVALID_DELEGATION' };
      const c = chain.at(-1)!;
      if (!await ports.consume({ issuer: c.issuer, audience: c.audience, jti: c.jti, expiresAt: c.expiresAt }, signal)) return { ok: false, reason: 'REPLAY' };
      if (signal.aborted) return { ok: false, reason: 'INVALID_DELEGATION' };
      // Only this authenticated and replay-checked code path can mint a usable handle.
      const handle = Object.freeze(Object.create(null)) as VerifiedDelegation;
      handles.set(handle, { claims: chain, digest: digestRequest(request), destinationId });
      return { ok: true, handle };
    } catch { return { ok: false, reason: 'INVALID_DELEGATION' }; }
  };
}

/** Internal handle check; object shape/type assertions cannot manufacture this authority. */
export function delegationAllows(handle: VerifiedDelegation | undefined, request: DecisionRequest, destinationId: string, now: number): boolean {
  const stored = handle && handles.get(handle);
  return !!stored && stored.digest === digestRequest(request) && stored.destinationId === destinationId &&
    validChain(stored.claims, request, destinationId, now);
}

export function delegationExpiry(handle: VerifiedDelegation | undefined): number {
  const stored = handle && handles.get(handle);
  return stored ? Math.min(...stored.claims.map(c => Date.parse(c.expiresAt))) : Infinity;
}
