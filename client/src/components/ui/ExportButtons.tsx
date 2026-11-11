import { Download } from 'lucide-react';
import { useState } from 'react';
import { download } from '../../lib/api';
import { Button } from './Button';

const FILES = [
  { key: 'inventory', label: 'Stock log', path: '/exports/inventory.csv', name: 'inventory-log.csv' },
  { key: 'donations', label: 'Donations', path: '/exports/donations.csv', name: 'donations.csv' },
] as const;

/** Two CSV downloads for hospital staff. Opens straight in Excel or Google Sheets. */
export function ExportButtons() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const run = async (f: (typeof FILES)[number]) => {
    setBusy(f.key); setError('');
    try { await download(f.path, f.name); } catch (e) { setError(e instanceof Error ? e.message : 'Download failed.'); } finally { setBusy(null); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      {FILES.map((f) => (
        <Button key={f.key} size="sm" variant="outline" loading={busy === f.key} icon={<Download className="size-4" />} onClick={() => run(f)}>{f.label} CSV</Button>
      ))}
      {error && <span role="alert" className="text-xs font-semibold text-brand-700">{error}</span>}
    </div>
  );
}
