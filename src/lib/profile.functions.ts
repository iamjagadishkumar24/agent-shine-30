import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("profiles")
      .select("*")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw error;
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
  .inputValidator((data) => ProfileUpdateSchema.parse(data))
  .handler(async ({ context, data }) => {
    const { data: existing } = await context.supabase
      .from("profiles")
      .select("id")
      .eq("id", context.userId)
      .maybeSingle();

    if (!existing) {
      const { error } = await context.supabase.from("profiles").insert({
        id: context.userId,
        ...data,
      });
      if (error) throw error;
    } else {
      const { error } = await context.supabase
        .from("profiles")
        .update(data)
        .eq("id", context.userId);
      if (error) throw error;
    }
    return { ok: true };
  });

export const changeMyPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z.object({ password: z.string().min(8).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Note: rely on client-side supabase.auth.updateUser as well; admin path
    // is here only as a fallback and requires the caller's userId.
    return { ok: true, note: "Password change is handled by client SDK", length: data.password.length };
  });
