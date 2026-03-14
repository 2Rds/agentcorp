import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Module-level counter for unique channel names — prevents collision
// when multiple components subscribe to the same table (e.g. Dashboard + workspace)
let channelCounter = 0;

/**
 * Subscribe to Supabase Realtime postgres_changes for a table.
 * On any change matching the filter, invalidates the given TanStack Query keys.
 *
 * @param table - Supabase table name
 * @param filter - RLS filter string, e.g. "org_id=eq.<uuid>"
 * @param queryKeys - TanStack Query keys to invalidate on change
 * @param enabled - gate to prevent subscription when orgId is null
 */
export function useRealtimeSubscription(
  table: string,
  filter: string | null,
  queryKeys: unknown[][],
  enabled = true,
) {
  const queryClient = useQueryClient();
  const queryKeysRef = useRef(queryKeys);
  queryKeysRef.current = queryKeys;

  useEffect(() => {
    if (!enabled || !filter) return;

    const channelId = `rt-${table}-${++channelCounter}`;

    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter },
        () => {
          queryKeysRef.current.forEach(key =>
            queryClient.invalidateQueries({ queryKey: key })
          );
        }
      )
      .subscribe((status, err) => {
        if (status === 'SUBSCRIBED') {
          // Invalidate on subscribe to close the race condition:
          // data inserted between initial fetch and subscription setup
          // would be permanently missed without this.
          queryKeysRef.current.forEach(key =>
            queryClient.invalidateQueries({ queryKey: key })
          );
        } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          console.error(`[Realtime] ${channelId} ${status}:`, err);
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, filter, enabled, queryClient]);
}
