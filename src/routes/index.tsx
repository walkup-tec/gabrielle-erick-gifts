import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Gift, Minus, Plus, Loader2, X, Heart } from "lucide-react";
import { toast } from "sonner";

import heroImg from "@/assets/casal-hero.jpg";
import fotoMeio from "@/assets/casal-3.jpg";
import { Ramo } from "@/components/site/Decor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { site } from "@/content/site";
import { isValidWhatsapp, maskWhatsapp } from "@/lib/format";
import { confirmReservation, getInvite, type PublicGift } from "@/lib/invite.functions";

type Search = { token?: string };

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    token: typeof search['token'] === "string" ? search['token'] : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Chá dos Noivos · Gabrielle & Erick" },
      {
        name: "description",
        content:
          "Convite e lista de presentes do Chá dos Noivos de Gabrielle e Erick, em 18 de outubro de 2026.",
      },
      { property: "og:title", content: "Chá dos Noivos · Gabrielle & Erick" },
      {
        property: "og:description",
        content: "Escolha um presente com carinho para o começo da nossa casa.",
      },
    ],
  }),
  component: Convite,
});

function Convite() {
  const { token } = Route.useSearch();
  const carregarConvite = useServerFn(getInvite);

  const query = useQuery({
    queryKey: ["convite", token],
    queryFn: () => carregarConvite({ data: { token: token! } }),
    enabled: Boolean(token),
    retry: 1,
  });

  return (
    <main className="min-h-screen bg-background">
      <Hero />
      {!token ? (
        <Aviso titulo={site.semConvite.titulo} texto={site.semConvite.texto} />
      ) : query.isLoading ? (
        <Carregando />
      ) : query.isError ? (
        <Aviso titulo="Ops" texto={site.erros.conexao} />
      ) : !query.data?.found ? (
        <Aviso titulo={site.erros.conviteInvalido} texto={site.erros.conviteInvalidoTexto} />
      ) : query.data.reservation ? (
        <Agradecimento
          nome={query.data.guestName ?? ""}
          itens={query.data.reservation.items}
          repetido
        />
      ) : (
        <Selecao
          token={token}
          nome={query.data.guestName ?? ""}
          gifts={query.data.gifts}
          onAtualizar={() => query.refetch()}
        />
      )}
      <Rodape />
    </main>
  );
}

/* ---------------------------------- Seções ---------------------------------- */

function Hero() {
  return (
    <header className="relative overflow-hidden">
      <img
        src={heroImg}
        alt="Gabrielle e Erick de mãos dadas"
        className="h-[62vh] min-h-[380px] w-full object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-forest/25 via-forest/35 to-forest/85" />
      <div className="absolute inset-x-0 bottom-0 px-6 pb-9 text-center text-primary-foreground">
        <p className="font-display text-lg tracking-[0.35em] uppercase opacity-90">
          {site.evento.titulo}
        </p>
        <h1 className="mt-2 font-display text-5xl leading-tight sm:text-6xl">{site.casal}</h1>
        <p className="mt-3 text-sm opacity-90">
          {site.evento.dataCurta} · {site.evento.local}
        </p>
        <a href="#lista">
          <Button className="mt-6 rounded-full px-7" size="lg">
            {site.hero.cta}
          </Button>
        </a>
      </div>
    </header>
  );
}

function Recado({ nome }: { nome?: string }) {
  return (
    <section className="folha-bg px-6 py-12 text-center">
      <Ramo className="mx-auto" />
      <h2 className="mt-5 font-display text-3xl">
        {nome ? site.saudacao(nome) : site.saudacaoGenerica}
      </h2>
      <p className="mx-auto mt-4 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
        {site.hero.convite}
      </p>
      <img
        src={fotoMeio}
        alt="Detalhe do casal"
        loading="lazy"
        className="mx-auto mt-8 h-56 w-full max-w-md rounded-3xl object-cover shadow-sm"
      />
      <h3 className="mt-8 font-display text-2xl">{site.apresentacao.titulo}</h3>
      <p className="mx-auto mt-3 max-w-prose text-[15px] leading-relaxed text-muted-foreground">
        {site.apresentacao.texto}
      </p>
      <p className="mt-8 text-xs uppercase tracking-[0.25em] text-muted-foreground">
        {site.casamento.titulo} · {site.casamento.dataNumerica} · {site.casamento.local}
      </p>
    </section>
  );
}

function Carregando() {
  return (
    <div className="flex items-center justify-center gap-2 py-20 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      Carregando...
    </div>
  );
}

