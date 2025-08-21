---
# https://vitepress.dev/reference/default-theme-home-page
layout: home

hero:
  name: "APIHive<br><small>Cache Adapter</small>"
  tagline: "A simple caching adapter for APIHive.<br>Compatible with most browsers and Deno."
  actions:
    - theme: brand
      text: Getting Started
      link: /getting-started
    - theme: alt
      text: View on GitHub
      link: https://github.com/cleverplatypus/apihive-adapter-simple-cache
    - theme: alt
      text: Demo
      link: /demo
---

Simple Cache Adapter is an extension for [APIHive Core](https://cleverplatypus.github.io/apihive-core/) that provides a simple way to cache responses in the local IndexedDB. 

It relies on the [request hash](https://cleverplatypus.github.io/apihive-core/guide/request-hash) feature to identify unique requests.

The cache can be leveraged at the request level, endpoint level or API level and can be configured to programmatically filter what API requests should be cached based on runtime conditions and request metadata.

Jump to the [getting started](/getting-started) section to learn how to use it.


