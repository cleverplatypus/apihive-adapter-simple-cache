// https://vitepress.dev/guide/custom-theme
import { h } from 'vue'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './style.css'
import syncPicoTheme from 'apihive-common-docs-assets/scripts/pico-vitest-theme-sync';
export default {
  extends: DefaultTheme,
  Layout: () => {
    return h(DefaultTheme.Layout, null, {
      // https://vitepress.dev/guide/extending-default-theme#layout-slots
    })
  },
  enhanceApp({ app: _app, router: _router, siteData: _siteData }) {
    syncPicoTheme();
  }
} satisfies Theme
