import { linkConvite, mensagemConviteWhatsapp, numeroWhatsappEvo } from "@/lib/whatsapp-convite";

function evoConfig() {
  const url = (process.env["EVO_API_URL"] || "").replace(/\/$/, "");
  const key = process.env["EVO_API_KEY"] || "";
  const instance = process.env["EVO_INSTANCE"] || "5181077770";
  return { url, key, instance };
}

async function postJson(path: string, body: unknown, key: string) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text };
  }
  return { ok: response.ok, status: response.status, json };
}

export async function enviarConviteWhatsapp(nome: string, whatsapp: string, token: string) {
  const { url, key, instance } = evoConfig();
  if (!url || !key) {
    return { ok: false as const, error: "Evolution API não configurada." };
  }
  const number = numeroWhatsappEvo(whatsapp);
  if (number.length < 12) {
    return { ok: false as const, error: "WhatsApp inválido para envio." };
  }
  const text = mensagemConviteWhatsapp(nome, linkConvite(token));
  const endpoint = `${url}/message/sendText/${encodeURIComponent(instance)}`;

  const v2 = await postJson(endpoint, { number, text, delay: 1200, linkPreview: true }, key);
  if (v2.ok) return { ok: true as const };

  const v1 = await postJson(
    endpoint,
    {
      number,
      options: { delay: 1200, presence: "composing", linkPreview: true },
      textMessage: { text },
    },
    key,
  );
  if (v1.ok) return { ok: true as const };

  console.error("[evo] falha ao enviar convite", v2.status, v2.json, v1.status, v1.json);
  return { ok: false as const, error: "Não foi possível enviar o WhatsApp agora." };
}
