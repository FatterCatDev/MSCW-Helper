import { NPC_RECOVERY_ITEMS } from './npc-recovery-prices.ts';

// Classic item IDs and GMS v62 icon IDs differ for several recovery items.
const GMS_ICON_IDS: Readonly<Record<number, number | null>> = {
  2000000: 2000000, 2000001: 2000001, 2000002: 2000002, 2000003: 2000003,
  2010001: 2010000, 2010002: 2010002, 2010003: 2010001, 2010004: 2010003,
  2010005: 2010004, 2010006: 2001000,
  2020000: 2020000, 2020001: 2020001, 2020002: 2020002, 2020003: 2020003,
  2020004: 2020004, 2020005: 2020005, 2020006: 2020006, 2020007: 2020007,
  2020008: 2020008, 2020009: 2020009, 2020010: 2020010, 2020012: 2001001,
  2020013: 2001002, 2020014: 2020012, 2020015: 2020013, 2020016: 2020014,
  2020017: 2020015, 2020018: null, 2020019: null, 2022000: 2022000,
  2022003: 2022003, 2210005: null, 2210006: null
};

export function recoveryIconUrl(itemId: number): string | null {
  if (!NPC_RECOVERY_ITEMS[itemId]) return null;
  const iconId = GMS_ICON_IDS[itemId];
  return iconId === undefined || iconId === null ? null : `https://maplestory.io/api/GMS/62/item/${iconId}/icon`;
}
