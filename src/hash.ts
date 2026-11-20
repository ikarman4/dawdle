/** FNV-1a 32-bit. Stable across browsers. */
export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function bpmForId(id: string): number {
  return 84 + (hashString(`${id}:bpm`) % 13) * 4;
}
