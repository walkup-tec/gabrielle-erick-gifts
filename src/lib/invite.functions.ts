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
  available: number;
};

export type InviteData = {
  found: boolean;
  guestName?: string;
  gifts: PublicGift[];
  reservation?: {
    confirmedAt: string;
    items: { name: string; quantity: number }[];
  } | null;
};

async function loadGifts() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const [{ data: gifts, error: giftsError }, { data: items, error: itemsError }] =
    await Promise.all([
      supabaseAdmin.from("gifts").select("id, name, desired_quantity").order("name"),
      supabaseAdmin
        .from("reservation_items")
        .select("gift_id, quantity, reservations!inner(status)")
        .eq("reservations.status", "confirmed"),
    ]);
  if (giftsError) throw giftsError;
  if (itemsError) throw itemsError;

  const reserved = new Map<string, number>();
  for (const item of items ?? []) {
    reserved.set(item.gift_id, (reserved.get(item.gift_id) ?? 0) + item.quantity);
  }
  return (gifts ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    desired: g.desired_quantity,
    reserved: reserved.get(g.id) ?? 0,
    available: Math.max(0, g.desired_quantity - (reserved.get(g.id) ?? 0)),
  }));
}

export const getInvite = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<InviteData> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: guest } = await supabaseAdmin
      .from("guests")
      .select("id, name")
      .eq("token", data.token)
      .maybeSingle();

    if (!guest) return { found: false, gifts: [] };

    const { data: reservation } = await supabaseAdmin
      .from("reservations")
      .select("id, confirmed_at, reservation_items(quantity, gifts(name))")
      .eq("guest_id", guest.id)
      .eq("status", "confirmed")
      .maybeSingle();

    if (reservation) {
      return {
        found: true,
        guestName: guest.name,
        gifts: [],
        reservation: {
          confirmedAt: reservation.confirmed_at,
          items: (reservation.reservation_items ?? []).map((i) => ({
            name: i.gifts?.name ?? "Presente",
            quantity: i.quantity,
          })),
        },
      };
    }

    const gifts = await loadGifts();
    return {
      found: true,
      guestName: guest.name,
      reservation: null,
      gifts: gifts
        .filter((g) => g.available > 0)
        .map(({ id, name, desired, available }) => ({ id, name, desired, available })),
    };
  });

export const listAvailableGifts = createServerFn({ method: "GET" }).handler(
  async (): Promise<PublicGift[]> => {
    const gifts = await loadGifts();
    return gifts
      .filter((g) => g.available > 0)
      .map(({ id, name, desired, available }) => ({ id, name, desired, available }));
  },
);

export const confirmReservation = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => itemsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: result, error } = await supabaseAdmin.rpc("confirm_reservation", {
      _token: data.token,
      _guest_name: data.name,
      _whatsapp: data.whatsapp,
      _items: data.items,
    });
    if (error) throw error;
    return result as { ok: boolean; error?: string; reservation_id?: string };
  });
