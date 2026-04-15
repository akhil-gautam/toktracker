import { defineConfig } from 'tsup'

export default defineConfig({
  entry: {
    index: 'src/index.tsx',
    cli: 'src/cli/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  outDir: 'dist',
  clean: true,
  loader: { '.sql': 'copy' },
  onSuccess: 'cp src/db/schema.sql dist/schema.sql',
})
