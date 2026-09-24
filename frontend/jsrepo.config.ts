import { defineConfig } from 'jsrepo';

export default defineConfig({
  registries: ['https://reactbits.dev/tailwind/'],
  paths: {
    '*': './src/components/reactbits',
    components: './src/components/reactbits',
  },
});