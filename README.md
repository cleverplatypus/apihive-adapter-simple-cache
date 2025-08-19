# @apihive/adapter-simple-cache

A simple, browser-oriented caching adapter for APIHive. It caches successful JSON/text responses in IndexedDB keyed by the request hash.

- Highest-priority interceptors (0).
- Auto-enables the request-hash feature.
- Client-driven TTL via `meta.cache` (seconds).
- Optional filter function to exclude requests when caching comes from API-level meta.

## Install

```bash
# peer dependency
npm install @apihive/core
# adapter
npm install @apihive/adapter-simple-cache