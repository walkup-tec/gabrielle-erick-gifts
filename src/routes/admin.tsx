import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Copy, LogOut, Pencil, Trash2, Share2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatDateTime, maskWhatsapp } from "@/lib/format";
import {
  adminDeleteGift,
  adminDeleteGuest,
  adminListGifts,
  adminListGuests,
  adminListReservations,
  adminLogin,
  adminLogout,
  adminOverview,
  adminSaveGift,
  adminSaveGuest,
  adminSession,
  adminSetReservationItem,
  adminSetReservationStatus,
} from "@/lib/admin.functions";

export const Route = createFileRoute("/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Área do casal · Chá dos Noivos" },
      { name: "description", content: "Painel reservado de Gabrielle e Erick." },
      { name: "robots", content: "noindex,nofollow" },
      { property: "og:title", content: "Área do casal" },
      { property: "og:description", content: "Painel reservado de Gabrielle e Erick." },
      { name: "x-deploy-marker", content: "GIFTS-FALLBACK-20260911" },
    ],
  }),
  component: Admin,
});

function Admin() {
  const sessaoFn = useServerFn(adminSession);
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "session"],
    queryFn: () => sessaoFn(),
  });

  if (isLoading) return <div className="p-10 text-center text-sm">Carregando...</div>;
  if (!data?.ok) return <Login />;
  return <Painel />;
}

function Login() {
  const qc = useQueryClient();
  const [email, setEmail] = useState("drax@draxsistemas.com.br");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);
  const entrarFn = useServerFn(adminLogin);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    try {
      const r = await entrarFn({ data: { email, password: senha } });
      if (!r.ok) {
        toast.error(r.error ?? "E-mail ou senha incorretos.");
        return;
      }
      await qc.invalidateQueries({ queryKey: ["admin", "session"] });
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main className="folha-bg flex min-h-screen items-center justify-center px-6" data-deploy="ADMIN-LOGIN-COOKIE-20260911">
      <form onSubmit={entrar} className="w-full max-w-sm rounded-3xl border bg-card p-7 shadow-sm">
        <h1 className="text-center font-display text-3xl">Área do casal</h1>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          Entre para cuidar da lista de presentes.
        </p>
        <div className="mt-6 space-y-4">
          <div>
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1.5"
              autoComplete="email"
              required
            />
          </div>
          <div>
            <Label htmlFor="senha">Senha</Label>
            <Input
              id="senha"
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="mt-1.5"
              autoComplete="current-password"
              minLength={8}
              required
            />
          </div>
        </div>
        <Button type="submit" className="mt-6 w-full rounded-full" disabled={carregando}>
          {carregando ? "Aguarde..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}

function Painel() {
  const qc = useQueryClient();
  const overview = useServerFn(adminOverview);
  const sairFn = useServerFn(adminLogout);
  const { data } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => overview() });

  const numeros = [
    ["Presentes", data?.totalGifts],
    ["Disponíveis", data?.giftsAvailable],
    ["Concluídos", data?.giftsDone],
    ["Convidados", data?.totalGuests],
    ["Já escolheram", data?.guestsChosen],
    ["Ainda não", data?.guestsPending],
    ["Reservas", data?.totalReservations],
  ] as const;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Área do casal</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await sairFn();
            window.location.reload();
          }}
        >
          <LogOut className="mr-1.5 h-4 w-4" aria-hidden /> Sair
        </Button>
      </div>

      <div className="mt-5 grid grid-cols-3 gap-2">
        {numeros.map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-2xl border bg-card p-3 text-center">
            <p className="font-display text-2xl">{valor ?? "–"}</p>
            <p className="text-[11px] text-muted-foreground">{rotulo}</p>
          </div>
        ))}
      </div>

      <Tabs defaultValue="presentes" className="mt-6">
        <TabsList className="w-full">
          <TabsTrigger value="presentes" className="flex-1">
            Presentes
          </TabsTrigger>
          <TabsTrigger value="convidados" className="flex-1">
            Convidados
          </TabsTrigger>
          <TabsTrigger value="escolhas" className="flex-1">
            Escolhas
          </TabsTrigger>
        </TabsList>
        <TabsContent value="presentes">
          <Presentes />
        </TabsContent>
        <TabsContent value="convidados">
          <Convidados />
        </TabsContent>
        <TabsContent value="escolhas">
          <Escolhas />
        </TabsContent>
      </Tabs>
    </main>
  );
}

function useRecarregar() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["admin"] });
}

/* --------------------------------- Presentes -------------------------------- */

