import { createFileRoute, redirect } from "@tanstack/react-router";

// The dedicated approvals queue has been retired — feedback now flows
// directly from Draft → Ready to Send → Sent. Anything that still points
// here lands on the filtered feedback list.
export const Route = createFileRoute("/_authenticated/approvals")({
  beforeLoad: () => {
    throw redirect({ to: "/feedback", search: { status: "pending" } });
  },
  component: () => null,
});
