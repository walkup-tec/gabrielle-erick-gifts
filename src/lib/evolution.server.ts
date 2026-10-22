import { linkConvite, mensagemConviteWhatsapp, numeroWhatsappEvo } from "@/lib/whatsapp-convite";

type EvoInstance = {
  name?: string;
  connectionStatus?: string;
  ownerJid?: string;
};

function evoConfig() {
  const key = process.env["EVO_API_KEY"] || "";
  const instance = process.env["EVO_INSTANCE"] || "gabi";
  const urls = [
    process.env["EVO_API_URL"],
    process.env["EVO_API_FALLBACK_URL"],
    "http://72.60.51.127:30181",
  ]
    .map((value) => (value || "").trim().replace(/\/$/, ""))
    .filter((value, index, all) => value && all.indexOf(value) === index);
  return { urls, key, instance };
}

function evoMessage(json: unknown) {
  if (!json || typeof json !== "object") return "";
  const response = (json as { response?: { message?: unknown } }).response;
  const message = response?.message;
  if (Array.isArray(message)) return message.map(String).join(" ");
  if (typeof message === "string") return message;
  return "";
}

function traduzErro(status: number, json: unknown, fallback: string) {
  const text = evoMessage(json).toLowerCase();
  if (status === 0) return "A Evolution API não respondeu a tempo.";
  if (text.includes("does not exist")) return "A instância do WhatsApp não foi encontrada.";
  if (text.includes("not found")) return "A Evolution API não encontrou esse envio.";
  if (text.includes("disconnect") || text.includes("close") || text.includes("not connected")) {
    return "O WhatsApp da instância está desconectado.";
  }
  if (status === 401 || status === 403) return "A chave da Evolution API foi recusada.";
  return fallback;
}

async function requestJson(path: string, key: string, init?: RequestInit, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(path, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        ...(init?.headers ?? {}),
      },
      signal: controller.signal,
    });
    const raw = await response.text();
    let json: unknown = null;
    try {
      json = raw ? JSON.parse(raw) : null;
    } catch {
      json = { raw };
    }
    return { ok: response.ok, status: response.status, json };
  } catch (error) {
    const message = error instanceof Error ? error.message : "timeout";
    console.error("[evo] falha de rede", path, message);
    return { ok: false, status: 0, json: { error: message } };
  } finally {
    clearTimeout(timer);
  }
}

function digits(value: string) {
  return value.replace(/\D/g, "");
}

function instanceMatches(instance: EvoInstance, configured: string) {
  const name = instance.name || "";
  if (name === configured) return true;
  const wanted = digits(configured);
  if (!wanted) return false;
  const owner = digits(instance.ownerJid || "");
  return owner.endsWith(wanted) || name === wanted;
}

async function resolveConnection(urls: string[], key: string, configured: string) {
  for (const url of urls) {
    const fetched = await requestJson(`${url}/instance/fetchInstances`, key, { method: "GET" }, 5000);
    if (!fetched.ok || !Array.isArray(fetched.json)) continue;
    const instances = fetched.json as EvoInstance[];
    const aberta = instances.find(
      (item) => (item.connectionStatus || "").toLowerCase() === "open" && item.name,
    );
    if (aberta?.name) {
      return { url, instanceName: aberta.name, status: "open" };
    }
    const matches = instances.filter((item) => instanceMatches(item, configured));
    const open = matches.find((item) => item.connectionStatus === "open") ?? matches[0];
    if (open?.name) {
      return { url, instanceName: open.name, status: open.connectionStatus };
    }
    const named = instances.find((item) => item.name === configured);
    if (named?.name) {
      return { url, instanceName: named.name, status: named.connectionStatus };
    }
    return { url, instanceName: configured, status: undefined };
  }
  return { url: urls[0], instanceName: configured, status: undefined, unreachable: true as const };
}

export async function enviarTextoWhatsapp(whatsapp: string, text: string) {
  const { urls, key, instance } = evoConfig();
  if (!urls.length || !key) {
    return { ok: false as const, error: "Evolution API não configurada." };
  }
  const number = numeroWhatsappEvo(whatsapp);
  if (number.length < 12) {
    return { ok: false as const, error: "WhatsApp inválido para envio." };
  }

  const connection = await resolveConnection(urls, key, instance);
  if ("unreachable" in connection && connection.unreachable) {
    return { ok: false as const, error: "A Evolution API não está acessível neste momento." };
  }
  if (connection.status && connection.status !== "open") {
    return { ok: false as const, error: "O WhatsApp da instância está desconectado." };
  }

  const endpoint = `${connection.url}/message/sendText/${encodeURIComponent(connection.instanceName)}`;

  const v2 = await requestJson(endpoint, key, {
    method: "POST",
    body: JSON.stringify({ number, text, delay: 0, linkPreview: true }),
  });
  if (v2.ok) return { ok: true as const };

  const v1 = await requestJson(endpoint, key, {
    method: "POST",
    body: JSON.stringify({
      number,
      options: { delay: 0, presence: "composing", linkPreview: true },
      textMessage: { text },
    }),
  });
  if (v1.ok) return { ok: true as const };

  console.error("[evo] falha ao enviar mensagem", {
    instance: connection.instanceName,
    v2: { status: v2.status, json: v2.json },
    v1: { status: v1.status, json: v1.json },
  });
  return {
    ok: false as const,
    error: traduzErro(v2.status || v1.status, v2.json || v1.json, "Não foi possível enviar o WhatsApp agora."),
  };
}

