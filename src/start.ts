import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Security headers applied to every response. Kept in one place so the
// policy is auditable and easy to tune. CSP intentionally allows the
// Supabase project + Lovable AI gateway + fonts.googleapis.
const SECURITY_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains; preload",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
  "X-DNS-Prefetch-Control": "off",
  "Content-Security-Policy": [
    "default-src 'self'",
    // Vite/TanStack SSR ships inline module preloads; allow same-origin scripts.
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com data:",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://ai.gateway.lovable.dev https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
    "upgrade-insecure-requests",
  ].join("; "),
};

function applySecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(k)) headers.set(k, v);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    const result = await next();
    // TanStack next() returns a context envelope; the runtime handles the
    // Response separately. We hook the outbound Response via securityMiddleware
    // below when it actually is a Response instance.
    return result;
  } catch (error) {
    if (error instanceof Response) {
      throw error;
    }
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8", ...SECURITY_HEADERS },
    });
  }
});

const securityHeadersMiddleware = createMiddleware().server(async ({ next }) => {
  const result = (await next()) as unknown;
  if (result instanceof Response) {
    return applySecurityHeaders(result) as unknown as ReturnType<typeof next> extends Promise<infer R> ? R : never;
  }
  return result as never;
});

export const startInstance = createStart(() => ({
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [securityHeadersMiddleware, errorMiddleware],
}));
