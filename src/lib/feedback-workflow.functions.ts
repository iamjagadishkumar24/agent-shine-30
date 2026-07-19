import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Simplified feedback workflow.
 *
 * The lifecycle is:
 *   draft → ready_to_send → sent → delivered → opened → acknowledged → completed
 * If a send permanently fails the row moves to `failed`, from which the
 * author can retry by transitioning back to `ready_to_send`.
 *
 * The retired review/approval flow (submit/approve/reject/request_revision)
 * has been removed — anyone with write access to the feedback can send.
 */
const ActionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("mark_ready"),
    feedbackId: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  }),
  z.object({
    type: z.literal("retry"),
    feedbackId: z.string().uuid(),
    note: z.string().trim().max(2000).optional(),
  }),
]);

type Action = z.infer<typeof ActionSchema>;

export const transitionFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: Action): Action => {
    const parsed = ActionSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Response(parsed.error.issues[0]?.message ?? "Invalid request", { status: 400 });
    }
    return parsed.data;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: fb, error: readErr } = await supabase
      .from("feedback")
      .select("id, status, created_by")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (readErr) throw new Response(readErr.message, { status: 500 });
    if (!fb) throw new Response("Feedback not found or not accessible", { status: 404 });

    let allowedFrom: string[];
    let action: string;
    if (data.type === "mark_ready") {
      allowedFrom = ["draft"];
      action = "mark_ready";
    } else {
      allowedFrom = ["failed"];
      action = "retry_send";
    }
    if (!allowedFrom.includes(fb.status as string)) {
      throw new Response(
        `Cannot ${data.type.replace(/_/g, " ")} from status "${fb.status}"`,
        { status: 409 },
      );
    }

    const { data: updated, error: updErr } = await supabase
      .from("feedback")
      // deno-lint-ignore no-explicit-any
      .update({ status: "ready_to_send", email_error: null } as any)
      .eq("id", data.feedbackId)
      .eq("status", fb.status as never)
      .select("id")
      .maybeSingle();
    if (updErr) throw new Response(updErr.message, { status: 500 });
    if (!updated) {
      throw new Response(
        "This feedback was updated by someone else. Refresh and try again.",
        { status: 409 },
      );
    }

    const { error: logErr } = await supabase.from("feedback_audit_log").insert({
      feedback_id: data.feedbackId,
      actor_id: userId,
      action,
      // deno-lint-ignore no-explicit-any
      from_status: fb.status as any,
      // deno-lint-ignore no-explicit-any
      to_status: "ready_to_send" as any,
      comment: data.note ?? null,
      metadata: { source: "workflow" },
    });
    if (logErr) console.error("feedback_audit_log insert failed", logErr);

    return { ok: true as const, from: fb.status, to: "ready_to_send" as const };
  });
