export function mensagemConviteWhatsapp(nome: string, link: string) {
  return [
    `Olá, ${nome}! 💚`,
    "",
    "Estamos muito felizes em poder compartilhar com você um momento tão especial para nós: o nosso Chá dos Noivos !💍",
    "",
    "Estamos vivendo uma fase cheia de planos, sonhos e preparativos para o nosso casamento, e queremos muito celebrar esse novo passo ao lado de pessoas que amamos e que fazem parte da nossa história.",
    "",
    "💚 Data | 24 de outubro de 2026",
    "💚 Horário | 16h",
    "💚 Local | Rua Emancipação 115, bairro Primavera - NH",
    "",
    "Preparamos uma lista de presentes com alguns itens que farão parte do nosso novo lar e dessa nova etapa da nossa vida! Para que você possa nos presentear, deixamos a lista disponível aqui:",
    `📎 ${link}`,
    "",
    "E claro… teremos uma surpresinha preparada para deixar a tarde ainda mais divertida!👀🤭💚",
    "",
    "Estamos muito felizes e esperamos você para comemorar esse novo capítulo com a gente!✨",
    "",
    "Com carinho,",
    "Érick & Ana 💍",
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
