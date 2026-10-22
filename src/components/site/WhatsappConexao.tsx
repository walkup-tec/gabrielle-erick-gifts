import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { adminConnectWhatsapp, adminListWhatsapp } from "@/lib/admin.functions";

function Aguarde() {
  return (
    <p className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      Aguarde ...
    </p>
  );
}

export function BotaoWhatsapp() {
  const [aberto, setAberto] = useState(false);
  const [adicionando, setAdicionando] = useState(false);
  const [nome, setNome] = useState("");
  const [qr, setQr] = useState("");
  const [aguardando, setAguardando] = useState(false);
  const [erro, setErro] = useState("");
  const listar = useServerFn(adminListWhatsapp);
  const conectar = useServerFn(adminConnectWhatsapp);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "whatsapp"],
    queryFn: () => listar(),
    enabled: aberto,
    refetchInterval: aberto && qr ? 3000 : false,
  });

  const conexoes = data?.ok ? data.conexoes : [];

  useEffect(() => {
    if (!aberto) {
      setAdicionando(false);
      setNome("");
      setQr("");
      setAguardando(false);
      setErro("");
    }
  }, [aberto]);

  useEffect(() => {
    if (conexoes.length > 0) {
      setQr("");
      setAdicionando(false);
      setAguardando(false);
    }
  }, [conexoes.length]);

  useEffect(() => {
    if (!aberto || !aguardando || qr) return;
    let vezes = 0;
    const timer = setInterval(async () => {
      vezes += 1;
      const r = await conectar({ data: { nome } });
      if (!r.ok) {
        setErro(r.error);
        setAguardando(false);
        return;
      }
      if ("conectado" in r && r.conectado) {
        setAguardando(false);
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
    return () => clearInterval(timer);
  }, [aberto, aguardando, qr, nome, conectar, qc]);

  async function conectarNumero() {
    setErro("");
    setQr("");
    setAguardando(true);
    const r = await conectar({ data: { nome } });
    if (!r.ok) {
      setErro(r.error);
      setAguardando(false);
      return;
    }
    if ("conectado" in r && r.conectado) {
      setAguardando(false);
      await qc.invalidateQueries({ queryKey: ["admin", "whatsapp"] });
      return;
    }
    if ("qr" in r && r.qr) {
      setQr(r.qr);
      setAguardando(false);
    }
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setAberto(true)}>
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
                  <p className="text-sm text-muted-foreground">Número conectado</p>
                  <p className="font-medium">{conexao.numero}</p>
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
    </>
  );
}
