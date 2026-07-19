import type { ReactNode } from "react";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  BarChart3,
  Lock as LockIcon,
  Mails,
  Monitor,
  Moon,
  ShieldCheck,
  Sparkles,
  Sun,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useTheme, type ThemeMode } from "@/lib/theme";

const APP_VERSION = "v1.0.0";

/**
 * Shared enterprise authentication shell used across sign in, sign up,
 * forgot password, reset password, and verify email. Provides the top bar
 * (brand + theme toggle), centered glass card, on-demand Learn More modal,
 * and legal footer with app version.
 */
export function AuthShell({
  children,
  showLearnMore = true,
  sidePanel,
}: {
  children: ReactNode;
  showLearnMore?: boolean;
  sidePanel?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute top-1/2 -right-32 h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-[130px]" />
        <div className="absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <header className="relative z-10 flex items-center justify-between px-5 py-4 sm:px-8">
        <BrandLockup size="sm" tagline={false} />
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        {sidePanel ? (
          <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div className="mx-auto w-full max-w-[440px] lg:mx-0">
              <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
                {children}
              </div>
              {showLearnMore && (
                <div className="mt-5 flex justify-center lg:justify-start">
                  <LearnMoreDialog />
                </div>
              )}
            </div>
            <div className="hidden lg:block">{sidePanel}</div>
          </div>
        ) : (
          <div className="w-full max-w-[440px]">
            <div className="rounded-2xl border border-border/70 bg-card/70 p-6 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] backdrop-blur-xl sm:p-8">
              {children}
            </div>
            {showLearnMore && (
              <div className="mt-5 flex justify-center">
                <LearnMoreDialog />
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-border/50 bg-background/50 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:px-8">
          <p>&copy; {new Date().getFullYear()} Zenwork · {APP_VERSION}</p>
          <nav className="flex items-center gap-4">
            <a href="#" className="hover:text-foreground transition-colors">Privacy</a>
            <a href="#" className="hover:text-foreground transition-colors">Terms</a>
            <a href="#" className="hover:text-foreground transition-colors">Security</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

function ThemeToggle() {
  const { prefs, update } = useTheme();
  const Icon = prefs.mode === "light" ? Sun : prefs.mode === "dark" ? Moon : Monitor;
  const options: { value: ThemeMode; label: string; icon: typeof Sun }[] = [
    { value: "light", label: "Light", icon: Sun },
    { value: "dark", label: "Dark", icon: Moon },
    { value: "system", label: "System", icon: Monitor },
  ];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Change theme" className="rounded-lg">
          <Icon className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-36">
        {options.map(({ value, label, icon: I }) => (
          <DropdownMenuItem
            key={value}
            onClick={() => update({ mode: value })}
            className={cn("gap-2", prefs.mode === value && "font-medium")}
          >
            <I className="h-4 w-4" />
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function LearnMoreDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5" />
          Learn more about the platform
        </button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-xl">Zenwork Performance Manager</DialogTitle>
          <DialogDescription>
            The modern quality management platform for Customer Success teams.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <FeatureCard icon={Sparkles} title="AI-assisted feedback" desc="Draft coaching, recognition, and PIP emails in seconds." />
          <FeatureCard icon={BarChart3} title="Analytics & reports" desc="Trends, scorecards, and scheduled PDF/CSV delivery." />
          <FeatureCard icon={Mails} title="Email automation" desc="Deliverability checks, provider webhooks, and SLA reminders." />
          <FeatureCard icon={Zap} title="Coaching workflows" desc="Sessions, action items, and follow-through tracking." />
          <FeatureCard icon={ShieldCheck} title="Enterprise security" desc="Row-level security, audit logs, and role-based access." />
          <FeatureCard icon={LockIcon} title="Approvals & portal" desc="Review workflow with agent acknowledgement portal." />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function FeatureCard({
  icon: Icon,
  title,
  desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/30 p-3">
      <div className="flex items-center gap-2">
        <div className="grid h-7 w-7 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-medium">{title}</p>
      </div>
      <p className="mt-1.5 text-xs text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
