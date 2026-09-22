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
  const { fromSeedGifts } = await import("@/lib/gifts-seed.server");
  const { mergeLocalGifts, withLocalReserved } = await import("@/lib/local-store.server");
  return withLocalReserved(await mergeLocalGifts(fromSeedGifts()));
}

async function findGuestByInviteToken(token: string) {
  const local = await import("@/lib/local-store.server");
  return local.findGuestByToken(token);
}

export const getInvite = createServerFn({ method: "GET" })
  .inputValidator((data: unknown) => tokenSchema.parse(data))
  .handler(async ({ data }): Promise<InviteData> => {
    const guest = await findGuestByInviteToken(data.token);
    if (!guest) return { found: false, gifts: [] };

    const local = await import("@/lib/local-store.server");
    const localReservation = await local.findConfirmedReservation(guest.id);
    if (localReservation) {
      return {
        found: true,
        guestName: guest.name,
        guestWhatsapp: guest.whatsapp ?? undefined,
        gifts: [],
        reservation: {
          confirmedAt: localReservation.confirmed_at,
          items: localReservation.items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            unit: i.unit,
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
    const stored = (await local.findGuestById(guest.id)) ?? guest;
    await local.upsertLocalGuest({
      ...stored,
      name: data.name,
      whatsapp: data.whatsapp,
      token: stored.token || data.token,
      created_at: stored.created_at || new Date().toISOString(),
    });
    return { ok: true, reservation_id: reservation.id };
  });
