import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { AuthShell } from "@/components/auth/auth-shell";
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
} from "lucide-react";
import { cn } from "@/lib/utils";


type AuthSearch = { next?: string; mode?: "signin" | "signup" };
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch => {
    const out: AuthSearch = {};
    if (typeof s.next === "string") out.next = s.next;
    if (s.mode === "signup" || s.mode === "signin") out.mode = s.mode;
    return out;
  },
  component: AuthPage,
  head: () => ({
    meta: [
      { title: "Sign in — Zenwork Performance Manager" },
      { name: "description", content: "Sign in to Zenwork Performance Manager." },
      { name: "robots", content: "noindex" },
    ],
  }),
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
  const { next, mode: initialMode } = Route.useSearch();
  const [mode, setMode] = useState<Mode>(initialMode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [touched, setTouched] = useState<{ email?: boolean; password?: boolean; name?: boolean; confirm?: boolean }>({});

  const destination = safeNext(next);
  const trimmedEmail = email.trim();
  const emailValid = EMAIL_RE.test(trimmedEmail);
  const passwordValid = mode === "signup" ? password.length >= 8 : password.length > 0;
  const nameValid = mode === "signup" ? name.trim().length >= 2 : true;
  const confirmValid = mode === "signup" ? confirmPassword === password && confirmPassword.length > 0 : true;
  const strength = useMemo(() => passwordStrength(password), [password]);
  const canSubmit = !loading && emailValid && (mode === "forgot" ? true : passwordValid) && nameValid && confirmValid;

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
    setTouched({ email: true, password: true, name: true, confirm: true });
    if (!canSubmit) {
      if (!emailValid) toast.error("Enter a valid email address");
      else if (mode !== "forgot" && !passwordValid)
        toast.error(mode === "signup" ? "Password must be at least 8 characters" : "Enter your password");
      else if (!nameValid) toast.error("Enter your full name");
      else if (!confirmValid) toast.error("Passwords do not match");
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
        const { data, error } = await supabase.auth.signUp({
          email: trimmedEmail,
          password,
          options: {
            emailRedirectTo: window.location.origin + destination,
            data: { full_name: name.trim() },
          },
        });
        if (error) throw error;
        persistRemember();
        // If the project requires email confirmation, Supabase returns a user
        // without an active session. Send them to the verify-email screen.
        if (data.session) {
          toast.success("Account created — welcome aboard");
          window.location.href = destination;
        } else {
          toast.success("Check your inbox to verify your email");
          window.location.href = `/verify-email?email=${encodeURIComponent(trimmedEmail)}`;
        }
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
    <AuthShell sidePanel={mode === "signin" ? <SignInMarketingPanel /> : undefined}>
      <>
        <div className="text-center">

              {mode === "forgot" && (
                <button
                  type="button"
                  onClick={() => { setMode("signin"); setResetSent(false); }}
                  className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
                </button>
              )}
              <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">
                {mode === "signin" && "Welcome back"}
                {mode === "signup" && "Create your account"}
                {mode === "forgot" && "Reset your password"}
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "signin" && "Sign in to Zenwork Performance Manager"}
                {mode === "signup" && "Get started in less than a minute"}
                {mode === "forgot" && "We'll email you a secure link to set a new password"}
              </p>
            </div>

            {mode === "forgot" && resetSent ? (
              <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" />
                  <div className="text-sm">
                    <p className="font-medium text-foreground">Check your inbox</p>
                    <p className="mt-1 text-muted-foreground">
                      If an account exists for <span className="font-medium text-foreground">{trimmedEmail}</span>, a reset link is on its way.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleEmail} className="mt-6 space-y-4">
                {mode === "signup" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="name" className="text-[13px] font-medium">Full name</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="name"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                        required
                        placeholder="Jane Doe"
                        autoComplete="name"
                        className={cn(
                          "h-11 rounded-lg pl-10",
                          nameError && "border-destructive focus-visible:ring-destructive/40",
                        )}
                      />
                    </div>
                    {nameError && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
                        <AlertCircle className="h-3 w-3" /> Enter your full name
                      </p>
                    )}
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-[13px] font-medium">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                        "h-11 rounded-lg pl-10",
                        emailError && "border-destructive focus-visible:ring-destructive/40",
                      )}
                    />
                  </div>
                  {emailError && (
                    <p className="flex items-center gap-1 text-xs text-destructive">
                      <AlertCircle className="h-3 w-3" /> Enter a valid email address
                    </p>
                  )}
                </div>

                {mode !== "forgot" && (
                  <div className="space-y-1.5">
                    <Label htmlFor="password" className="text-[13px] font-medium">Password</Label>
                    <div className="relative">
                      <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                          "h-11 rounded-lg pl-10 pr-11",
                          pwError && "border-destructive focus-visible:ring-destructive/40",
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((s) => !s)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                                i < strength.score ? strength.tone : "bg-muted",
                              )}
                            />
                          ))}
                        </div>
                        <p className="mt-1.5 text-xs text-muted-foreground">
                          Strength: <span className="font-medium text-foreground">{strength.label}</span>
                        </p>
                      </div>
                    )}
                    {pwError && (
                      <p className="flex items-center gap-1 text-xs text-destructive">
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
                      />
                      <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                        Remember me
                      </Label>
                    </div>
                    <button
                      type="button"
                      onClick={() => { setMode("forgot"); setResetSent(false); }}
                      className="text-sm font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={!canSubmit}
                  className="h-11 w-full rounded-lg text-sm font-semibold"
                >
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  <span className="inline-flex items-center gap-2">
                    {mode === "signin" && (loading ? "Signing in…" : "Sign in")}
                    {mode === "signup" && (loading ? "Creating account…" : "Create account")}
                    {mode === "forgot" && (loading ? "Sending link…" : "Send reset link")}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </span>
                </Button>

                {mode !== "forgot" && (
                  <>
                    <div className="relative flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                      <div className="h-px flex-1 bg-border" />
                      <span>or</span>
                      <div className="h-px flex-1 bg-border" />
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleGoogle}
                      disabled={loading}
                      className="h-11 w-full rounded-lg"
                    >
                      <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                        <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 3.4 14.5 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z" />
                      </svg>
                      Continue with Google
                    </Button>
                  </>
                )}
              </form>
            )}

            {mode !== "forgot" && (
              <p className="mt-6 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "Don't have an account?" : "Have an account?"}{" "}
                <button
                  type="button"
                  className="font-semibold text-primary hover:underline"
                  onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setTouched({}); }}
                >
                  {mode === "signin" ? "Sign up" : "Sign in"}
                </button>
              </p>
            )}
      </>
    </AuthShell>
  );
}

