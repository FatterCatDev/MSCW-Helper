export interface MapClassification { state: 'safe' | 'unsafe' | 'unknown'; message: string; name: string; street: string }

const object = (v: unknown): Record<string, unknown> | null =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
const canonical = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

export async function lookupMap(name: string, street: string, version: string, request: typeof fetch = fetch): Promise<MapClassification> {
  if (!name.trim() || name.length > 120 || !street.trim() || street.length > 120 || !/^\d{1,4}[A-Za-z]?$/.test(version))
    throw new Error('Invalid minimap name or API version.');
  const search = await request(`https://maplestory.io/api/GMS/${version}/map?searchFor=${encodeURIComponent(name)}&count=100`,
    { signal: AbortSignal.timeout(10000) });
  if (!search.ok) throw new Error(`Map search failed (${search.status}).`);
  const raw: unknown = await search.json();
  if (!Array.isArray(raw)) throw new Error('Invalid map search response.');
  const matches = raw.map(object).filter(m => m && typeof m.name === 'string' &&
    typeof m.streetName === 'string' && canonical(m.name) === canonical(name) &&
    canonical(m.streetName) === canonical(street) && Number.isSafeInteger(m.id));
  if (!matches.length || matches.length > 20) return { state: 'unknown', name, street,
    message: matches.length ? 'Too many matching maps to verify safety.' : 'Map name was not found in the API.' };
  const states: ('safe' | 'unsafe' | 'unknown')[] = [];
  for (const match of matches) {
    const details = await request(`https://maplestory.io/api/GMS/${version}/map/${match!.id}`, { signal: AbortSignal.timeout(10000) });
    if (details.status === 404) continue;
    if (!details.ok) throw new Error(`Map details failed (${details.status}).`);
    const map = object(await details.json());
    if (!map || map.id !== match!.id || typeof map.isTown !== 'boolean' || !Array.isArray(map.mobs))
      throw new Error('Map details are incomplete or do not match the search result.');
    states.push(map.mobs.length > 0 ? 'unsafe' : map.isTown ? 'safe' : 'unknown');
  }
  const state = states.length && states.every(s => s === states[0]) ? states[0]! : 'unknown';
  return { state, name: String(matches[0]!.name), street: String(matches[0]!.streetName),
    message: state === 'safe' ? 'Town with no monsters listed in GMS data.' :
      state === 'unsafe' ? 'Monsters are listed in GMS data.' : 'Map safety is ambiguous or cannot be verified from the API.' };
}
