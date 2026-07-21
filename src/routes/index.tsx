import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "QualiPulse" },
      { name: "description", content: "Sign in to QualiPulse." },
      { name: "robots", content: "noindex" },
    ],
  }),
  beforeLoad: async () => {
    if (typeof window === "undefined") {
      throw redirect({ to: "/auth/signin" });
    }
    const { data } = await supabase.auth.getSession();
    throw redirect({ to: data.session ? "/dashboard" : "/auth/signin" });
  },
  component: () => null,
});
