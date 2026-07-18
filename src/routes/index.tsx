import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Sparkles, BarChart3, Zap, ShieldCheck, LayoutDashboard } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal QMS — Retire the spreadsheet. Run QA like a product team." },
      {
        name: "description",
        content:
          "Signal QMS is the modern quality management platform for support, sales, and success teams. Create feedback, track coaching, and see performance trends in one place.",
      },
    ],
  }),
  component: Landing,
});

function useIsAuthed() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setAuthed(!!data.session);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setAuthed(!!session);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);
  return authed;
}

function Landing() {
  const authed = useIsAuthed();

  const primaryCta = authed
    ? { to: "/dashboard" as const, label: "Go to dashboard", Icon: LayoutDashboard }
    : { to: "/auth" as const, label: "Start free", Icon: ArrowRight };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2">
            <div className="grid h-6 w-6 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-3.5 w-3.5" />
            </div>
            <span className="text-sm font-semibold tracking-tight">Signal QMS</span>
          </div>
          <div className="flex items-center gap-2">
            {authed ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                Open app <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            ) : (
              <>
                <Link to="/auth" className="text-sm text-muted-foreground hover:text-foreground">
                  Sign in
                </Link>
                <Link
                  to="/auth"
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  Get started <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-24">
        <div className="max-w-2xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> AI-powered quality management
          </div>
          <h1 className="mt-6 text-5xl font-semibold tracking-tight leading-[1.05]">
            Retire the spreadsheet.
            <br />
            <span className="text-muted-foreground">Run QA like a product team.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base text-muted-foreground">
            Signal is the modern quality management platform for support, sales, and success teams.
            Create feedback, track coaching, and see performance trends — all in one place.
          </p>
          <div className="mt-8 flex items-center gap-3">
            <Link
              to={primaryCta.to}
              className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90"
            >
              {primaryCta.label} <primaryCta.Icon className="h-4 w-4" />
            </Link>
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              See features →
            </a>
          </div>
        </div>

        <section
          id="features"
          className="mt-28 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3"
        >
          {[
            {
              icon: Zap,
              title: "Feedback in seconds",
              body: "Structured feedback with categories, severity, and workflow — draft, review, send, acknowledge.",
            },
            {
              icon: BarChart3,
              title: "Trends you can act on",
              body: "Live QA scores by team, category, and time. Spot regressions before they escalate.",
            },
            {
              icon: ShieldCheck,
              title: "Enterprise-grade",
              body: "Row-level security, granular roles, and audit logs. Ready for 100K+ employees.",
            },
          ].map((f) => (
            <div key={f.title} className="bg-card p-6">
              <f.icon className="h-4 w-4 text-primary" aria-hidden />
              <div className="mt-4 text-sm font-semibold">{f.title}</div>
              <div className="mt-1 text-sm text-muted-foreground">{f.body}</div>
            </div>
          ))}
        </section>
      </main>

      <footer className="border-t border-border/60 py-8">
        <div className="mx-auto max-w-6xl px-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} Signal QMS
        </div>
      </footer>
    </div>
  );
}
