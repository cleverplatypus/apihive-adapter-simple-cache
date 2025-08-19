import type {
  Adapter,
  AdapterPriority,
  Feature,
  RequestConfig,
  RequestInterceptor,
  ResponseInterceptor
} from '@apihive/core';
import requestHashFeature from '@apihive/core/features/request-hash';

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
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'hash' });
          store.createIndex('expiresAt', 'expiresAt', { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
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

// Utilities
function isTextualContentType(ct: string | null): boolean {
  if (!ct) return false;
  const low = ct.toLowerCase();
  return /json/.test(low) || /text\//.test(low) || /application\/(xml|x-www-form-urlencoded)/.test(low);
}

async function readResponseSafely(response: Response): Promise<any | null> {
  const ct = response.headers.get('content-type')?.split(/;\s?/)[0] || '';
  try {
    if (/json/.test(ct)) return await response.clone().json();
  } catch {}
  try {
    if (isTextualContentType(ct)) return await response.clone().text();
  } catch {}
  return null; // skip binary / unknown
}

function resolveTTLSeconds(config: RequestConfig): number {
  const ttl = Number(config?.meta?.cache || 0);
  return ttl > 0 ? ttl : 0;
}

// Determine if cache was explicitly set at endpoint or request level.
// If explicit, adapter filter is ignored. If API-level only, adapter filter applies.
function isExplicitCache(config: RequestConfig): boolean {
  const apiLevelTTL = (config.meta?.api?.apiMeta as any)?.cache;
  const endpointMeta = (config.meta?.api?.endpoint?.meta as any) || {};
  const endpointHasCache = Object.prototype.hasOwnProperty.call(endpointMeta, 'cache');
  const currentTTL = config.meta?.cache;

  if (endpointHasCache) return true; // endpoint-level explicit
  if (typeof apiLevelTTL !== 'undefined' && currentTTL !== apiLevelTTL) return true; // request-level explicit
  return false;
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

  constructor(options: SimpleRequestCacheAdapterOptions = {}) {
    const { cacheName = 'apihive-request-cache', filter, clear = false } = options;
    this.filter = filter;
    this.clearOnAttach = !!clear;
    this.store = new IDBStore(cacheName);
  }

  async onAttach(): Promise<void> {
    try {
      if (this.clearOnAttach) {
        await this.store.clear();
      } else {
        await this.store.cleanupExpired(Date.now());
      }
    } catch {
      // non-fatal
    }
  }

  getFactoryDefaults() {
    return [];
  }

  getRequestInterceptors(): RequestInterceptor[] {
    return [async (config, controls) => {
      const ttlSeconds = resolveTTLSeconds(config);
      if (!ttlSeconds) return;

      const explicit = isExplicitCache(config);
      if (!explicit && this.filter && !this.filter(config)) return;

      // Ensure URL is finalized prior to hashing
      controls.finaliseURL();

      let hash: string;
      try {
        hash = controls.getHash(); // includeBody defaults to false
      } catch {
        // If request-hash is unavailable, do nothing
        return;
      }

      try {
        const entry = await this.store.get(hash);
        const now = Date.now();
        if (entry && entry.expiresAt > now) {
          return entry.body;
        }
      } catch {
        // ignore store errors
      }
      return;
    }];
  }

  getResponseInterceptors(): (ResponseInterceptor | { interceptor: ResponseInterceptor; skipTransformersOnReturn?: boolean })[] {
    const interceptor: ResponseInterceptor = async (response, config, controls) => {
      const ttlSeconds = resolveTTLSeconds(config);
      if (!ttlSeconds) return;

      const explicit = isExplicitCache(config);
      if (!explicit && this.filter && !this.filter(config)) return;

      if (!response || !response.ok) return;

      const body = await readResponseSafely(response);
      if (body === null) return;

      let hash: string;
      try {
        hash = controls.getHash();
      } catch {
        return;
      }

      const now = Date.now();
      const entry: CacheEntry = { hash, body, createdAt: now, expiresAt: now + ttlSeconds * 1000 };
      try {
        await this.store.set(entry);
      } catch {
        // ignore store errors
      }
      return;
    };

    return [interceptor];
  }

  getErrorInterceptors() {
    return [];
  }

  async clearCache(): Promise<void> {
    await this.store.clear();
  }
}
 