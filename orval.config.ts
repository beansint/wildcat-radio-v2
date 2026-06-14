import { defineConfig } from 'orval';

export default defineConfig({
  api: {
    output: {
      mode: 'tags-split',
      client: 'react-query',
      target: 'src/lib/api/endpoints',
      schemas: 'src/lib/api/model',
      override: {
        mutator: {
          path: './src/lib/api/fetcher.ts',
          name: 'customFetch',
        },
        query: {
          useQuery: true,
        },
      },
    },
    input: {
      target: './openapi/openapi.json',
    },
  },
  apiZod: {
    output: {
      client: 'zod',
      target: 'src/lib/api/endpoints',
      fileExtension: '.zod.ts',
    },
    input: {
      target: './openapi/openapi.json',
    },
  },
});
