import { createFileRoute } from "@tanstack/react-router";
import { AuthPage, parseAuthSearch, redirectIfAuthenticated, type AuthSearch } from "./auth";

export const Route = createFileRoute("/auth/forgot-password")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>): AuthSearch => parseAuthSearch(s),
  beforeLoad: async ({ search }) => {
    await redirectIfAuthenticated(search.next);
  },
  component: ForgotPasswordRoute,
  head: () => ({
    meta: [
      { title: "Reset your password — QualiPulse" },
      { name: "description", content: "Request a secure link to reset your QualiPulse password." },
      { property: "og:title", content: "Reset your password — QualiPulse" },
      { property: "og:description", content: "Request a secure link to reset your QualiPulse password." },
      { name: "robots", content: "noindex" },
    ],
  }),
});


function ForgotPasswordRoute() {
  const { next, email } = Route.useSearch();
  return <AuthPage initialMode="forgot" next={next} initialEmail={email} />;
}
