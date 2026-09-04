import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, LogOut, Pencil, Trash2, Share2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
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
  adminOverview,
  adminSaveGift,
  adminSaveGuest,
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
    ],
  }),
  component: Admin,
});

function Admin() {
  const [sessao, setSessao] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSessao(Boolean(s)));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (sessao === null) return <div className="p-10 text-center text-sm">Carregando...</div>;
  if (!sessao) return <Login />;
  return <Painel />;
}

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [carregando, setCarregando] = useState(false);

  async function entrar(e: React.FormEvent) {
    e.preventDefault();
    setCarregando(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
    setCarregando(false);
    if (error) toast.error("E-mail ou senha incorretos.");
  }

  return (
    <main className="folha-bg flex min-h-screen items-center justify-center px-6">
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
              required
            />
          </div>
        </div>
        <Button type="submit" className="mt-6 w-full rounded-full" disabled={carregando}>
          {carregando ? "Entrando..." : "Entrar"}
        </Button>
      </form>
    </main>
  );
}

function Painel() {
  const qc = useQueryClient();
  const overview = useServerFn(adminOverview);
  const { data } = useQuery({ queryKey: ["admin", "overview"], queryFn: () => overview() });

  const numeros = [
    ["Presentes", data?.totalGifts],
    ["Disponíveis", data?.giftsAvailable],
    ["Concluídos", data?.giftsDone],
    ["Convidados", data?.totalGuests],
    ["Já escolheram", data?.guestsChosen],
    ["Ainda não", data?.guestsPending],
  ] as const;

  return (
    <main className="mx-auto min-h-screen w-full max-w-3xl px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-3xl">Área do casal</h1>
        <Button
          variant="ghost"
          size="sm"
          onClick={async () => {
            await supabase.auth.signOut();
            qc.clear();
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

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const r = await salvar({ data: { id, name: nome.trim(), desired: Number(qtd) || 1 } });
    if (!r.ok) {
      toast.error(r.error ?? "Não foi possível salvar.");
      return;
    }
    toast.success("Presente salvo.");
    setId(undefined);
    setNome("");
    setQtd("1");
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
                    Deseja {g.desired} · reservados {g.reserved} · disponíveis {g.available}
                  </p>
                  <p className="mt-1 text-xs font-medium text-primary">{g.status}</p>
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
    return `${window.location.origin}/?token=${token}`;
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
      {(data ?? []).map((r) => (
        <li key={r.id} className="rounded-2xl border bg-card p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="font-medium">{r.guestName}</p>
              <p className="text-xs text-muted-foreground">{r.whatsapp}</p>
              <p className="text-xs text-muted-foreground">{formatDateTime(r.confirmedAt)}</p>
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
                    onClick={() => set(r.id, i.giftId, i.quantity - 1)}
                  >
                    –
                  </Button>
                  <span className="w-6 text-center font-semibold">{i.quantity}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Aumentar"
                    onClick={() => set(r.id, i.giftId, i.quantity + 1)}
                  >
                    +
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="Remover"
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
                await mudarStatus({
                  data: {
                    reservationId: r.id,
                    status: r.status === "confirmed" ? "cancelled" : "confirmed",
                  },
                });
                recarregar();
              }}
            >
              {r.status === "confirmed" ? "Cancelar escolha" : "Reativar"}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
