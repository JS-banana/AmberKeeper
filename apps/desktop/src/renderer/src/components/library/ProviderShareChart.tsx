import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import type { CaptureSessionRecord, ProviderRecord } from '@amberkeeper/shared-types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const PROVIDER_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  claude: '#cc785c',
  gemini: '#4285f4',
  deepseek: '#4d6bfe',
  grok: '#000000',
  kimi: '#6366f1',
  qianwen: '#615cee',
  doubao: '#3370ff',
  'xiaomi-aistudio': '#ff6900',
};

export function ProviderShareChart(props: {
  sessions: CaptureSessionRecord[];
  providers: ProviderRecord[];
}) {
  const data = useMemo(() => {
    const countMap = new Map<string, number>();
    for (const s of props.sessions) {
      countMap.set(s.provider, (countMap.get(s.provider) ?? 0) + 1);
    }

    return props.providers
      .filter((p) => p.enabled)
      .map((p) => ({
        name: p.name,
        providerId: p.id,
        count: countMap.get(p.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count);
  }, [props.sessions, props.providers]);

  const hasData = data.some((d) => d.count > 0);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Provider 占比</CardTitle>
      </CardHeader>
      <CardContent>
        {hasData ? (
          <ResponsiveContainer width="100%" height={Math.max(120, data.length * 36)}>
            <BarChart data={data} layout="vertical" margin={{ left: 0, right: 24 }}>
              <XAxis type="number" hide />
              <YAxis
                type="category"
                dataKey="name"
                width={80}
                className="text-xs fill-muted-foreground"
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  borderRadius: '0.5rem',
                  border: '1px solid hsl(35, 20%, 84%)',
                  fontSize: '0.875rem',
                }}
              />
              <Bar dataKey="count" name="会话数" radius={[0, 4, 4, 0]} barSize={20}>
                {data.map((entry) => (
                  <Cell key={entry.providerId} fill={PROVIDER_COLORS[entry.providerId] ?? '#94a3b8'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[120px] text-muted-foreground text-sm">
            暂无数据
          </div>
        )}
      </CardContent>
    </Card>
  );
}
