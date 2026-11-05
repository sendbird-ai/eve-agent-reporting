import { createAccessHost, type HostBindings, type Boundary } from './host.js';

/** SDK-independent adapter, NOT an Eve extension/hook or a universal interceptor. */
export const EVE_HOST_GUARD_MATRIX = Object.freeze({
  '0.27.2': { mode: 'explicit-host-guards', forwardedPrincipal: false },
  '0.66.2': { mode: 'explicit-host-guards', forwardedPrincipal: true },
} as const);
export function createEveHostGuards<C, O>(version: string, bindings: HostBindings<C, O>, timeoutMs = 2500) {
  if (!Object.hasOwn(EVE_HOST_GUARD_MATRIX, version)) throw new Error('UNSUPPORTED_RUNTIME');
  const host = createAccessHost(bindings, timeoutMs);
  return Object.freeze({ ...host,
    /** Buffer restricted bytes inside the host. Resolve their COMPLETE provenance and actual
     * audience at operation, then authorize immediately before releasing any bytes. */
    releaseBuffered<T>(context: C, operation: O, send: () => Promise<T>) {
      return host.run('send', context, operation, send);
    },
    guarded<T>(boundary: Boundary, context: C, operation: O, execute: () => Promise<T>) {
      return host.run(boundary, context, operation, execute);
    },
  });
}
