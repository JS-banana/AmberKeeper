import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const workspacePackageExcludes = [
  '@anychat/capture-core',
  '@anychat/provider-claude',
  '@anychat/provider-deepseek',
  '@anychat/provider-gemini',
  '@anychat/provider-chatgpt',
  '@anychat/shared-types',
];

const sharedTypesEntry = resolve(__dirname, '../../packages/shared-types/src/index.ts');
const captureCoreEntry = resolve(__dirname, '../../packages/capture-core/src/index.ts');
const providerClaudeEntry = resolve(__dirname, '../../packages/provider-claude/src/index.ts');
const providerDeepSeekEntry = resolve(__dirname, '../../packages/provider-deepseek/src/index.ts');
const providerGeminiEntry = resolve(__dirname, '../../packages/provider-gemini/src/index.ts');
const providerChatGptEntry = resolve(__dirname, '../../packages/provider-chatgpt/src/index.ts');

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageExcludes })],
    resolve: {
      alias: {
        '@anychat/capture-core': captureCoreEntry,
        '@anychat/provider-claude': providerClaudeEntry,
        '@anychat/provider-deepseek': providerDeepSeekEntry,
        '@anychat/provider-gemini': providerGeminiEntry,
        '@anychat/provider-chatgpt': providerChatGptEntry,
        '@anychat/shared-types': sharedTypesEntry,
      },
    },
    build: {
      outDir: 'out/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.ts'),
        },
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: workspacePackageExcludes })],
    resolve: {
      alias: {
        '@anychat/capture-core': captureCoreEntry,
        '@anychat/provider-claude': providerClaudeEntry,
        '@anychat/provider-deepseek': providerDeepSeekEntry,
        '@anychat/provider-gemini': providerGeminiEntry,
        '@anychat/provider-chatgpt': providerChatGptEntry,
        '@anychat/shared-types': sharedTypesEntry,
      },
    },
    build: {
      outDir: 'out/preload',
      rollupOptions: {
        input: {
          renderer: resolve(__dirname, 'src/preload/renderer.ts'),
          chat: resolve(__dirname, 'src/preload/chat.ts'),
        },
      },
      isolatedEntries: true,
      externalizeDeps: false,
    },
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    resolve: {
      alias: {
        '@anychat/capture-core': captureCoreEntry,
        '@anychat/provider-claude': providerClaudeEntry,
        '@anychat/provider-deepseek': providerDeepSeekEntry,
        '@anychat/provider-gemini': providerGeminiEntry,
        '@anychat/provider-chatgpt': providerChatGptEntry,
        '@anychat/shared-types': sharedTypesEntry,
      },
    },
    build: {
      outDir: 'out/renderer',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html'),
        },
      },
      isolatedEntries: true,
    },
  },
});
