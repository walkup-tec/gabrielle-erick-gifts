/**
 * Garante a conta master do painel. Só importar dentro de handlers de servidor.
 */
const MASTER_EMAIL = (process.env["ADMIN_EMAIL"] || "drax@draxsistemas.com.br").trim().toLowerCase();
const MASTER_PASSWORD = process.env["ADMIN_PASSWORD"] || "draxsistemas";

export async function ensureMasterAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { data: listed, error: listError } = await supabaseAdmin.auth.admin.listUsers({
    page: 1,
    perPage: 1000,
  });
  if (listError) throw listError;

  const existing = listed.users.find((u) => u.email?.toLowerCase() === MASTER_EMAIL);
  let userId = existing?.id;

  if (!userId) {
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: MASTER_EMAIL,
      password: MASTER_PASSWORD,
      email_confirm: true,
    });
    if (error || !created.user) throw error ?? new Error("Não foi possível criar o administrador.");
    userId = created.user.id;
  } else {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: MASTER_PASSWORD,
      email_confirm: true,
    });
    if (error) throw error;
  }

  const { data: roles, error: roleError } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("user_id", userId)
    .eq("role", "admin");
  if (roleError) throw roleError;
  if (!roles?.length) {
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "admin" });
    if (error) throw error;
  }
}
