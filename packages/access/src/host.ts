import { z } from 'zod';
import { DecisionRequestSchema, EvidenceSchema, type Decision, type DecisionRequest, type DenyReason } from './schemas.js';
import { createDelegationVerifier } from './delegation.js';
import { evaluate } from './evaluator.js';
import { localDeny, parseBounded, readClock, validClock } from './common.js';

export const BOUNDARY_ACTIONS = Object.freeze({
  dispatch: ['agent.use'], retrieval: ['corpus.retrieve'], context: ['context.read'],
  tool: ['tool.invoke'], developer: ['developer.invoke'], send: ['delivery.send'],
  job: ['agent.use'], artifactCreate: ['artifact.create'], artifactOpen: ['artifact.open'],
  administer: ['access.admin'], audit: ['audit.read'],
} as const);
export type Boundary = keyof typeof BOUNDARY_ACTIONS;
export interface DenialEvent { reason: DenyReason; requestDigest: string }
export interface HostBindings<Context, Operation> {
  /** Trusted startup code authenticates transport/machine, derives the original actor, resolves
   * complete resources/provenance/recipients and current epochs, and persists the audit intent.
   * Context and Operation MUST be server handles, never model-provided identity/evidence JSON. */
  resolve(boundary: Boundary, context: Context, operation: Operation, signal: AbortSignal): Promise<unknown>;
  clock(): number;
  recordDenial(event: DenialEvent): void;
  recordOutcome(decisionId: string, outcome: 'confirmed' | 'failed' | 'unknown'): Promise<void>;
  verifyDelegation?: ReturnType<typeof createDelegationVerifier>;
}
export class AccessDeniedError extends Error {
  constructor(readonly reason: DenyReason) { super(reason); this.name = 'AccessDeniedError'; }
}
export async function bounded<T>(timeoutMs: number, fn: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([fn(controller.signal), new Promise<never>((_, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new Error('SERVICE_UNAVAILABLE')); }, timeoutMs);
    })]);
  } finally { clearTimeout(timer!); controller.abort(); }
}
const EnvelopeSchema = z.object({ request: DecisionRequestSchema, evidence: EvidenceSchema,
  delegationToken: z.string().min(1).max(8192).optional() }).strict();

export function createAccessHost<Context, Operation>(bindings: HostBindings<Context, Operation>, timeoutMs = 2500) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 5000) throw new Error('INVALID_REQUEST');
  const clock = () => readClock(bindings.clock);
  const report = (d: Decision) => {
    if (d.outcome === 'deny') { try { bindings.recordDenial({ reason: d.reason, requestDigest: d.requestDigest }); } catch { /* no diagnostic data escapes */ } }
    return d;
  };
  async function authorize(boundary: Boundary, context: Context, operation: Operation): Promise<Decision> {
    let request: DecisionRequest | undefined;
    try {
      return await bounded(timeoutMs, async signal => {
        const envelope = parseBounded(EnvelopeSchema, await bindings.resolve(boundary, context, operation, signal));
        request = envelope.request;
        if (!Object.hasOwn(BOUNDARY_ACTIONS, boundary) ||
          !(BOUNDARY_ACTIONS[boundary] as readonly string[]).includes(request.action)) return report(localDeny('ACTION_DENIED', clock(), request));
        if (!!request.delegationId !== !!envelope.delegationToken) return report(localDeny('INVALID_DELEGATION', clock(), request));
        let delegation;
        if (envelope.delegationToken) {
          if (!bindings.verifyDelegation) return report(localDeny('INVALID_DELEGATION', clock(), request));
          const result = await bindings.verifyDelegation(envelope.delegationToken, request, envelope.evidence.destination.bindingId,
            envelope.evidence.machine.clientId, clock(), signal);
          if (!result.ok) return report(localDeny(result.reason, clock(), request));
          delegation = result.handle;
        }
        if (signal.aborted) return report(localDeny('SERVICE_UNAVAILABLE', clock(), request));
        return report(evaluate(request, envelope.evidence, clock(), delegation));
      });
    } catch { return report(localDeny('SERVICE_UNAVAILABLE', clock(), request)); }
  }
  return Object.freeze({
    authorize,
    /** Call immediately around ONE host operation. A result/dispatch authorization is not a
     * send permit. Every retry/edit/upload/session read must call a new guarded boundary. */
    async run<T>(boundary: Boundary, context: Context, operation: Operation, execute: () => Promise<T>): Promise<T> {
      const decision = await authorize(boundary, context, operation);
      if (decision.outcome !== 'allow') throw new AccessDeniedError(decision.reason);
      const now = clock();
      if (!validClock(now) || now < Date.parse(decision.evaluatedAt) || now >= Date.parse(decision.validUntil)) throw new AccessDeniedError('POLICY_STALE');
      let value: T;
      try { value = await execute(); }
      catch {
        // An exception does not establish that a remote write failed. Never retry here.
        try { await bindings.recordOutcome(decision.decisionId, 'unknown'); } catch { /* preserve uncertainty */ }
        throw new Error('OPERATION_OUTCOME_UNKNOWN');
      }
      try { await bindings.recordOutcome(decision.decisionId, 'confirmed'); }
      catch { throw new Error('AUDIT_OUTCOME_UNKNOWN'); }
      return value;
    },
  });
}
export type AccessHost<Context, Operation> = ReturnType<typeof createAccessHost<Context, Operation>>;
