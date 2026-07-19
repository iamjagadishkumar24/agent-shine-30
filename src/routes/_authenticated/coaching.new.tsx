import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/coaching/new")({
  beforeLoad: () => {
    throw redirect({ to: "/coaching", search: { create: "1" } as any });
  },
  component: () => null,
});
