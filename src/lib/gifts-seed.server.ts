import { createHash } from "node:crypto";
import { presentesIniciais } from "@/content/gifts-iniciais";

type QueryResult = { count?: number | null; data?: unknown; error: { message: string } | null };

export function giftId(name: string) {
  const bytes = Buffer.from(createHash("sha1").update(`gabrielle-gift:${name}`).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function fromSeedGifts() {
  return presentesIniciais.map((g) => ({
    id: giftId(g.name),
    name: g.name,
    desired: g.desired,
    unit: g.unit,
    reserved: 0,
    available: g.desired,
    status: "Disponível" as const,
    created_at: "",
  }));
}

export async function ensureInitialGifts(db: {
  from: (table: "gifts") => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => PromiseLike<QueryResult>;
    insert: (rows: Record<string, unknown>[]) => PromiseLike<QueryResult>;
  };
}) {
  const counted = await db.from("gifts").select("id", { count: "exact", head: true });
  if (counted.error) throw counted.error;
  if ((counted.count ?? 0) > 0) return;

  const rows = presentesIniciais.map((g) => ({
    id: giftId(g.name),
    name: g.name,
    desired_quantity: g.desired,
    unit: g.unit,
  }));
  const withUnit = await db.from("gifts").insert(rows);
  if (!withUnit.error) return;

  const withoutUnit = await db.from("gifts").insert(
    presentesIniciais.map((g) => ({ id: giftId(g.name), name: g.name, desired_quantity: g.desired })),
  );
  if (withoutUnit.error) throw withoutUnit.error;
}

export function unitOf(name: string, unit?: string | null) {
  const fromDb = unit?.trim();
  if (fromDb) return fromDb;
  return presentesIniciais.find((g) => g.name === name)?.unit ?? "Item";
}
