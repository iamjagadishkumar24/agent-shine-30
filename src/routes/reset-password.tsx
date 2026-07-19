import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Loader2,
  Eye,
  EyeOff,
  Lock,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "Reset password — Zenwork Performance Manager" },
      { name: "description", content: "Set a new password for your Zenwork account." },
      { name: "robots", content: "noindex" },
    ],
  }),
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
    <AuthShell>
      {done ? (
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">Password updated</h1>
          <p className="mt-2 text-sm text-muted-foreground">Redirecting you to sign in…</p>
        </div>
      ) : (
        <>
          <div className="text-center">
            <Link
              to="/auth"
              className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to sign in
            </Link>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">
              Set a new password
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Choose a strong password you haven't used before.
            </p>
          </div>

          {!ready ? (
            <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying reset link…
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="password" className="text-[13px] font-medium">
                  New password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={show ? "text" : "password"}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="At least 8 characters"
                    className="h-11 rounded-lg pl-10 pr-11"
                  />
                  <button
                    type="button"
                    onClick={() => setShow((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
                      Strength: <span className="font-medium text-foreground">{strength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirm" className="text-[13px] font-medium">
                  Confirm password
                </Label>
                <div className="relative">
                  <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={show ? "text" : "password"}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    required
                    placeholder="Re-enter password"
                    className={cn(
                      "h-11 rounded-lg pl-10",
                      confirm.length > 0 && !match && "border-destructive focus-visible:ring-destructive/40",
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
                disabled={!canSubmit}
                className="h-11 w-full rounded-lg text-sm font-semibold"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                <span className="inline-flex items-center gap-2">
                  {loading ? "Updating…" : "Update password"}
                  {!loading && <ArrowRight className="h-4 w-4" />}
                </span>
              </Button>
            </form>
          )}
        </>
      )}
    </AuthShell>
  );
}
