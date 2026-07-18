import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function fail(status: number, message: string, logCtx?: unknown): never {
  if (logCtx !== undefined) console.error("[profile.functions]", message, logCtx);
  throw new Response(message, { status });
}

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) fail(500, "Failed to load profile", error);
    return data;
  });

const ProfileUpdateSchema = z.object({
  full_name: z.string().trim().max(120).optional().nullable(),
  designation: z.string().trim().max(120).optional().nullable(),
  phone: z.string().trim().max(40).optional().nullable(),
  bio: z.string().trim().max(1000).optional().nullable(),
  avatar_url: z.string().url().max(500).optional().nullable(),
  cover_url: z.string().url().max(500).optional().nullable(),
  preferences: z.record(z.string(), z.unknown()).optional(),
});

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => {
    const parsed = ProfileUpdateSchema.safeParse(data);
    if (!parsed.success) throw new Response("Invalid profile payload", { status: 400 });
    return parsed.data;
  })
  .handler(async ({ context, data }) => {
    // Defense-in-depth: never trust a client-supplied id; always scope to context.userId.
    const { data: existing, error: readErr } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();
    if (readErr) fail(500, "Failed to load profile", readErr);

    if (!existing) {
      const { error } = await context.supabase.from("profiles").insert({
        id: context.userId,
        ...data,
        preferences: (data.preferences ?? {}) as never,
      });
      if (error) fail(500, "Failed to create profile", error);
    } else {
      const { error } = await context.supabase
        .from("profiles")
        .update({ ...data, preferences: data.preferences as never })
        .eq("id", context.userId);
      if (error) fail(500, "Failed to update profile", error);
    }
    return { ok: true };
  });

// Password changes are performed by the browser Supabase SDK
// (supabase.auth.updateUser). This server endpoint intentionally does not
// accept or forward passwords — accepting a plaintext password here would
// expose it in server logs and to any admin-client fallback path.
export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    return {
      ok: false,
      note: "Password changes must go through supabase.auth.updateUser() on the client.",
    };
  });
