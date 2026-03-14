import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { FinancialModelRow } from "./useFinancialModel";

export function useModelMutations(orgId: string | null, scenario: string) {
  const queryClient = useQueryClient();
  const queryKey = ["financial_model", orgId, scenario];

  const upsertRow = useMutation({
    mutationFn: async (row: { id: string; amount: number }) => {
      const { error } = await supabase
        .from("financial_model")
        .update({ amount: row.amount })
        .eq("id", row.id);
      if (error) throw error;
    },
    onMutate: async (row) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FinancialModelRow[]>(queryKey);
      queryClient.setQueryData<FinancialModelRow[]>(queryKey, (old) =>
        old?.map((r) => (r.id === row.id ? { ...r, amount: row.amount } : r))
      );
      return { previous };
    },
    onError: (_err, _row, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const addRows = useMutation({
    mutationFn: async (
      rows: Omit<FinancialModelRow, "id">[]
    ) => {
      const { error } = await supabase.from("financial_model").insert(rows);
      if (error) throw error;
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const deleteRow = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("financial_model")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<FinancialModelRow[]>(queryKey);
      queryClient.setQueryData<FinancialModelRow[]>(queryKey, (old) =>
        old?.filter((r) => r.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) queryClient.setQueryData(queryKey, context.previous);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  return { upsertRow, addRows, deleteRow };
}
