import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import {
  LayoutDashboard,
  Users,
  MessageSquareText,
  GraduationCap,
  BarChart3,
  FileBarChart,
  Settings,
  UserCog,
  Plus,
  Bell,
  Inbox,
  ShieldCheck,
  Activity,
} from "lucide-react";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, keywords: "home overview kpi" },
  { to: "/agents", label: "Agents", icon: Users, keywords: "team people users staff" },
  { to: "/feedback", label: "Feedback", icon: MessageSquareText, keywords: "reviews quality evaluations customer success" },
  { to: "/approvals", label: "Approvals", icon: ShieldCheck, keywords: "review approve queue" },
  { to: "/coaching", label: "Coaching", icon: GraduationCap, keywords: "sessions 1:1 mentoring" },
  { to: "/coaching/plans", label: "Coaching plans", icon: GraduationCap, keywords: "goals development" },
  { to: "/analytics", label: "Analytics", icon: BarChart3, keywords: "charts insights metrics" },
  { to: "/reports", label: "Reports", icon: FileBarChart, keywords: "pdf csv export" },
  { to: "/notifications", label: "Notifications", icon: Bell, keywords: "inbox alerts" },
  { to: "/portal", label: "Agent portal", icon: Inbox, keywords: "self service my feedback" },
  { to: "/settings", label: "Settings", icon: Settings, keywords: "smtp email config admin" },
  { to: "/account", label: "Account", icon: UserCog, keywords: "profile password theme" },
] as const;

const ACTIONS = [
  { to: "/feedback/new", label: "New feedback", icon: Plus, keywords: "create draft" },
  { to: "/coaching/new", label: "New coaching session", icon: Plus, keywords: "create schedule" },
  { to: "/coaching/plans/new", label: "New coaching plan", icon: Plus, keywords: "create goals" },
  { to: "/reports/schedules", label: "Report schedules", icon: FileBarChart, keywords: "cron weekly monthly" },
] as const;

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const go = (to: string) => {
    onOpenChange(false);
    // Defer navigation until after the dialog closes so focus restoration
    // does not race with the router transition.
    queueMicrotask(() => {
      try {
        navigate({ to: to as never });
      } catch {
        // Route may not exist for this role; fail silently.
      }
    });
  };
  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Jump to a page, search actions…" />
      <CommandList>
        <CommandEmpty>No results.</CommandEmpty>
        <CommandGroup heading="Navigate">
          {NAV.map((n) => (
            <CommandItem key={n.to} value={`${n.label} ${n.keywords}`} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Quick actions">
          {ACTIONS.map((n) => (
            <CommandItem key={n.to} value={`${n.label} ${n.keywords}`} onSelect={() => go(n.to)}>
              <n.icon className="mr-2 h-4 w-4" />
              {n.label}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ignore synthesized events and modifier-only repeats.
      if (e.defaultPrevented || e.repeat) return;
      const isK = e.key === "k" || e.key === "K";
      if (isK && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return { open, setOpen };
}
