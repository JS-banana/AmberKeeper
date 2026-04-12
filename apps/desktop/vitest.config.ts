import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@amberkeeper/capture-core': resolve(__dirname, '../../packages/capture-core/src/index.ts'),
      '@amberkeeper/provider-claude': resolve(__dirname, '../../packages/provider-claude/src/index.ts'),
      '@amberkeeper/provider-deepseek': resolve(__dirname, '../../packages/provider-deepseek/src/index.ts'),
      '@amberkeeper/provider-doubao': resolve(__dirname, '../../packages/provider-doubao/src/index.ts'),
      '@amberkeeper/provider-gemini': resolve(__dirname, '../../packages/provider-gemini/src/index.ts'),
      '@amberkeeper/provider-grok': resolve(__dirname, '../../packages/provider-grok/src/index.ts'),
      '@amberkeeper/provider-chatgpt': resolve(__dirname, '../../packages/provider-chatgpt/src/index.ts'),
      '@amberkeeper/provider-kimi': resolve(__dirname, '../../packages/provider-kimi/src/index.ts'),
      '@amberkeeper/provider-qianwen': resolve(__dirname, '../../packages/provider-qianwen/src/index.ts'),
      '@amberkeeper/provider-xiaomi-aistudio': resolve(
        __dirname,
        '../../packages/provider-xiaomi-aistudio/src/index.ts'
      ),
      '@amberkeeper/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
      '@': resolve(__dirname, 'src/renderer/src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/renderer/src/**/*.test.tsx'],
  },
});
