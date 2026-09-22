import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const tokenSchema = z.object({ token: z.string().min(6).max(120) });

const itemsSchema = z.object({
  token: z.string().min(6).max(120),
  name: z.string().trim().min(2).max(120),
  whatsapp: z.string().trim().min(10).max(25),
  items: z
    .array(
      z.object({
        gift_id: z.string().uuid(),
        quantity: z.number().int().min(1).max(50),
      }),
    )
    .min(1)
    .max(30),
});

export type PublicGift = {
  id: string;
  name: string;
  desired: number;
  unit: string;
  available: number;
};

export type InviteData = {
  found: boolean;
  guestName?: string;
  guestWhatsapp?: string;
  gifts: PublicGift[];
  reservation?: {
    confirmedAt: string;
    items: { name: string; quantity: number; unit?: string }[];
  } | null;
};

async function loadGifts() {
  const { fromSeedGifts, ensureInitialGifts, unitOf } = await import("@/lib/gifts-seed.server");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await ensureInitialGifts(supabaseAdmin as never);
    const withUnit = await supabaseAdmin.from("gifts").select("id, name, desired_quantity, unit").order("name");
    const giftsQuery = withUnit.error
      ? await supabaseAdmin.from("gifts").select("id, name, desired_quantity").order("name")
      : withUnit;
    const [{ data: gifts, error: giftsError }, { data: items, error: itemsError }] =
      await Promise.all([
        Promise.resolve(giftsQuery),
        supabaseAdmin
          .from("reservation_items")
          .select("gift_id, quantity, reservations!inner(status)")
          .eq("reservations.status", "confirmed"),
      ]);
    if (giftsError) throw giftsError;
    if (itemsError) throw itemsError;
    const { mergeLocalGifts, withLocalReserved } = await import("@/lib/local-store.server");
    const reserved = new Map<string, number>();
    for (const item of items ?? []) {
      reserved.set(item.gift_id, (reserved.get(item.gift_id) ?? 0) + item.quantity);
    }
    const base = !gifts?.length
      ? fromSeedGifts()
      : gifts.map((g) => ({
          id: g.id,
          name: g.name,
          desired: g.desired_quantity,
          unit: unitOf(g.name, "unit" in g ? g.unit : null),
          reserved: reserved.get(g.id) ?? 0,
          available: Math.max(0, g.desired_quantity - (reserved.get(g.id) ?? 0)),
        }));
    return withLocalReserved(await mergeLocalGifts(base));
  } catch (error) {
    console.error("[convite] usando lista inicial de presentes", error);
    const { mergeLocalGifts, withLocalReserved } = await import("@/lib/local-store.server");
    return withLocalReserved(await mergeLocalGifts(fromSeedGifts()));
  }
}

async function findGuestByInviteToken(token: string) {
  const local = await import("@/lib/local-store.server");
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: guest } = await supabaseAdmin
      .from("guests")
      .select("id, name, whatsapp")
      .eq("token", token)
      .maybeSingle();
    if (guest) return guest;
  } catch (error) {
    console.error("[convite] busca supabase", error);
  }
  return local.findGuestByToken(token);
}

export const getInvite = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<InviteData> => {
    const guest = await findGuestByInviteToken(data.token);
    if (!guest) return { found: false, gifts: [] };

    const local = await import("@/lib/local-store.server");
    let reservation: {
      confirmed_at: string;
      reservation_items: { quantity: number; gifts?: { name?: string; unit?: string } | null }[];
    } | null = null;

    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: fromDb } = await supabaseAdmin
        .from("reservations")
        .select("id, confirmed_at, reservation_items(quantity, gifts(name, unit))")
        .eq("guest_id", guest.id)
        .eq("status", "confirmed")
        .maybeSingle();
      if (fromDb) reservation = fromDb;
    } catch (error) {
      console.error("[convite] reserva supabase", error);
    }

    if (!reservation) {
      const localReservation = await local.findConfirmedReservation(guest.id);
      if (localReservation) {
        reservation = {
          confirmed_at: localReservation.confirmed_at,
          reservation_items: localReservation.items.map((i) => ({
            quantity: i.quantity,
            gifts: { name: i.name, unit: i.unit },
          })),
        };
      }
    }

    if (reservation) {
      return {
        found: true,
        guestName: guest.name,
        guestWhatsapp: guest.whatsapp ?? undefined,
        gifts: [],
        reservation: {
          confirmedAt: reservation.confirmed_at,
          items: (reservation.reservation_items ?? []).map((i) => ({
            name: i.gifts?.name ?? "Presente",
            quantity: i.quantity,
            unit: i.gifts && "unit" in i.gifts ? (i.gifts as { unit?: string }).unit : undefined,
          })),
        },
      };
    }

    const gifts = await loadGifts();
    return {
      found: true,
      guestName: guest.name,
      guestWhatsapp: guest.whatsapp ?? undefined,
      reservation: null,
      gifts: gifts
        .filter((g) => g.available > 0)
        .map(({ id, name, desired, unit, available }) => ({ id, name, desired, unit, available })),
    };
  });

export const listAvailableGifts = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<PublicGift[]> => {
    const guest = await findGuestByInviteToken(data.token);
    if (!guest) return [];
    const gifts = await loadGifts();
    return gifts
      .filter((g) => g.available > 0)
      .map(({ id, name, desired, unit, available }) => ({ id, name, desired, unit, available }));
  });

export const confirmReservation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => itemsSchema.parse(data))
  .handler(async ({ data }) => {
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: result, error } = await supabaseAdmin.rpc("confirm_reservation", {
        _token: data.token,
        _guest_name: data.name,
        _whatsapp: data.whatsapp,
        _items: data.items,
      });
      if (!error && result) return result as { ok: boolean; error?: string; reservation_id?: string };
      if (error) console.error("[convite] confirm supabase", error);
    } catch (error) {
      console.error("[convite] confirm supabase", error);
    }

    const local = await import("@/lib/local-store.server");
    const guest = await findGuestByInviteToken(data.token);
    if (!guest) return { ok: false, error: "Convite não encontrado." };
    if (await local.findConfirmedReservation(guest.id)) {
      return { ok: false, error: "Você já escolheu presentes neste convite." };
    }

    const gifts = await loadGifts();
    const items = [];
    for (const item of data.items) {
      const gift = gifts.find((g) => g.id === item.gift_id);
      if (!gift || gift.available < item.quantity) {
        return { ok: false, error: "Alguns presentes não estão mais disponíveis." };
      }
      items.push({
        id: crypto.randomUUID(),
        gift_id: gift.id,
        name: gift.name,
        quantity: item.quantity,
        unit: gift.unit,
      });
    }

    const reservation = await local.saveLocalReservation({
      id: crypto.randomUUID(),
      guest_id: guest.id,
      guest_name: data.name,
      whatsapp: data.whatsapp,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
      items,
    });
    await local.upsertLocalGuest({
      id: guest.id,
      name: data.name,
      whatsapp: data.whatsapp,
      token: (await local.findGuestById(guest.id))?.token ?? data.token,
      created_at: (await local.findGuestById(guest.id))?.created_at ?? new Date().toISOString(),
    });
    return { ok: true, reservation_id: reservation.id };
  });
