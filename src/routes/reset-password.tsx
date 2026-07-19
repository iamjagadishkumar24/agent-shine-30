import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Sparkles, Loader2, Eye, EyeOff, Lock, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function strengthOf(pw: string) {
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s++;
  if (/\d/.test(pw)) s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(s, 4);
  const labels = ["Too weak", "Weak", "Fair", "Strong", "Excellent"];
  const tones = ["bg-destructive", "bg-destructive/80", "bg-amber-500", "bg-emerald-500", "bg-emerald-400"];
  return { score, label: labels[score], tone: tones[score] };
}

function ResetPasswordPage() {
  const [ready, setReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const strength = useMemo(() => strengthOf(password), [password]);

  useEffect(() => {
    // Supabase recovery links land here with a `type=recovery` hash and the SDK
    // hydrates a temporary session automatically. Wait for it before showing the form.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const pwValid = password.length >= 8;
  const match = password.length > 0 && password === confirm;
  const canSubmit = ready && !loading && pwValid && match;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) {
      if (!pwValid) toast.error("Password must be at least 8 characters");
      else if (!match) toast.error("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setDone(true);
      toast.success("Password updated");
      setTimeout(() => {
        window.location.href = "/auth";
      }, 1500);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not update password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full bg-primary/25 blur-[120px]" />
        <div className="absolute bottom-[-160px] right-[-100px] h-[480px] w-[480px] rounded-full bg-fuchsia-500/20 blur-[130px]" />
      </div>
      <div className="relative flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <Link to="/" className="mb-6 flex items-center justify-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-md bg-gradient-to-br from-primary to-fuchsia-500 text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">Zenwork Performance Manager</span>
          </Link>

          <div className="rounded-2xl border border-border/60 bg-background/50 p-7 sm:p-8 shadow-2xl shadow-black/20 backdrop-blur-2xl">
            {done ? (
              <div className="text-center">
                <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
                  <CheckCircle2 className="h-6 w-6" />
                </div>
                <h1 className="text-xl font-semibold tracking-tight">Password updated</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">Redirecting you to sign in…</p>
              </div>
            ) : (
              <>
                <h1 className="text-2xl font-semibold tracking-tight">Set a new password</h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  Choose a strong password you haven't used before.
                </p>

                {!ready ? (
                  <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying reset link…
                  </div>
                ) : (
                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="password">New password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="password"
                          type={show ? "text" : "password"}
                          autoComplete="new-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={8}
                          placeholder="At least 8 characters"
                          className="pl-9 pr-10 h-11"
                        />
                        <button
                          type="button"
                          onClick={() => setShow((s) => !s)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-muted"
                          aria-label={show ? "Hide password" : "Show password"}
                          tabIndex={-1}
                        >
                          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                      {password.length > 0 && (
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
                    </div>

                    <div className="space-y-1.5">
                      <Label htmlFor="confirm">Confirm password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="confirm"
                          type={show ? "text" : "password"}
                          value={confirm}
                          onChange={(e) => setConfirm(e.target.value)}
                          required
                          placeholder="Re-enter password"
                          className={cn(
                            "pl-9 h-11",
                            confirm.length > 0 && !match && "border-destructive focus-visible:ring-destructive",
                          )}
                        />
                      </div>
                      {confirm.length > 0 && !match && (
                        <p className="flex items-center gap-1 text-xs text-destructive">
                          <AlertCircle className="h-3 w-3" /> Passwords do not match
                        </p>
                      )}
                    </div>

                    <Button
                      type="submit"
                      className="w-full h-11 bg-gradient-to-r from-primary to-fuchsia-500 hover:opacity-95 shadow-lg shadow-primary/20"
                      disabled={!canSubmit}
                    >
                      {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      {loading ? "Updating…" : "Update password"}
                    </Button>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
