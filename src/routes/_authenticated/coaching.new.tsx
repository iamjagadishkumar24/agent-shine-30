import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/coaching/new")({
  component: () => <Navigate to="/coaching" search={{ create: "1" } as any} replace />,
});
