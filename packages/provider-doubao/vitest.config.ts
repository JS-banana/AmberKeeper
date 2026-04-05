import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = dirname(fileURLToPath(import.meta.url));

export default {
  test: {
    environment: 'node',
  },
  resolve: {
    alias: {
      '@amberkeeper/shared-types': resolve(currentDir, '../shared-types/src/index.ts'),
    },
  },
};
