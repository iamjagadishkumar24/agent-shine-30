import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Bell, CheckCheck, Trash2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

function NotificationsPage() {
  const list = useServerFn(listMyNotifications);
  const markRead = useServerFn(markNotificationRead);
  const markAll = useServerFn(markAllNotificationsRead);
  const del = useServerFn(deleteNotification);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => list(),
  });

  const readMut = useMutation({
    mutationFn: (id: string) => markRead({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const allMut = useMutation({
    mutationFn: () => markAll(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });
  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <Bell className="h-5 w-5" /> Notifications
          </h1>
          <p className="text-xs text-muted-foreground mt-1">
            {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
          </p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={() => allMut.mutate()} disabled={allMut.isPending}>
            <CheckCheck className="h-3.5 w-3.5 mr-1.5" /> Mark all read
          </Button>
        )}
      </div>

      <Card className="divide-y">
        {isLoading ? (
          <div className="p-8 text-center text-xs text-muted-foreground">Loading…</div>
        ) : notifications.length === 0 ? (
          <div className="p-12 text-center">
            <Bell className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <div className="text-sm text-muted-foreground">No notifications yet.</div>
          </div>
        ) : (
          notifications.map((n) => (
            <div
              key={n.id}
              className={cn(
                "px-4 py-3 flex items-start gap-3 group hover:bg-muted/30 transition-colors",
                !n.read_at && "bg-primary/5",
              )}
            >
              <div
                className={cn(
                  "mt-1.5 h-2 w-2 rounded-full shrink-0",
                  !n.read_at ? "bg-primary" : "bg-muted-foreground/30",
                )}
              />
              <button
                onClick={() => {
                  if (!n.read_at) readMut.mutate(n.id);
                  if (n.link) navigate({ to: n.link });
                }}
                className="flex-1 min-w-0 text-left"
              >
                <div className="text-sm font-medium">{n.title}</div>
                {n.body && (
                  <div className="text-xs text-muted-foreground mt-0.5">{n.body}</div>
                )}
                <div className="text-[10px] text-muted-foreground mt-1.5">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </div>
              </button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => delMut.mutate(n.id)}
                aria-label="Delete notification"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
