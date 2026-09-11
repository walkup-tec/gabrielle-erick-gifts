import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requireMaster = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertMasterCookie } = await import("@/lib/admin-auth.server");
  assertMasterCookie();
  return next();
});

/** Acesso ao banco depois que o cookie master já foi validado. */
async function ensureAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
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
  unit: string;
  reserved: number;
  available: number;
  status: "Disponível" | "Parcialmente presenteado" | "Quantidade concluída";
  created_at: string;
};

async function computeGifts(db: Awaited<ReturnType<typeof ensureAdmin>>): Promise<AdminGift[]> {
  const { ensureInitialGifts, unitOf, fromSeedGifts } = await import("@/lib/gifts-seed.server");
  try {
    await ensureInitialGifts(db as never);
    const withUnit = await db.from("gifts").select("id, name, desired_quantity, unit, created_at").order("name");
    const giftsRes = withUnit.error
      ? await db.from("gifts").select("id, name, desired_quantity, created_at").order("name")
      : withUnit;
    const [{ data: gifts, error: e1 }, { data: items, error: e2 }] = await Promise.all([
      Promise.resolve(giftsRes),
      db
        .from("reservation_items")
        .select("gift_id, quantity, reservations!inner(status)")
        .eq("reservations.status", "confirmed"),
    ]);
    if (e1) throw e1;
    if (e2) throw e2;
    const { withLocalReserved } = await import("@/lib/local-store.server");
    if (!gifts?.length) return withLocalReserved(fromSeedGifts());
    const reserved = new Map<string, number>();
    for (const i of items ?? []) reserved.set(i.gift_id, (reserved.get(i.gift_id) ?? 0) + i.quantity);

    return withLocalReserved(
      gifts.map((g) => {
        const r = reserved.get(g.id) ?? 0;
        const available = Math.max(0, g.desired_quantity - r);
        return {
          id: g.id,
          name: g.name,
          desired: g.desired_quantity,
          unit: unitOf(g.name, "unit" in g ? g.unit : null),
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
      }),
    );
  } catch (error) {
    console.error("[admin] usando lista inicial de presentes", error);
    const { withLocalReserved } = await import("@/lib/local-store.server");
    return withLocalReserved(fromSeedGifts());
  }
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const { fromSeedGifts } = await import("@/lib/gifts-seed.server");
    try {
      const db = await ensureAdmin();
      const gifts = await computeGifts(db);
      const { data: guests } = await db.from("guests").select("id");
      const { data: reservations } = await db
        .from("reservations")
        .select("guest_id, status")
        .eq("status", "confirmed");
      const local = await import("@/lib/local-store.server");
      const localGuests = await local.listLocalGuests();
      const localReservations = await local.listLocalReservations();
      const guestIds = new Set([...(guests ?? []).map((g) => g.id), ...localGuests.map((g) => g.id)]);
      const escolheram = new Set([
        ...(reservations ?? []).map((r) => r.guest_id),
        ...localReservations.filter((r) => r.status === "confirmed").map((r) => r.guest_id),
      ]);
      return {
        totalGifts: gifts.length,
        giftsAvailable: gifts.filter((g) => g.available > 0).length,
        giftsDone: gifts.filter((g) => g.available === 0).length,
        totalGuests: guestIds.size,
        guestsChosen: escolheram.size,
        guestsPending: guestIds.size - escolheram.size,
        totalReservations:
          (reservations?.length ?? 0) + localReservations.filter((r) => r.status === "confirmed").length,
      };
    } catch (error) {
      console.error("[admin] overview fallback", error);
      const gifts = fromSeedGifts();
      const local = await import("@/lib/local-store.server");
      const localGuests = await local.listLocalGuests();
      const localReservations = (await local.listLocalReservations()).filter((r) => r.status === "confirmed");
      const escolheram = new Set(localReservations.map((r) => r.guest_id));
      return {
        totalGifts: gifts.length,
        giftsAvailable: gifts.filter((g) => g.available > 0).length,
        giftsDone: gifts.filter((g) => g.available === 0).length,
        totalGuests: localGuests.length,
        guestsChosen: escolheram.size,
        guestsPending: localGuests.length - escolheram.size,
        totalReservations: localReservations.length,
      };
    }
  });

/* ---------------------------------- Presentes --------------------------------- */

export const adminListGifts = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async ({ context }) => computeGifts(await ensureAdmin()));

