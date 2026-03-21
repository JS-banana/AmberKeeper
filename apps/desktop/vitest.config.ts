import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@anychat/capture-core': resolve(__dirname, '../../packages/capture-core/src/index.ts'),
      '@anychat/provider-claude': resolve(__dirname, '../../packages/provider-claude/src/index.ts'),
      '@anychat/provider-deepseek': resolve(__dirname, '../../packages/provider-deepseek/src/index.ts'),
      '@anychat/provider-gemini': resolve(__dirname, '../../packages/provider-gemini/src/index.ts'),
      '@anychat/provider-chatgpt': resolve(__dirname, '../../packages/provider-chatgpt/src/index.ts'),
      '@anychat/shared-types': resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts', 'src/renderer/src/**/*.test.tsx'],
  },
});