function SignInMarketingPanel() {
  return (
    <div className="relative">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/70 bg-card/60 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
        <span className="h-1.5 w-1.5 rounded-full bg-primary" />
        AI-powered quality management
      </div>
      <h2 className="mt-5 text-4xl font-semibold leading-[1.05] tracking-tight xl:text-5xl">
        Retire the spreadsheet.
        <br />
        <span className="text-muted-foreground">
          Run Customer Success like a product team.
        </span>
      </h2>
      <p className="mt-5 max-w-md text-sm text-muted-foreground">
        Zenwork Performance Manager is the modern quality management platform for support,
        sales, and success teams. Create feedback, track coaching, and see performance
        trends — all in one place.
      </p>

      <div className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.35)] backdrop-blur-xl">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-4 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-destructive/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-500/60" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/60" />
          <span className="ml-3 text-[11px] text-muted-foreground">
            zenwork · performance
          </span>
        </div>
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Quality score
            </div>
            <div className="mt-1 text-2xl font-semibold">92.4%</div>
            <div className="mt-1 text-xs text-emerald-500">+4.1% vs last week</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Feedback sent
            </div>
            <div className="mt-1 text-2xl font-semibold">1,284</div>
            <div className="mt-1 text-xs text-muted-foreground">Last 30 days</div>
          </div>
          <div className="rounded-lg border border-border/60 bg-background/40 p-3 sm:col-span-2">
            <div className="flex items-center justify-between text-[11px] uppercase tracking-wider text-muted-foreground">
              <span>Team performance</span>
              <span>7d</span>
            </div>
            <div className="mt-3 flex h-14 items-end gap-1.5">
              {[42, 55, 48, 62, 58, 71, 68].map((h, i) => (
                <div
                  key={i}
                  className="flex-1 rounded-sm bg-gradient-to-t from-primary/40 to-primary"
                  style={{ height: `${h}%` }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


