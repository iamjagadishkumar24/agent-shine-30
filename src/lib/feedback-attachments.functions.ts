import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const MAX_BYTES = 20 * 1024 * 1024; // 20 MB
const STAFF_ROLES = ["qa_admin", "qa_manager", "qa_reviewer"] as const;
const ADMIN_ROLES = ["qa_admin", "qa_manager"] as const;

const ALLOWED_MIME = new Set<string>([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "audio/mpeg",
  "audio/wav",
  "audio/webm",
  "video/mp4",
  "video/webm",
]);

function fail(message: string, status: number, err?: unknown): never {
  if (err) console.error(`[feedback-attachments] ${message}`, err);
  throw new Response(message, { status });
}

function sanitizeFileName(name: string): string {
  const trimmed = name.trim().replace(/[\r\n\t]/g, "");
  const noPath = trimmed.split(/[\\/]/).pop() ?? "file";
  const collapsed = noPath.replace(/[^\w.\-]+/g, "_").replace(/_+/g, "_");
  return collapsed.slice(0, 180) || "file";
}

async function loadRoles(supabase: any, userId: string): Promise<Set<string>> {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) fail("Unable to verify permissions", 500, error);
  return new Set((data ?? []).map((r: any) => r.role));
}

export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (data: { feedbackId: string; fileName: string; mimeType: string; sizeBytes: number }) =>
      z
        .object({
          feedbackId: z.string().uuid(),
          fileName: z.string().trim().min(1).max(255),
          mimeType: z.string().trim().min(1).max(200),
          sizeBytes: z.number().int().min(1).max(MAX_BYTES),
        })
        .parse(data),
  )
  .handler(async ({ data, context }) => {
    if (!ALLOWED_MIME.has(data.mimeType)) {
      throw new Response(`Unsupported file type: ${data.mimeType}`, { status: 415 });
    }

    // Verify caller can attach to this feedback:
    //   • staff roles can attach to any feedback (subject to RLS visibility), OR
    //   • the caller is the feedback creator (draft state).
    const roles = await loadRoles(context.supabase, context.userId);
    const isStaff = STAFF_ROLES.some((r) => roles.has(r));

    const { data: fb, error: fbErr } = await context.supabase
      .from("feedback")
      .select("id, created_by, status")
      .eq("id", data.feedbackId)
      .maybeSingle();
    if (fbErr) fail("Unable to verify feedback", 500, fbErr);
    if (!fb) throw new Response("Feedback not found", { status: 404 });

    const isOwner = fb.created_by === context.userId;
    if (!isStaff && !isOwner) {
      throw new Response("Not permitted to attach files to this feedback", { status: 403 });
    }
    // Terminal states cannot accept new attachments.
    if (["sent", "acknowledged", "completed"].includes(fb.status)) {
      throw new Response(
        `Cannot add attachments to feedback in status "${fb.status}"`,
        { status: 409 },
      );
    }

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = sanitizeFileName(data.fileName);
    const path = `${data.feedbackId}/${Date.now()}_${safe}`;

    const { data: signed, error } = await supabaseAdmin.storage
      .from("feedback-attachments")
      .createSignedUploadUrl(path);
    if (error || !signed?.signedUrl) fail("Unable to create upload URL", 500, error);

    const { data: row, error: iErr } = await supabaseAdmin
      .from("feedback_attachments")
      .insert({
        feedback_id: data.feedbackId,
        storage_path: path,
        file_name: safe,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        uploaded_by: context.userId,
      })
      .select("*")
      .single();
    if (iErr || !row) {
      // Rollback the signed upload slot if the DB row insert fails.
      await supabaseAdmin.storage.from("feedback-attachments").remove([path]).catch(() => {});
      fail("Unable to record attachment", 500, iErr);
    }

    return { signedUrl: signed.signedUrl, token: signed.token, path, attachment: row };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: row, error } = await supabaseAdmin
      .from("feedback_attachments")
      .select("id, storage_path, uploaded_by, feedback_id")
      .eq("id", data.id)
      .maybeSingle();
    if (error) fail("Unable to load attachment", 500, error);
    if (!row) throw new Response("Attachment not found", { status: 404 });

    const roles = await loadRoles(context.supabase, context.userId);
    const isAdmin = ADMIN_ROLES.some((r) => roles.has(r));
    const isUploader = row.uploaded_by === context.userId;
    if (!isAdmin && !isUploader) {
      throw new Response("Not permitted to delete this attachment", { status: 403 });
    }

    const { error: storageErr } = await supabaseAdmin.storage
      .from("feedback-attachments")
      .remove([row.storage_path]);
    if (storageErr) {
      console.error("[feedback-attachments] storage delete failed", storageErr);
    }

    const { error: delErr } = await supabaseAdmin
      .from("feedback_attachments")
      .delete()
      .eq("id", data.id);
    if (delErr) fail("Unable to delete attachment record", 500, delErr);

    return { ok: true };
  });