export const adminSaveGift = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        name: z.string().trim().min(2).max(120),
        desired: z.number().int().min(1).max(999),
        unit: z.string().trim().min(1).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin();
    if (data.id) {
      const gifts = await computeGifts(db);
      const current = gifts.find((g) => g.id === data.id);
      if (current && data.desired < current.reserved) {
        return { ok: false, error: `Já existem ${current.reserved} unidades reservadas.` };
      }
      const { error } = await db
        .from("gifts")
        .update({ name: data.name, desired_quantity: data.desired, unit: data.unit })
        .eq("id", data.id);
      if (error) throw error;
    } else {
      const { error } = await db
        .from("gifts")
        .insert({ name: data.name, desired_quantity: data.desired, unit: data.unit });
      if (error) throw error;
    }
    return { ok: true };
  });

export const adminDeleteGift = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin();
    const { error } = await db.from("gifts").delete().eq("id", data.id);
    if (error) return { ok: false, error: "Este presente já foi escolhido por alguém." };
    return { ok: true };
  });

/* --------------------------------- Convidados --------------------------------- */

export const adminListGuests = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async ({ context }) => {
    const local = await import("@/lib/local-store.server");
    const localGuests = await local.listLocalGuests();
    const localChosen = new Set(
      (await local.listLocalReservations())
        .filter((r) => r.status === "confirmed")
        .map((r) => r.guest_id),
    );

    let guests = localGuests;
    const chosen = new Set(localChosen);
    try {
      const db = await ensureAdmin();
      const { data, error } = await db
        .from("guests")
        .select("id, name, whatsapp, token, created_at")
        .order("name");
      if (!error && data?.length) {
        const byId = new Map(localGuests.map((g) => [g.id, g]));
        for (const guest of data) byId.set(guest.id, guest);
        guests = [...byId.values()];
      }
      const { data: reservations } = await db.from("reservations").select("guest_id").eq("status", "confirmed");
      for (const row of reservations ?? []) chosen.add(row.guest_id);
    } catch (error) {
      console.error("[admin] listando convidados no arquivo local", error);
    }

    return guests
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((g) => ({ ...g, chosen: chosen.has(g.id) }));
  });

export const adminSaveGuest = createServerFn({ method: "POST" })
  .middleware([requireMaster])
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
    try {
    const local = await import("@/lib/local-store.server");
    const payload = { name: data.name, whatsapp: data.whatsapp || null };

    if (data.id) {
      try {
        const db = await ensureAdmin();
        const { error } = await db.from("guests").update(payload).eq("id", data.id);
        if (error) console.error("[admin] update guest supabase", error);
      } catch (error) {
        console.error("[admin] update guest supabase", error);
      }
      const current = await local.findGuestById(data.id);
      if (current) {
        await local.upsertLocalGuest({ ...current, ...payload });
      }
      return { ok: true as const, whatsappSent: false as const };
    }

    const guest = {
      id: crypto.randomUUID(),
      name: payload.name,
      whatsapp: payload.whatsapp,
      token: newToken(),
      created_at: new Date().toISOString(),
    };

    try {
      const db = await ensureAdmin();
      const { error } = await db.from("guests").insert(guest);
      if (error) console.error("[admin] insert guest supabase", error);
    } catch (error) {
      console.error("[admin] insert guest supabase", error);
    }

    await local.upsertLocalGuest(guest);

    if (!guest.whatsapp) {
      return { ok: true as const, whatsappSent: false as const };
    }

    const { tentarEnviarConviteWhatsapp } = await import("@/lib/evolution.server");
    const enviado = await tentarEnviarConviteWhatsapp(guest.name, guest.whatsapp, guest.token);
    return {
      ok: true as const,
      whatsappSent: enviado.ok,
      whatsappError: enviado.ok ? undefined : enviado.error,
    };
    } catch (error) {
      console.error("[admin] salvar convidado", error);
      return {
        ok: false as const,
        whatsappSent: false as const,
        error: "Não foi possível salvar o convidado.",
      };
    }
  });

export const adminDeleteGuest = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const local = await import("@/lib/local-store.server");
    try {
      const db = await ensureAdmin();
      const { error } = await db.from("guests").delete().eq("id", data.id);
      if (error) console.error("[admin] delete guest supabase", error);
    } catch (error) {
      console.error("[admin] delete guest supabase", error);
    }
    await local.deleteLocalGuest(data.id);
    return { ok: true };
  });

/* ---------------------------------- Escolhas ---------------------------------- */

