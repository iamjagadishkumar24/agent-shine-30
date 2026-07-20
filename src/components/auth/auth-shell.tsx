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
  AlertCircle,
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
 * Premium light-themed authentication shell.
 *
 * A single unified frame used by Sign In, Sign Up, Forgot Password,
 * Reset Password and Verify Email. On lg+ viewports it renders a
 * split-screen frosted-glass container: a floating auth card on the
 * left (~42%) and a branded illustration hero on the right (~58%).
 * On smaller screens the hero collapses and the card takes the full
 * viewport.
 */
export function AuthShell({
  children,
  showLearnMore = true,
  sidePanel,
  showBrand = true,
  loading = false,
  loadingLabel = "Working…",
  error = null,
  onDismissError,
}: {
  children: ReactNode;
  showLearnMore?: boolean;
  sidePanel?: ReactNode;
  showBrand?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onDismissError?: () => void;
}) {
  const brandBlock = showBrand ? (
    <div
      role="group"
      aria-label="Zenwork Performance Manager"
      className="mx-auto mb-5 flex w-full max-w-full flex-col items-center gap-2 px-2 sm:mb-6"
    >
      <img
        src={zenworkLogo.url}
        alt=""
        aria-hidden="true"
        className="block h-12 w-12 shrink-0 object-contain bg-transparent sm:h-14 sm:w-14"
      />
      <h1
        style={{ fontWeight: 800 }}
        className={cn(
          "font-display leading-[1.15] tracking-tight text-center break-words",
          "text-[16px] sm:text-[18px] md:text-[19px]",
          "text-slate-900 dark:text-white",
        )}
      >
        Zenwork Performance Manager
      </h1>
    </div>
  ) : null;

  return (
    <div className="auth-shell relative flex min-h-dvh flex-col text-foreground">
      {/* Ambient gradient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,#e0f2fe_0%,transparent_45%),radial-gradient(ellipse_at_bottom_right,#ede9fe_0%,transparent_45%),linear-gradient(180deg,#f6f9ff,#eef4ff)] dark:bg-[radial-gradient(ellipse_at_top_left,rgba(56,189,248,0.08)_0%,transparent_45%),radial-gradient(ellipse_at_bottom_right,rgba(167,139,250,0.10)_0%,transparent_45%),linear-gradient(180deg,#0b1220,#0a1020)]" />
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-cyan-300/25 blur-[140px] dark:bg-cyan-400/10 animate-[authblob_18s_ease-in-out_infinite]" />
        <div className="absolute top-1/3 -right-40 h-[560px] w-[560px] rounded-full bg-violet-300/25 blur-[150px] dark:bg-violet-400/10 animate-[authblob_22s_ease-in-out_infinite_reverse]" />
        <div className="absolute bottom-[-180px] left-1/3 h-[440px] w-[440px] rounded-full bg-emerald-300/20 blur-[140px] dark:bg-emerald-500/10 animate-[authblob_26s_ease-in-out_infinite]" />
      </div>

      <header className="relative z-10 flex items-center justify-end px-5 py-3 sm:px-8">
        <ThemeToggle />
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-6 sm:px-8">
        {sidePanel ? (
          <div className="mx-auto grid w-full max-w-6xl overflow-hidden rounded-[28px] border border-white/60 bg-white/50 shadow-[0_30px_80px_-30px_rgba(15,23,42,0.25)] backdrop-blur-2xl dark:border-white/10 dark:bg-white/[0.04] lg:grid-cols-[minmax(0,42fr)_minmax(0,58fr)]">
            <div className="flex items-center justify-center p-6 sm:p-10">
              <div className="w-full max-w-[440px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
                <AuthCard loading={loading} loadingLabel={loadingLabel} error={error} onDismissError={onDismissError}>
                  {brandBlock}
                  {children}
                </AuthCard>
                {showLearnMore && (
                  <div className="mt-4 flex justify-center">
                    <LearnMoreDialog />
                  </div>
                )}
              </div>
            </div>
            <div className="relative hidden min-h-[560px] overflow-hidden lg:block motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-700">
              <HeroFrame>{sidePanel}</HeroFrame>
            </div>
          </div>
        ) : (
          <div className="w-full max-w-[460px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-500">
            <AuthCard loading={loading} loadingLabel={loadingLabel} error={error} onDismissError={onDismissError}>
              {brandBlock}
              {children}
            </AuthCard>
            {showLearnMore && (
              <div className="mt-4 flex justify-center">
                <LearnMoreDialog />
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="relative z-10 border-t border-white/50 bg-white/40 backdrop-blur dark:border-white/10 dark:bg-white/[0.03]">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-2 px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:px-8">
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

function HeroFrame({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br from-white/70 via-sky-50/60 to-violet-50/70 p-10 dark:from-white/[0.03] dark:via-white/[0.02] dark:to-white/[0.03]">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-20 -right-20 h-[400px] w-[400px] rounded-full bg-cyan-300/30 blur-[110px] dark:bg-cyan-400/15" />
        <div className="absolute -bottom-16 -left-16 h-[420px] w-[420px] rounded-full bg-violet-300/30 blur-[110px] dark:bg-violet-400/15" />
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-200/20 blur-[130px] dark:bg-emerald-400/10" />
      </div>
      <div className="relative z-10 flex h-full w-full items-center justify-center">
        {children}
      </div>
    </div>
  );
}

function AuthCard({
  children,
  loading,
  loadingLabel,
  error,
  onDismissError,
}: {
  children: ReactNode;
  loading?: boolean;
  loadingLabel?: string;
  error?: string | null;
  onDismissError?: () => void;
}) {
  return (
    <div
      className={cn(
        "auth-card relative overflow-hidden rounded-[24px] border border-white/70 bg-white/80 p-7 shadow-[0_20px_60px_-25px_rgba(15,23,42,0.25)] backdrop-blur-xl",
        "dark:border-white/10 dark:bg-white/[0.06] sm:p-8",
      )}
      aria-busy={loading || undefined}
    >
      {loading && (
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-0.5 overflow-hidden">
          <div className="h-full w-1/3 animate-[authshimmer_1.2s_ease-in-out_infinite] bg-gradient-to-r from-transparent via-primary to-transparent" />
        </div>
      )}

      {error && (
        <div
          role="alert"
          aria-live="assertive"
          tabIndex={-1}
          className="mb-4 flex items-start gap-2.5 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[13px] text-destructive outline-none focus-visible:ring-2 focus-visible:ring-destructive/40 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-top-1 motion-safe:duration-300"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 leading-snug">{error}</span>
          {onDismissError && (
            <button
              type="button"
              onClick={onDismissError}
              className="ml-1 shrink-0 rounded p-0.5 text-destructive/70 hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive/40"
              aria-label="Dismiss error"
            >
              ×
            </button>
          )}
        </div>
      )}

      <div className={cn("relative transition-opacity duration-200", loading && "opacity-70")}>
        {children}
      </div>

      {loading && (
        <div aria-live="polite" className="pointer-events-none absolute inset-0 flex items-end justify-center pb-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/85 px-3 py-1.5 text-xs font-medium text-foreground shadow-sm backdrop-blur">
            <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-primary border-t-transparent" aria-hidden />
            {loadingLabel}
          </div>
        </div>
      )}
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
