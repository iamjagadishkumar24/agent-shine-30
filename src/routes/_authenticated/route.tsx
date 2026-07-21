import { createFileRoute, Outlet, redirect, Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

import qualipulseMark from "@/assets/qualipulse-mark.png.asset.json";

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
  UserSearch,
  
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
import { ExportsMenu } from "@/components/exports/exports-menu";

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
  { to: "/acknowledgements", label: "Acknowledgements", icon: MessageSquareText },
  { to: "/coaching", label: "Coaching", icon: GraduationCap },
  { to: "/analytics", label: "Analytics", icon: BarChart3 },
  { to: "/reports", label: "Reports", icon: FileBarChart },
  { to: "/agent-reports", label: "Agent Reports", icon: UserSearch },
] as const;

const MASTER_ADMIN_NAV = [
  { to: "/access-management", label: "Access Management", icon: ShieldCheck },
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
  const staffRoles = ["master_admin", "admin", "super_admin", "qa_admin", "qa_evaluator", "manager", "team_manager"];
  const isStaff = roles.some((r) => staffRoles.includes(r));
  const isMasterAdmin = roles.includes("master_admin");
  const NAV = isStaff
    ? (isMasterAdmin ? [...STAFF_NAV, ...MASTER_ADMIN_NAV] : STAFF_NAV)
    : AGENT_NAV;

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
          "before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:h-24 before:bg-[radial-gradient(ellipse_at_top,color-mix(in_oklab,var(--primary)_10%,transparent),transparent_70%)]",
          collapsed ? "w-[68px]" : "w-64",
        )}
      >
        <div className={cn("relative flex h-16 items-center border-b border-sidebar-border/80", collapsed ? "justify-center px-2" : "gap-3 px-5")}>
          <div className="relative shrink-0">
            <img src={qualipulseMark.url} alt="QualiPulse" className="h-8 w-8 object-contain" />
            <span className="absolute -inset-1 rounded-full bg-primary/15 blur-md" aria-hidden="true" />
          </div>
          {!collapsed && (
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-semibold tracking-tight text-sidebar-foreground">QualiPulse</span>
              <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-muted-foreground">Performance Manager</span>
            </div>
          )}
        </div>

        <nav className="relative flex-1 space-y-0.5 overflow-y-auto p-3">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 pb-1.5 pt-2 eyebrow text-muted-foreground/80">
              <span className="h-1 w-1 rounded-full bg-primary/70" />
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
                  "group relative flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                  active
                    ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)] text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_color-mix(in_oklab,var(--primary)_60%,transparent)]" />
                )}
                <item.icon
                  className={cn(
                    "h-[17px] w-[17px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground",
                  )}
                  strokeWidth={active ? 2.25 : 1.9}
                />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="space-y-0.5 border-t border-sidebar-border/60 p-3">
          {!collapsed && (
            <div className="flex items-center gap-2 px-3 pb-1.5 eyebrow text-muted-foreground/80">
              <span className="h-1 w-1 rounded-full bg-muted-foreground/60" />
              Account
            </div>
          )}
          {BOTTOM_NAV.map((item) => {
            const active = pathname === item.to || pathname.startsWith(item.to + "/");
            return (
              <Link
                key={item.to}
                to={item.to}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "group flex items-center gap-3 rounded-lg text-[13.5px] font-medium transition-all duration-150",
                  collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2",
                  active
                    ? "bg-[linear-gradient(90deg,color-mix(in_oklab,var(--primary)_14%,transparent),transparent)] text-sidebar-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                )}
              >
                <item.icon
                  className={cn(
                    "h-[17px] w-[17px] shrink-0 transition-colors",
                    active ? "text-primary" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground",
                  )}
                  strokeWidth={active ? 2.25 : 1.9}
                />
                {!collapsed && <span>{item.label}</span>}
              </Link>
            );
          })}

          <button
            onClick={() => update({ sidebarCollapsed: !collapsed })}
            className={cn(
              "mt-2 flex w-full items-center gap-2 rounded-lg border border-sidebar-border/70 bg-sidebar-accent/20 text-[11px] font-medium uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
              collapsed ? "justify-center px-2 py-2" : "justify-center px-2 py-1.5",
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <ChevronLeft className={cn("h-3.5 w-3.5 transition-transform duration-200", collapsed && "rotate-180")} />
            {!collapsed && <span>Collapse</span>}
          </button>
        </div>
      </aside>

      <div className={cn("flex-1 transition-[margin] duration-200", collapsed ? "ml-[68px]" : "ml-64")}>
        {/* Top header */}
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border/60 bg-background/70 px-4 backdrop-blur-xl sm:px-6">
          <div className="flex min-w-0 items-center gap-2.5">
            <span className="hidden h-1.5 w-1.5 shrink-0 rounded-full bg-primary shadow-[0_0_10px_color-mix(in_oklab,var(--primary)_70%,transparent)] sm:block" aria-hidden="true" />
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-[15px] font-semibold tracking-tight text-foreground">
                {current ? current.label : "Dashboard"}
              </span>
              <span className="hidden truncate text-[10.5px] font-medium uppercase tracking-[0.14em] text-muted-foreground md:block">
                Driving Customer Success
              </span>
            </div>
          </div>


          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => setCmdOpen(true)}
              className="hidden h-9 items-center gap-2 rounded-lg border border-border/70 bg-secondary/40 px-3 text-xs text-muted-foreground transition-all hover:border-border hover:bg-secondary/70 md:flex lg:min-w-[240px]"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="flex-1 text-left">Search agents, feedback, coaching…</span>
              <kbd className="rounded border border-border/70 bg-background/60 px-1.5 py-0.5 text-[10px] font-mono">⌘K</kbd>
            </button>

            <button
              onClick={() => setCmdOpen(true)}
              aria-label="Search"
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-border/70 bg-secondary/40 text-muted-foreground hover:bg-secondary/70 md:hidden"
            >
              <Search className="h-4 w-4" />
            </button>

            {isStaff && (
              <Button
                size="sm"
                className="h-9 gap-1.5 rounded-lg border-0 bg-[image:var(--gradient-brand)] text-primary-foreground shadow-sm transition-all hover:opacity-95 hover:shadow-md"
                onClick={() => navigate({ to: "/feedback/new" })}
              >
                <Plus className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">New feedback</span>
              </Button>
            )}

            <span className="mx-1 hidden h-6 w-px bg-border/70 sm:block" aria-hidden="true" />


            <ExportsMenu />
            <NotificationsBell userId={user.id} />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex h-9 items-center gap-2 rounded-lg border border-border/60 bg-secondary/30 pl-1 pr-2.5 transition-colors hover:bg-secondary/60">
                  <Avatar className="h-7 w-7">
                    {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
                    <AvatarFallback className="bg-primary/20 text-[10px] font-semibold text-primary">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-xs font-medium md:inline">{displayName}</span>
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