function Presentes() {
  const listar = useServerFn(adminListGifts);
  const salvar = useServerFn(adminSaveGift);
  const excluir = useServerFn(adminDeleteGift);
  const recarregar = useRecarregar();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "gifts"], queryFn: () => listar() });

  const [id, setId] = useState<string | undefined>();
  const [nome, setNome] = useState("");
  const [qtd, setQtd] = useState("1");
  const [unidade, setUnidade] = useState("Item");

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = await salvar({
      data: { id, name: nome.trim(), desired: Number(qtd) || 1, unit: unidade.trim() || "Item" },
    });
    if (!r.ok) {
      toast.error(r.error ?? "Não foi possível salvar.");
      return;
    }
    toast.success("Presente salvo.");
    setId(undefined);
    setNome("");
    setQtd("1");
    setUnidade("Item");
    recarregar();
  }

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={enviar} className="rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="g-nome">Nome do presente</Label>
            <Input
              id="g-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div className="w-full sm:w-28">
            <Label htmlFor="g-qtd">Quantidade</Label>
            <Input
              id="g-qtd"
              type="number"
              min={1}
              value={qtd}
              onChange={(e) => setQtd(e.target.value)}
              className="mt-1.5"
            />
          </div>
          <div className="w-full sm:w-32">
            <Label htmlFor="g-unidade">Unidade</Label>
            <Input
              id="g-unidade"
              value={unidade}
              onChange={(e) => setUnidade(e.target.value)}
              className="mt-1.5"
              list="g-unidade-opcoes"
              required
            />
            <datalist id="g-unidade-opcoes">
              <option value="Item" />
              <option value="Kit" />
            </datalist>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" className="rounded-full">
            {id ? "Salvar alterações" : "Adicionar presente"}
          </Button>
          {id && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setId(undefined);
                setNome("");
                setQtd("1");
                setUnidade("Item");
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((g) => (
            <li key={g.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-medium">{g.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.desired} {g.unit} · reservados {g.reserved} · disponíveis {g.available}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">{g.status}</p>
                  {g.created_at ? (
                    <p className="mt-1 text-[11px] text-muted-foreground">{formatDateTime(g.created_at)}</p>
                  ) : null}
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Editar"
                    onClick={() => {
                      setId(g.id);
                      setNome(g.name);
                      setQtd(String(g.desired));
                      setUnidade(g.unit);
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir"
                    onClick={async () => {
                      if (!confirm(`Excluir "${g.name}"?`)) return;
                      const r = await excluir({ data: { id: g.id } });
                      if (!r.ok) {
                        toast.error(r.error ?? "Não foi possível excluir.");
                        return;
                      }
                      recarregar();
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* -------------------------------- Convidados -------------------------------- */

function Convidados() {
  const listar = useServerFn(adminListGuests);
  const salvar = useServerFn(adminSaveGuest);
  const excluir = useServerFn(adminDeleteGuest);
  const recarregar = useRecarregar();
  const { data, isLoading } = useQuery({ queryKey: ["admin", "guests"], queryFn: () => listar() });

  const [id, setId] = useState<string | undefined>();
  const [nome, setNome] = useState("");
  const [whats, setWhats] = useState("");

  function linkDe(token: string) {
    return `${window.location.origin}/convite/${token}`;
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    await salvar({ data: { id, name: nome.trim(), whatsapp: whats || null } });
    toast.success("Convidado salvo.");
    setId(undefined);
    setNome("");
    setWhats("");
    recarregar();
  }

  return (
    <div className="mt-4 space-y-4">
      <form onSubmit={enviar} className="rounded-2xl border bg-card p-4">
        <div className="flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="c-nome">Nome</Label>
            <Input
              id="c-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              className="mt-1.5"
              required
            />
          </div>
          <div className="flex-1">
            <Label htmlFor="c-whats">WhatsApp (opcional)</Label>
            <Input
              id="c-whats"
              value={whats}
              inputMode="tel"
              placeholder="(11) 99999-9999"
              onChange={(e) => setWhats(maskWhatsapp(e.target.value))}
              className="mt-1.5"
            />
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button type="submit" className="rounded-full">
            {id ? "Salvar alterações" : "Adicionar convidado"}
          </Button>
          {id && (
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setId(undefined);
                setNome("");
                setWhats("");
              }}
            >
              Cancelar
            </Button>
          )}
        </div>
      </form>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : (
        <ul className="space-y-2">
          {(data ?? []).map((c) => (
            <li key={c.id} className="rounded-2xl border bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{c.name}</p>
                  <p className="text-xs text-muted-foreground">{c.whatsapp ?? "sem WhatsApp"}</p>
                  {c.created_at ? (
                    <p className="text-xs text-muted-foreground">{formatDateTime(c.created_at)}</p>
                  ) : null}
                  <p className="mt-1 text-xs font-medium text-primary">
                    {c.chosen ? "Já escolheu" : "Ainda não escolheu"}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Copiar link"
                    onClick={async () => {
                      await navigator.clipboard.writeText(linkDe(c.token));
                      toast.success("Link copiado.");
                    }}
                  >
                    <Copy className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Compartilhar"
                    onClick={async () => {
                      const url = linkDe(c.token);
                      if (navigator.share) await navigator.share({ title: "Convite", url });
                      else window.open(`https://wa.me/?text=${encodeURIComponent(url)}`, "_blank");
                    }}
                  >
                    <Share2 className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Editar"
                    onClick={() => {
                      setId(c.id);
                      setNome(c.name);
                      setWhats(c.whatsapp ?? "");
                    }}
                  >
                    <Pencil className="h-4 w-4" aria-hidden />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Excluir"
                    onClick={async () => {
                      if (!confirm(`Excluir ${c.name}?`)) return;
                      await excluir({ data: { id: c.id } });
                      recarregar();
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* --------------------------------- Escolhas --------------------------------- */

function Escolhas() {
  const listar = useServerFn(adminListReservations);
  const listarPresentes = useServerFn(adminListGifts);
  const ajustar = useServerFn(adminSetReservationItem);
  const mudarStatus = useServerFn(adminSetReservationStatus);
  const recarregar = useRecarregar();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "reservations"],
    queryFn: () => listar(),
  });
  const { data: presentes } = useQuery({
    queryKey: ["admin", "gifts"],
    queryFn: () => listarPresentes(),
  });

  async function set(reservationId: string, giftId: string, quantity: number) {
    const r = await ajustar({ data: { reservationId, giftId, quantity } });
    if (!r.ok) {
      toast.error(r.error ?? "Não foi possível ajustar.");
      return;
    }
    recarregar();
  }

  if (isLoading) return <p className="mt-4 text-sm text-muted-foreground">Carregando...</p>;

  return (
    <ul className="mt-4 space-y-3">
      {(data ?? []).length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhuma escolha confirmada ainda.</p>
      )}
      {(data ?? []).map((r) => {
        const ativa = r.status === "confirmed";
        return (
        <li key={r.id} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{r.guestName}</p>
              <p className="text-xs text-muted-foreground">{r.whatsapp}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.confirmedAt)}</p>
              {r.guestToken ? (
                <button
                  type="button"
                  className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      `${window.location.origin}/convite/${r.guestToken}`,
                    );
                    toast.success("Link do convite copiado.");
                  }}
                >
                  Copiar link do convite
                </button>
              ) : null}
            </div>
            <span className="rounded-full bg-secondary px-3 py-1 text-xs">
              {r.status === "confirmed" ? "Confirmada" : "Cancelada"}
            </span>
          </div>

          <ul className="mt-3 space-y-2">
            {r.items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 text-sm">
                <span>{i.name}</span>
                <span className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Diminuir"
                    disabled={!ativa}
                    onClick={() => set(r.id, i.giftId, i.quantity - 1)}
                  >
                    –
                  </Button>
                  <span className="w-6 text-center font-semibold">{i.quantity}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Aumentar"
                    disabled={!ativa}
                    onClick={() => set(r.id, i.giftId, i.quantity + 1)}
                  >
                    +
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover"
                    disabled={!ativa}
                    onClick={() => set(r.id, i.giftId, 0)}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden />
                  </Button>
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <select
              aria-label="Adicionar presente"
              className="rounded-full border bg-background px-3 py-2 text-sm"
              value=""
              disabled={!ativa}
              onChange={(e) => {
                if (e.target.value) set(r.id, e.target.value, 1);
              }}
            >
              <option value="">Adicionar presente…</option>
              {(presentes ?? [])
                .filter((g) => g.available > 0)
                .map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
            </select>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                const rStatus = await mudarStatus({
                  data: {
                    reservationId: r.id,
                    status: r.status === "confirmed" ? "cancelled" : "confirmed",
                  },
                });
                if (!rStatus.ok) {
                  toast.error(rStatus.error ?? "Não foi possível atualizar a escolha.");
                  return;
                }
                recarregar();
              }}
            >
              {r.status === "confirmed" ? "Cancelar escolha" : "Reativar"}
            </Button>
          </div>
        </li>
        );
      })}
    </ul>
  );
}
