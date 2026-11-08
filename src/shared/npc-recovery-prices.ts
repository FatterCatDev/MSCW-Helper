export const NPC_RECOVERY_PRICE_SOURCE = 'https://meowdb.com/msclassic/npc-shops/item-efficiency/consumables';
export const NPC_RECOVERY_PRICES_CHECKED_AT = '2026-11-07';

export interface NpcRecoveryItem {
  itemId: number;
  name: string;
  hp: number;
  mp: number;
  npcBuyPrice: number | null;
  availability: 'shop' | 'not-open';
}

/**
 * NiaDB Classic NPC shop snapshot, keyed by the original MapleStory item ID.
 * Closed-release shops and items absent from this table have no usable buy price.
 */
export const NPC_RECOVERY_ITEMS: Readonly<Record<number, Readonly<NpcRecoveryItem>>> = {
  2000000: { itemId: 2000000, name: 'Red Potion', hp: 100, mp: 0, npcBuyPrice: 50, availability: 'shop' },
  2000001: { itemId: 2000001, name: 'Orange Potion', hp: 250, mp: 0, npcBuyPrice: 150, availability: 'shop' },
  2000002: { itemId: 2000002, name: 'White Potion', hp: 500, mp: 0, npcBuyPrice: 350, availability: 'shop' },
  2000003: { itemId: 2000003, name: 'Blue Potion', hp: 0, mp: 200, npcBuyPrice: 220, availability: 'shop' },
  2010001: { itemId: 2010001, name: 'Apple', hp: 40, mp: 0, npcBuyPrice: 20, availability: 'shop' },
  2010002: { itemId: 2010002, name: 'Egg', hp: 60, mp: 0, npcBuyPrice: 30, availability: 'shop' },
  2010003: { itemId: 2010003, name: 'Meat', hp: 160, mp: 0, npcBuyPrice: 80, availability: 'shop' },
  2010004: { itemId: 2010004, name: 'Orange', hp: 0, mp: 50, npcBuyPrice: 50, availability: 'shop' },
  2010005: { itemId: 2010005, name: 'Lemon', hp: 0, mp: 150, npcBuyPrice: 150, availability: 'shop' },
  2010006: { itemId: 2010006, name: 'Watermelon', hp: 800, mp: 800, npcBuyPrice: 1920, availability: 'shop' },
  2020000: { itemId: 2020000, name: 'Salad', hp: 0, mp: 200, npcBuyPrice: 220, availability: 'shop' },
  2020001: { itemId: 2020001, name: 'Fried Chicken', hp: 120, mp: 0, npcBuyPrice: 60, availability: 'shop' },
  2020002: { itemId: 2020002, name: 'Cake', hp: 100, mp: 100, npcBuyPrice: 150, availability: 'shop' },
  2020003: { itemId: 2020003, name: 'Pizza', hp: 360, mp: 0, npcBuyPrice: 252, availability: 'shop' },
  2020004: { itemId: 2020004, name: 'Hamburger', hp: 500, mp: 0, npcBuyPrice: 350, availability: 'shop' },
  2020005: { itemId: 2020005, name: 'Hot Dog', hp: 300, mp: 0, npcBuyPrice: 180, availability: 'shop' },
  2020006: { itemId: 2020006, name: 'Hot Dog Supreme', hp: 600, mp: 0, npcBuyPrice: 480, availability: 'shop' },
  2020007: { itemId: 2020007, name: 'Dried Squid', hp: 300, mp: 0, npcBuyPrice: 180, availability: 'shop' },
  2020008: { itemId: 2020008, name: 'Fat Sausage', hp: 800, mp: 0, npcBuyPrice: 800, availability: 'shop' },
  2020009: { itemId: 2020009, name: 'Orange Juice', hp: 0, mp: 450, npcBuyPrice: 540, availability: 'shop' },
  2020010: { itemId: 2020010, name: 'Grape Juice', hp: 0, mp: 900, npcBuyPrice: 1260, availability: 'shop' },
  2020012: { itemId: 2020012, name: 'Ice Cream Pop', hp: 1500, mp: 0, npcBuyPrice: 1500, availability: 'shop' },
  2020013: { itemId: 2020013, name: 'Red Bean Sundae', hp: 0, mp: 1500, npcBuyPrice: 2250, availability: 'shop' },
  2020014: { itemId: 2020014, name: 'Melting Cheese', hp: 2000, mp: 0, npcBuyPrice: null, availability: 'not-open' },
  2020015: { itemId: 2020015, name: 'Reindeer Milk', hp: 2500, mp: 0, npcBuyPrice: null, availability: 'not-open' },
  2020016: { itemId: 2020016, name: 'Sunrise Dew', hp: 0, mp: 2000, npcBuyPrice: null, availability: 'not-open' },
  2020017: { itemId: 2020017, name: 'Sunset Dew', hp: 0, mp: 2500, npcBuyPrice: null, availability: 'not-open' },
  2020018: { itemId: 2020018, name: "Mrs. Ming Ming's Stew", hp: 300, mp: 300, npcBuyPrice: 480, availability: 'shop' },
  2020019: { itemId: 2020019, name: "Andre's Seafood Soup", hp: 300, mp: 300, npcBuyPrice: 480, availability: 'shop' },
  2022000: { itemId: 2022000, name: 'Pure Water', hp: 0, mp: 800, npcBuyPrice: 1120, availability: 'shop' },
  2022003: { itemId: 2022003, name: 'Unagi', hp: 1000, mp: 0, npcBuyPrice: 1000, availability: 'shop' },
  2210005: { itemId: 2210005, name: 'Orange Mushroom Daydream', hp: 100, mp: 0, npcBuyPrice: 500, availability: 'shop' },
  2210006: { itemId: 2210006, name: 'Ribbon Pig Daydream', hp: 150, mp: 0, npcBuyPrice: 500, availability: 'shop' }
};
