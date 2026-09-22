import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type StoredGuest = {
  id: string;
  name: string;
  whatsapp: string | null;
  token: string;
  created_at: string;
};

export type StoredReservationItem = {
  id: string;
  gift_id: string;
  name: string;
  quantity: number;
  unit?: string;
};

export type StoredReservation = {
  id: string;
  guest_id: string;
  guest_name: string;
  whatsapp: string;
  status: "confirmed" | "cancelled";
  confirmed_at: string;
  items: StoredReservationItem[];
};

export type StoredGift = {
  id: string;
  name: string;
  desired: number;
  unit: string;
  created_at: string;
};

type Store = {
  guests: StoredGuest[];
  reservations: StoredReservation[];
  gifts: StoredGift[];
  deletedGiftIds: string[];
};

const emptyStore = (): Store => ({ guests: [], reservations: [], gifts: [], deletedGiftIds: [] });

function storePath() {
  return process.env["LOCAL_STORE_PATH"] || `${process.cwd()}/data/local-store.json`;
}

let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(storePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<Store>;
    return {
      guests: Array.isArray(parsed.guests) ? parsed.guests : [],
      reservations: Array.isArray(parsed.reservations) ? parsed.reservations : [],
      gifts: Array.isArray(parsed.gifts) ? parsed.gifts : [],
      deletedGiftIds: Array.isArray(parsed.deletedGiftIds) ? parsed.deletedGiftIds : [],
    };
  } catch {
    return emptyStore();
  }
}

async function writeStore(store: Store) {
  const path = storePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(store, null, 2));
}

export async function listLocalGuests() {
  return (await readStore()).guests;
}

export async function findGuestByToken(token: string) {
  return (await readStore()).guests.find((g) => g.token === token) ?? null;
}

export async function findGuestById(id: string) {
  return (await readStore()).guests.find((g) => g.id === id) ?? null;
}

export async function upsertLocalGuest(guest: StoredGuest) {
  return withLock(async () => {
    const store = await readStore();
    const index = store.guests.findIndex((g) => g.id === guest.id);
    if (index >= 0) store.guests[index] = { ...store.guests[index], ...guest };
    else store.guests.push(guest);
    await writeStore(store);
    return guest;
  });
}

export async function deleteLocalGuest(id: string) {
  return withLock(async () => {
    const store = await readStore();
    store.guests = store.guests.filter((g) => g.id !== id);
    await writeStore(store);
  });
}

export async function listLocalReservations() {
  return (await readStore()).reservations;
}

export async function findConfirmedReservation(guestId: string) {
  return (
    (await readStore()).reservations.find((r) => r.guest_id === guestId && r.status === "confirmed") ??
    null
  );
}

export async function saveLocalReservation(reservation: StoredReservation) {
  return withLock(async () => {
    const store = await readStore();
    const index = store.reservations.findIndex((r) => r.id === reservation.id);
    if (index >= 0) store.reservations[index] = reservation;
    else store.reservations.push(reservation);
    await writeStore(store);
    return reservation;
  });
}

export async function setLocalReservationStatus(id: string, status: StoredReservation["status"]) {
  return withLock(async () => {
    const store = await readStore();
    const current = store.reservations.find((r) => r.id === id);
    if (!current) return null;
    current.status = status;
    await writeStore(store);
    return current;
  });
}

export async function setLocalReservationItem(
  reservationId: string,
  item: StoredReservationItem,
  quantity: number,
) {
  return withLock(async () => {
    const store = await readStore();
    const reservation = store.reservations.find((r) => r.id === reservationId);
    if (!reservation) return null;
    if (quantity <= 0) {
      reservation.items = reservation.items.filter((i) => i.gift_id !== item.gift_id);
    } else {
      const index = reservation.items.findIndex((i) => i.gift_id === item.gift_id);
      if (index >= 0) reservation.items[index] = { ...reservation.items[index], ...item, quantity };
      else reservation.items.push({ ...item, quantity });
    }
    await writeStore(store);
    return reservation;
  });
}

export async function listLocalGifts() {
  return (await readStore()).gifts;
}

export async function upsertLocalGift(gift: StoredGift) {
  return withLock(async () => {
    const store = await readStore();
    const index = store.gifts.findIndex((g) => g.id === gift.id);
    if (index >= 0) store.gifts[index] = { ...store.gifts[index], ...gift };
    else store.gifts.push(gift);
    store.deletedGiftIds = store.deletedGiftIds.filter((id) => id !== gift.id);
    await writeStore(store);
    return gift;
  });
}

export async function deleteLocalGift(id: string) {
  return withLock(async () => {
    const store = await readStore();
    store.gifts = store.gifts.filter((g) => g.id !== id);
    if (!store.deletedGiftIds.includes(id)) store.deletedGiftIds.push(id);
    await writeStore(store);
  });
}

export async function mergeLocalGifts<
  T extends {
    id: string;
    name: string;
    desired: number;
    unit: string;
    reserved: number;
    available: number;
    status?: string;
    created_at?: string;
  },
>(gifts: T[]): Promise<T[]> {
  const store = await readStore();
  const deleted = new Set(store.deletedGiftIds);
  const byId = new Map(gifts.filter((g) => !deleted.has(g.id)).map((g) => [g.id, g]));
  for (const local of store.gifts) {
    if (deleted.has(local.id)) continue;
    const current = byId.get(local.id);
    const reserved = current?.reserved ?? 0;
    const available = Math.max(0, local.desired - reserved);
    byId.set(local.id, {
      ...(current ?? { reserved: 0, created_at: local.created_at }),
      id: local.id,
      name: local.name,
      desired: local.desired,
      unit: local.unit,
      reserved,
      available,
      status:
        available === 0
          ? "Quantidade concluída"
          : reserved > 0
            ? "Parcialmente presenteado"
            : "Disponível",
      created_at: local.created_at || current?.created_at || "",
    } as T);
  }
  return [...byId.values()];
}

export async function reservedByGift() {
  const reserved = new Map<string, number>();
  for (const reservation of await listLocalReservations()) {
    if (reservation.status !== "confirmed") continue;
    for (const item of reservation.items) {
      reserved.set(item.gift_id, (reserved.get(item.gift_id) ?? 0) + item.quantity);
    }
  }
  return reserved;
}

export async function withLocalReserved<
  T extends { id: string; desired: number; reserved: number; available: number; status?: string },
>(gifts: T[]): Promise<T[]> {
  const extra = await reservedByGift();
  if (extra.size === 0) return gifts;
  return gifts.map((gift) => {
    const reserved = gift.reserved + (extra.get(gift.id) ?? 0);
    const available = Math.max(0, gift.desired - reserved);
    return {
      ...gift,
      reserved,
      available,
      status:
        available === 0
          ? "Quantidade concluída"
          : reserved > 0
            ? "Parcialmente presenteado"
            : "Disponível",
    };
  });
}
