import { defineConfig } from "astro/config";
import vercel from "@astrojs/vercel";
import tailwind from "@astrojs/tailwind";


import vue from "@astrojs/vue";


export default defineConfig({
  adapter: vercel(),
  output: 'server',
  integrations: [tailwind(), vue({
    appEntrypoint: '/src/plugins/vue.js'
  })],
});