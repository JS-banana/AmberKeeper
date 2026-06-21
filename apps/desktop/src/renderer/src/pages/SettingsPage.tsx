import type {
  CaptureSaveScope,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Section } from '@/components/ui/section';

const SAVE_SCOPE_OPTIONS: Array<{ value: CaptureSaveScope; label: string }> = [
  { value: 'complete', label: '完整对话' },
  { value: 'user', label: '仅我的消息' },
];

export function SettingsPage(props: {
  shellInfo: ShellInfo | null;
  onSetCaptureSaveScope: (saveScope: CaptureSaveScope) => Promise<void> | void;
  onChooseChatDataLocation: () => Promise<void> | void;
  onRestoreDefaultChatDataLocation: () => Promise<void> | void;
}) {
  const chatDataLocation = props.shellInfo?.chatDataLocation;
  const chatDataLocationNotice = chatDataLocation?.pendingDirectory
    ? '重启后生效'
    : chatDataLocation?.status === 'unavailable' && !chatDataLocation.error
      ? '位置不可用'
      : null;

  return (
    <div className="flex flex-col gap-10 py-2">
      <Section title="数据保存">
        <div className="space-y-5">
          <div className="flex items-center gap-4">
            <label className="text-sm font-medium text-foreground" id="save-scope-label">
              保存范围
            </label>
            <Select
              value={props.shellInfo?.captureSaveScope ?? 'complete'}
              onValueChange={(value) => {
                void props.onSetCaptureSaveScope(value as CaptureSaveScope);
              }}
            >
              <SelectTrigger className="w-48" aria-labelledby="save-scope-label">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SAVE_SCOPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0 space-y-3">
                <h3 className="text-sm font-medium text-foreground">聊天数据位置</h3>
                <dl className="grid gap-2 text-sm">
                  <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                    <dt className="shrink-0 text-muted-foreground sm:w-24">当前生效位置</dt>
                    <dd className="break-all text-foreground">
                      {chatDataLocation?.currentDirectory || '未加载'}
                    </dd>
                  </div>
                  {chatDataLocation?.pendingDirectory ? (
                    <div className="flex flex-col gap-1 sm:flex-row sm:gap-3">
                      <dt className="shrink-0 text-muted-foreground sm:w-24">待迁移位置</dt>
                      <dd className="break-all text-foreground">{chatDataLocation.pendingDirectory}</dd>
                    </div>
                  ) : null}
                </dl>
                {chatDataLocationNotice ? (
                  <p className="text-sm text-muted-foreground">{chatDataLocationNotice}</p>
                ) : null}
                {chatDataLocation?.error ? (
                  <p className="text-sm text-destructive">{chatDataLocation.error}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void props.onChooseChatDataLocation();
                  }}
                >
                  选择文件夹
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void props.onRestoreDefaultChatDataLocation();
                  }}
                >
                  恢复默认位置
                </Button>
              </div>
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}
