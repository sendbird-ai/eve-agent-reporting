import { createHash } from 'node:crypto';
import type { z } from 'zod';
import type { Decision, DecisionRequest, DenyReason, Freshness, Principal, Scope } from './schemas.js';

export const LIMITS = Object.freeze({ identityMs: 120_000, policyMs: 15_000, decisionMs: 15_000,
  membershipMs: 5_000, delegationMs: 60_000, maxWireBytes: 524_288 });

export function validClock(now: number): boolean { return Number.isFinite(now) && Math.abs(now) <= 8.64e15; }
export function readClock(clock: () => number): number { try { return clock(); } catch { return NaN; } }

// Arrays in this contract are exact sets; object keys and sets have canonical order.
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).sort().join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => JSON.stringify(k) + ':' + canonical(v)).join(',') + '}';
  return JSON.stringify(value);
}
export function digestRequest(request: DecisionRequest): string {
  return createHash('sha256').update(canonical(request)).digest('hex');
}
export function parseBounded<T>(schema: z.ZodType<T>, value: unknown): T {
  // A serialization boundary rejects cycles/oversized input before recursive schema parsing.
  const wire = JSON.stringify(value);
  if (!wire || Buffer.byteLength(wire) > LIMITS.maxWireBytes) throw new Error('INVALID_REQUEST');
  return schema.parse(JSON.parse(wire));
}
export function fresh(f: Freshness, now: number, maxAge: number): boolean {
  const start = Date.parse(f.observedAt), end = Date.parse(f.validUntil);
  return validClock(now) && start <= now && now < end && end > start &&
    end - start <= maxAge && now - start <= maxAge;
}
export function principalEpoch(p: Principal): string {
  return p.kind === 'human' ? p.identityEpoch : p.registrationEpoch;
}
export function identityFreshness(p: Principal): Freshness {
  return p.kind === 'human' ? p.identity : p.registration;
}
export function same(a: unknown, b: unknown): boolean { return canonical(a) === canonical(b); }
export function subset<T>(a: readonly T[], b: readonly T[]): boolean { return a.every(v => b.includes(v)); }
export function scopeSubset(a: Scope, b: Scope): boolean {
  return subset(a.actions, b.actions) && subset(a.resourceIds, b.resourceIds) && subset(a.corpusIds, b.corpusIds) &&
    subset(a.destinationIds, b.destinationIds) && subset(a.toolIds, b.toolIds);
}
export function covers(scope: Scope, r: DecisionRequest, destinationId: string): boolean {
  return scope.actions.includes(r.action) && (!r.toolId || scope.toolIds.includes(r.toolId)) &&
    r.resources.every(v => scope.resourceIds.includes(v.resourceId) && scope.corpusIds.includes(v.corpusId)) &&
    (r.destination.kind === 'none' || scope.destinationIds.includes(destinationId));
}
export function localDeny(reason: DenyReason, now: number, request?: DecisionRequest, decisionId = 'local-denial'): Decision {
  const time = new Date(validClock(now) ? now : 0).toISOString();
  return { schemaVersion: '1.0', decisionId, requestDigest: request ? digestRequest(request) : 'unbound',
    policyVersion: null, policyEpoch: null, principalEpoch: null, evaluatedAt: time, validUntil: time,
    identity: null, policy: null, membership: null, auditReceiptId: null, outcome: 'deny', reason };
}
