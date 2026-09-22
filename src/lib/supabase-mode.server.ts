/** Só tenta o Lovable/Supabase quando existe chave de serviço de verdade. */
export function supabaseEnabled() {
  const skip = process.env["SKIP_SUPABASE"];
  if (skip === "1" || skip === "true") return false;
  const key =
    process.env["SUPABASE_SERVICE_ROLE_KEY"] ||
    process.env["SUPABASE_SECRET_KEY"] ||
    process.env["SUPABASE_SECRET"] ||
    "";
  return key.startsWith("eyJ") || key.startsWith("sb_secret_");
}
