import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const NOTIF_LIST_MAX = 100;

function fail(message: string, status: number, err?: unknown): never {
  if (err) console.error(`[notifications] ${message}`, err);
  throw new Response(message, { status });
}

export const listMyNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        limit: z.coerce.number().int().min(1).max(NOTIF_LIST_MAX).optional(),
        unreadOnly: z.boolean().optional(),
      })
      .optional()
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const limit = data?.limit ?? 50;
    let query = context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (data?.unreadOnly) query = query.is("read_at", null);
    const { data: rows, error } = await query;
    if (error) fail("Unable to load notifications", 500, error);
    return rows ?? [];
  });

export const getUnreadCount = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count, error } = await context.supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) fail("Unable to load unread count", 500, error);
    return count ?? 0;
  });

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() }, { count: "exact" })
      .eq("id", data.id)
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) fail("Unable to mark notification read", 500, error);
    return { ok: true, updated: count ?? 0 };
  });

export const markAllNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { error, count } = await context.supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() }, { count: "exact" })
      .eq("user_id", context.userId)
      .is("read_at", null);
    if (error) fail("Unable to mark all read", 500, error);
    return { ok: true, updated: count ?? 0 };
  });

export const deleteNotification = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error, count } = await context.supabase
      .from("notifications")
      .delete({ count: "exact" })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) fail("Unable to delete notification", 500, error);
    if ((count ?? 0) === 0) throw new Response("Notification not found", { status: 404 });
    return { ok: true };
  });
