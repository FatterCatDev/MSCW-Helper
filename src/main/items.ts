import type { PotionItem } from '../shared/types.ts';
import { itemNameDistance } from '../shared/game-tracking.ts';

function object(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function parsePotionItem(value: unknown): PotionItem {
  const item = object(value);
  const description = object(item?.description);
  const meta = object(item?.metaInfo);
  const consume = object(meta?.consumeSpec);
  if (!item || !Number.isSafeInteger(item.id) || typeof description?.name !== 'string' ||
      !consume || !['hp', 'mp', 'hpR', 'mpR'].some(key => typeof consume[key] === 'number' && consume[key] > 0)) {
    throw new Error('This item is not a supported HP/MP potion in the selected API version.');
  }
  return {
    id: Number(item.id), name: description.name,
    description: typeof description.description === 'string' ? description.description.replaceAll('\\n', '\n') : '',
    npcSellPrice: typeof meta?.price === 'number' && Number.isFinite(meta.price) ? meta.price : null
  };
}

const cache = new Map<string, PotionItem>();

const lootCache = new Map<string, { id: number; price: number }>();

export async function lookupLoot(name: string, version: string): Promise<{ id: number; price: number }> {
  if (!/^\d{1,4}[A-Za-z]?$/.test(version) || !name.trim() || name.length > 100) throw new Error('Invalid loot lookup.');
  const key = `${version}/${name.toLowerCase()}`;
  const cached = lootCache.get(key);
  if (cached) return cached;
  const response = await fetch(`https://maplestory.io/api/GMS/${version}/item?searchFor=${encodeURIComponent(name)}&count=100`,
    { signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error(`Loot lookup failed (${response.status}) for ${name}.`);
  let raw: unknown = await response.json();
  if (!Array.isArray(raw)) throw new Error(`Invalid item search response for ${name}.`);
  let matches = raw.map(object).filter(item => item && typeof item.name === 'string' && item.name.toLowerCase() === name.toLowerCase());
  if (!matches.length && name.includes(' ')) {
    const search = await fetch(`https://maplestory.io/api/GMS/${version}/item?searchFor=${encodeURIComponent(name.split(' ')[0]!)}&count=100`,
      { signal: AbortSignal.timeout(10000) });
    if (!search.ok) throw new Error(`Item name lookup failed (${search.status}) for ${name}.`);
    raw = await search.json();
    if (!Array.isArray(raw)) throw new Error(`Invalid item search response for ${name}.`);
    matches = raw.map(object).filter(item => item && typeof item.name === 'string' && itemNameDistance(name, item.name) <= 1);
  }
  if (matches.length !== 1 || !Number.isSafeInteger(matches[0]?.id)) throw new Error(`No unique exact item match for ${name}; set a value override.`);
  const id = Number(matches[0]!.id);
  const details = await fetch(`https://maplestory.io/api/GMS/${version}/item/${id}`, { signal: AbortSignal.timeout(10000) });
  if (!details.ok) throw new Error(`Item price lookup failed (${details.status}) for ${name}.`);
  const data = object(await details.json());
  const meta = object(data?.metaInfo);
  const price = meta?.price;
  if (!Number.isSafeInteger(price) || typeof price !== 'number' || price < 0) throw new Error(`No NPC price for ${name}; set a value override.`);
  const result = { id, price };
  if (lootCache.size >= 500) lootCache.clear();
  lootCache.set(key, result);
  return result;
}

export async function lookupPotion(itemId: unknown, version: unknown): Promise<PotionItem> {
  if (!Number.isSafeInteger(itemId) || typeof itemId !== 'number' || itemId <= 0 ||
      typeof version !== 'string' || !/^\d{1,4}[A-Za-z]?$/.test(version)) {
    throw new Error('Enter a positive item ID and a valid GMS API version.');
  }
  const key = `${version}/${itemId}`;
  const cached = cache.get(key);
  if (cached) return cached;
  const response = await fetch(`https://maplestory.io/api/GMS/${version}/item/${itemId}`, { signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Item lookup failed (${response.status}). Check the ID, version, or try again later.`);
  const item = parsePotionItem(await response.json());
  if (item.id !== itemId) throw new Error('The API returned a different item ID.');
  if (cache.size >= 100) cache.clear();
  cache.set(key, item);
  return item;
}
