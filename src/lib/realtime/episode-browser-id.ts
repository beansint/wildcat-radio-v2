const KEY = "wildcat.episode-browser-ids.v1";
const TTL = 86_400_000;
type Entry = { id: string; expiresAt: number };
type Store = Pick<Storage, "getItem" | "setItem">;
type Options = {
  storage?: Store;
  exclusive?: <T>(fn: () => T) => Promise<T>;
  now?: () => number;
};
const valid = (entry: Entry | undefined, now: number) =>
  entry &&
  typeof entry === "object" &&
  entry.expiresAt > now &&
  entry.expiresAt <= now + TTL &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    entry.id,
  );
export interface EpisodeBrowserIdentity {
  id: string;
  persistent: boolean;
}

export function createEpisodeIdentityProvider(options: Options = {}) {
  const memory: Record<string, Entry> = {};
  return async (episodeId: string): Promise<EpisodeBrowserIdentity> => {
    const now = options.now?.() ?? Date.now();
    const claim = () => {
      let entries: Record<string, Entry> = {};
      let persistent = Boolean(options.storage);
      try {
        const stored = JSON.parse(options.storage?.getItem(KEY) ?? "{}");
        if (stored && typeof stored === "object" && !Array.isArray(stored))
          entries = stored;
      } catch {
        persistent = false;
        /* Storage-denied browsers use this page session only. */
      }
      entries = Object.fromEntries(
        Object.entries(entries)
          .filter(([, v]) => valid(v, now))
          .slice(-31),
      );
      const existing = entries[episodeId] ?? memory[episodeId];
      const entry = valid(existing, now)
        ? existing!
        : { id: crypto.randomUUID(), expiresAt: now + TTL };
      entries[episodeId] = entry;
      for (const [key, value] of Object.entries(memory))
        if (!valid(value, now) || Object.keys(memory).length >= 32)
          delete memory[key];
      memory[episodeId] = entry;
      try {
        options.storage?.setItem(KEY, JSON.stringify(entries));
      } catch {
        persistent = false;
        /* No persistent tracking fallback. */
      }
      return { id: entry.id, persistent };
    };
    return options.exclusive ? options.exclusive(claim) : claim();
  };
}
export function createEpisodeIdProvider(options: Options = {}) {
  const identity = createEpisodeIdentityProvider(options);
  return async (episodeId: string) => (await identity(episodeId)).id;
}
let provider: ReturnType<typeof createEpisodeIdentityProvider> | undefined;
const sessionOnlyProvider = createEpisodeIdentityProvider();
/** IndexedDB readwrite transactions serialize concurrent first-play tabs without Web Locks. */
async function indexedClaim(episodeId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("wildcat-episode-measurement", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("episodes");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("episodes", "readwrite");
      const store = tx.objectStore("episodes");
      const now = Date.now();
      let id: string;
      const get = store.get(episodeId);
      get.onsuccess = () => {
        const value = get.result as Entry | undefined;
        const entry = valid(value, now)
          ? value!
          : { id: crypto.randomUUID(), expiresAt: now + TTL };
        id = entry.id;
        store.put(entry, episodeId);
        const cursor = store.openCursor();
        cursor.onsuccess = () => {
          const row = cursor.result;
          if (row) {
            if (!valid(row.value, now)) row.delete();
            row.continue();
          }
        };
      };
      tx.oncomplete = () => {
        db.close();
        resolve(id);
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}
export async function getEpisodeBrowserIdentity(
  episodeId: string,
): Promise<EpisodeBrowserIdentity> {
  if (!provider) {
    let storage: Store | undefined;
    try {
      storage = window.localStorage;
    } catch {
      /* session only */
    }
    provider = createEpisodeIdentityProvider({
      storage: navigator.locks ? storage : undefined,
      exclusive: navigator.locks
        ? (fn) => navigator.locks.request(KEY, fn)
        : undefined,
    });
  }
  if (!navigator.locks) {
    try {
      return { id: await indexedClaim(episodeId), persistent: true };
    } catch {
      /* IndexedDB denied: page-session identity only. */
    }
  }
  try {
    return await provider(episodeId);
  } catch {
    return sessionOnlyProvider(episodeId);
  }
}

export async function getEpisodeBrowserId(episodeId: string): Promise<string> {
  return (await getEpisodeBrowserIdentity(episodeId)).id;
}
/** A denied durable claim must remain visible in backend measurement quality. */
export function listeningJoinPayload(
  episodeId: string,
  identity: EpisodeBrowserIdentity,
) {
  return identity.persistent
    ? { episodeId, anonId: identity.id }
    : { episodeId };
}
