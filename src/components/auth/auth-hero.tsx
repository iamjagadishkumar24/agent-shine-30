import { BarChart3, LineChart, ShieldCheck, KeyRound, UserPlus, Sparkles, TrendingUp, Cloud, CheckCircle2, Lock, Rocket, Users } from "lucide-react";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";

export type AuthHeroVariant = "signin" | "signup" | "forgot" | "reset" | "verify";

/**
 * Branded, unique illustration hero for each auth surface.
 * Uses floating frosted-glass cards + soft gradient blobs — no external art.
 */
export function AuthHero({ variant }: { variant: AuthHeroVariant }) {
  const copy = COPY[variant];
  return (
    <div className="relative flex h-full w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <div className="relative mb-8 h-[300px] w-full">
        {variant === "signin" && <SigninIllustration />}
        {variant === "signup" && <SignupIllustration />}
        {variant === "forgot" && <SecurityIllustration />}
        {variant === "reset" && <SecurityIllustration />}
        {variant === "verify" && <VerifyIllustration />}
      </div>

      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/70 bg-white/70 px-3 py-1 text-[11px] font-medium uppercase tracking-wider text-slate-500 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300">
        <img src={zenworkLogo.url} alt="" aria-hidden className="h-3.5 w-3.5" />
        Zenwork Performance Manager
      </div>

      <h2 className="max-w-md text-3xl font-extrabold leading-tight tracking-tight text-slate-800 dark:text-white xl:text-4xl">
        {copy.title}{" "}
        <span className="bg-gradient-to-r from-emerald-600 via-cyan-600 to-violet-600 bg-clip-text text-transparent dark:from-emerald-300 dark:via-cyan-300 dark:to-violet-300">
          {copy.accent}
        </span>
      </h2>
      <p className="mt-4 max-w-md text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {copy.body}
      </p>

      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        {copy.chips.map(({ icon: Icon, label }) => (
          <span
            key={label}
            className="inline-flex items-center gap-1.5 rounded-full border border-white/70 bg-white/70 px-2.5 py-1 text-[11px] font-medium text-slate-600 backdrop-blur-md dark:border-white/10 dark:bg-white/[0.06] dark:text-slate-300"
          >
            <Icon className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

const COPY: Record<AuthHeroVariant, { title: string; accent: string; body: string; chips: { icon: any; label: string }[] }> = {
  signin: {
    title: "Empowering your team with",
    accent: "Modern Performance",
    body: "Sign in to streamline feedback, coaching, and analytics — the operating system for high-performing Customer Success teams.",
    chips: [
      { icon: TrendingUp, label: "Live analytics" },
      { icon: Sparkles, label: "AI-assisted" },
      { icon: ShieldCheck, label: "Enterprise secure" },
    ],
  },
  signup: {
    title: "Get started with",
    accent: "Zenwork in minutes",
    body: "Join teams using Zenwork to run structured reviews, automated coaching, and executive dashboards — all in one workspace.",
    chips: [
      { icon: Rocket, label: "Fast onboarding" },
      { icon: Users, label: "Team-ready" },
      { icon: Cloud, label: "Cloud-native" },
    ],
  },
  forgot: {
    title: "Your account is",
    accent: "safe with us",
    body: "We'll send a secure recovery link to your email so you can reset your password without losing your workspace history.",
    chips: [
      { icon: ShieldCheck, label: "Encrypted" },
      { icon: KeyRound, label: "One-time link" },
      { icon: Lock, label: "SOC-friendly" },
    ],
  },
  reset: {
    title: "Choose a",
    accent: "strong new password",
    body: "Set a fresh password to keep your workspace secure. We recommend a passphrase you don't use anywhere else.",
    chips: [
      { icon: ShieldCheck, label: "Encrypted" },
      { icon: Lock, label: "Zero-trust" },
      { icon: CheckCircle2, label: "Verified" },
    ],
  },
  verify: {
    title: "One quick step to",
    accent: "activate your account",
    body: "Confirm your email address to unlock your Zenwork workspace, invites, and coaching workflows.",
    chips: [
      { icon: CheckCircle2, label: "Instant activation" },
      { icon: ShieldCheck, label: "Secure" },
      { icon: Sparkles, label: "Personalized" },
    ],
  },
};

/* ---------- Isometric illustrations (pure SVG + Tailwind) ---------- */

function FloatingCard({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <div
      className={`absolute rounded-2xl border border-white/70 bg-white/85 shadow-2xl backdrop-blur-md dark:border-white/10 dark:bg-white/[0.08] motion-safe:animate-[authfloat_6s_ease-in-out_infinite] ${className ?? ""}`}
      style={{ animationDelay: `${delay}s` }}
    >
      {children}
    </div>
  );
}

function SigninIllustration() {
  return (
    <div className="relative h-full w-full">
      <FloatingCard className="left-[8%] top-4 h-56 w-48 -rotate-6 p-4" delay={0}>
        <div className="mb-3 flex gap-1">
          <span className="h-2 w-2 rounded-full bg-rose-400" />
          <span className="h-2 w-2 rounded-full bg-amber-400" />
          <span className="h-2 w-2 rounded-full bg-emerald-400" />
        </div>
        <div className="space-y-2">
          <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="h-2 w-3/4 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="mt-3 h-20 rounded-lg bg-gradient-to-br from-emerald-50 to-cyan-50 p-2 dark:from-emerald-900/30 dark:to-cyan-900/30">
            <svg viewBox="0 0 100 40" className="h-full w-full">
              <path d="M0 30 Q20 5 40 25 T80 15 T100 25" stroke="#10b981" strokeWidth="2" fill="none" />
              <path d="M0 30 Q20 5 40 25 T80 15 T100 25 L100 40 L0 40 Z" fill="#10b981" opacity="0.15" />
            </svg>
          </div>
          <div className="flex gap-1.5">
            <div className="h-6 w-8 rounded bg-emerald-100 dark:bg-emerald-900/30" />
            <div className="h-6 w-8 rounded bg-cyan-100 dark:bg-cyan-900/30" />
            <div className="h-6 w-8 rounded bg-violet-100 dark:bg-violet-900/30" />
          </div>
        </div>
      </FloatingCard>

      <FloatingCard className="right-[8%] top-16 h-32 w-52 rotate-6 p-4" delay={1.4}>
        <div className="mb-1.5 text-[9px] font-bold uppercase tracking-widest text-slate-400">Quality Score</div>
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-extrabold text-slate-800 dark:text-white">92.4%</span>
          <span className="text-[10px] font-semibold text-emerald-600">+4.1%</span>
        </div>
        <div className="mt-3 flex h-8 items-end gap-1">
          {[40, 55, 48, 62, 58, 71, 68].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm bg-gradient-to-t from-emerald-400 to-cyan-400" style={{ height: `${h}%` }} />
          ))}
        </div>
      </FloatingCard>

      <FloatingCard className="bottom-2 left-1/2 h-24 w-56 -translate-x-1/2 rotate-2 p-3" delay={0.7}>
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-md">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="flex-1 space-y-1.5">
            <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
            <div className="h-2 w-2/3 rounded-full bg-slate-100 dark:bg-slate-700" />
          </div>
          <div className="text-[10px] font-bold text-emerald-600">LIVE</div>
        </div>
      </FloatingCard>
    </div>
  );
}

function SignupIllustration() {
  return (
    <div className="relative h-full w-full">
      <FloatingCard className="left-1/2 top-2 h-56 w-56 -translate-x-1/2 rotate-0 p-4" delay={0}>
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-emerald-500 via-cyan-500 to-violet-500 text-white shadow-lg">
            <UserPlus className="h-7 w-7" />
          </div>
          <div className="h-2 w-24 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="mt-2 flex w-full gap-1.5">
            <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
            <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
            <div className="h-1.5 flex-1 rounded-full bg-emerald-500" />
            <div className="h-1.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>
          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">3 of 4 steps</span>
        </div>
      </FloatingCard>

      <FloatingCard className="left-[4%] bottom-4 h-24 w-32 -rotate-12 p-3" delay={1}>
        <Cloud className="h-5 w-5 text-cyan-500" />
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
        <div className="mt-1.5 h-2 w-2/3 rounded-full bg-slate-100 dark:bg-slate-700" />
      </FloatingCard>

      <FloatingCard className="right-[4%] bottom-8 h-24 w-32 rotate-12 p-3" delay={1.6}>
        <Sparkles className="h-5 w-5 text-violet-500" />
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
        <div className="mt-1.5 h-2 w-2/3 rounded-full bg-slate-100 dark:bg-slate-700" />
      </FloatingCard>
    </div>
  );
}

function SecurityIllustration() {
  return (
    <div className="relative h-full w-full">
      <FloatingCard className="left-1/2 top-2 h-52 w-52 -translate-x-1/2 rotate-0 p-6" delay={0}>
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-full bg-gradient-to-br from-emerald-500 to-cyan-500 text-white shadow-xl ring-8 ring-emerald-500/10">
            <ShieldCheck className="h-8 w-8" />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-emerald-600">Secure recovery</div>
          <div className="h-2 w-24 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
        </div>
      </FloatingCard>

      <FloatingCard className="left-[4%] bottom-6 h-20 w-28 -rotate-12 p-3" delay={1}>
        <KeyRound className="h-5 w-5 text-violet-500" />
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
      </FloatingCard>

      <FloatingCard className="right-[4%] bottom-10 h-20 w-28 rotate-12 p-3" delay={1.6}>
        <Lock className="h-5 w-5 text-emerald-500" />
        <div className="mt-2 h-2 w-full rounded-full bg-slate-100 dark:bg-slate-700" />
      </FloatingCard>
    </div>
  );
}

function VerifyIllustration() {
  return (
    <div className="relative h-full w-full">
      <FloatingCard className="left-1/2 top-2 h-52 w-56 -translate-x-1/2 p-5" delay={0}>
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-500 text-white shadow-xl">
            <LineChart className="h-7 w-7" />
          </div>
          <div className="text-[11px] font-bold uppercase tracking-widest text-cyan-600">Almost there</div>
          <div className="h-2 w-24 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="h-2 w-16 rounded-full bg-slate-100 dark:bg-slate-700" />
          <div className="mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            <span className="text-[10px] font-semibold text-slate-500">Check your inbox</span>
          </div>
        </div>
      </FloatingCard>
    </div>
  );
}
