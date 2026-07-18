import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser, unauthenticated } from "../supabase";

const STATUSES = ["draft", "review", "approved", "sent", "acknowledged", "completed"] as const;

export default defineTool({
  name: "update_feedback_status",
  title: "Update feedback status",
  description:
    "Update a feedback item's status and record a reviewer comment. Writes an audit log entry capturing the actor, previous and new status, and the comment. RLS applies as the signed-in user.",
  inputSchema: {
    feedback_id: z.string().uuid().describe("Feedback UUID to update."),
    to_status: z.enum(STATUSES).describe("New status."),
    comment: z.string().min(1).describe("Reviewer comment / justification for the change."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return unauthenticated();
    const sb = supabaseForUser(ctx);

    const { data: current, error: readErr } = await sb
      .from("feedback")
      .select("id, status")
      .eq("id", input.feedback_id)
      .maybeSingle();
    if (readErr) return { content: [{ type: "text", text: readErr.message }], isError: true };
    if (!current)
      return { content: [{ type: "text", text: "Feedback not found or not accessible." }], isError: true };

    const fromStatus = current.status as (typeof STATUSES)[number];
    const now = new Date().toISOString();
    const patch: Record<string, unknown> = { status: input.to_status };
    if (input.to_status === "sent" && fromStatus !== "sent") patch.sent_at = now;
    if (input.to_status === "acknowledged") {
      patch.acknowledged_at = now;
      patch.acknowledgement_note = input.comment;
    }

    const { data: updated, error: updErr } = await sb
      .from("feedback")
      .update(patch)
      .eq("id", input.feedback_id)
      .select("id, status, sent_at, acknowledged_at")
      .maybeSingle();
    if (updErr) return { content: [{ type: "text", text: updErr.message }], isError: true };

    const { error: auditErr } = await sb.from("feedback_audit_log").insert({
      feedback_id: input.feedback_id,
      actor_id: ctx.getUserId(),
      action: "status_change",
      from_status: fromStatus,
      to_status: input.to_status,
      comment: input.comment,
      metadata: { source: "mcp", client_id: ctx.getClientId() ?? null },
    });
    if (auditErr)
      return {
        content: [
          {
            type: "text",
            text: `Status updated but audit log insert failed: ${auditErr.message}`,
          },
        ],
        isError: true,
      };

    return {
      content: [
        {
          type: "text",
          text: `Feedback ${input.feedback_id} status: ${fromStatus} → ${input.to_status}`,
        },
      ],
      structuredContent: { feedback: updated, from_status: fromStatus, to_status: input.to_status },
    };
  },
});
