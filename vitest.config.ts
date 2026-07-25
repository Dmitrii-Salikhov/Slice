import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.{test,spec}.{ts,tsx}', 'tests/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: [
        'src/dicom/**/*.ts',
        'src/viewer/**/*.ts',
        'src/i18n/translations.ts',
        'src/errorLog/store.ts',
        'src/dicom/dicomdir.ts',
        'src/dicom/dicomdirTypes.ts',
        'src/export/imageExport.ts',
        'src/export/anonymize.ts',
      ],
      exclude: [
        'src/dicom/types.ts',
        'src/dicom/decode.ts',
        'src/viewer/webgl.ts',
        'src/viewer/render.ts',
        '**/*.d.ts',
      ],
      thresholds: {
        lines: 75,
        functions: 80,
        statements: 75,
        branches: 55,
      },
    },
  },
});
