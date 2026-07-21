import { createFileRoute } from "@tanstack/react-router";

// Acknowledgement reminder emails to agents have been disabled by product decision.
// This endpoint is intentionally a no-op and the pg_cron schedule has been removed.
export const Route = createFileRoute("/api/public/hooks/feedback-escalations")({
  server: {
    handlers: {
      POST: async () => {
        return Response.json({ processed: 0, disabled: true });
      },
    },
  },
});
