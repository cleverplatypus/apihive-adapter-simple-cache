import type {
  Adapter,
  AdapterPriority,
  Feature,
  HTTPRequestFactory,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor
} from '@apihive/core';
import requestHashFeature from '@apihive/core/features/request-hash';

export type ExtendedCacheMeta = {
  ttlSeconds: number;
  hashBody: boolean;
};

export type SimpleCacheMeta = number;

export type CacheMeta = SimpleCacheMeta | ExtendedCacheMeta;

type CacheEntry = {
  hash: string;
  body: any;
  createdAt: number;
  expiresAt: number;
};

interface Store {
  get(hash: string): Promise<CacheEntry | null>;
  set(entry: CacheEntry): Promise<void>;
  delete(hash: string): Promise<void>;
  clear(): Promise<void>;
  cleanupExpired(nowMs?: number): Promise<void>;
}

/**
 * Returns true if the cache config is not a number or an object with ttlSeconds and hashBody properties
 */
function configDoesntConform(cacheConfig: unknown): cacheConfig is never {
  return (
    typeof cacheConfig !== 'undefined' &&
    !(
      typeof cacheConfig === 'number' ||
      (typeof cacheConfig === 'object' &&
        cacheConfig !== null &&
        (typeof (cacheConfig as any).ttlSeconds === 'number' ||
          typeof (cacheConfig as any).hashBody === 'boolean'))
    )
  );
}
class IDBStore implements Store {
  private dbName: string;
  private storeName: string;
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(dbName: string, storeName = 'entries') {
    this.dbName = dbName;
    this.storeName = storeName;
  }

  private get supported() {
    return typeof indexedDB !== 'undefined';
  }

