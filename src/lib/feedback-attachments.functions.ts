import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const createUploadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { feedbackId: string; fileName: string; mimeType: string; sizeBytes: number }) =>
    z
      .object({
        feedbackId: z.string().uuid(),
        fileName: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(200),
        sizeBytes: z.number().min(1).max(20 * 1024 * 1024),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const safe = data.fileName.replace(/[^\w.\-]+/g, "_");
    const path = `${data.feedbackId}/${Date.now()}_${safe}`;
    const { data: signed, error } = await supabaseAdmin.storage
      .from("feedback-attachments")
      .createSignedUploadUrl(path);
    if (error) throw new Error(error.message);
    // Insert attachment record immediately (uploader posts to signed URL next)
    const { data: row, error: iErr } = await supabaseAdmin
      .from("feedback_attachments")
      .insert({
        feedback_id: data.feedbackId,
        storage_path: path,
        file_name: data.fileName,
        mime_type: data.mimeType,
        size_bytes: data.sizeBytes,
        uploaded_by: context.userId,
      })
      .select("*")
      .single();
    if (iErr) throw new Error(iErr.message);
    return { signedUrl: signed.signedUrl, token: signed.token, path, attachment: row };
  });

export const deleteAttachment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { id: string }) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("feedback_attachments")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) return { ok: true };
    await supabaseAdmin.storage.from("feedback-attachments").remove([row.storage_path]);
    await supabaseAdmin.from("feedback_attachments").delete().eq("id", data.id);
    return { ok: true };
  });
