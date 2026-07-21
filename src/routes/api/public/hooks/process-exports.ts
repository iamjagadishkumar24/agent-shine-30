import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/api/public/hooks/process-exports")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey") || request.headers.get("x-api-key");
        const expected = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
        if (!expected || apiKey !== expected) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        let body: any = null;
        try {
          body = await request.json();
        } catch {
          body = null;
        }

        const { processExportJob, drainQueuedExports } = await import("@/lib/export-jobs.server");
        try {
          if (body?.jobId) {
            const res = await processExportJob(String(body.jobId));
            return Response.json(res);
          }
          const res = await drainQueuedExports(3);
          return Response.json(res);
        } catch (e) {
          console.error("[process-exports] error", e);
          return new Response(JSON.stringify({ error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