function Aviso({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <>
      <Recado />
      <section className="px-6 pb-16">
        <div className="mx-auto max-w-md rounded-3xl border bg-card p-7 text-center shadow-sm">
          <Heart className="mx-auto h-6 w-6 text-accent" aria-hidden />
          <h2 className="mt-3 font-display text-2xl">{titulo}</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{texto}</p>
        </div>
      </section>
    </>
  );
}

function Agradecimento({
  nome,
  itens,
  repetido,
}: {
  nome: string;
  itens: { name: string; quantity: number }[];
  repetido?: boolean;
}) {
  return (
    <section className="folha-bg px-6 py-16">
      <div className="mx-auto max-w-md rounded-3xl border bg-card p-7 text-center shadow-sm">
        <Ramo className="mx-auto" />
        <h2 className="mt-4 font-display text-3xl">{site.sucesso.titulo}</h2>
        {nome ? <p className="mt-1 text-sm text-muted-foreground">{nome}</p> : null}
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{site.sucesso.texto}</p>
        <h3 className="mt-7 font-display text-xl">{site.sucesso.resumo}</h3>
        <ul className="mt-3 space-y-2 text-left">
          {itens.map((i) => (
            <li
              key={i.name}
              className="flex items-center justify-between rounded-2xl bg-secondary px-4 py-3 text-sm"
            >
              <span>{i.name}</span>
              <span className="font-semibold">{i.quantity}x</span>
            </li>
          ))}
        </ul>
        {repetido ? (
          <p className="mt-6 text-xs leading-relaxed text-muted-foreground">
            {site.sucesso.alterar}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function Rodape() {
  return (
    <footer className="border-t px-6 py-8 text-center text-xs text-muted-foreground">
      {site.footer}
    </footer>
  );
}

/* --------------------------------- Seleção --------------------------------- */

function Selecao({
  token,
  nome,
  gifts,
  onAtualizar,
}: {
  token: string;
  nome: string;
  gifts: PublicGift[];
  onAtualizar: () => void;
}) {
  const [cesta, setCesta] = useState<Record<string, number>>({});
  const [aberta, setAberta] = useState(false);
  const [pronto, setPronto] = useState(false);
  const [nomeInput, setNomeInput] = useState(nome);
  const [whats, setWhats] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [confirmado, setConfirmado] = useState<{ name: string; quantity: number }[] | null>(null);
  const enviar = useServerFn(confirmReservation);

  const total = useMemo(
    () => Object.values(cesta).reduce((soma, q) => soma + q, 0),
    [cesta],
  );
  const escolhidos = useMemo(
    () =>
      gifts
        .filter((g) => (cesta[g.id] ?? 0) > 0)
        .map((g) => ({ ...g, quantity: cesta[g.id] ?? 0 })),
    [gifts, cesta],
  );

  function ajustar(gift: PublicGift, delta: number) {
    setCesta((atual) => {
      const q = Math.min(gift.available, Math.max(0, (atual[gift.id] ?? 0) + delta));
      const proximo = { ...atual };
      if (q === 0) delete proximo[gift.id];
      else proximo[gift.id] = q;
      return proximo;
    });
  }

  async function confirmar() {
    if (nomeInput.trim().length < 2) return toast.error(site.erros.nomeObrigatorio);
    if (!isValidWhatsapp(whats)) return toast.error(site.erros.whatsappObrigatorio);
    setEnviando(true);
    try {
      const resultado = await enviar({
        data: {
          token,
          name: nomeInput.trim(),
          whatsapp: whats,
          items: escolhidos.map((g) => ({ gift_id: g.id, quantity: g.quantity })),
        },
      });
      if (resultado.ok) {
        setConfirmado(escolhidos.map((g) => ({ name: g.name, quantity: g.quantity })));
        return;
      }
      if (resultado.error === "unavailable") {
        toast.error(site.erros.concorrencia);
        setCesta({});
        setAberta(false);
        setPronto(false);
        onAtualizar();
        return;
      }
      if (resultado.error === "already_reserved") {
        onAtualizar();
        return;
      }
      toast.error(site.erros.conexao);
    } catch {
      toast.error(site.erros.conexao);
    } finally {
      setEnviando(false);
    }
  }

  if (confirmado) {
    return <Agradecimento nome={nomeInput} itens={confirmado} />;
  }

  return (
    <>
      <Recado nome={nome} />

      <section id="lista" className="px-6 pb-32 pt-4">
        <div className="mx-auto max-w-lg">
          <h2 className="text-center font-display text-3xl">{site.lista.titulo}</h2>
          <p className="mx-auto mt-3 max-w-prose text-center text-sm leading-relaxed text-muted-foreground">
            {site.lista.instrucoes}
          </p>

          {gifts.length === 0 ? (
            <p className="mt-10 rounded-3xl border bg-card p-6 text-center text-sm leading-relaxed text-muted-foreground">
              {site.lista.vazia}
            </p>
          ) : (
            <ul className="mt-8 space-y-3">
              {gifts.map((g) => {
                const q = cesta[g.id] ?? 0;
                return (
                  <li key={g.id} className="rounded-3xl border bg-card p-4 shadow-sm">
                    <h3 className="font-display text-xl leading-snug">{g.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {site.lista.querem} {g.desired} · {g.available}{" "}
                      {g.available === 1 ? site.lista.disponivel : site.lista.disponiveis}
                    </p>
                    {q === 0 ? (
                      <Button
                        variant="secondary"
                        className="mt-3 w-full rounded-full"
                        onClick={() => ajustar(g, 1)}
                      >
                        {site.lista.selecionar}
                      </Button>
                    ) : (
                      <div className="mt-3 flex items-center justify-between rounded-full bg-secondary p-1">
                        <Contador
                          valor={q}
                          max={g.available}
                          onMenos={() => ajustar(g, -1)}
                          onMais={() => ajustar(g, 1)}
                        />
                        <span className="pr-4 text-xs font-medium text-primary">
                          {site.lista.selecionado}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

      {total > 0 && (
        <button
          type="button"
          onClick={() => setAberta(true)}
          aria-label={`${site.pacote.titulo}: ${total}`}
          className="fixed bottom-5 right-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        >
          <Gift className="h-6 w-6" aria-hidden />
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-accent px-1 text-xs font-bold text-accent-foreground">
            {total}
          </span>
        </button>
      )}

      {aberta && (
        <div className="fixed inset-0 z-50 flex items-end bg-forest/50">
          <div className="max-h-[85vh] w-full overflow-y-auto rounded-t-3xl bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-2xl">
                {pronto ? site.formulario.titulo : site.pacote.titulo}
              </h2>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setAberta(false)}
                className="rounded-full p-2 hover:bg-secondary"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
            </div>

            {!pronto ? (
              <>
                <ul className="space-y-3">
                  {escolhidos.map((g) => (
                    <li key={g.id} className="rounded-2xl border p-3">
                      <div className="flex items-start justify-between gap-3">
                        <span className="text-sm font-medium">{g.name}</span>
                        <button
                          type="button"
                          className="text-xs text-muted-foreground underline"
                          onClick={() => ajustar(g, -g.quantity)}
                        >
                          {site.pacote.remover}
                        </button>
                      </div>
                      <div className="mt-2 flex items-center rounded-full bg-secondary p-1">
                        <Contador
                          valor={g.quantity}
                          max={g.available}
                          onMenos={() => ajustar(g, -1)}
                          onMais={() => ajustar(g, 1)}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
                <Button
                  className="mt-6 w-full rounded-full"
                  size="lg"
                  onClick={() => setPronto(true)}
                >
                  {site.pacote.continuar}
                </Button>
              </>
            ) : (
              <>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {site.formulario.subtitulo}
                </p>
                <div className="mt-5 space-y-4">
                  <div>
                    <Label htmlFor="nome">{site.formulario.nome}</Label>
                    <Input
                      id="nome"
                      value={nomeInput}
                      onChange={(e) => setNomeInput(e.target.value)}
                      className="mt-1.5"
                      autoComplete="name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="whats">{site.formulario.whatsapp}</Label>
                    <Input
                      id="whats"
                      value={whats}
                      inputMode="tel"
                      placeholder="(11) 99999-9999"
                      onChange={(e) => setWhats(maskWhatsapp(e.target.value))}
                      className="mt-1.5"
                    />
                  </div>
                </div>
                <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
                  {site.formulario.aviso}
                </p>
                <Button
                  className="mt-5 w-full rounded-full"
                  size="lg"
                  disabled={enviando}
                  onClick={confirmar}
                >
                  {enviando ? site.formulario.enviando : site.formulario.cta}
                </Button>
                <button
                  type="button"
                  className="mt-3 w-full text-center text-xs text-muted-foreground underline"
                  onClick={() => setPronto(false)}
                >
                  Voltar para os presentes
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

function Contador({
  valor,
  max,
  onMenos,
  onMais,
}: {
  valor: number;
  max: number;
  onMenos: () => void;
  onMais: () => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Diminuir"
        onClick={onMenos}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-sm"
      >
        <Minus className="h-4 w-4" aria-hidden />
      </button>
      <span className="w-8 text-center text-sm font-semibold">{valor}</span>
      <button
        type="button"
        aria-label="Aumentar"
        onClick={onMais}
        disabled={valor >= max}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-card text-foreground shadow-sm disabled:opacity-40"
      >
        <Plus className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