export const adminListReservations = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async ({ context }) => {
    const local = await import("@/lib/local-store.server");
    const localGuests = await local.listLocalGuests();
    const tokenByGuest = new Map(localGuests.map((g) => [g.id, g.token]));
    const localRows = (await local.listLocalReservations()).map((r) => ({
      id: r.id,
      guestName: r.guest_name,
      whatsapp: r.whatsapp,
      status: r.status,
      confirmedAt: r.confirmed_at,
      guestToken: tokenByGuest.get(r.guest_id) ?? null,
      items: r.items.map((i) => ({
        id: i.id,
        giftId: i.gift_id,
        name: i.name,
        quantity: i.quantity,
      })),
    }));

    try {
      const db = await ensureAdmin();
      const { data, error } = await db
        .from("reservations")
        .select(
          "id, guest_name, whatsapp, status, confirmed_at, guests(id, name, token), reservation_items(id, quantity, gift_id, gifts(name))",
        )
        .order("confirmed_at", { ascending: false });
      if (error) throw error;
      const fromDb = (data ?? []).map((r) => ({
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
      const byId = new Map(localRows.map((r) => [r.id, r]));
      for (const row of fromDb) byId.set(row.id, row);
      return [...byId.values()].sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
    } catch (error) {
      console.error("[admin] listando escolhas no arquivo local", error);
      return localRows.sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
    }
  });

export const adminSetReservationItem = createServerFn({ method: "POST" })
  .middleware([requireMaster])
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
    const db = await ensureAdmin();
    const { data: result, error } = await db.rpc("admin_set_reservation_item", {
      _reservation_id: data.reservationId,
      _gift_id: data.giftId,
      _quantity: data.quantity,
    });
    if (!error) {
      const r = result as { ok: boolean; error?: string };
      if (!r.ok && r.error === "unavailable") {
        return { ok: false, error: "Não há unidades suficientes deste presente." };
      }
      return r;
    }

    const local = await import("@/lib/local-store.server");
    const gifts = await computeGifts(db);
    const gift = gifts.find((g) => g.id === data.giftId);
    if (!gift && data.quantity > 0) {
      return { ok: false, error: "Presente não encontrado." };
    }
    const updated = await local.setLocalReservationItem(
      data.reservationId,
      {
        id: crypto.randomUUID(),
        gift_id: data.giftId,
        name: gift?.name ?? "Presente",
        quantity: data.quantity,
        unit: gift?.unit,
      },
      data.quantity,
    );
    if (!updated) return { ok: false, error: "Escolha não encontrada." };
    return { ok: true };
  });

export const adminSetReservationStatus = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) =>
    z
      .object({
        reservationId: z.string().uuid(),
        status: z.enum(["confirmed", "cancelled"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const db = await ensureAdmin();
    if (data.status === "confirmed") {
      const { data: atual, error: loadError } = await db
        .from("reservations")
        .select("status, reservation_items(gift_id, quantity)")
        .eq("id", data.reservationId)
        .maybeSingle();
      if (loadError) throw loadError;
      if (atual && atual.status !== "confirmed") {
        const gifts = await computeGifts(db);
        for (const item of atual.reservation_items ?? []) {
          const gift = gifts.find((g) => g.id === item.gift_id);
          if (!gift || gift.available < item.quantity) {
            return {
              ok: false as const,
              error: "Não há unidades suficientes para reativar esta escolha.",
            };
          }
        }
      }
    }
    const { error } = await db
      .from("reservations")
      .update({ status: data.status })
      .eq("id", data.reservationId);
    if (!error) return { ok: true as const };
    const local = await import("@/lib/local-store.server");
    const updated = await local.setLocalReservationStatus(data.reservationId, data.status);
    if (!updated) throw error;
    return { ok: true as const };
  });

/* ------------------------------ Login master ------------------------------ */

export const adminSession = createServerFn({ method: "GET" }).handler(async () => {
  const { hasMasterCookie } = await import("@/lib/admin-auth.server");
  return { ok: hasMasterCookie() };
});

export const adminLogin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ email: z.string().email(), password: z.string().min(8).max(72) }).parse(d),
  )
  .handler(async ({ data }) => {
    const auth = await import("@/lib/admin-auth.server");
    if (!auth.credentialsMatch(data.email, data.password)) {
      return { ok: false as const, error: "E-mail ou senha incorretos." };
    }
    auth.setMasterCookie();
    try {
      const { ensureMasterAdmin } = await import("@/lib/admin-seed.server");
      await ensureMasterAdmin();
    } catch (error) {
      console.error("[admin] seed opcional após login", error);
    }
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearMasterCookie } = await import("@/lib/admin-auth.server");
  clearMasterCookie();
  return { ok: true as const };
});
