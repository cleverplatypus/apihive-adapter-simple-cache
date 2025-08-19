# Getting Started

## Installation

::: code-group
```bash [yarn]
yarn add @apihive/adapter-simple-request-cache
```

```bash [npm]
npm install @apihive/adapter-simple-request-cache
```

```bash [jsr]
jsr add @apihive/adapter-simple-request-cache
```
:::

## Enabling the adapter

```ts
import { HTTPRequestFactory } from '@apihive/core';
import SimpleRequestCacheAdapter from '@apihive/adapter-simple-request-cache';


const requestFactory = new HTTPRequestFactory()
  .withAdapter(new SimpleRequestCacheAdapter());

// Cache the response for 60 seconds
const response = await requestFactory
  .createGETRequest('https://jsonplaceholder.typicode.com/users/1')
  .withMeta({ cache: 60 })
  .execute();

const cachedResponse = await requestFactory
  .createGETRequest('https://jsonplaceholder.typicode.com/users/1')
  .execute();
```


### API-level caching configuration
When using an API, the adapter can be configured at the API level.

The adapter can be then configured with a filter callback that can override the API-level configuration.

::: tip Note

The filter callback is only called when the request is not explicitly cached at the request/endpoint level.
:::

```ts
import { HTTPRequestFactory, type APIConfig } from '@apihive/core';
import SimpleRequestCacheAdapter, { type SimpleRequestCacheAdapterOptions } from '@apihive/adapter-simple-request-cache';

const api: APIConfig = {
    name : 'default',
    meta : {
        cache : 3600
    }
}

const config : SimpleRequestCacheAdapterOptions = {
    cacheName : 'my-app-request-cache',
    filter : (config : RequestConfig) => {
        return config.method === 'GET'
    }
}

const requestFactory = new HTTPRequestFactory()
    .withAdapter(new SimpleRequestCacheAdapter(config))

```

### Including body in the hash computation

By default, the adapter does not include the request body in the hash computation because, unless the body is used to query the server, it is not relevant to the cache key and it would add unnecessary computational time.

If you need to include the body in the hash computation, you can pass the `hashBody` option to the `meta.cache` property in its extended form.

```ts
const response = await requestFactory
  .createPOSTRequest('https://mydomain.com/api/search-user')
  .withBody({ type : 'admin' })
  .withMeta({ cache: { ttlSeconds : 60, hashBody : true } })
  .execute();
```

The same configuration style can be used at the API level.



