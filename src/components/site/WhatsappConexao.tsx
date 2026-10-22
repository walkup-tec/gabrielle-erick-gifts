import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  adminConnectWhatsapp,
  adminDeleteWhatsapp,
  adminListWhatsapp,
  adminReconnectWhatsapp,
} from "@/lib/admin.functions";

function Aguarde() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Aguarde ...
    </p>
  );
}

type RespostaQr =
  | { ok: false; error: string }
  | { ok: true; conectado: true; numero: string }
  | { ok: true; qr: string }
  | { ok: true; aguardando: true };

export function BotaoWhatsapp() {
  const [aberto, setAberto] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [nome, setNome] = useState("");
  const [qr, setQr] = useState("");
  const [qrNome, setQrNome] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [modo, setModo] = useState<"novo" | "reconectar">("novo");
  const [alvo, setAlvo] = useState("");
  const [erro, setErro] = useState("");
  const [confirmar, setConfirmar] = useState<{ nome: string; texto: string } | null>(null);
  const [excluindo, setExcluindo] = useState(false);
  const listar = useServerFn(adminListWhatsapp);
  const conectar = useServerFn(adminConnectWhatsapp);
  const reconectar = useServerFn(adminReconnectWhatsapp);
  const apagar = useServerFn(adminDeleteWhatsapp);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "whatsapp"],
    queryFn: () => listar(),
    refetchInterval: aberto && (qr || aguardando) ? 3000 : 10000,
  });

  const conexoes = data?.ok ? data.conexoes : [];
  const desconectado = Boolean(data?.ok && conexoes.length > 0 && conexoes.every((item) => !item.conectada));

  useEffect(() => {
    if (!aberto) {
      setAdicionando(false);
      setNome("");
      setQr("");
      setQrNome("");
      setAguardando(false);
      setAlvo("");
      setErro("");
      setConfirmar(null);
    }
  }, [aberto]);

  useEffect(() => {
    if (qrNome) {
      const atual = conexoes.find((item) => item.nome === qrNome);
      if (atual?.conectada) {
        setQr("");
        setQrNome("");
        setAguardando(false);
        setAlvo("");
      }
      return;
    }
    if ((adicionando || qr) && conexoes.some((item) => item.conectada)) {
      setQr("");
      setAdicionando(false);
      setAguardando(false);
      setAlvo("");
      setNome("");
    }
  }, [conexoes, qrNome, adicionando, qr]);

  useEffect(() => {
    if (!aberto || !aguardando || qr || !alvo) return;
    let vezes = 0;
    let cancelado = false;
    const timer = setInterval(async () => {
      vezes += 1;
      const r = (modo === "reconectar"
        ? await reconectar({ data: { nome: alvo } })
        : await conectar({ data: { nome: alvo } })) as RespostaQr;
      if (cancelado) return;
      if (!r.ok) {
        setErro(r.error);
        setAguardando(false);
        return;
      }
      if ("conectado" in r && r.conectado) {
        setAguardando(false);
        setQr("");
        await qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
        return;
      }
      if ("qr" in r && r.qr) {
        setQr(r.qr);
        setAguardando(false);
        return;
      }
      if (vezes >= 15) {
        setAguardando(false);
        setErro("O QR Code não abriu. Tente conectar de novo.");
      }
    }, 2000);
    return () => {
      cancelado = true;
      clearInterval(timer);
    };
  }, [aberto, aguardando, qr, alvo, modo, conectar, reconectar, qc]);

  async function aplicarResposta(r: RespostaQr) {
    if (!r.ok) {
      setErro(r.error);
      setAguardando(false);
      return;
    }
    if ("conectado" in r && r.conectado) {
      setAguardando(false);
      setQr("");
      await qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
      return;
    }
    if ("qr" in r && r.qr) {
      setQr(r.qr);
      setAguardando(false);
    }
  }

  async function conectarNumero() {
    setErro("");
    setQr("");
    setQrNome("");
    setModo("novo");
    setAlvo(nome);
    setAguardando(true);
    await aplicarResposta((await conectar({ data: { nome } })) as RespostaQr);
  }

  async function reconectarNumero(nomeInstancia: string) {
    setErro("");
    setQr("");
    setQrNome(nomeInstancia);
    setModo("reconectar");
    setAlvo(nomeInstancia);
    setAguardando(true);
    await aplicarResposta((await reconectar({ data: { nome: nomeInstancia } })) as RespostaQr);
  }

  async function excluirConexao() {
    if (!confirmar) return;
    setExcluindo(true);
    setErro("");
    const r = await apagar({ data: { nome: confirmar.nome } });
    setExcluindo(false);
    if (!r.ok) {
      setErro(r.error);
      return;
    }
    setConfirmar(null);
    setQr("");
    setQrNome("");
    setAguardando(false);
    await qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setAberto(true)}
        aria-label={desconectado ? "WhatsApp desconectado" : "WhatsApp"}
        className={
          desconectado ? "animate-pulse bg-red-600 text-white hover:bg-red-700 hover:text-white" : undefined
        }
      >
        WhatsApp
      </Button>
      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>WhatsApp</DialogTitle>
          </DialogHeader>

          {isLoading ? <Aguarde /> : null}

          {!isLoading && conexoes.length > 0 ? (
            <ul className="space-y-2">
              {conexoes.map((conexao) => (
                <li key={conexao.nome} className="rounded-2xl border px-4 py-3">
                  <p className="text-sm text-muted-foreground">
                    {conexao.conectada ? "Número conectado" : "Número desconectado"}
                  </p>
                  <p className="font-medium">{conexao.numero || conexao.rotulo}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {conexao.conectada ? null : (
                      <Button
                        type="button"
                        className="rounded-full"
                        disabled={aguardando && alvo === conexao.nome}
                        onClick={() => void reconectarNumero(conexao.nome)}
                      >
                        Reconectar
                      </Button>
                    )}
                    <Button
                      type="button"
                      className="rounded-full bg-red-600 text-white hover:bg-red-700"
                      onClick={() =>
                        setConfirmar({
                          nome: conexao.nome,
                          texto: conexao.numero || conexao.rotulo,
                        })
                      }
                    >
                      Excluir Conexão
                    </Button>
                  </div>
                  {aguardando && qrNome === conexao.nome ? <div className="mt-3"><Aguarde /></div> : null}
                  {qr && qrNome === conexao.nome ? (
                    <img
                      src={qr}
                      alt="QR Code para reconectar o WhatsApp"
                      className="mx-auto mt-3 h-64 w-64 rounded-xl border bg-white p-2"
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}

          {!isLoading && conexoes.length === 0 && !adicionando ? (
            <Button type="button" className="rounded-full" onClick={() => setAdicionando(true)}>
              Adicionar
            </Button>
          ) : null}

          {adicionando && conexoes.length === 0 ? (
            <div className="space-y-4">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <Label htmlFor="evo-nome">Nome</Label>
                  <Input
                    id="evo-nome"
                    value={nome}
                    onChange={(e) => setNome(e.target.value)}
                    className="mt-1.5"
                    placeholder="Nome da conexão"
                    disabled={aguardando}
                  />
                </div>
                <Button
                  type="button"
                  className="rounded-full"
                  disabled={aguardando || nome.trim().length < 2}
                  onClick={() => void conectarNumero()}
                >
                  Conectar
                </Button>
              </div>
              {aguardando ? <Aguarde /> : null}
              {qr ? (
                <img
                  src={qr}
                  alt="QR Code para conectar o WhatsApp"
                  className="mx-auto h-64 w-64 rounded-xl border bg-white p-2"
                />
              ) : null}
            </div>
          ) : null}

          {erro ? <p className="text-sm text-destructive">{erro}</p> : null}
          {!isLoading && data && !data.ok && !erro ? (
            <p className="text-sm text-destructive">{data.error}</p>
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(confirmar)} onOpenChange={(open) => !open && !excluindo && setConfirmar(null)}>
        <AlertDialogContent className="z-[60]">
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir conexão</AlertDialogTitle>
            <AlertDialogDescription>
              Excluir a conexão {confirmar?.texto}? Ela será removida da Evolution.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <Button
              type="button"
              className="bg-red-600 text-white hover:bg-red-700"
              disabled={excluindo}
              onClick={() => void excluirConexao()}
            >
              {excluindo ? "Aguarde ..." : "Excluir"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
