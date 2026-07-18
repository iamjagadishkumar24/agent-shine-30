import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/analytics")({
  component: () => (
    <div>
      <PageHeader title="Analytics" subtitle="Deep trends, forecasting, and AI-generated insights." />
      <div className="mx-auto max-w-4xl px-8 pb-12 pt-6">
        <Card className="rounded-xl border-border/60 bg-card/60 p-10 text-center">
          <BarChart3 className="mx-auto h-6 w-6 text-muted-foreground" />
          <h2 className="mt-3 text-sm font-medium">Advanced analytics — coming next</h2>
          <p className="mt-1 text-xs text-muted-foreground">The dashboard has your core trends. Predictive scoring, heat maps, and Sankey flows land here.</p>
        </Card>
      </div>
    </div>
  ),
});
