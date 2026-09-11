import { presentesIniciais } from "@/content/gifts-iniciais";

type QueryResult = { count?: number | null; error: { message: string } | null };

export async function ensureInitialGifts(db: {
  from: (table: "gifts") => {
    select: (columns: string, options?: { count?: "exact"; head?: boolean }) => PromiseLike<QueryResult>;
    insert: (rows: Record<string, unknown>[]) => PromiseLike<QueryResult>;
  };
}) {
  const counted = await db.from("gifts").select("id", { count: "exact", head: true });
  if (counted.error) throw counted.error;
  if ((counted.count ?? 0) > 0) return;

  const withUnit = await db.from("gifts").insert(
    presentesIniciais.map((g) => ({
      name: g.name,
      desired_quantity: g.desired,
      unit: g.unit,
    })),
  );
  if (!withUnit.error) return;

  const withoutUnit = await db.from("gifts").insert(
    presentesIniciais.map((g) => ({ name: g.name, desired_quantity: g.desired })),
  );
  if (withoutUnit.error) throw withoutUnit.error;
}

export function unitOf(name: string, unit?: string | null) {
  const fromDb = unit?.trim();
  if (fromDb) return fromDb;
  return presentesIniciais.find((g) => g.name === name)?.unit ?? "Item";
}
