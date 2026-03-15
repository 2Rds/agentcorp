import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { ArrowUpDown, Search } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface Column<T> {
  key: string;
  label: string;
  sortable?: boolean;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  searchKeys?: string[];
  searchPlaceholder?: string;
  onRowClick?: (row: T) => void;
}

export function DataTable<T extends Record<string, unknown>>({
  data,
  columns,
  searchKeys,
  searchPlaceholder = 'Search...',
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const filtered = useMemo(() => {
    if (!search || !searchKeys?.length) return data;
    const q = search.toLowerCase();
    return data.filter(row =>
      searchKeys.some(key => {
        const val = row[key];
        return typeof val === 'string' && val.toLowerCase().includes(q);
      })
    );
  }, [data, search, searchKeys]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [filtered, sortKey, sortDir]);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  return (
    <div className="space-y-3">
      {searchKeys && searchKeys.length > 0 && (
        <div className="relative max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="pl-9 h-8 text-xs bg-white/[0.03] border-white/[0.08]"
          />
        </div>
      )}
      <div className="glass-card rounded-xl overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-white/[0.06] hover:bg-transparent">
              {columns.map(col => (
                <TableHead key={col.key} className={cn('text-xs', col.className)}>
                  {col.sortable ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleSort(col.key)}
                      className="h-auto p-0 font-medium text-xs hover:bg-transparent hover:text-foreground gap-1"
                    >
                      {col.label}
                      <ArrowUpDown className="h-3 w-3" />
                    </Button>
                  ) : (
                    col.label
                  )}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} className="text-center py-8 text-muted-foreground text-sm">
                  {search ? 'No matching results' : 'No data'}
                </TableCell>
              </TableRow>
            ) : (
              sorted.map((row, i) => (
                <motion.tr
                  key={i}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                  className={cn(
                    'border-b border-white/[0.04] transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-white/[0.03]'
                  )}
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map(col => (
                    <TableCell key={col.key} className={cn('text-sm', col.className)}>
                      {col.render ? col.render(row) : (row[col.key] as React.ReactNode) ?? '—'}
                    </TableCell>
                  ))}
                </motion.tr>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
