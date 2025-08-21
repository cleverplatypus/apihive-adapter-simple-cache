import { defineConfig } from 'vitepress';
import { resolve } from 'path';

const alias = {
  '@': resolve(__dirname, '../demos'),
  // 'apihive-common-docs-assets': resolve(__dirname, '../../../apihive-common-docs-assets')
};

// https://vitepress.dev/reference/site-config
export default defineConfig({
  vite: {
    server: {
      port: 5174,
      host: '0.0.0.0', // or specifically allow your hostname
      allowedHosts: ['foobar.io']
    },
    resolve: {
      alias
    }
  },
  base: '/apihive-adapter-simple-cache/',
  title: 'Cache Adapter',
  description: 'A simple, browser-oriented caching adapter for APIHive.',
  
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    logo: 'images/logo.svg',
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Demo', link: '/demo' }
    ],

    sidebar: [
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Demo', link: '/demo' }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cleverplatypus/apihive-adapter-simple-cache' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@apihive/adapter-simple-cache' }
    ]
  }
});
