export function dedupeByRemoteJid<T extends { remoteJid: string }>(items: T[]): T[] {
  const map = new Map<string, T>();
  for (const it of items) {
    // last write wins (biasanya lastMessage terbaru)
    map.set(it.remoteJid, it);
  }
  return Array.from(map.values());
}
