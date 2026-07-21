import { createFileRoute } from "@tanstack/react-router";
import { AuthPage, parseAuthSearch, type AuthSearch } from "./auth";

export const Route = createFileRoute("/auth/signin")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => parseAuthSearch(s),
  component: SignInRoute,
  head: () => ({
    meta: [
      { title: "Sign in — QualiPulse" },
      { name: "description", content: "Sign in to your QualiPulse workspace." },
      { property: "og:title", content: "Sign in — QualiPulse" },
      { property: "og:description", content: "Sign in to your QualiPulse workspace." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SignInRoute() {
  const { next, email } = Route.useSearch();
  return <AuthPage initialMode="signin" next={next} initialEmail={email} />;
}
