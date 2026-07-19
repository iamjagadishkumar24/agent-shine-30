import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/sign-up")({
  beforeLoad: () => {
    throw redirect({ to: "/auth", search: { mode: "signup" } as never });
  },
});
