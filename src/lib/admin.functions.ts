import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Ctx = { userId: string };

/**
 * Garante que o usuário autenticado é administrador.
 * O primeiro usuário criado assume o papel de administrador (bootstrap do casal).
 */
async function ensureAdmin(context: Ctx) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "admin");

  if (!existing || existing.length === 0) {
    await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    return supabaseAdmin;
  }
  if (!existing.some((r) => r.user_id === context.userId)) {
    throw new Error("Acesso restrito");
  }
  return supabaseAdmin;
}

function newToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export type AdminGift = {
  id: string;
  name: string;
  desired: number;
  reserved: number;
  available: number;
  status: "Disponível" | "Parcialmente presenteado" | "Quantidade concluída";
  created_at: string;
};

async function computeGifts(db: Awaited<ReturnType<typeof ensureAdmin>>): Promise<AdminGift[]> {
  const [{ data: gifts, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db.from("gifts").select("id, name, desired_quantity, created_at").order("name"),
    db
      .from("reservation_items")
      .select("gift_id, quantity, reservations!inner(status)")
      .eq("reservations.status", "confirmed"),
  ]);
  if (e1) throw e1;
  if (e2) throw e2;
  const reserved = new Map<string, number>();
  for (const i of items ?? []) reserved.set(i.gift_id, (reserved.get(i.gift_id) ?? 0) + i.quantity);

  return (gifts ?? []).map((g) => {
    const r = reserved.get(g.id) ?? 0;
    const available = Math.max(0, g.desired_quantity - r);
    return {
      id: g.id,
      name: g.name,
      desired: g.desired_quantity,
      reserved: r,
      available,
      status:
        available === 0
          ? ("Quantidade concluída" as const)
          : r > 0
            ? ("Parcialmente presenteado" as const)
            : ("Disponível" as const),
      created_at: g.created_at,
    };
  });
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await ensureAdmin(context as Ctx);
    const gifts = await computeGifts(db);
    const { data: guests } = await db.from("guests").select("id");
    const { data: reservations } = await db
      .from("reservations")
      .select("guest_id, status")
      .eq("status", "confirmed");

    const escolheram = new Set((reservations ?? []).map((r) => r.guest_id));
    return {
      totalGifts: gifts.length,
      giftsAvailable: gifts.filter((g) => g.available > 0).length,
      giftsDone: gifts.filter((g) => g.available === 0).length,
      totalGuests: guests?.length ?? 0,
      guestsChosen: escolheram.size,
      guestsPending: (guests?.length ?? 0) - escolheram.size,
      totalReservations: reservations?.length ?? 0,
    };
  });

/* ---------------------------------- Presentes --------------------------------- */

export const adminListGifts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => computeGifts(await ensureAdmin(context as Ctx)));

export const adminSaveGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(120),
        desired: z.number().int().min(1).max(999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    if (data.id) {
      const gifts = await computeGifts(db);
      const current = gifts.find((g) => g.id === data.id);
      if (current && data.desired < current.reserved) {
        return { ok: false, error: `Já existem ${current.reserved} unidades reservadas.` };
      }
      const { error } = await db
        .from("gifts")
        .update({ name: data.name, desired_quantity: data.desired })
        .eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("gifts")
        .insert({ name: data.name, desired_quantity: data.desired });
      if (error) throw error;
    }
    return { ok: true };
  });

export const adminDeleteGift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { error } = await db.from("gifts").delete().eq("id", data.id);
    if (error) return { ok: false, error: "Este presente já foi escolhido por alguém." };
    return { ok: true };
  });

/* --------------------------------- Convidados --------------------------------- */

export const adminListGuests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { data: guests, error } = await db
      .from("guests")
      .select("id, name, whatsapp, token, created_at")
      .order("name");
    if (error) throw error;
    const { data: reservations } = await db
      .from("reservations")
      .select("guest_id")
      .eq("status", "confirmed");
    const chosen = new Set((reservations ?? []).map((r) => r.guest_id));
    return (guests ?? []).map((g) => ({ ...g, chosen: chosen.has(g.id) }));
  });

export const adminSaveGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(120),
        whatsapp: z.string().trim().max(25).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    const payload = { name: data.name, whatsapp: data.whatsapp || null };
    if (data.id) {
      const { error } = await db.from("guests").update(payload).eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await db.from("guests").insert({ ...payload, token: newToken() });
      if (error) throw error;
    }
    return { ok: true };
  });

export const adminDeleteGuest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { error } = await db.from("guests").delete().eq("id", data.id);
    if (error) throw error;
    return { ok: true };
  });

/* ---------------------------------- Escolhas ---------------------------------- */

export const adminListReservations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { data, error } = await db
      .from("reservations")
      .select(
        "id, guest_name, whatsapp, status, confirmed_at, guests(id, name, token), reservation_items(id, quantity, gift_id, gifts(name))",
      )
      .order("confirmed_at", { ascending: false });
    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      guestName: r.guest_name,
      whatsapp: r.whatsapp,
      status: r.status,
      confirmedAt: r.confirmed_at,
      guestToken: r.guests?.token ?? null,
      items: (r.reservation_items ?? []).map((i) => ({
        id: i.id,
        giftId: i.gift_id,
        name: i.gifts?.name ?? "Presente",
        quantity: i.quantity,
      })),
    }));
  });

export const adminSetReservationItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        giftId: z.string().uuid(),
        quantity: z.number().int().min(0).max(999),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { data: result, error } = await db.rpc("admin_set_reservation_item", {
      _reservation_id: data.reservationId,
      _gift_id: data.giftId,
      _quantity: data.quantity,
    });
    if (error) throw error;
    const r = result as { ok: boolean; error?: string };
    if (!r.ok && r.error === "unavailable") {
      return { ok: false, error: "Não há unidades suficientes deste presente." };
    }
    return r;
  });

export const adminSetReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        status: z.enum(["confirmed", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin(context as Ctx);
    const { error } = await db
      .from("reservations")
      .update({ status: data.status })
      .eq("id", data.reservationId);
    if (error) throw error;
    return { ok: true };
  });
