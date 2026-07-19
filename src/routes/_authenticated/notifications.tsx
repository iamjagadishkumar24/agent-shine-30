import { useState, useMemo } from "react";
import { useRealtimeInvalidate } from "@/hooks/use-realtime-invalidate";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2, Inbox } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/layout/page-header";
import { cn } from "@/lib/utils";
import {
  listMyNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
} from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/notifications")({
  component: NotificationsPage,
});

function safeTimeAgo(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  try {
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return "";
  }
}

type Filter = "all" | "unread";

function NotificationsPage() {
  useRealtimeInvalidate("notifications", [["notifications"]]);
  const list = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Filter>("all");

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
  });

  const readMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
    onError: (e: any) => toast.error(e?.message ?? "Failed to mark as read"),
  });
  const allMut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update notifications"),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete notification"),
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  const visible = useMemo(
    () => (filter === "unread" ? notifications.filter((n) => !n.read_at) : notifications),
    [filter, notifications],
  );

  const handleActivate = (n: (typeof notifications)[number]) => {
    if (!n.read_at) readMut.mutate(n.id);
    if (n.link && typeof n.link === "string" && n.link.startsWith("/")) {
      // Notifications may link to routes that don't exist in the typed router;
      // use a plain string navigation so unknown links can't crash the app.
      window.location.assign(n.link);
    }
  };

  return (
    <div>
      <PageHeader
        title="Notifications"
        subtitle={unreadCount > 0 ? `${unreadCount} unread` : "You're all caught up."}
        actions={
          unreadCount > 0 ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => allMut.mutate()}
              disabled={allMut.isPending}
            >
              <CheckCheck className="mr-1.5 h-3.5 w-3.5" /> Mark all read
            </Button>
          ) : undefined
        }
      />

      <div className="mx-auto max-w-4xl space-y-4 px-8 pb-12 pt-6">
        <div className="flex rounded-lg border border-border/60 bg-muted/30 p-0.5 text-xs w-fit">
          {(["all", "unread"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-md px-3 py-1.5 capitalize transition-colors",
                filter === f
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {f}
              {f === "unread" && unreadCount > 0 && (
                <span className="ml-1.5 rounded-full bg-primary/15 px-1.5 py-px text-[10px] font-medium text-primary">
                  {unreadCount}
                </span>
              )}
            </button>
          ))}
        </div>

        <Card className="divide-y divide-border/60 rounded-xl border-border/60 bg-card/60 backdrop-blur-xl">
          {isLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-12 w-full rounded-md" />
              ))}
            </div>
          ) : visible.length === 0 ? (
            <div className="p-12 text-center">
              <Inbox className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
              <div className="text-sm text-muted-foreground">
                {filter === "unread" ? "No unread notifications." : "No notifications yet."}
              </div>
              <p className="mt-1 text-xs text-muted-foreground/70">
                You'll be notified about feedback, coaching, and approvals here.
              </p>
            </div>
          ) : (
            visible.map((n) => (
              <div
                key={n.id}
                className={cn(
                  "group flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/30",
                  !n.read_at && "bg-primary/5",
                )}
              >
                <div
                  className={cn(
                    "mt-1.5 h-2 w-2 shrink-0 rounded-full",
                    !n.read_at ? "bg-primary" : "bg-muted-foreground/30",
                  )}
                />
                <button
                  onClick={() => handleActivate(n)}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="truncate text-sm font-medium">{n.title || "Notification"}</div>
                  {n.body && (
                    <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                      {n.body}
                    </div>
                  )}
                  <div className="mt-1.5 text-[10px] text-muted-foreground">
                    {safeTimeAgo(n.created_at)}
                  </div>
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={() => delMut.mutate(n.id)}
                  disabled={delMut.isPending}
                  aria-label="Delete notification"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))
          )}
        </Card>
      </div>
    </div>
  );
}
