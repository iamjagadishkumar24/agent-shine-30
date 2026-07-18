import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { GraduationCap } from "lucide-react";

export const Route = createFileRoute("/_authenticated/coaching")({
  component: () => (
    <div>
      <PageHeader title="Coaching" subtitle="1-on-1s, action plans, and follow-through." />
      <div className="mx-auto max-w-4xl px-8 pb-12 pt-6">
        <Card className="rounded-xl border-border/60 bg-card/60 p-10 text-center">
          <GraduationCap className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-medium">Coaching module — coming next</h2>
          <p className="mt-1 text-xs text-muted-foreground">Schedule sessions, assign learning material, and track completion against feedback.</p>
        </Card>
      </div>
    </div>
  ),
});
