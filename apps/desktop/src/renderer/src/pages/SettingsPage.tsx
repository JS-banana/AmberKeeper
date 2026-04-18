import type {
  InterfaceLanguage,
  ShellInfo,
} from '@amberkeeper/shared-types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Section } from '@/components/ui/section';

const LANGUAGE_OPTIONS: Array<{ value: InterfaceLanguage; label: string }> = [
  { value: 'system', label: '跟随系统' },
  { value: 'zh-CN', label: '简体中文' },
  { value: 'en', label: 'English' },
];

export function SettingsPage(props: {
  shellInfo: ShellInfo | null;
  onSetInterfaceLanguage: (language: InterfaceLanguage) => Promise<void> | void;
}) {
  return (
    <div className="flex flex-col gap-10 py-2">
      <Section title="外观与语言">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-foreground" id="lang-label">
            界面语言
          </label>
          <Select
            value={props.shellInfo?.interfaceLanguage ?? 'system'}
            onValueChange={(value) => {
              void props.onSetInterfaceLanguage(value as InterfaceLanguage);
            }}
          >
            <SelectTrigger className="w-48" aria-labelledby="lang-label">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LANGUAGE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>
    </div>
  );
}
