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
      toast.error("Missing email address — return to sign up to request a new link");
      return;
    }
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/dashboard` },
      });
      if (error) throw error;
      toast.success("Verification email sent");
      setCooldown(30);
    } catch (err: any) {
      toast.error(err?.message ?? "Could not resend verification email");
    } finally {
      setResending(false);
    }
  };

  return (
    <AuthShell>
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
        </>
      )}
    </AuthShell>
  );
}
