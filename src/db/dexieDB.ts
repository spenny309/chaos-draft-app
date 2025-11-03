import Dexie, { type Table } from "dexie";

export interface Pack {
  id?: number; // auto-incremented by Dexie
  name: string;
  imageUrl: string;
  quantity: number;
}

export class MTGDatabase extends Dexie {
  packs!: Table<Pack, number>;

  constructor() {
    super("mtgChaosDraftDB");
    this.version(1).stores({
      packs: "++id, name, quantity",
    });
  }
}

export const db = new MTGDatabase();
