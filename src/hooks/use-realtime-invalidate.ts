import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type QueryKey = readonly unknown[];

/**
 * Subscribe to Postgres change events on a table via Supabase Realtime and
 * invalidate the given React Query keys whenever anything changes. RLS still
 * applies — subscribers only receive rows they can SELECT.
 *
 * Usage:
 *   useRealtimeInvalidate("feedback", [["feedback-list"], ["dashboard"]]);
 *
 * Optional `filter` maps to Postgres CDC filter syntax, e.g. `agent_id=eq.${id}`.
 */
export function useRealtimeInvalidate(
  table: string,
  invalidateKeys: QueryKey[],
  options?: { filter?: string; enabled?: boolean },
) {
  const qc = useQueryClient();
  const enabled = options?.enabled ?? true;
  const filter = options?.filter;
  // Stable key list for the effect dependency
  const depKey = JSON.stringify(invalidateKeys);

  useEffect(() => {
    if (!enabled) return;
    const channelName = `rt:${table}:${filter ?? "all"}:${Math.random().toString(36).slice(2, 8)}`;
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes" as never,
        { event: "*", schema: "public", table, ...(filter ? { filter } : {}) },
        () => {
          for (const key of invalidateKeys) {
            qc.invalidateQueries({ queryKey: key });
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter, enabled, depKey, qc]);
}
