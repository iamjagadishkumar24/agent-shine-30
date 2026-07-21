import { createFileRoute } from "@tanstack/react-router";
import { AuthPage, parseAuthSearch, type AuthSearch } from "./auth";

export const Route = createFileRoute("/auth/signup")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => parseAuthSearch(s),
  component: SignUpRoute,
  head: () => ({
    meta: [
      { title: "Create your account — QualiPulse" },
      { name: "description", content: "Create your QualiPulse account and start running quality reviews." },
      { property: "og:title", content: "Create your account — QualiPulse" },
      { property: "og:description", content: "Create your QualiPulse account and start running quality reviews." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function SignUpRoute() {
  const { next, email } = Route.useSearch();
  return <AuthPage initialMode="signup" next={next} initialEmail={email} />;
}
