import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Mint / rotate / fetch the caller's personal iCal feed token.

export const getMyCalendarFeed = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("calendar_feed_tokens")
      .select("token, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Response(error.message, { status: 500 });
    return data;
  });

export const rotateCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Simple opaque token: 32 random bytes, hex.
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    const token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");

    // Delete existing tokens for this user and insert the new one.
    await context.supabase.from("calendar_feed_tokens").delete().eq("user_id", context.userId);
    const { error } = await context.supabase
      .from("calendar_feed_tokens")
      .insert({ user_id: context.userId, token });
    if (error) throw new Response(error.message, { status: 500 });
    return { token };
  });

export const revokeCalendarFeed = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error } = await context.supabase
      .from("calendar_feed_tokens")
      .delete()
      .eq("user_id", context.userId);
    if (error) throw new Response(error.message, { status: 500 });
    return { ok: true };
  });
