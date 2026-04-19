import type { ShellInfo } from '@amberkeeper/shared-types';
import { ExternalLink, Bug } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PROJECT_URL = 'https://github.com/JS-banana/amberkeeper';
const FEEDBACK_URL = 'https://github.com/JS-banana/amberkeeper/issues';

function openInBrowser(url: string) {
  void window.captureApi.openExternal(url);
}

export function AboutPage(props: { shellInfo: ShellInfo | null }) {
  const version = props.shellInfo?.appVersion ?? '开发环境';

  return (
    <section className="flex flex-col items-center justify-center flex-1 min-h-0 px-6 py-12">
      <div className="flex flex-col items-center text-center gap-3 mb-10">
        <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary text-2xl font-bold">
          A
        </div>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">AmberKeeper</h1>
          <p className="text-sm text-muted-foreground mt-1">
            多 AI Provider 本地对话工作台
          </p>
        </div>
      </div>

      <div className="mb-8">
        <MetaCard label="当前版本" value={version} />
      </div>

      <div className="flex gap-3">
        <Button onClick={() => openInBrowser(PROJECT_URL)}>
          <ExternalLink className="size-4 mr-2" />
          GitHub 项目
        </Button>
        <Button variant="outline" onClick={() => openInBrowser(FEEDBACK_URL)}>
          <Bug className="size-4 mr-2" />
          反馈问题
        </Button>
      </div>
    </section>
  );
}

function MetaCard(props: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-4 text-center">
      <div className="text-xs text-muted-foreground">{props.label}</div>
      <div className="text-base font-semibold tabular-nums mt-1 text-foreground">{props.value}</div>
    </div>
  );
}
