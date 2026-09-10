function createImageResponseCache({ maxEntries = 200, maxBytes = 64 * 1024 * 1024 } = {}) {
  if (![maxEntries, maxBytes].every((limit) => Number.isSafeInteger(limit) && limit > 0)) {
    throw new TypeError("image_cache_limit_invalid");
  }
  const entries = new Map();
  let totalBytes = 0;

  function remove(key) {
    const entry = entries.get(key);
    if (!entry) return false;
    totalBytes -= entry.bytes;
    return entries.delete(key);
  }

  return {
    get size() { return entries.size; },
    get totalBytes() { return totalBytes; },
    get(key) { return entries.get(key)?.value; },
    set(key, value) {
      const bytes = value.body.length;
      remove(key);
      if (bytes > maxBytes) return false;
      while (entries.size >= maxEntries || totalBytes + bytes > maxBytes) {
        remove(entries.keys().next().value);
      }
      entries.set(key, { value, bytes });
      totalBytes += bytes;
      return true;
    },
    delete: remove,
    clear() {
      entries.clear();
      totalBytes = 0;
    },
  };
}

module.exports = { createImageResponseCache };
