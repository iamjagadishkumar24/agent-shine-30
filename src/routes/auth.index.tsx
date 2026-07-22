import { createFileRoute, redirect } from "@tanstack/react-router";
import { parseAuthSearch, type AuthSearch } from "./auth";

// Bare `/auth` redirects to the canonical `/auth/signin` (or `/auth/signup`
// when `?mode=signup`). The parent `/auth` route is a passthrough layout so
// that this redirect only fires for the exact `/auth` URL, not for child
// pages like `/auth/signin`.
export const Route = createFileRoute("/auth/")({
  validateSearch: (s: Record<string, unknown>): AuthSearch & { mode?: "signin" | "signup" } => {
    const out: AuthSearch & { mode?: "signin" | "signup" } = parseAuthSearch(s);
    if (s.mode === "signup" || s.mode === "signin") out.mode = s.mode;
    return out;
  },
  beforeLoad: ({ search }) => {
    const target = search.mode === "signup" ? "/auth/signup" : "/auth/signin";
    const passthrough: AuthSearch = {};
    if (search.next) passthrough.next = search.next;
    if (search.email) passthrough.email = search.email;
    throw redirect({ to: target, search: passthrough });
  },
});
