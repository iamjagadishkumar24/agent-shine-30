import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

import zenworkMark from "@/assets/zenwork-mark.png.asset.json";

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
import { NotificationsBell } from "@/components/notifications/notifications-bell";

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
  const NAV = isStaff ? STAFF_NAV : AGENT_NAV;

  const email = user?.email ?? "";
  const displayName = profile?.full_name?.trim() || email.split("@")[0] || "User";
  const initials =
    (profile?.full_name || email || "?")
      .split(/\s+/)
      .map((s: string) => s?.[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?";

  const signOut = async () => {
    try {
      await qc.cancelQueries();
      qc.clear();
      await supabase.auth.signOut();
    } catch {
      /* even if signOut errors, still bounce to /auth */
    } finally {
      navigate({ to: "/auth", replace: true });
    }
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
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 items-center border-b border-sidebar-border", collapsed ? "justify-center px-2" : "gap-3 px-5")}>
          <img src={zenworkMark.url} alt="Zenwork" className="h-8 w-8 shrink-0 object-contain" />
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground">Zenwork</span>
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Performance Manager</span>
            </div>
          )}
        </div>


        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 pb-2 pt-3 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <span className="h-1 w-1 rounded-full bg-primary/60" />
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
                  "group relative flex items-center gap-3 rounded-lg text-[14px] font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  active
                    ? "bg-primary/12 text-sidebar-foreground shadow-[0_1px_0_0_color-mix(in_oklab,var(--primary)_20%,transparent)]"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground hover:translate-x-[1px]",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-r-full bg-primary" />
                )}
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                  )}
                  strokeWidth={active ? 2.25 : 2}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="p-3 space-y-1 border-t border-sidebar-border/60">
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg text-[14px] font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5",
                  active
                    ? "bg-primary/12 text-sidebar-foreground"
                    : "text-sidebar-foreground/75 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-[18px] w-[18px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/60 group-hover:text-sidebar-foreground",
                  )}
                  strokeWidth={active ? 2.25 : 2}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>

        <button
          onClick={() => update({ sidebarCollapsed: !collapsed })}
          className="mx-3 mb-3 flex items-center justify-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/30 px-2 py-1.5 text-[10.5px] font-medium uppercase tracking-wider text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
          {!collapsed && <span>Collapse</span>}
        </button>
      </aside>

      <div className={cn("flex-1 transition-[margin] duration-200", collapsed ? "ml-16" : "ml-60")}>
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/60 bg-background/75 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img src={zenworkMark.url} alt="" aria-hidden="true" className="hidden h-8 w-8 shrink-0 object-contain sm:block" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-semibold text-foreground sm:text-base">
                {current ? current.label : "Dashboard"}
              </span>
              <span className="hidden truncate text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground md:block">
                Driving Customer Success
              </span>
            </div>
          </div>


          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden md:flex items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary/70 hover:border-border transition-all lg:min-w-[220px]"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search…</span>
              <kbd className="rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
            </button>

            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Search"
              className="md:hidden flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary/70"
            >
              <Search className="h-4 w-4" />
            </button>

            {isStaff && (
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-lg bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm hover:opacity-95 hover:shadow-md transition-all border-0"
                onClick={() => navigate({ to: "/feedback/new" })}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New feedback</span>
              </Button>
            )}




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

            <NotificationsBell userId={user.id} />

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
