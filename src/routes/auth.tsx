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
  Sparkles,
  Loader2,
  Eye,
  EyeOff,
  Mail,
  Lock,
  User as UserIcon,
  ArrowLeft,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

type AuthSearch = { next?: string };
export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): AuthSearch =>
    typeof s.next === "string" ? { next: s.next } : {},
  component: AuthPage,
});

// Only accept same-origin relative paths so OAuth returns cannot bounce off-site.
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
  const navigate = useNavigate();
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

  const canSubmit =
    !loading &&
    emailValid &&
    (mode === "forgot" ? true : passwordValid) &&
    nameValid;

  // Restore remembered email
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
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Ambient background */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute top-1/3 -right-32 h-[480px] w-[480px] rounded-full bg-fuchsia-500/20 blur-[130px]" />
        <div className="absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-400/15 blur-[120px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
      </div>

      <div className="relative grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
        {/* Left — brand / testimonial */}
        <aside className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground shadow-lg shadow-primary/30">
              <Sparkles className="h-4.5 w-4.5" />
            </div>
            <span className="text-lg font-semibold tracking-tight">Zenwork Performance Manager</span>
          </Link>

          <div className="space-y-8 max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/40 px-3 py-1 text-xs backdrop-blur">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-muted-foreground">All systems operational</span>
            </div>
            <p className="text-3xl xl:text-4xl font-medium leading-[1.15] tracking-tight">
              The quality operating system for modern support teams.
            </p>
            <p className="text-base text-muted-foreground leading-relaxed">
              Automate QA feedback, coaching, and reporting across every agent — with the polish of Linear and the depth of an enterprise platform.
            </p>

            <blockquote className="rounded-2xl border border-border/60 bg-background/40 p-5 backdrop-blur-xl">
              <p className="text-sm leading-relaxed">
                "We replaced four spreadsheets and a Trello board with Signal. QA scores are up 18% in a quarter."
              </p>
              <footer className="mt-3 text-xs text-muted-foreground">
                — Head of Support Operations, Fintech Co.
              </footer>
            </blockquote>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5" /> SOC 2
            </span>
            <span>·</span>
            <span>GDPR ready</span>
            <span>·</span>
            <span>256-bit encryption</span>
          </div>
        </aside>

        {/* Right — form */}
        <main className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-md">
            <div className="rounded-2xl border border-border/60 bg-background/50 p-7 sm:p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl">
              {/* Mobile brand */}
              <Link to="/" className="lg:hidden flex items-center gap-2 mb-6">
                <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground">
                  <Sparkles className="h-4 w-4" />
                </div>
                <span className="font-semibold tracking-tight">Zenwork Performance Manager</span>
              </Link>

              {mode === "forgot" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMode("signin");
                    setResetSent(false);
                  }}
                  className="mb-4 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  Back to sign in
                </button>
              ) : null}

              <h1 className="text-2xl font-semibold tracking-tight">
                {mode === "signin" && "Welcome back"}
                {mode === "signup" && "Create your workspace"}
                {mode === "forgot" && "Reset your password"}
              </h1>
              <p className="mt-1.5 text-sm text-muted-foreground">
                {mode === "signin" && "Sign in to continue to Signal."}
                {mode === "signup" && "Free while in beta — no credit card required."}
                {mode === "forgot" && "We'll email you a secure link to set a new password."}
              </p>

              {mode === "forgot" && resetSent ? (
                <div className="mt-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-500 shrink-0" />
                    <div className="text-sm">
                      <p className="font-medium">Check your inbox</p>
                      <p className="mt-1 text-muted-foreground">
                        If an account exists for <span className="text-foreground">{trimmedEmail}</span>, a reset link is on its way. It may take a minute to arrive.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {mode !== "forgot" && (
                    <>
                      <Button
                        variant="outline"
                        className="mt-6 w-full h-11 bg-background/60 backdrop-blur hover:bg-background/80"
                        onClick={handleGoogle}
                        disabled={loading}
                      >
                        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden>
                          <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.24 1.4-1.7 4.1-5.5 4.1-3.3 0-6-2.7-6-6.1s2.7-6.1 6-6.1c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 3.4 14.5 2.4 12 2.4 6.7 2.4 2.4 6.7 2.4 12S6.7 21.6 12 21.6c6.9 0 9.5-4.8 9.5-7.3 0-.5 0-.9-.1-1.3H12z"/>
                          <path fill="#34A853" d="M3.9 7.4l3.2 2.3C8 8 9.8 6.9 12 6.9c1.9 0 3.1.8 3.8 1.5l2.6-2.5C16.6 4.4 14.5 3.4 12 3.4 8.2 3.4 5 5.6 3.9 7.4z" opacity="0"/>
                        </svg>
                        Continue with Google
                      </Button>

                      <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wider text-muted-foreground">
                        <div className="h-px flex-1 bg-border/60" />
                        <span>or with email</span>
                        <div className="h-px flex-1 bg-border/60" />
                      </div>
                    </>
                  )}

                  <form onSubmit={handleEmail} className="space-y-4">
                    {mode === "signup" && (
                      <div className="space-y-1.5">
                        <Label htmlFor="name">Full name</Label>
                        <div className="relative">
                          <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                          <Input
                            id="name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                            required
                            placeholder="Jane Doe"
                            className={cn("pl-9 h-11", nameError && "border-destructive focus-visible:ring-destructive")}
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
                      <Label htmlFor="email">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                          className={cn("pl-9 h-11", emailError && "border-destructive focus-visible:ring-destructive")}
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
                        <div className="flex items-center justify-between">
                          <Label htmlFor="password">Password</Label>
                          {mode === "signin" && (
                            <button
                              type="button"
                              onClick={() => {
                                setMode("forgot");
                                setResetSent(false);
                              }}
                              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              Forgot password?
                            </button>
                          )}
                        </div>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
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
                            className={cn("pl-9 pr-10 h-11", pwError && "border-destructive focus-visible:ring-destructive")}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((s) => !s)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                              Strength: <span className="text-foreground">{strength.label}</span>
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
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id="remember"
                          checked={remember}
                          onCheckedChange={(v) => setRemember(v === true)}
                        />
                        <Label htmlFor="remember" className="text-sm font-normal cursor-pointer">
                          Remember me on this device
                        </Label>
                      </div>
                    )}

                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-95 shadow-lg shadow-primary/20"
                      disabled={!canSubmit}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {mode === "signin" && (loading ? "Signing in…" : "Sign in")}
                      {mode === "signup" && (loading ? "Creating account…" : "Create account")}
                      {mode === "forgot" && (loading ? "Sending link…" : "Send reset link")}
                    </Button>
                  </form>
                </>
              )}

              {mode !== "forgot" && (
                <p className="mt-6 text-center text-sm text-muted-foreground">
                  {mode === "signin" ? "New to Signal?" : "Have an account?"}{" "}
                  <button
                    type="button"
                    className="font-medium text-foreground underline-offset-4 hover:underline"
                    onClick={() => {
                      setMode(mode === "signin" ? "signup" : "signin");
                      setTouched({});
                    }}
                  >
                    {mode === "signin" ? "Create an account" : "Sign in"}
                  </button>
                </p>
              )}
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              By continuing, you agree to Signal's Terms and Privacy Policy.
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
