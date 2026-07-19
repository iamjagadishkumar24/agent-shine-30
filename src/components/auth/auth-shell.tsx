import type { ReactNode } from "react";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";
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
  showBrand = true,
}: {
  children: ReactNode;
  showLearnMore?: boolean;
  sidePanel?: ReactNode;
  showBrand?: boolean;
}) {
  const brandBlock = showBrand ? (
    <div className="mb-6 flex flex-col items-center gap-2.5 sm:mb-7">
      <img
        src={zenworkLogo.url}
        alt=""
        aria-hidden="true"
        className="h-9 w-9 sm:h-10 sm:w-10 object-contain rounded-md dark:bg-white/5 dark:ring-1 dark:ring-white/10 dark:p-0.5"
      />
      <h1
        className={cn(
          "font-display font-bold leading-tight tracking-tight text-center whitespace-nowrap",
          "text-[22px] sm:text-[26px] md:text-[28px]",
          "text-indigo-600 dark:text-indigo-300",
          "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600",
          "dark:from-indigo-300 dark:via-violet-300 dark:to-fuchsia-300",
          "bg-clip-text text-transparent",
        )}
      >
        Zenwork Performance Manager
      </h1>
    </div>
  ) : null;

  return (
    <div className="auth-shell relative flex min-h-dvh flex-col text-foreground lg:h-dvh lg:min-h-0 lg:overflow-hidden">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-48 -left-40 h-[560px] w-[560px] rounded-full bg-emerald-500/10 blur-[140px] dark:bg-emerald-400/10" />
        <div className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-indigo-500/10 blur-[140px] dark:bg-indigo-400/10" />
        <div className="absolute bottom-[-180px] left-1/3 h-[440px] w-[440px] rounded-full bg-slate-400/10 blur-[140px] dark:bg-slate-500/10" />
      </div>

      <header className="relative z-10 flex items-center justify-end px-5 py-4 sm:px-8">
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-5 py-8 sm:px-8">
        {sidePanel ? (
          <div className="grid w-full max-w-6xl items-center gap-10 lg:grid-cols-2">
            <div className="mx-auto w-full min-w-0 max-w-[460px] lg:mx-0 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
              <div className="auth-card rounded-[20px] p-7 pt-8 sm:p-10 sm:pt-11">
                {brandBlock}
                {children}
              </div>
              {showLearnMore && (
                <div className="mt-5 flex justify-center lg:justify-start">
                  <LearnMoreDialog />
                </div>
              )}
            </div>
            <div className="hidden min-w-0 lg:block motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">{sidePanel}</div>
          </div>
        ) : (
          <div className="w-full max-w-[460px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <div className="auth-card rounded-[20px] p-7 pt-8 sm:p-10 sm:pt-11">
              {brandBlock}
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
