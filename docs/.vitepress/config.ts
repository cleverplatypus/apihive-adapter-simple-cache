import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "Simple Request Cache Adapter",
  description: "A simple, browser-oriented caching adapter for APIHive.",
  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Getting Started', link: '/getting-started' },
      { text: 'Demo', link: '/demo' }
    ],

    sidebar: [
      {
        text: 'Examples',
        items: [
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Demo', link: '/demo' }
        ]
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/cleverplatypus/apihive-adapter-simple-cache' },
      { icon: 'npm', link: 'https://www.npmjs.com/package/@apihive/adapter-simple-cache' }
    ]
  }
})