export async function enviarConviteWhatsapp(nome: string, whatsapp: string, token: string) {
  return enviarTextoWhatsapp(whatsapp, mensagemConviteWhatsapp(nome, linkConvite(token)));
}

export async function tentarEnviarTextoWhatsapp(whatsapp: string, text: string) {
  try {
    return await enviarTextoWhatsapp(whatsapp, text);
  } catch (error) {
    console.error("[evo] erro inesperado", error);
    return { ok: false as const, error: "Não foi possível enviar o WhatsApp agora." };
  }
}

export async function tentarEnviarConviteWhatsapp(nome: string, whatsapp: string, token: string) {
  return tentarEnviarTextoWhatsapp(whatsapp, mensagemConviteWhatsapp(nome, linkConvite(token)));
}

export type ConexaoWhatsapp = { nome: string; numero: string };

function nomeInstancia(nome: string) {
  return nome
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function imagemQr(valor: string) {
  if (valor.startsWith("data:")) return valor;
  return `data:image/png;base64,${valor}`;
}

function lerQr(json: unknown) {
  if (!json || typeof json !== "object") return "";
  const corpo = json as { base64?: unknown; qrcode?: { base64?: unknown } };
  const bruto = typeof corpo.base64 === "string" ? corpo.base64 : corpo.qrcode?.base64;
  return typeof bruto === "string" && bruto ? imagemQr(bruto) : "";
}

function lerConexoes(json: unknown): ConexaoWhatsapp[] {
  if (!Array.isArray(json)) return [];
  return json.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const instancia = item as EvoInstance & { instance?: { instanceName?: string; state?: string } };
    const nome = instancia.name || instancia.instance?.instanceName || "";
    const status = (instancia.connectionStatus || instancia.instance?.state || "").toLowerCase();
    const numero = digits(instancia.ownerJid || "");
    if (!nome || status !== "open" || numero.length < 12) return [];
    return [{ nome, numero }];
  });
}

async function urlAlcancavel(urls: string[], key: string) {
  for (const url of urls) {
    const fetched = await requestJson(`${url}/instance/fetchInstances`, key, { method: "GET" }, 8000);
    if (fetched.ok) return { url, json: fetched.json };
  }
  return null;
}

export async function listarConexoesWhatsapp() {
  const { urls, key } = evoConfig();
  if (!urls.length || !key) {
    return { ok: false as const, error: "Evolution API não configurada.", conexoes: [] as ConexaoWhatsapp[] };
  }
  const alcançada = await urlAlcancavel(urls, key);
  if (!alcançada) {
    return {
      ok: false as const,
      error: "A Evolution API não está acessível neste momento.",
      conexoes: [] as ConexaoWhatsapp[],
    };
  }
  return { ok: true as const, conexoes: lerConexoes(alcançada.json) };
}

export async function conectarWhatsapp(nomeInformado: string) {
  const nome = nomeInstancia(nomeInformado);
  if (nome.length < 2) {
    return { ok: false as const, error: "Informe um nome para a conexão." };
  }
  const { urls, key } = evoConfig();
  if (!urls.length || !key) {
    return { ok: false as const, error: "Evolution API não configurada." };
  }
  const alcançada = await urlAlcancavel(urls, key);
  if (!alcançada) {
    return { ok: false as const, error: "A Evolution API não está acessível neste momento." };
  }

  const jaConectada = lerConexoes(alcançada.json).find((item) => item.nome === nome);
  if (jaConectada) return { ok: true as const, conectado: true as const, numero: jaConectada.numero };

  const criada = await requestJson(
    `${alcançada.url}/instance/create`,
    key,
    {
      method: "POST",
      body: JSON.stringify({ instanceName: nome, integration: "WHATSAPP-BAILEYS", qrcode: true }),
    },
    20000,
  );
  const qrCriado = lerQr(criada.json);
  if (qrCriado) return { ok: true as const, qr: qrCriado };

  const conexao = await requestJson(
    `${alcançada.url}/instance/connect/${encodeURIComponent(nome)}`,
    key,
    { method: "GET" },
    20000,
  );
  const qr = lerQr(conexao.json);
  if (qr) return { ok: true as const, qr };
  if (conexao.status === 401 || conexao.status === 403) {
    return {
      ok: false as const,
      error: traduzErro(conexao.status, conexao.json, "Não foi possível abrir o QR Code."),
    };
  }
  return { ok: true as const, aguardando: true as const };
}
