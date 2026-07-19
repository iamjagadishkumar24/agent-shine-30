import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import zenworkLogo from "@/assets/zenwork-logo.png.asset.json";
import { lovable } from "@/integrations/lovable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Loader2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User as UserIcon,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  Sparkles,
  MessageSquare,
  Users,
  Star,
  Activity,
  BarChart3,
  Bell,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuthSearch = { next?: string };
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: AuthPage,
});

function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/dashboard";
  return next;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const REMEMBER_KEY = "signal.auth.remember-email";

type Mode = "signin" | "signup" | "forgot";

function passwordStrength(pw: string): { score: number; label: string; tone: string } {
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  const clamped = Math.min(score, 4);
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];
  const tones = [
    "bg-destructive",
    "bg-destructive/80",
    "bg-amber-500",
    "bg-emerald-500",
    "bg-emerald-400",
  ];
  return { score: clamped, label: labels[clamped], tone: tones[clamped] };
}

function AuthPage() {
  useNavigate();
  const { next } = Route.useSearch();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean; name?: boolean }>({});

  const destination = safeNext(next);
  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = mode === "signup" ? password.length >= 8 : password.length > 0;
  const nameValid = mode === "signup" ? name.trim().length >= 2 : true;
  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit = !loading && emailValid && (mode === "forgot" ? true : passwordValid) && nameValid;

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        setEmail(saved);
        setRemember(true);
      }
    } catch {}
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = destination;
    });
  }, [destination]);

  const persistRemember = () => {
    try {
      if (remember && emailValid) localStorage.setItem(REMEMBER_KEY, trimmedEmail);
      else localStorage.removeItem(REMEMBER_KEY);
    } catch {}
  };

  const handleEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched({ email: true, password: true, name: true });
    if (!canSubmit) {
      if (!emailValid) toast.error("Enter a valid email address");
      else if (mode !== "forgot" && !passwordValid)
        toast.error(mode === "signup" ? "Password must be at least 8 characters" : "Enter your password");
      else if (!nameValid) toast.error("Enter your full name");
      return;
    }
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setResetSent(true);
        toast.success("Reset link sent — check your inbox");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin + destination,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        persistRemember();
        toast.success("Account created — welcome aboard");
        window.location.href = destination;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: trimmedEmail,
          password,
        });
        if (error) throw error;
        persistRemember();
        window.location.href = destination;
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      const redirectUri = `${window.location.origin}/auth${next ? `?next=${encodeURIComponent(next)}` : ""}`;
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: redirectUri });
      if (result.error) {
        toast.error(result.error.message);
        setLoading(false);
        return;
      }
      if (result.redirected) return;
      window.location.href = destination;
    } catch (err: any) {
      toast.error(err?.message ?? "Google sign-in failed");
      setLoading(false);
    }
  };

  const emailError = touched.email && email.length > 0 && !emailValid;
  const pwError = touched.password && mode === "signup" && password.length > 0 && !passwordValid;
  const nameError = touched.name && mode === "signup" && name.length > 0 && !nameValid;

  return (
    <div className="min-h-dvh bg-white text-slate-900 lg:grid lg:grid-cols-2">
      {/* ============ LEFT — Auth panel ============ */}
      <main className="flex min-h-dvh flex-col px-6 py-8 sm:px-10 sm:py-10 lg:px-16 xl:px-24">
        <div className="mx-auto flex w-full max-w-md flex-1 flex-col">
          {/* Prominent brand — top-center */}
          <div className="flex flex-col items-center pt-2 text-center animate-fade-in">
            <Link
              to="/"
              aria-label="Zenwork Performance Manager — go to home"
              className="group flex flex-col items-center gap-4 rounded-2xl outline-none transition-opacity hover:opacity-95 focus-visible:ring-2 focus-visible:ring-indigo-500/50 focus-visible:ring-offset-4 focus-visible:ring-offset-white"
            >
              <h1
                className="brand-wordmark font-display font-extrabold leading-[1.05] tracking-tight text-[clamp(1.75rem,5.5vw,3rem)] drop-shadow-[0_1px_16px_rgba(99,102,241,0.18)]"
              >
                Zenwork Performance Manager
              </h1>
              <img
                src={zenworkLogo.url}
                alt=""
                aria-hidden="true"
                className="h-14 w-14 object-contain transition-transform duration-300 group-hover:scale-105 sm:h-16 sm:w-16"
              />
            </Link>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
              Driving Customer Success
            </p>
          </div>

          {/* Auth card */}
          <div className="mt-10 flex flex-1 flex-col justify-center">
          <div className="text-center">
            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => { setMode("signin"); setResetSent(false); }}
                className="mb-4 inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
              </button>
            )}
            <h2 className="text-[26px] font-semibold tracking-tight text-slate-900 sm:text-[28px]">
              {mode === "signin" && "Welcome Back"}
              {mode === "signup" && "Create your account"}
              {mode === "forgot" && "Reset your password"}
            </h2>
            <p className="mt-2 text-sm text-slate-500">
              {mode === "signin" && "Sign in to continue to Zenwork Performance Manager"}
              {mode === "signup" && "Join Zenwork Performance Manager and start managing customer success, coaching, feedback, and performance from a single platform."}
              {mode === "forgot" && "We'll email you a secure link to set a new password"}
            </p>
          </div>


          {/* Forgot success */}
          {mode === "forgot" && resetSent ? (
            <div className="mt-8 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-600 shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-emerald-900">Check your inbox</p>
                  <p className="mt-1 text-emerald-800/80">
                    If an account exists for <span className="font-medium">{trimmedEmail}</span>, a reset link is on its way.
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleEmail} className="mt-8 space-y-5">
              {mode === "signup" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-[13px] font-semibold text-slate-800">Full Name</Label>
                  <div className="relative">
                    <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="name"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                      required
                      placeholder="Jane Doe"
                      className={cn(
                        "pl-10 h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500",
                        nameError && "border-red-400 focus-visible:ring-red-400/30",
                      )}
                    />
                  </div>
                  {nameError && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" /> Enter your full name
                    </p>
                  )}
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-[13px] font-semibold text-slate-800">Work Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setTouched((t) => ({ ...t, email: true }))}
                    required
                    placeholder="you@company.com"
                    aria-invalid={emailError || undefined}
                    className={cn(
                      "pl-10 h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500",
                      emailError && "border-red-400 focus-visible:ring-red-400/30",
                    )}
                  />
                </div>
                {emailError && (
                  <p className="flex items-center gap-1 text-xs text-red-600">
                    <AlertCircle className="h-3 w-3" /> Enter a valid email address
                  </p>
                )}
              </div>

              {mode !== "forgot" && (
                <div className="space-y-1.5">
                  <Label htmlFor="password" className="text-[13px] font-semibold text-slate-800">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onBlur={() => setTouched((t) => ({ ...t, password: true }))}
                      required
                      minLength={mode === "signup" ? 8 : undefined}
                      placeholder={mode === "signup" ? "At least 8 characters" : "Enter your password"}
                      aria-invalid={pwError || undefined}
                      className={cn(
                        "pl-10 pr-11 h-12 rounded-xl border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus-visible:ring-2 focus-visible:ring-indigo-500/40 focus-visible:border-indigo-500",
                        pwError && "border-red-400 focus-visible:ring-red-400/30",
                      )}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((s) => !s)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {mode === "signup" && password.length > 0 && (
                    <div className="pt-1">
                      <div className="flex gap-1">
                        {[0, 1, 2, 3].map((i) => (
                          <div
                            key={i}
                            className={cn(
                              "h-1 flex-1 rounded-full transition-colors",
                              i < strength.score ? strength.tone : "bg-slate-200",
                            )}
                          />
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs text-slate-500">
                        Strength: <span className="text-slate-900 font-medium">{strength.label}</span>
                      </p>
                    </div>
                  )}
                  {pwError && (
                    <p className="flex items-center gap-1 text-xs text-red-600">
                      <AlertCircle className="h-3 w-3" /> Must be at least 8 characters
                    </p>
                  )}
                </div>
              )}

              {mode === "signin" && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id="remember"
                      checked={remember}
                      onCheckedChange={(v) => setRemember(v === true)}
                      className="border-slate-300 data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600"
                    />
                    <Label htmlFor="remember" className="text-sm font-normal text-slate-600 cursor-pointer">
                      Remember me
                    </Label>
                  </div>
                  <button
                    type="button"
                    onClick={() => { setMode("forgot"); setResetSent(false); }}
                    className="text-sm font-medium text-indigo-600 hover:text-indigo-700 transition-colors"
                  >
                    Forgot Password?
                  </button>
                </div>
              )}

              <Button
                type="submit"
                disabled={!canSubmit}
                className={cn(
                  "group relative w-full h-12 rounded-xl overflow-hidden",
                  "bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:from-indigo-500 hover:via-violet-500 hover:to-purple-500",
                  "text-white font-semibold shadow-[0_10px_30px_-10px_rgba(99,102,241,0.6)] transition-all",
                  "hover:shadow-[0_16px_40px_-12px_rgba(139,92,246,0.7)] hover:-translate-y-0.5",
                )}
              >
                <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/25 to-transparent group-hover:translate-x-full transition-transform duration-700" />
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                <span className="relative inline-flex items-center gap-2">
                  {mode === "signin" && (loading ? "Signing in…" : "Login")}
                  {mode === "signup" && (loading ? "Creating account…" : "Create account")}
                  {mode === "forgot" && (loading ? "Sending link…" : "Send reset link")}
                  {!loading && <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />}
                </span>
              </Button>

              {mode !== "forgot" && (
                <>
                  <div className="relative flex items-center gap-3 text-[11px] uppercase tracking-wider text-slate-400">
                    <div className="h-px flex-1 bg-slate-200" />
                    <span>or continue with</span>
                    <div className="h-px flex-1 bg-slate-200" />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleGoogle}
                    disabled={loading}
                    className="w-full h-12 rounded-xl border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                  >
                    <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 3.4 14.5 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z"/>
                    </svg>
                    Continue with Google
                  </Button>
                </>
              )}
            </form>
          )}

          {/* Bottom links */}
          {mode !== "forgot" && (
            <p className="mt-8 text-center text-xs text-slate-500">
              By continuing you agree to our{" "}
              <a href="#" className="font-medium text-indigo-600 hover:underline">Terms of Service</a>{" "}
              and{" "}
              <a href="#" className="font-medium text-indigo-600 hover:underline">Privacy Policy</a>.
            </p>
          )}

          {mode !== "forgot" && (
            <p className="mt-4 text-center text-sm text-slate-600">
              {mode === "signin" ? "Don't have an account?" : "Have an account?"}{" "}
              <button
                type="button"
                className="font-semibold text-indigo-600 hover:text-indigo-700"
                onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setTouched({}); }}
              >
                {mode === "signin" ? "Sign Up" : "Sign In"}
              </button>
            </p>
          )}
          </div>
        </div>
      </main>


      {/* ============ RIGHT — Hero panel ============ */}
      <aside className="relative hidden lg:block p-6 xl:p-10">
        <div className="relative h-full w-full overflow-hidden rounded-[32px] bg-gradient-to-br from-indigo-600 via-violet-600 to-purple-700 shadow-[0_30px_80px_-20px_rgba(79,70,229,0.55)]">
          {/* Animated blobs */}
          <div aria-hidden className="pointer-events-none absolute inset-0 motion-reduce:hidden">
            <div className="absolute -top-24 -left-16 h-80 w-80 rounded-full bg-cyan-300/25 blur-3xl animate-blob-slow" />
            <div className="absolute top-1/3 -right-20 h-96 w-96 rounded-full bg-fuchsia-400/25 blur-3xl animate-blob-slower" />
            <div className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-sky-300/20 blur-3xl animate-blob-slow" />
          </div>
          {/* Grid lines */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-[0.12]"
            style={{
              backgroundImage:
                "linear-gradient(to right, white 1px, transparent 1px), linear-gradient(to bottom, white 1px, transparent 1px)",
              backgroundSize: "56px 56px",
            }}
          />

          {/* Content */}
          <div className="relative flex h-full flex-col justify-between p-8 xl:p-12">
            {/* Top row: status pill */}
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-md">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-300 opacity-75 animate-ping" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Live · All systems operational
              </div>
              <div className="inline-flex items-center gap-1.5 rounded-full border border-white/25 bg-white/10 px-3 py-1 text-xs text-white/90 backdrop-blur-md">
                <ShieldCheck className="h-3.5 w-3.5" /> SOC 2 · GDPR
              </div>
            </div>

            {/* Dashboard mock */}
            <div className="relative my-8 flex-1">
              {/* Main dashboard card */}
              <div className="relative mx-auto max-w-[520px] rounded-2xl border border-white/25 bg-white/10 p-5 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-white/70">Customer Success Dashboard</p>
                    <p className="mt-1 text-sm font-semibold text-white">This week overview</p>
                  </div>
                  <div className="inline-flex items-center gap-1 rounded-lg bg-emerald-400/20 px-2 py-1 text-[11px] font-semibold text-emerald-100">
                    <TrendingUp className="h-3 w-3" /> +18%
                  </div>
                </div>

                {/* KPIs */}
                <div className="mt-4 grid grid-cols-3 gap-3">
                  <KPI icon={Star} label="Quality" value="94.2" suffix="%" tone="from-amber-300 to-orange-300" />
                  <KPI icon={MessageSquare} label="Feedback" value="248" tone="from-cyan-300 to-sky-300" />
                  <KPI icon={Users} label="Coaching" value="36" tone="from-emerald-300 to-teal-300" />
                </div>

                {/* Animated chart */}
                <div className="mt-4 rounded-xl border border-white/15 bg-white/5 p-3">
                  <div className="flex items-center justify-between text-[11px] text-white/70">
                    <span className="inline-flex items-center gap-1.5"><BarChart3 className="h-3 w-3" /> Feedback trend</span>
                    <span>7d</span>
                  </div>
                  <svg viewBox="0 0 300 80" className="mt-2 h-16 w-full">
                    <defs>
                      <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="rgb(165 243 252)" stopOpacity="0.6" />
                        <stop offset="100%" stopColor="rgb(165 243 252)" stopOpacity="0" />
                      </linearGradient>
                      <linearGradient id="chartStroke" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#a5f3fc" />
                        <stop offset="100%" stopColor="#f0abfc" />
                      </linearGradient>
                    </defs>
                    <path
                      d="M0,60 L30,48 L60,52 L90,36 L120,42 L150,28 L180,32 L210,20 L240,24 L270,14 L300,10 L300,80 L0,80 Z"
                      fill="url(#chartFill)"
                    />
                    <path
                      d="M0,60 L30,48 L60,52 L90,36 L120,42 L150,28 L180,32 L210,20 L240,24 L270,14 L300,10"
                      fill="none"
                      stroke="url(#chartStroke)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="animate-dash motion-reduce:animate-none"
                      style={{ strokeDasharray: 800, strokeDashoffset: 0 }}
                    />
                  </svg>
                </div>

                {/* Progress rows */}
                <div className="mt-4 space-y-3">
                  <ProgressRow label="CSAT" value={92} tone="bg-emerald-400" />
                  <ProgressRow label="First Response" value={78} tone="bg-cyan-300" />
                  <ProgressRow label="Resolution Rate" value={85} tone="bg-fuchsia-300" />
                </div>
              </div>

              {/* Floating cards */}
              <FloatingCard
                className="absolute -top-4 -left-2 xl:-left-6 hidden sm:block animate-float-slow"
                icon={Sparkles}
                title="AI Insight"
                subtitle="Escalation risk down"
                accent="from-fuchsia-400 to-pink-400"
              />
              <FloatingCard
                className="absolute -bottom-2 -right-2 xl:-right-6 animate-float-slower"
                icon={Bell}
                title="Approval queued"
                subtitle="3 pending reviews"
                accent="from-cyan-300 to-sky-400"
              />
              <FloatingCard
                className="absolute top-1/2 -right-4 xl:right-2 hidden xl:block animate-float-slow"
                icon={Activity}
                title="Live activity"
                subtitle="12 sessions today"
                accent="from-emerald-300 to-teal-400"
              />
            </div>

            {/* Bottom copy */}
            <div className="max-w-md text-white">
              <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-[1.15]">
                Seamless quality experience
              </h2>
              <p className="mt-3 text-sm text-white/80 leading-relaxed">
                Feedback, coaching, and analytics for Customer Success — unified in a single, intelligent workspace.
              </p>
              <div className="mt-5 flex items-center gap-1.5">
                <span className="h-1.5 w-8 rounded-full bg-white" />
                <span className="h-1.5 w-2 rounded-full bg-white/50" />
                <span className="h-1.5 w-2 rounded-full bg-white/50" />
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function KPI({
  icon: Icon,
  label,
  value,
  suffix,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-white/15 bg-white/5 p-3 backdrop-blur">
      <div className={cn("inline-flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br text-slate-900", tone)}>
        <Icon className="h-3.5 w-3.5" />
      </div>
      <p className="mt-2 text-[10px] uppercase tracking-wider text-white/70">{label}</p>
      <p className="mt-0.5 text-lg font-semibold text-white tabular-nums">
        {value}
        {suffix && <span className="text-xs text-white/70">{suffix}</span>}
      </p>
    </div>
  );
}

function ProgressRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div>
      <div className="flex items-center justify-between text-[11px] text-white/80">
        <span>{label}</span>
        <span className="tabular-nums">{value}%</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
        <div
          className={cn("h-full rounded-full animate-progress-in motion-reduce:animate-none", tone)}
          style={{ width: `${value}%` }}
        />
      </div>
    </div>
  );
}

function FloatingCard({
  className,
  icon: Icon,
  title,
  subtitle,
  accent,
}: {
  className?: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  subtitle: string;
  accent: string;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-2xl border border-white/25 bg-white/15 px-3 py-2.5 backdrop-blur-xl shadow-xl",
        className,
      )}
    >
      <div className={cn("grid h-8 w-8 place-items-center rounded-xl bg-gradient-to-br text-slate-900", accent)}>
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-semibold text-white leading-tight">{title}</p>
        <p className="text-[10px] text-white/70 leading-tight">{subtitle}</p>
      </div>
    </div>
  );
}
