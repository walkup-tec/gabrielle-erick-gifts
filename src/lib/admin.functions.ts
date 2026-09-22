import { createMiddleware, createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const requireMaster = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const { assertMasterCookie } = await import("@/lib/admin-auth.server");
  assertMasterCookie();
  return next();
});

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

async function computeGifts(): Promise<AdminGift[]> {
  const { fromSeedGifts } = await import("@/lib/gifts-seed.server");
  const { mergeLocalGifts, withLocalReserved } = await import("@/lib/local-store.server");
  return withLocalReserved(await mergeLocalGifts(fromSeedGifts()));
}

export const adminOverview = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const gifts = await computeGifts();
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
  });

/* ---------------------------------- Presentes --------------------------------- */

export const adminListGifts = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => computeGifts());

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
    try {
      const local = await import("@/lib/local-store.server");
      const id = data.id ?? crypto.randomUUID();

      if (data.id) {
        const gifts = await computeGifts();
        const current = gifts.find((g) => g.id === data.id);
        if (current && data.desired < current.reserved) {
          return { ok: false as const, error: `Já existem ${current.reserved} unidades reservadas.` };
        }
      }

      const previous = (await local.listLocalGifts()).find((g) => g.id === id);
      await local.upsertLocalGift({
        id,
        name: data.name,
        desired: data.desired,
        unit: data.unit,
        created_at: previous?.created_at ?? new Date().toISOString(),
      });
      return { ok: true as const };
    } catch (error) {
      console.error("[admin] salvar presente", error);
      return { ok: false as const, error: "Não foi possível salvar o presente." };
    }
  });

export const adminDeleteGift = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const local = await import("@/lib/local-store.server");
    await local.deleteLocalGift(data.id);
    return { ok: true as const };
  });

/* --------------------------------- Convidados --------------------------------- */

export const adminListGuests = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const local = await import("@/lib/local-store.server");
    const guests = await local.listLocalGuests();
    const chosen = new Set(
      (await local.listLocalReservations())
        .filter((r) => r.status === "confirmed")
        .map((r) => r.guest_id),
    );

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
    await local.deleteLocalGuest(data.id);
    return { ok: true };
  });

export const adminSendGuestInvite = createServerFn({ method: "POST" })
  .middleware([requireMaster])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const local = await import("@/lib/local-store.server");
    const guest = await local.findGuestById(data.id);
    if (!guest) {
      return { ok: false as const, error: "Convidado não encontrado." };
    }
    if (!guest.whatsapp) {
      return { ok: false as const, error: "Este convidado não tem WhatsApp." };
    }
    const { tentarEnviarConviteWhatsapp } = await import("@/lib/evolution.server");
    const enviado = await tentarEnviarConviteWhatsapp(guest.name, guest.whatsapp, guest.token);
    if (!enviado.ok) {
      return { ok: false as const, error: enviado.error };
    }
    return { ok: true as const };
  });

/* ---------------------------------- Escolhas ---------------------------------- */

export const adminListReservations = createServerFn({ method: "GET" })
  .middleware([requireMaster])
  .handler(async () => {
    const local = await import("@/lib/local-store.server");
    const localGuests = await local.listLocalGuests();
    const tokenByGuest = new Map(localGuests.map((g) => [g.id, g.token]));
    return (await local.listLocalReservations())
      .map((r) => ({
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
      }))
      .sort((a, b) => (a.confirmedAt < b.confirmedAt ? 1 : -1));
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
  .handler(async ({ data }) => {
    const local = await import("@/lib/local-store.server");
    const gifts = await computeGifts();
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
  .handler(async ({ data }) => {
    const local = await import("@/lib/local-store.server");
    if (data.status === "confirmed") {
      const atual = (await local.listLocalReservations()).find((r) => r.id === data.reservationId);
      if (atual && atual.status !== "confirmed") {
        const gifts = await computeGifts();
        for (const item of atual.items) {
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
    const updated = await local.setLocalReservationStatus(data.reservationId, data.status);
    if (!updated) return { ok: false as const, error: "Escolha não encontrada." };
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
    return { ok: true as const };
  });

export const adminLogout = createServerFn({ method: "POST" }).handler(async () => {
  const { clearMasterCookie } = await import("@/lib/admin-auth.server");
  clearMasterCookie();
  return { ok: true as const };
});
