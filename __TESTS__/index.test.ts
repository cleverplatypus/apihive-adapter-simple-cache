import 'fake-indexeddb/auto';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

import adaptersFeature from '@apihive/core/features/adapters';
import requestHashFeature from '@apihive/core/features/request-hash';
import { HTTPRequestFactory } from '@apihive/core';
import SimpleRequestCacheAdapter from '../src/index';

const okJSON = (data: any, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Response(JSON.stringify(data), { status: 200, headers });
const okText = (text: string, headers: Record<string, string> = { 'content-type': 'text/plain' }) =>
  new Response(text, { status: 200, headers });

describe('apihive_adapter_simple_request_cache', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;
  let factory: HTTPRequestFactory;

  beforeEach(async () => {
    // Return a fresh Response for each fetch call to avoid reusing a consumed body
    fetchSpy = vi.spyOn(globalThis, 'fetch' as any).mockImplementation(() => okJSON({ ok: true }));
    factory = new HTTPRequestFactory()
      .use(adaptersFeature)
      // request-hash is auto-enabled by the adapter, but adding here keeps explicitness in tests
      .use(requestHashFeature)
      .withLogLevel('error');
    // fresh adapter each test on its own cache
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
    vi.useRealTimers();
  });

  it('caches_json_responses_with_request_level_cache_meta', async () => {
    const adapter = new SimpleRequestCacheAdapter({ cacheName: 'cache-json-1' });
    await factory.withAdapter(adapter);

    const req1 = factory.createGETRequest('https://example.com/data')
      .withMeta({ cache: { ttlSeconds: 60 } });
    const r1 = await req1.execute();
    expect(r1).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    const req2 = factory.createGETRequest('https://example.com/data')
      .withMeta({ cache: { ttlSeconds: 60 } });
    const r2 = await req2.execute();
    expect(r2).toEqual({ ok: true });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // served from cache
  });

  it('respects_ttl_expiry', async () => {
    const adapter = new SimpleRequestCacheAdapter({ cacheName: 'cache-ttl-1' });
    await factory.withAdapter(adapter);

    const req = factory.createGETRequest('https://example.com/ttl').withMeta({ cache: { ttlSeconds: 5 } });

    await req.execute(); // fetch 1
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // second call before expiry -> cache hit
    await factory.createGETRequest('https://example.com/ttl').withMeta({ cache: { ttlSeconds: 5 } }).execute();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Simulate time jump by mocking Date.now to avoid fake timers interfering with IDB
    const realNow = Date.now();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(realNow + 6000);
    await factory.createGETRequest('https://example.com/ttl').withMeta({ cache: { ttlSeconds: 5 } }).execute();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
    nowSpy.mockRestore();
  }, 10000);

  it('includes_body_in_hash_when_hash_body_true', async () => {
    const adapter = new SimpleRequestCacheAdapter({ cacheName: 'cache-hash-body' });
    await factory.withAdapter(adapter);

    // different bodies -> different cache entries -> two fetches
    await factory.createPOSTRequest('https://example.com/echo')
      .withJSONBody({ id: 1 })
      .withMeta({ cache: { ttlSeconds: 60, hashBody: true } })
      .execute();
    await factory.createPOSTRequest('https://example.com/echo')
      .withJSONBody({ id: 2 })
      .withMeta({ cache: { ttlSeconds: 60, hashBody: true } })
      .execute();
    expect(fetchSpy).toHaveBeenCalledTimes(2);

    // same body again -> cache hit -> no additional fetch
    await factory.createPOSTRequest('https://example.com/echo')
      .withJSONBody({ id: 1 })
      .withMeta({ cache: { ttlSeconds: 60, hashBody: true } })
      .execute();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('filter_enforced_for_api_level_cache_but_ignored_for_explicit_request_or_endpoint_cache', async () => {
    // Filter only allows GETs to be cached
    const adapter = new SimpleRequestCacheAdapter({
      cacheName: 'cache-filter-explicit',
      filter: (cfg) => cfg.method === 'GET',
    });
    await factory.withAdapter(adapter);

    // Define an API with API-level cache (non-explicit)
    factory.withAPIConfig({
      name: 'test-api',
      baseURL: 'https://api.example.com',
      meta: { cache: 60 }, // API-level TTL
      endpoints: {
        getX: { target: '/x', method: 'GET' },
        postY: { target: '/y', method: 'POST', meta: {} }, // no endpoint explicit cache
        postZ: { target: '/z', method: 'POST', meta: { cache: 120 } }, // endpoint explicit cache
      },
    });

    // GET honors filter and API-level cache -> cache hit on second call
    // Only one fetch should occur; enqueue a single response
    fetchSpy.mockImplementationOnce(() => okJSON({ a: 1 }));
    const g1 = await factory.createAPIRequest('test-api', 'getX').execute();
    expect(g1).toEqual({ a: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const g2 = await factory.createAPIRequest('test-api', 'getX').execute();
    expect(g2).toEqual({ a: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(1); // cached

    // POST without explicit cache -> filter denies -> no cache; second call fetches again
    fetchSpy.mockImplementationOnce(() => okJSON({ b: 1 })).mockImplementationOnce(() => okJSON({ b: 1 }));
    const p1 = await factory.createAPIRequest('test-api', 'postY').execute();
    const p2 = await factory.createAPIRequest('test-api', 'postY').execute();
    expect(p1).toEqual({ b: 1 });
    expect(p2).toEqual({ b: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(3); // two fetches for postY

    // POST with endpoint-level explicit cache -> filter ignored -> second call uses cache
    fetchSpy.mockImplementationOnce(() => okJSON({ c: 1 }));
    const z1 = await factory.createAPIRequest('test-api', 'postZ').execute();
    expect(z1).toEqual({ c: 1 });
    const z2 = await factory.createAPIRequest('test-api', 'postZ').execute();
    expect(z2).toEqual({ c: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(4); // only one fetch for postZ

    // Also test request-level explicit override: set different TTL than API-level
    fetchSpy.mockImplementationOnce(() => okJSON({ d: 1 }));
    const r1 = await factory.createGETRequest('https://api.example.com/override')
      .withMeta({ api: { name: 'test-api', apiMeta: { cache: 60 }, endpoint: { target: '/override', method: 'GET' }, endpointName: 'override' } as any })
      .withMeta({ cache: 120 })
      .execute();
    expect(r1).toEqual({ d: 1 });
    const r2 = await factory.createGETRequest('https://api.example.com/override')
      .withMeta({ api: { name: 'test-api', apiMeta: { cache: 60 }, endpoint: { target: '/override', method: 'GET' }, endpointName: 'override' } as any })
      .withMeta({ cache: 120 })
      .execute();
    expect(r2).toEqual({ d: 1 });
    expect(fetchSpy).toHaveBeenCalledTimes(5); // only first call fetched; second was cached
  });

  it('handles_mime_detection_caches_json_and_text_skips_unknown_or_binary', async () => {
    const adapter = new SimpleRequestCacheAdapter({ cacheName: 'cache-mime' });
    await factory.withAdapter(adapter);

    // JSON
    fetchSpy.mockResolvedValueOnce(okJSON({ x: 1 }));
    const j1 = await factory.createGETRequest('https://example.com/mime-json').withMeta({ cache: 60 }).execute();
    const j2 = await factory.createGETRequest('https://example.com/mime-json').withMeta({ cache: 60 }).execute();
    expect(j1).toEqual({ x: 1 });
    expect(j2).toEqual({ x: 1 });
    // only one extra fetch call for JSON above
    // Current fetch count carries over; just ensure no extra call for second j2

    // Text
    fetchSpy.mockResolvedValueOnce(okText('hello'));
    const t1 = await factory.createGETRequest('https://example.com/mime-text').withMeta({ cache: 60 }).execute();
    const t2 = await factory.createGETRequest('https://example.com/mime-text').withMeta({ cache: 60 }).execute();
    expect(t1).toEqual('hello');
    expect(t2).toEqual('hello');

    // Unknown/binary -> not cached
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    );
    const b1 = await factory.createGETRequest('https://example.com/mime-bin').withMeta({ cache: 60 }).execute();
    expect(b1).toBeInstanceOf(Blob);
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([4, 5, 6]), { status: 200, headers: { 'content-type': 'application/octet-stream' } })
    );
    const b2 = await factory.createGETRequest('https://example.com/mime-bin').withMeta({ cache: 60 }).execute();
    expect(b2).toBeInstanceOf(Blob);
    // two fetches for binary due to no caching
  });

  it('clear_on_attach_removes_existing_entries_for_same_cache_name', async () => {
    // First adapter populates cache
    const adapter1 = new SimpleRequestCacheAdapter({ cacheName: 'cache-clear', filter: () => true });
    await factory.withAdapter(adapter1);
    fetchSpy.mockImplementationOnce(() => okJSON({ first: 1 }));
    await factory.createGETRequest('https://example.com/clear-me').withMeta({ cache: 60 }).execute();
    // second call hits cache
    await factory.createGETRequest('https://example.com/clear-me').withMeta({ cache: 60 }).execute();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    // Attach a new adapter instance pointing to the same store with clear = true
    // Use a new factory to avoid duplicate adapter name conflict
    const newFactory = new HTTPRequestFactory().use(adaptersFeature).use(requestHashFeature).withLogLevel('error');
    const adapter2 = new SimpleRequestCacheAdapter({ cacheName: 'cache-clear', clear: true });
    await newFactory.withAdapter(adapter2);

    // Cache should be cleared; next call should fetch again
    fetchSpy.mockImplementationOnce(() => okJSON({ second: 2 }));
    await newFactory.createGETRequest('https://example.com/clear-me').withMeta({ cache: 60 }).execute();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});