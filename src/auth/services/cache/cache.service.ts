import { Injectable } from '@nestjs/common';

interface CacheItem {
  value: any;
  expiry: number;
}

@Injectable()
export class SimpleCacheService {
  private cache = new Map<string, CacheItem>();

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    const expiry = Date.now() + (ttlSeconds * 1000);
    this.cache.set(key, { value, expiry });
    
    console.log(`📝 Cache SET: ${key} = ${value} (TTL: ${ttlSeconds}s)`);
    
    // Clean up expired entries periodically
    setTimeout(() => this.cleanup(), ttlSeconds * 1000);
  }

  async get<T>(key: string): Promise<T | undefined> {
    const item = this.cache.get(key);
    
    if (!item) {
      console.log(`🔍 Cache MISS: ${key} (not found)`);
      return undefined;
    }

    if (Date.now() > item.expiry) {
      this.cache.delete(key);
      console.log(`🔍 Cache MISS: ${key} (expired)`);
      return undefined;
    }

    console.log(`✅ Cache HIT: ${key} = ${item.value}`);
    return item.value;
  }

  async del(key: string): Promise<void> {
    const deleted = this.cache.delete(key);
    console.log(`🗑️ Cache DEL: ${key} (${deleted ? 'success' : 'not found'})`);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.cache.entries()) {
      if (now > item.expiry) {
        this.cache.delete(key);
      }
    }
  }

  // Debug method
  getAllKeys(): string[] {
    return Array.from(this.cache.keys());
  }
}
