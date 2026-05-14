import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { cn } from '@/lib/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  buildCaptureTrendData,
  CAPTURE_TREND_RANGES,
  type CaptureTrendRange,
} from './capture-trend-data';

export function CaptureTrendChart(props: { sessions: CaptureSessionRecord[] }) {
  const [range, setRange] = useState<CaptureTrendRange>('month');
  const data = useMemo(
    () => buildCaptureTrendData({ sessions: props.sessions, range }),
    [props.sessions, range]
  );

  const hasData = data.some((d) => typeof d.count === 'number' && d.count > 0);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2 space-y-0">
        <CardTitle className="text-base">会话趋势</CardTitle>
        <div className="inline-flex rounded-md bg-muted p-0.5" aria-label="选择会话趋势范围">
          {CAPTURE_TREND_RANGES.map((option) => {
            const active = option.id === range;

            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setRange(option.id)}
                className={cn(
                  'min-w-12 rounded-[5px] px-2.5 py-1 text-xs font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1',
                  active
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="fillAmber" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(32, 90%, 49%)" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="hsl(32, 90%, 49%)" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis
                dataKey="label"
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                allowDecimals={false}
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
                width={30}
              />
              <Tooltip
                labelFormatter={(_, payload) => payload?.[0]?.payload?.key ?? ''}
                contentStyle={{
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(35, 20%, 84%)',
                  fontSize: '0.875rem',
                }}
              />
              <Area
                type="monotone"
                dataKey="count"
                name="会话数"
                stroke="hsl(32, 90%, 49%)"
                strokeWidth={2}
                fill="url(#fillAmber)"
                connectNulls={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground text-sm">
            <p>还没有任何会话</p>
            <p className="text-xs mt-1">去任意 provider 开始第一次对话</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
