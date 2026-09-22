import { constants } from "node:fs";
import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

export type StoredGuest = {
  id: string;
  name: string;
  whatsapp: string | null;
  token: string;
  aliases?: string[];
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
  snapshotId: string;
  guests: StoredGuest[];
  reservations: StoredReservation[];
  gifts: StoredGift[];
  deletedGiftIds: string[];
  deletedGuestIds: string[];
};

const emptyStore = (): Store => ({
  snapshotId: "",
  guests: [],
  reservations: [],
  gifts: [],
  deletedGiftIds: [],
  deletedGuestIds: [],
});

let memory: Store | null = null;
let seeded = false;
let writeQueue: Promise<unknown> = Promise.resolve();

function withLock<T>(fn: () => Promise<T>) {
  const run = writeQueue.then(fn, fn);
  writeQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function digits(value: string | null | undefined) {
  return (value || "").replace(/\D/g, "");
}

function guestTokens(guest: StoredGuest) {
  return [guest.token, ...(guest.aliases ?? [])].filter(Boolean);
}

function matchesToken(guest: StoredGuest, token: string) {
  return guestTokens(guest).includes(token);
}

export function storePath() {
  if (process.env["LOCAL_STORE_PATH"]) return process.env["LOCAL_STORE_PATH"];
  return `${process.cwd()}/data/local-store.json`;
}

function seedPaths() {
  return [
    process.env["LOCAL_STORE_SEED"],
    "/app/data/local-store.seed.json",
    `${process.cwd()}/data/local-store.seed.json`,
  ].filter((value, index, all): value is string => Boolean(value) && all.indexOf(value) === index);
}

async function pathWritable(dir: string) {
  try {
    await access(dir, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

async function resolveStorePath() {
  if (process.env["LOCAL_STORE_PATH"]) return process.env["LOCAL_STORE_PATH"];
  try {
    await mkdir("/data", { recursive: true });
    if (await pathWritable("/data")) return "/data/local-store.json";
  } catch {
    /* usa a pasta do app */
  }
  return `${process.cwd()}/data/local-store.json`;
}

function normalizeStore(parsed: Partial<Store> | null | undefined): Store {
  return {
    snapshotId: typeof parsed?.snapshotId === "string" ? parsed.snapshotId : "",
    guests: Array.isArray(parsed?.guests) ? parsed.guests : [],
    reservations: Array.isArray(parsed?.reservations) ? parsed.reservations : [],
    gifts: Array.isArray(parsed?.gifts) ? parsed.gifts : [],
    deletedGiftIds: Array.isArray(parsed?.deletedGiftIds) ? parsed.deletedGiftIds : [],
    deletedGuestIds: Array.isArray(parsed?.deletedGuestIds) ? parsed.deletedGuestIds : [],
  };
}

async function readJson(path: string): Promise<Store | null> {
  try {
    const raw = await readFile(path, "utf8");
    return normalizeStore(JSON.parse(raw) as Partial<Store>);
  } catch {
    return null;
  }
}

function mergeSeedInto(store: Store, seed: Store) {
  if (seed.snapshotId && store.snapshotId !== seed.snapshotId) {
    store.snapshotId = seed.snapshotId;
    store.guests = seed.guests.map((guest) => ({ ...guest }));
    store.reservations = seed.reservations.map((reservation) => ({
      ...reservation,
      items: reservation.items.map((item) => ({ ...item })),
    }));
    store.gifts = seed.gifts.map((gift) => ({ ...gift }));
    store.deletedGiftIds = [...seed.deletedGiftIds];
    store.deletedGuestIds = [...seed.deletedGuestIds];
    return true;
  }

  let changed = false;
  const deletedGuests = new Set(store.deletedGuestIds);
  const byId = new Map(store.guests.map((guest) => [guest.id, guest]));
  const byPhone = new Map(
    store.guests
      .map((guest) => [digits(guest.whatsapp), guest] as const)
      .filter(([phone]) => phone.length > 0),
  );
  const byToken = new Map<string, StoredGuest>();
  for (const guest of store.guests) {
    for (const token of guestTokens(guest)) byToken.set(token, guest);
  }

  for (const seedGuest of seed.guests) {
    if (deletedGuests.has(seedGuest.id)) continue;
    const phone = digits(seedGuest.whatsapp);
    const existing =
      byId.get(seedGuest.id) ||
      (phone ? byPhone.get(phone) : undefined) ||
      guestTokens(seedGuest)
        .map((token) => byToken.get(token))
        .find(Boolean);
    if (existing) {
      const extras = guestTokens(seedGuest).filter(
        (token) => token !== existing.token && !(existing.aliases ?? []).includes(token),
      );
      if (extras.length) {
        existing.aliases = [...(existing.aliases ?? []), ...extras];
        changed = true;
      }
      continue;
    }
    store.guests.push(seedGuest);
    byId.set(seedGuest.id, seedGuest);
    if (phone) byPhone.set(phone, seedGuest);
    for (const token of guestTokens(seedGuest)) byToken.set(token, seedGuest);
    changed = true;
  }

  const deletedGifts = new Set(store.deletedGiftIds);
  const giftIds = new Set(store.gifts.map((gift) => gift.id));
  for (const gift of seed.gifts) {
    if (deletedGifts.has(gift.id) || giftIds.has(gift.id)) continue;
    store.gifts.push(gift);
    giftIds.add(gift.id);
    changed = true;
  }
  return changed;
}

async function persist(store: Store, path: string) {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  await writeFile(tmp, JSON.stringify(store, null, 2));
  await rename(tmp, path);
}

async function readStore(): Promise<Store> {
  if (memory && seeded) return memory;
  const path = await resolveStorePath();
  process.env["LOCAL_STORE_PATH"] = path;
  const store = (await readJson(path)) ?? emptyStore();
  if (!seeded) {
    for (const seedPath of seedPaths()) {
      const seed = await readJson(seedPath);
      if (seed) mergeSeedInto(store, seed);
    }
    seeded = true;
    try {
      await persist(store, path);
    } catch (error) {
      console.error("[store] não foi possível gravar a cópia persistente", error);
    }
  }
  memory = store;
  return store;
}

async function writeStore(store: Store) {
  memory = store;
  const path = await resolveStorePath();
  process.env["LOCAL_STORE_PATH"] = path;
  await persist(store, path);
}

export async function listLocalGuests() {
  return (await readStore()).guests;
}

export async function findGuestByToken(token: string) {
  return (await readStore()).guests.find((guest) => matchesToken(guest, token)) ?? null;
}

export async function findGuestById(id: string) {
  return (await readStore()).guests.find((guest) => guest.id === id) ?? null;
}

export async function upsertLocalGuest(guest: StoredGuest) {
  return withLock(async () => {
    const store = await readStore();
    const index = store.guests.findIndex((current) => current.id === guest.id);
    if (index >= 0) {
      store.guests[index] = { ...store.guests[index], ...guest };
    } else {
      store.guests.push(guest);
    }
    store.deletedGuestIds = store.deletedGuestIds.filter((id) => id !== guest.id);
    await writeStore(store);
    return guest;
  });
}

export async function deleteLocalGuest(id: string) {
  return withLock(async () => {
    const store = await readStore();
    store.guests = store.guests.filter((guest) => guest.id !== id);
    if (!store.deletedGuestIds.includes(id)) store.deletedGuestIds.push(id);
    await writeStore(store);
  });
}

export async function listLocalReservations() {
  return (await readStore()).reservations;
}

export async function findConfirmedReservation(guestId: string) {
  return (
    (await readStore()).reservations.find(
      (reservation) => reservation.guest_id === guestId && reservation.status === "confirmed",
    ) ?? null
  );
}

export async function saveLocalReservation(reservation: StoredReservation) {
  return withLock(async () => {
    const store = await readStore();
    const index = store.reservations.findIndex((current) => current.id === reservation.id);
    if (index >= 0) store.reservations[index] = reservation;
    else store.reservations.push(reservation);
    await writeStore(store);
    return reservation;
  });
}

export async function setLocalReservationStatus(id: string, status: StoredReservation["status"]) {
  return withLock(async () => {
    const store = await readStore();
    const current = store.reservations.find((reservation) => reservation.id === id);
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
    const reservation = store.reservations.find((current) => current.id === reservationId);
    if (!reservation) return null;
    if (quantity <= 0) {
      reservation.items = reservation.items.filter((current) => current.gift_id !== item.gift_id);
    } else {
      const index = reservation.items.findIndex((current) => current.gift_id === item.gift_id);
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
    const index = store.gifts.findIndex((current) => current.id === gift.id);
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
    store.gifts = store.gifts.filter((gift) => gift.id !== id);
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
  const byId = new Map(gifts.filter((gift) => !deleted.has(gift.id)).map((gift) => [gift.id, gift]));
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
