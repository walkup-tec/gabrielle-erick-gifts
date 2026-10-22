export function whatsappDigits(value: string) {
  return value.replace(/\D/g, "");
}

/** Compara só os dígitos. 5551999666841 e (51) 99966-6841 são o mesmo número. */
export function canonicalWhatsapp(value: string | null | undefined) {
  const digits = whatsappDigits(value || "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length > 11) return digits.slice(2).slice(0, 11);
  return digits.slice(0, 11);
}

export function sameWhatsapp(a: string | null | undefined, b: string | null | undefined) {
  const left = canonicalWhatsapp(a);
  const right = canonicalWhatsapp(b);
  return left.length >= 10 && left === right;
}

export function maskWhatsapp(value: string) {
  const digits = canonicalWhatsapp(value);
  if (digits.length <= 2) return digits.length ? `(${digits}` : "";
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
}

export function isValidWhatsapp(value: string) {
  const digits = canonicalWhatsapp(value);
  return digits.length === 10 || digits.length === 11;
}

export function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
