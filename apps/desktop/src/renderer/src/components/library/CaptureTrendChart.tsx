import { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { CaptureSessionRecord } from '@amberkeeper/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function CaptureTrendChart(props: { sessions: CaptureSessionRecord[] }) {
  const data = useMemo(() => {
    const now = new Date();
    const days: Array<{ date: string; count: number }> = [];
    const countMap = new Map<string, number>();

    for (const session of props.sessions) {
      const d = session.createdAt.slice(0, 10); // 'YYYY-MM-DD'
      countMap.set(d, (countMap.get(d) ?? 0) + 1);
    }

    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({ date: key, count: countMap.get(key) ?? 0 });
    }

    return days;
  }, [props.sessions]);

  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">30 天会话趋势</CardTitle>
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
                dataKey="date"
                tickFormatter={(v: string) => v.slice(5)}
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
