import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

import {
  LayoutDashboard,
  Users,
  MessageSquareText,
  GraduationCap,
  BarChart3,
  FileBarChart,
  Settings,
  LogOut,
  Sparkles,
  Search,
  Bell,
  ChevronLeft,
  Sun,
  Moon,
  Monitor,
  UserCog,
  Plus,
  ShieldCheck,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { cn } from "@/lib/utils";
import { useTheme } from "@/lib/theme";
import { CommandPalette, useCommandPalette } from "@/components/layout/command-palette";
import { getMyProfile } from "@/lib/profile.functions";
import { getMyRoles } from "@/lib/agent-portal.functions";
import { UserRound } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AuthedLayout,
});

const STAFF_NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/agents", label: "Agents", icon: Users },
  { to: "/feedback", label: "Feedback", icon: MessageSquareText },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck },
  { to: "/coaching", label: "Coaching", icon: GraduationCap },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileBarChart },
] as const;

const AGENT_NAV = [
  { to: "/portal", label: "My feedback", icon: UserRound },
  { to: "/coaching", label: "Coaching", icon: GraduationCap },
] as const;

const BOTTOM_NAV = [
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

function AuthedLayout() {
  const { user } = Route.useRouteContext();
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { prefs, update } = useTheme();
  const collapsed = prefs.sidebarCollapsed;
  const { open: cmdOpen, setOpen: setCmdOpen } = useCommandPalette();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchRoles = useServerFn(getMyRoles);
  const { data: profile } = useQuery({
    queryKey: ["my-profile"],
    queryFn: () => fetchProfile(),
  });
  const { data: roles = [] } = useQuery({
    queryKey: ["my-roles"],
    queryFn: () => fetchRoles(),
    staleTime: 5 * 60_000,
  });
  const staffRoles = ["super_admin", "qa_admin", "team_manager"];
  const isStaff = roles.some((r) => staffRoles.includes(r));
  const NAV = (isStaff ? STAFF_NAV : AGENT_NAV) as ReadonlyArray<{
    to: string;
    label: string;
    icon: typeof LayoutDashboard;
  }>;

  const email = user?.email ?? "";
  const displayName = profile?.full_name || email.split("@")[0] || "User";
  const initials = (profile?.full_name || email || "?")
    .split(/\s+/)
    .map((s: string) => s[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const signOut = async () => {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const current = [...NAV, ...BOTTOM_NAV, { to: "/account", label: "Account", icon: UserCog }].find((n) =>
    pathname === n.to || pathname.startsWith(n.to + "/"),
  );

  const modeIcon = prefs.mode === "light" ? Sun : prefs.mode === "dark" ? Moon : Monitor;
  const ModeIcon = modeIcon;

  return (
    <div className="flex min-h-screen w-full bg-background">
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 flex flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className={cn("flex h-14 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-2 px-4")}>
          <div className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-sm">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <span className="text-sm font-semibold tracking-tight text-sidebar-foreground">Signal QMS</span>
          )}
        </div>

        {!collapsed && (
          <div className="px-3 pt-3">
            <button
              onClick={() => setCmdOpen(true)}
              className="flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-sidebar-accent/70 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search…</span>
              <kbd className="ml-auto rounded border border-sidebar-border px-1 text-[10px] font-mono">⌘K</kbd>
            </button>
          </div>
        )}

        <nav className="flex-1 space-y-0.5 p-3 overflow-y-auto">
          {!collapsed && (
            <div className="px-2 pb-2 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Workspace
            </div>
          )}
          {NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group relative flex items-center gap-2.5 rounded-md text-sm transition-all",
                  collapsed ? "justify-center px-2 py-2" : "px-2.5 py-1.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r bg-primary" />
                )}
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-0.5">
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-md text-sm transition-colors",
                  collapsed ? "justify-center px-2 py-2" : "px-2.5 py-1.5",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <button
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1 text-[10px] text-muted-foreground hover:bg-sidebar-accent/60 transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={cn("h-3 w-3 transition-transform", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      <div className={cn("flex-1 transition-[margin] duration-200", collapsed ? "ml-16" : "ml-60")}>
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border/60 bg-background/80 px-6 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>Signal QMS</span>
            {current && (
              <>
                <span className="text-muted-foreground/40">/</span>
                <span className="font-medium text-foreground">{current.label}</span>
              </>
            )}
          </div>

          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-md border border-border bg-secondary/40 px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary/70 transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              <span>Search</span>
              <kbd className="rounded border border-border px-1 text-[10px] font-mono">⌘K</kbd>
            </button>

            <Button asChild size="sm" variant="ghost" className="gap-1.5">
              <Link to="/feedback/new">
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New feedback</span>
              </Link>
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Toggle theme">
                  <ModeIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Theme</DropdownMenuLabel>
                <DropdownMenuItem onClick={() => update({ mode: "light" })}>
                  <Sun className="mr-2 h-4 w-4" /> Light
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => update({ mode: "dark" })}>
                  <Moon className="mr-2 h-4 w-4" /> Dark
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => update({ mode: "system" })}>
                  <Monitor className="mr-2 h-4 w-4" /> System
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="ghost" size="icon" aria-label="Notifications">
              <Bell className="h-4 w-4" />
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 rounded-md p-1 pr-2 hover:bg-secondary/50 transition-colors">
                  <Avatar className="h-7 w-7">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                    <AvatarFallback className="bg-primary/20 text-primary text-[10px] font-semibold">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden md:inline text-xs font-medium">{displayName}</span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="text-xs font-medium">{displayName}</span>
                  <span className="text-[10px] font-normal text-muted-foreground">{email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to="/account"><UserCog className="mr-2 h-4 w-4" />Account settings</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/settings"><Settings className="mr-2 h-4 w-4" />Workspace settings</Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main>
          <Outlet />
        </main>
      </div>

      <CommandPalette open={cmdOpen} onOpenChange={setCmdOpen} />
    </div>
  );
}
