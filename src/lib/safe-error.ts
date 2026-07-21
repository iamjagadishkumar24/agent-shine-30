// Generic user-safe error envelope + helpers. Prevents stack traces,
// database errors, provider identifiers, and internal paths from ever
// reaching the browser.

export type SafeErrorCode =
  | "VALIDATION_FAILED"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "UPSTREAM_UNAVAILABLE"
  | "REQUEST_FAILED";

export interface SafeErrorShape {
  success: false;
  code: SafeErrorCode;
  message: string;
  correlationId: string;
}

const MESSAGES: Record<SafeErrorCode, string> = {
  VALIDATION_FAILED: "The provided information is invalid.",
  UNAUTHORIZED: "Sign in to continue.",
  FORBIDDEN: "Access is not authorised.",
  NOT_FOUND: "The requested resource could not be found.",
  RATE_LIMITED: "Too many requests. Please try again shortly.",
  CONFLICT: "This action conflicts with the current state.",
  UPSTREAM_UNAVAILABLE: "A required service is temporarily unavailable.",
  REQUEST_FAILED: "Unable to complete the request.",
};

function makeCorrelationId(): string {
  return (
    "err_" +
    Date.now().toString(36) +
    "_" +
    Math.random().toString(36).slice(2, 10)
  );
}

/**
 * Build a safe error envelope. Logs full details server-side (never returned).
 */
export function safeError(
  code: SafeErrorCode,
  detail?: unknown,
  overrideMessage?: string,
): SafeErrorShape {
  const correlationId = makeCorrelationId();
  // Server-side log only — never returned to the caller.
  try {
    console.error("[safe-error]", { correlationId, code, detail });
  } catch {
    /* ignore logging failures */
  }
  return {
    success: false,
    code,
    message: overrideMessage ?? MESSAGES[code],
    correlationId,
  };
}

/**
 * Throw an error whose message is safe to surface to the UI toast layer.
 * Full detail is logged server-side under the correlation id.
 */
export function throwSafe(
  code: SafeErrorCode,
  detail?: unknown,
  overrideMessage?: string,
): never {
  const env = safeError(code, detail, overrideMessage);
  const err = new Error(`${env.message} [${env.correlationId}]`);
  (err as Error & { code: SafeErrorCode }).code = code;
  throw err;
}