  private async open(): Promise<IDBDatabase> {
    if (!this.supported) throw new Error('IndexedDB not available');
    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      let settled = false;
      const done = (db: IDBDatabase) => {
        if (!settled) {
          settled = true;
          resolve(db);
        }
      };
      const fail = (err: unknown) => {
        if (!settled) {
          settled = true;
          reject(err);
        }
      };

      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, {
            keyPath: 'hash'
          });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
        // Some environments (e.g., fake-indexeddb) require waiting for the upgrade transaction to complete
        const tx = (req.transaction as IDBTransaction | null) || null;
        if (tx) {
          tx.oncomplete = () => done(db);
          tx.onabort = () => fail(tx.error);
          tx.onerror = () => fail(tx.error);
        }
      };
      req.onsuccess = () => done(req.result);
      req.onblocked = () => fail(new Error('IndexedDB open blocked'));
      req.onerror = () => fail(req.error);
    });

    return this.dbPromise;
  }

  private async tx(mode: IDBTransactionMode) {
    const db = await this.open();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get(hash: string): Promise<CacheEntry | null> {
    const store = await this.tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(hash);
      req.onsuccess = () => resolve((req.result as CacheEntry) || null);
      req.onerror = () => reject(req.error);
    });
  }

  async set(entry: CacheEntry): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(entry);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async delete(hash: string): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(hash);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear(): Promise<void> {
    const store = await this.tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async cleanupExpired(nowMs: number = Date.now()): Promise<void> {
    const db = await this.open();
    const tx = db.transaction(this.storeName, 'readwrite');
    const store = tx.objectStore(this.storeName);
    const index = store.index('expiresAt');
    return new Promise((resolve, reject) => {
      const range = IDBKeyRange.upperBound(nowMs);
      const cursorReq = index.openCursor(range);
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  }
}

export type SimpleRequestCacheAdapterOptions = {
  cacheName?: string;
  filter?: (config: RequestConfig) => boolean;
  clear?: boolean;
};

export default class SimpleRequestCacheAdapter implements Adapter {
  readonly name = '@apihive/adapter-simple-request-cache';
  readonly priority: AdapterPriority = {
    requestInterceptor: 0,
    responseInterceptor: 0,
    errorInterceptor: 0
  };
  // Auto-enable the request-hash feature
  readonly use: Feature[] = [requestHashFeature];

  private store: Store;
  private filter?: (config: RequestConfig) => boolean;
  private clearOnAttach: boolean;
  private factory?: HTTPRequestFactory;
  private readyPromise?: Promise<void>;

  constructor(options: SimpleRequestCacheAdapterOptions = { cacheName: 'apihive-request-cache' }) {
    const { cacheName, filter, clear = false } = options;
    if (!cacheName) throw new Error('cacheName is cannot be an empty string');
    this.filter = filter;
    this.clearOnAttach = !!clear;
    this.store = new IDBStore(cacheName!);
  }

  onAttach(factory: HTTPRequestFactory): void {
    this.factory = factory;
    try {
      if (this.clearOnAttach) {
        this.store.clear();
      } else {
        this.readyPromise = this.store.cleanupExpired(Date.now());
      }
    } catch {
      // non-fatal
    }
  }

  getRequestInterceptors(): RequestInterceptor[] {
    return [
      async (config, controls) => {
        await this.readyPromise;

        const { ttlSeconds, hashBody } = this.resolveCacheMetaConfig(config.meta);
        if (!ttlSeconds) return;

        const explicit = this.isExplicitCache(config);
        if (!explicit && this.filter && !this.filter(config)) return;

        // Ensure URL is finalized prior to hashing
        controls.finaliseURL();

        let hash: string;
        try {
          hash = controls.getHash({ includeBody: hashBody }); // includeBody defaults to false
        } catch {
          // If request-hash is unavailable, do nothing. Feature guard is already in getHash()
          return;
        }

        try {
          const entry = await this.store.get(hash);
          const now = Date.now();
          if (entry && entry.expiresAt > now) {
            return entry.body;
          }
        } catch (e) {
          this.factory!.logger.error('Failed to read cache entry', e);
        }
        return;
      }
    ];
  }

  getResponseInterceptors(): (
    | ResponseInterceptor
    | { interceptor: ResponseInterceptor; skipTransformersOnReturn?: boolean }
  )[] {
    const interceptor: ResponseInterceptor = async (response, config, controls) => {
      await this.readyPromise;
      const { ttlSeconds, hashBody } = this.resolveCacheMetaConfig(config.meta);
      if (!ttlSeconds) return;

      const explicit = this.isExplicitCache(config);
      if (!explicit && this.filter && !this.filter(config)) return;

      if (!response || !response.ok) return;

      const body = await this.readResponseSafely(response, config);
      if (body === null) return;

      let hash: string;
      try {
        hash = controls.getHash({ includeBody: hashBody });
      } catch {
        return;
      }

      const now = Date.now();
      const entry: CacheEntry = {
        hash,
        body,
        createdAt: now,
        expiresAt: now + ttlSeconds * 1000
      };
      try {
        await this.store.set(entry);
      } catch (e) {
        this.factory!.logger.error('Failed to write cache entry', e);
      }
      return;
    };

    return [interceptor];
  }

  async clearCache(): Promise<void> {
    await this.store.clear();
  }

  private isJSONResponse(config: RequestConfig, contentType: string): boolean {
    return config.jsonMimeTypes.some((type) => new RegExp(type, 'i').test(contentType));
  }

  private isTextResponse(config: RequestConfig, contentType: string): boolean {
    return config.textMimeTypes.some((type) => new RegExp(type, 'i').test(contentType));
  }

  private async readResponseSafely(response: Response, config: RequestConfig): Promise<any | null> {
    const ct = response.headers.get('content-type')?.split(/;\s?/)[0] || '';
    try {
      if (this.isJSONResponse(config, ct)) return await response.clone().json();
    } catch {}
    try {
      if (this.isTextResponse(config, ct)) return await response.clone().text();
    } catch {}
    return null; // skip binary / unknown
  }

  private resolveCacheMetaConfig(meta: { cache?: CacheMeta }): ExtendedCacheMeta {
    if (typeof meta?.cache === 'undefined') return { ttlSeconds: 0, hashBody: false };

    if (configDoesntConform(meta.cache))
      throw new Error('Cache config must be a number or an object with ttlSeconds and/or hashBody properties');
    const ttl = typeof meta?.cache === 'number' ? meta?.cache : meta?.cache.ttlSeconds || 0;
    const hashBody = (meta?.cache as ExtendedCacheMeta)?.hashBody === true || false;
    return { ttlSeconds: ttl, hashBody };
  }

  // Determine if cache was explicitly set at endpoint or request level.
  // If explicit, adapter filter is ignored. If API-level only, adapter filter applies.
  private isExplicitCache(config: RequestConfig): boolean {
    const { ttlSeconds: apiLevelTTL } = this.resolveCacheMetaConfig(config.meta?.api?.apiMeta as any);
    const endpointMeta = (config.meta?.api?.endpoint?.meta as any) || {};
    const endpointHasCache = Object.prototype.hasOwnProperty.call(endpointMeta, 'cache');
    const { ttlSeconds: currentTTL } = this.resolveCacheMetaConfig(config.meta);

    if (endpointHasCache) return true; // endpoint-level explicit
    if (typeof apiLevelTTL !== 'undefined' && currentTTL !== apiLevelTTL) return true; // request-level explicit
    return false;
  }
}
