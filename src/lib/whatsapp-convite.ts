import { site } from "@/content/site";

export function mensagemConviteWhatsapp(nome: string, link: string) {
  return [
    `Oi, ${nome}!`,
    "",
    "Somos a Gabrielle e o Erick. Que alegria ter você com a gente no nosso Chá dos Noivos.",
    "",
    "📅 18 de outubro de 2026, às 6:00",
    `📍 ${site.evento.local}`,
    "Av. Rodolfo Müler, 1772 — Feitoria, São Leopoldo - RS",
    "",
    "Neste link exclusivo você vê o convite e escolhe o presente da nossa casa:",
    "",
    link,
    "",
    "Com carinho,",
    "Gabrielle & Erick",
  ].join("\n");
}

export function numeroWhatsappEvo(whatsapp: string) {
  const digits = whatsapp.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  return `55${digits}`;
}

export function linkConvite(token: string) {
  const base = (process.env["PUBLIC_SITE_URL"] || "https://chaanaeerick.draxsistemas.com.br").replace(
    /\/$/,
    "",
  );
  return `${base}/convite/${token}`;
}
