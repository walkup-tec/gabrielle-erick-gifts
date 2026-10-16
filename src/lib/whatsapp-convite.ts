export function mensagemBingoWhatsapp(nome: string) {
  return [
    `Oiii ${nome}!💚`,
    "Tem novidade para o nosso Chá dos Noivos! 💍✨",
    "Quem aí gosta de um bom bingo? 👀",
    "",
    "Então já prepara a sorte, porque vamos ter um bingo especial, com prêmios incríveis e aquele gostinho de diversão em família!🥳",
    "",
    "🎟️ Cartela por apenas R$ 5,00!",
    "",
    "🏆 Confira os prêmios:",
    "🥇 1º lugar: Licor Sheridan’s Café & Leite",
    "🥈 2º lugar: Champagne Freixenet",
    "🥉 3º lugar: Uma surpresa especial",
    "",
    "E tem um motivo ainda mais especial para participar: todo o valor arrecadado com a venda das cartelas será destinado a ajudar nos custos do nosso casamento!💚",
    "Cada cartela comprada é uma ajudinha para realizarmos esse sonho e deixa essa caminhada ainda mais especial para nós!",
    "Como adquirir | Envie o valor referente a quantidade de cartelas para o pix:",
    "*Erickcosta621@gmail.com*",
    "E envie o comprovante para a noiva (eu🤭)",
  ].join("\n");
}

export function mensagemLembreteWhatsapp(nome: string, link: string) {
  return [
    `Ah, ${nome}... um lembrete carinhoso! Para quem ainda não selecionou o presente na nossa lista, estamos reenviando o link abaixo.`,
    "",
    "Se tiver qualquer dificuldade ou não conseguir escolher, pode nos chamar que ajudamos com muito carinho! 🥰",
    "",
    `🔗 ${link}`,
    "",
    "Agradecemos de coração por todo o carinho e por fazerem parte dessa etapa tão especial da nossa vida! 🥹💚",
    "",
    "Com carinho,",
    "Érick & Ana💚",
  ].join("\n");
}

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
