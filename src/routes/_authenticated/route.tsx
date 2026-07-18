import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useEffect, useState } from "react";
import { LayoutDashboard, Users, MessageSquareText, GraduationCap, BarChart3, Settings, LogOut, Sparkles, Search } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/feedback", label: "Feedback", icon: MessageSquareText },
  { to: "/coaching", label: "Coaching", icon: GraduationCap },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
] as const;

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [email, setEmail] = useState<string>("");

  useEffect(() => { setEmail(user?.email ?? ""); }, [user]);

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside className="fixed inset-y-0 left-0 z-30 flex w-60 flex-col border-r border-sidebar-border bg-sidebar">
        <div className="flex h-14 items-center gap-2 px-4 border-b border-sidebar-border">
          <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Signal QMS</span>
        </div>

        <div className="px-3 pt-3">
          <div className="flex items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 text-xs text-muted-foreground">
            <Search className="h-3.5 w-3.5" />
            <span>Search…</span>
            <kbd className="ml-auto rounded border border-sidebar-border px-1 text-[10px]">⌘K</kbd>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 p-3">
          <div className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Workspace</div>
          {NAV.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
                  active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border p-3">
          <div className="flex items-center gap-2 rounded-md px-2 py-1.5">
            <div className="grid h-7 w-7 place-items-center rounded-full bg-primary/20 text-xs font-medium text-primary">
              {(email[0] ?? "?").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs text-sidebar-foreground">{email}</div>
              <div className="text-[10px] text-muted-foreground">QA Admin</div>
            </div>
            <button onClick={signOut} className="rounded p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-foreground" title="Sign out">
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      <main className="ml-60 flex-1">
        <Outlet />
      </main>
    </div>
  );
}
