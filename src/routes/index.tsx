import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { BrandLockup } from "@/components/brand/brand-lockup";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Zenwork Performance Manager" },
      { name: "description", content: "Sign in to Zenwork Performance Manager." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) {
        window.location.href = "/dashboard";
      } else {
        setAuthed(false);
      }
    });
    return () => {
      alive = false;
    };
  }, []);

  if (authed === null) {
    return <div className="min-h-dvh bg-background" aria-hidden />;
  }

  return (
    <div className="relative flex min-h-dvh flex-col bg-background text-foreground">
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-primary/15 blur-[130px]" />
        <div className="absolute top-1/2 -right-32 h-[520px] w-[520px] rounded-full bg-fuchsia-500/10 blur-[130px]" />
        <div className="absolute bottom-[-160px] left-1/3 h-[420px] w-[420px] rounded-full bg-cyan-500/10 blur-[130px]" />
      </div>

      <main className="relative z-10 flex flex-1 flex-col items-center justify-center px-6 py-12">
        <BrandLockup size="lg" tagline={false} />
        <p className="mt-6 text-center text-base text-muted-foreground">
          Welcome to Zenwork Performance Manager
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button asChild size="lg" className="min-w-[160px] rounded-lg">
            <Link to="/auth">
              Sign in <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-w-[160px] rounded-lg">
            <Link to="/auth" search={{ next: "/dashboard" } as never}>
              Create account
            </Link>
          </Button>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/50 bg-background/50 py-4 backdrop-blur">
        <div className="mx-auto max-w-6xl px-6 text-center text-xs text-muted-foreground">
          &copy; {new Date().getFullYear()} Zenwork Performance Manager
        </div>
      </footer>
    </div>
  );
}
