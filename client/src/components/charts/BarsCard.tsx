import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card } from '../ui/Misc';

export interface Series {
  key: string;
  label: string;
  color: string;
}

interface Props {
  title: string;
  subtitle?: string;
  data: Record<string, string | number>[];
  xKey: string;
  series: Series[];
  stacked?: boolean;
  emptyText: string;
  height?: number;
}

/** One chart component for every dashboard: real rows in, honest empty state when they are all zero. */
export function BarsCard({ title, subtitle, data, xKey, series, stacked, emptyText, height = 260 }: Props) {
  const total = data.reduce((sum, row) => sum + series.reduce((s, k) => s + Number(row[k.key] ?? 0), 0), 0);
  return (
    <Card className="p-6 sm:p-7">
      <div className="mb-5">
        <h2 className="text-xl font-bold text-ink-900">{title}</h2>
        {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
      </div>
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 4, left: -24, bottom: 0 }} barCategoryGap="22%">
            <CartesianGrid vertical={false} stroke="#e2e5e9" />
            <XAxis dataKey={xKey} tickLine={false} axisLine={false} tick={{ fill: '#4f5762', fontSize: 12, fontWeight: 600 }} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: '#98a0aa', fontSize: 12 }} />
            <Tooltip
              cursor={{ fill: 'rgba(207,42,47,0.06)' }}
              contentStyle={{ borderRadius: 14, border: '1px solid #e2e5e9', boxShadow: '0 8px 24px -12px rgba(0,0,0,.2)', fontSize: 13 }}
            />
            {series.length > 1 && <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />}
            {series.map((s, i) => (
              <Bar
                key={s.key}
                dataKey={s.key}
                name={s.label}
                fill={s.color}
                stackId={stacked ? 'a' : undefined}
                radius={stacked ? (i === series.length - 1 ? [8, 8, 0, 0] : 0) : [8, 8, 3, 3]}
                maxBarSize={44}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {total === 0 && <p className="mt-3 text-center text-sm text-ink-500">{emptyText}</p>}
    </Card>
  );
}

export const CHART = { brand: '#cf2a2f', ink: '#98a0aa', plasma: '#e8b730' };
