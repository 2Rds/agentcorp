import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCapTable } from '@/hooks/useCapTable';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/workspace/DataTable';
import { EmptyState } from '@/components/workspace/EmptyState';
import { useToast } from '@/hooks/use-toast';
import { Users, Plus, PieChart as PieChartIcon, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const COLORS = [
  'hsl(var(--chart-1))',
  'hsl(var(--chart-2))',
  'hsl(var(--chart-3))',
  'hsl(var(--chart-4))',
  'hsl(var(--chart-5))',
];

const STAKEHOLDER_TYPES = ['founder', 'investor', 'employee', 'advisor', 'option_pool'];

function fmt(n: number | null) {
  if (!n) return '$0';
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n.toFixed(0)}`;
}

function fmtShares(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function AddEntryDialog({ orgId }: { orgId: string }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [type, setType] = useState('investor');
  const [shares, setShares] = useState('');
  const [ownershipPct, setOwnershipPct] = useState('');
  const [investmentAmount, setInvestmentAmount] = useState('');
  const [sharePrice, setSharePrice] = useState('');
  const [roundName, setRoundName] = useState('');

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addEntry = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('cap_table_entries').insert({
        organization_id: orgId,
        stakeholder_name: name,
        stakeholder_type: type,
        shares: Number(shares) || 0,
        ownership_pct: Number(ownershipPct) || 0,
        investment_amount: Number(investmentAmount) || 0,
        share_price: Number(sharePrice) || null,
        round_name: roundName || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cap_table', orgId] });
      toast({ title: 'Entry added' });
      setOpen(false);
      setName(''); setShares(''); setOwnershipPct(''); setInvestmentAmount(''); setSharePrice(''); setRoundName('');
    },
    onError: (err) => toast({ title: 'Failed to add entry', description: String(err), variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-1.5 text-xs"><Plus className="w-3.5 h-3.5" />Add Entry</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add Cap Table Entry</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="name">Stakeholder Name</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sean Weiss" />
          </div>
          <div className="grid gap-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {STAKEHOLDER_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="capitalize">{t.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="shares">Shares</Label>
              <Input id="shares" type="number" value={shares} onChange={(e) => setShares(e.target.value)} placeholder="1,000,000" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="pct">Ownership %</Label>
              <Input id="pct" type="number" step="0.1" value={ownershipPct} onChange={(e) => setOwnershipPct(e.target.value)} placeholder="25.0" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="investment">Investment Amount</Label>
              <Input id="investment" type="number" value={investmentAmount} onChange={(e) => setInvestmentAmount(e.target.value)} placeholder="500000" />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="price">Share Price</Label>
              <Input id="price" type="number" step="0.01" value={sharePrice} onChange={(e) => setSharePrice(e.target.value)} placeholder="0.50" />
            </div>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="round">Round</Label>
            <Input id="round" value={roundName} onChange={(e) => setRoundName(e.target.value)} placeholder="e.g. Pre-Seed, Seed" />
          </div>
          <Button onClick={() => addEntry.mutate()} disabled={!name || addEntry.isPending}>
            {addEntry.isPending ? 'Adding...' : 'Add Entry'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function CapTableTab() {
  const { orgId } = useAuth();
  const { summary, isLoading } = useCapTable(orgId);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const deleteEntry = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('cap_table_entries').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cap_table', orgId] });
      toast({ title: 'Entry deleted' });
    },
    onError: (err) => toast({ title: 'Failed to delete', description: String(err), variant: 'destructive' }),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (!summary.entries.length) return <EmptyState icon={<Users className="h-6 w-6 text-muted-foreground" />} title="No cap table entries" description="Chat with Morgan or add entries manually to build your cap table." />;

  const pieData = summary.entries.map((e) => ({ name: e.stakeholder_name, value: Number(e.ownership_pct) }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Cap Table</h2>
        {orgId && <AddEntryDialog orgId={orgId} />}
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Stakeholders</p><p className="text-2xl font-bold">{summary.entries.length}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Shares</p><p className="text-2xl font-bold font-mono">{fmtShares(summary.totalShares)}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Investment</p><p className="text-2xl font-bold font-mono">{fmt(summary.totalInvestment)}</p></CardContent></Card>
        <Card className="border-border/50"><CardContent className="p-4"><p className="text-xs text-muted-foreground">Types</p><div className="flex flex-wrap gap-1 mt-1">{summary.byType.map((t) => <Badge key={t.type} variant="secondary" className="text-[10px] capitalize">{t.type.replace('_', ' ')} ({t.pct.toFixed(1)}%)</Badge>)}</div></CardContent></Card>
      </div>

      {/* Chart + Table Layout */}
      <div className="grid grid-cols-12 gap-4">
        {/* Pie Chart */}
        <div className="col-span-12 lg:col-span-4">
          <Card className="border-border/50 p-4">
            <div className="flex items-center gap-2 mb-3">
              <PieChartIcon className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-medium">Ownership Distribution</h3>
            </div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Tooltip
                  formatter={(value: number) => `${value.toFixed(1)}%`}
                  contentStyle={{ background: 'hsl(225, 45%, 5.5%)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 8, fontSize: 12 }}
                />
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} innerRadius={40}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-1.5 mt-2">
              {pieData.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ background: COLORS[i % COLORS.length] }} />
                  <span className="text-muted-foreground flex-1 truncate">{d.name}</span>
                  <span className="font-mono">{d.value.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </Card>
        </div>

        {/* Data Table */}
        <div className="col-span-12 lg:col-span-8">
          <DataTable
            data={summary.entries as unknown as Record<string, unknown>[]}
            searchKeys={['stakeholder_name', 'round_name']}
            searchPlaceholder="Search stakeholders..."
            columns={[
              { key: 'stakeholder_name', label: 'Stakeholder', sortable: true, className: 'font-medium' },
              { key: 'stakeholder_type', label: 'Type', sortable: true, render: (row) => <Badge variant="secondary" className={cn('text-[10px] capitalize')}>{String(row.stakeholder_type).replace('_', ' ')}</Badge> },
              { key: 'shares', label: 'Shares', sortable: true, render: (row) => <span className="font-mono text-xs">{fmtShares(Number(row.shares))}</span> },
              { key: 'ownership_pct', label: 'Ownership', sortable: true, render: (row) => <span className="font-mono text-xs">{Number(row.ownership_pct).toFixed(1)}%</span> },
              { key: 'investment_amount', label: 'Invested', sortable: true, render: (row) => <span className="font-mono text-xs">{fmt(Number(row.investment_amount))}</span> },
              { key: 'share_price', label: 'Price', render: (row) => <span className="font-mono text-xs">{Number(row.share_price) ? `$${Number(row.share_price).toFixed(2)}` : '—'}</span> },
              { key: 'round_name', label: 'Round', render: (row) => <span className="text-muted-foreground text-xs">{row.round_name ? String(row.round_name) : '—'}</span> },
              { key: 'id', label: '', render: (row) => (
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => deleteEntry.mutate(String(row.id))}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              )},
            ] as Column<Record<string, unknown>>[]}
          />
        </div>
      </div>
    </div>
  );
}
