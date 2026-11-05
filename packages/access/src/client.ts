import { z } from 'zod';
import { DecisionRequestSchema, DecisionSchema, IdSchema, TimeSchema, type Decision, type DecisionRequest } from './schemas.js';
import { digestRequest, fresh, identityFreshness, LIMITS, localDeny, parseBounded, principalEpoch, readClock, same, validClock } from './common.js';
import { bounded, type DenialEvent } from './host.js';

const ExpectationSchema = z.object({ policyVersion: IdSchema, policyEpoch: IdSchema, principalEpoch: IdSchema,
  validUntil: TimeSchema }).strict();
export interface ClientBindings {
  /** Authenticated service transport only; verify issuer, audience, machine scope and response
   * authenticity in host code. Never implement with an arbitrary model-selected URL. */
  decideAuthenticated(request: DecisionRequest, signal: AbortSignal): Promise<unknown>;
  /** Authoritative online check on EVERY call, including outage/revocation. No cached allow fallback.
   * validUntil must cap every required source, group, grant, approval and destination expiry. */
  current(request: DecisionRequest, signal: AbortSignal): Promise<unknown>;
  clock(): number;
  recordDenial(event: DenialEvent): void;
}
export function createAccessClient(bindings: ClientBindings, timeoutMs = 2500) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error('INVALID_REQUEST');
  const clock = () => readClock(bindings.clock);
  return async (input: unknown): Promise<Decision> => {
    let r: DecisionRequest | undefined;
    let result: Decision;
    try {
      r = parseBounded(DecisionRequestSchema, input);
      const request = r, started = clock();
      result = await bounded(timeoutMs, async signal => {
        const expected = parseBounded(ExpectationSchema, await bindings.current(request, signal));
        const d = parseBounded(DecisionSchema, await bindings.decideAuthenticated(request, signal));
        const now = clock(), end = Date.parse(d.validUntil), evaluated = Date.parse(d.evaluatedAt);
        if (signal.aborted || !validClock(now) || !validClock(started) || now < started || evaluated < started || evaluated > now || d.requestDigest !== digestRequest(request)) return localDeny('INVALID_REQUEST', now, request);
        if (d.outcome === 'deny') return end === evaluated ? d : localDeny('INVALID_REQUEST', now, request);
        if (d.policyVersion !== expected.policyVersion || d.policyEpoch !== expected.policyEpoch ||
          d.principalEpoch !== expected.principalEpoch || d.principalEpoch !== principalEpoch(request.principal) ||
          (request.expectedPolicyVersion && d.policyVersion !== request.expectedPolicyVersion) ||
          !d.auditReceiptId || !d.matchedGrantIds.length || !d.identity || !d.policy ||
          !same(d.identity, identityFreshness(request.principal)) || !fresh(d.identity, now, LIMITS.identityMs) || !fresh(d.policy, now, LIMITS.policyMs) ||
          end <= now || end > evaluated + LIMITS.decisionMs || end > Date.parse(expected.validUntil) ||
          end > Date.parse(d.identity.validUntil) || end > Date.parse(d.policy.validUntil) ||
          (request.destination.kind !== 'none' && (!d.membership || !fresh(d.membership, now, LIMITS.membershipMs) || end > Date.parse(d.membership.validUntil)))) return localDeny('INVALID_REQUEST', now, request);
        return d;
      });
    } catch { result = localDeny(r ? 'SERVICE_UNAVAILABLE' : 'INVALID_REQUEST', clock(), r); }
    if (result.outcome === 'deny') { try { bindings.recordDenial({ reason: result.reason, requestDigest: result.requestDigest }); } catch { /* sanitized */ } }
    return result;
  };
}
