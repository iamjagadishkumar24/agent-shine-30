import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AuthShell } from "@/components/auth/auth-shell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle2, Loader2, Mail, RefreshCw, ArrowLeft, AlertCircle } from "lucide-react";

type Search = { email?: string };

export const Route = createFileRoute("/verify-email")({
  validateSearch: (s: Record<string, unknown>): Search =>
    typeof s.email === "string" ? { email: s.email } : {},
  component: VerifyEmailPage,
  head: () => ({
    meta: [
      { title: "Verify your email — Zenwork Performance Manager" },
      { name: "description", content: "Confirm your email to activate your Zenwork account." },
      { name: "robots", content: "noindex" },
    ],
  }),
});

function VerifyEmailPage() {
  const { email } = Route.useSearch();
  const [status, setStatus] = useState<"pending" | "verified">("pending");
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [feedback, setFeedback] = useState<
    | { kind: "success"; message: string; at: Date; nonce: number }
    | { kind: "error"; message: string; nonce: number }
    | null
  >(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user?.email_confirmed_at) setStatus("verified");
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (session?.user?.email_confirmed_at) setStatus("verified");
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(id);
  }, [cooldown]);

  const handleResend = async () => {
    if (!email) {
      const msg = "Missing email address — return to sign up to request a new link.";
      setFeedback({ kind: "error", message: msg, nonce: Date.now() });
      toast.error(msg);
      return;
    }
    setResending(true);
    setFeedback(null);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      const msg = `Verification email sent to ${email}. Check your inbox and spam folder.`;
      setFeedback({ kind: "success", message: msg, at: new Date(), nonce: Date.now() });
      setCooldown(30);
    } catch (err: any) {
      const msg = err?.message ?? "Could not resend verification email. Please try again.";
      setFeedback({ kind: "error", message: msg, nonce: Date.now() });
      toast.error(msg);
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell loading={resending} loadingLabel="Resending verification email…">
      {status === "verified" ? (
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-emerald-500/15 text-emerald-500">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">Email verified</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your account is ready. Continue to your dashboard.
          </p>
          <Button asChild className="mt-6 h-11 w-full rounded-lg text-sm font-semibold">
            <Link to="/dashboard">Go to dashboard</Link>
          </Button>
        </div>
      ) : (
        <>
          <div className="text-center">
            <div className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
              <Mail className="h-6 w-6" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-[26px]">
              Verify your email
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              We sent a confirmation link to{" "}
              <span className="font-medium text-foreground">
                {email ?? "your inbox"}
              </span>
              . Open it to activate your account.
            </p>
          </div>

          <div className="mt-6 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              Didn't get the email? Check your spam folder, or resend the link below. This page
              updates automatically once verification is complete.
            </p>
          </div>

          <div className="mt-6 space-y-3">
            <Button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown > 0 || !email}
              className="h-11 w-full rounded-lg text-sm font-semibold"
            >
              {resending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {cooldown > 0
                ? `Resend in ${cooldown}s`
                : resending
                  ? "Sending…"
                  : "Resend verification email"}
            </Button>
            <Button asChild variant="outline" className="h-11 w-full rounded-lg">
              <Link to="/auth">
                <ArrowLeft className="mr-2 h-4 w-4" /> Back to sign in
              </Link>
            </Button>
          </div>

          {/* Persistent live regions: keyed by nonce so identical repeated
              messages are re-announced by screen readers. */}
          <div
            role="status"
            aria-live="polite"
            aria-atomic="true"
            className={
              feedback?.kind === "success"
                ? "mt-4 flex items-start gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300"
                : "sr-only"
            }
            key={feedback?.kind === "success" ? `s-${feedback.nonce}` : "s-empty"}
          >
            {feedback?.kind === "success" && (
              <>
                <CheckCircle2 aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <div className="flex-1">
                  <p>
                    <span className="sr-only">Success: </span>
                    {feedback.message}
                  </p>
                  <p className="mt-1 text-xs opacity-80">
                    Sent at {feedback.at.toLocaleTimeString()}
                  </p>
                </div>
              </>
            )}
          </div>

          <div
            role="alert"
            aria-live="assertive"
            aria-atomic="true"
            className={
              feedback?.kind === "error"
                ? "mt-4 flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
                : "sr-only"
            }
            key={feedback?.kind === "error" ? `e-${feedback.nonce}` : "e-empty"}
          >
            {feedback?.kind === "error" && (
              <>
                <AlertCircle aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                <p className="flex-1">
                  <span className="sr-only">Error: </span>
                  {feedback.message}
                </p>
              </>
            )}
          </div>

        </>
      )}
    </AuthShell>
  );
}
