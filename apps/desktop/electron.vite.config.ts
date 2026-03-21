import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';

const workspacePackageExcludes = [
  '@amberkeeper/capture-core',
  '@amberkeeper/provider-claude',
  '@amberkeeper/provider-deepseek',
  '@amberkeeper/provider-gemini',
  '@amberkeeper/provider-chatgpt',
  '@amberkeeper/shared-types',
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
        '@amberkeeper/capture-core': captureCoreEntry,
        '@amberkeeper/provider-claude': providerClaudeEntry,
        '@amberkeeper/provider-deepseek': providerDeepSeekEntry,
        '@amberkeeper/provider-gemini': providerGeminiEntry,
        '@amberkeeper/provider-chatgpt': providerChatGptEntry,
        '@amberkeeper/shared-types': sharedTypesEntry,
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
        '@amberkeeper/capture-core': captureCoreEntry,
        '@amberkeeper/provider-claude': providerClaudeEntry,
        '@amberkeeper/provider-deepseek': providerDeepSeekEntry,
        '@amberkeeper/provider-gemini': providerGeminiEntry,
        '@amberkeeper/provider-chatgpt': providerChatGptEntry,
        '@amberkeeper/shared-types': sharedTypesEntry,
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
        '@amberkeeper/capture-core': captureCoreEntry,
        '@amberkeeper/provider-claude': providerClaudeEntry,
        '@amberkeeper/provider-deepseek': providerDeepSeekEntry,
        '@amberkeeper/provider-gemini': providerGeminiEntry,
        '@amberkeeper/provider-chatgpt': providerChatGptEntry,
        '@amberkeeper/shared-types': sharedTypesEntry,
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
