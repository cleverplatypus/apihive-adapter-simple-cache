---
title: Demo
---

# DEMO: Simple Request Cache Adapter

Here's a simple demo of how to use the simple request cache adapter.

Choose the service from the dropdown to select the API to call and observe the cache in action.

Requests for the getUserById endpoint are cached for 30 seconds, while requests for the getPostById endpoint are not cached.

<script setup>
  import 'apihive-common-docs-assets/style/styles.scss';
  import SimpleRequestCacheAdapterDemo from './SimpleRequestCacheAdapterDemo.vue';
</script>

<ClientOnly>
  <SimpleRequestCacheAdapterDemo />
</ClientOnly>

::: code-group
<<< ./api-config.ts{9} [API Config]
<<< ./demo-controller.ts [Demo Controller]
