import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

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
