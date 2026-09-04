# Chá dos Noivos — Gabrielle e Erick

Site exclusivo do casal, feito para celular primeiro, com lista de presentes real, links de convite individuais e uma área reservada para vocês administrarem tudo.

## O que o convidado vê

Uma única página, em português, com:

1. Abertura com foto do casal, "Chá dos Noivos", "Gabrielle & Erick", 18 de outubro de 2026, Capela Nossa Senhora Aparecida e o botão "Ver lista de presentes" (rolagem suave).
2. Saudação personalizada pelo nome ("Olá, João! Que alegria ter você com a gente.") quando entra pelo link exclusivo.
3. Recado carinhoso do casal e informações do Chá dos Noivos em destaque; o casamento (25/04/2027, Paróquia Nossa Senhora das Graças) aparece de forma discreta e elegante.
4. Lista de presentes sem fotos, sem preços, sem cara de loja: nome, quantos o casal deseja, quantos ainda faltam e o botão "Quero presentear". Itens já completos somem da lista.
5. Escolha de quantidade com [-] 1 [+], limitada ao que ainda está disponível.
6. Um ícone de pacote de presente flutuante com contador; ao tocar, abre o resumo, onde ainda dá para mudar quantidades ou remover.
7. Nome e WhatsApp obrigatórios, com máscara (11) 99999-9999.
8. "Confirmar presentes" — a escolha é registrada na hora e vira definitiva.
9. Tela de agradecimento com o resumo escolhido.
10. Se abrir o link de novo depois de confirmar: vê agradecimento e resumo, sem poder alterar (orientação gentil para falar com o casal).
11. Link inválido: página acolhedora dizendo que o convite não foi encontrado.

Estados cuidados: carregando, lista vazia, todos os presentes já escolhidos, erro de conexão, e o caso de alguém escolher o último item ao mesmo tempo (mensagem amigável + lista atualizada).

## Área do casal (/admin)

Entrada protegida por login (e-mail e senha de vocês, criados por mim; a senha nunca fica no código).

- Painel com números: presentes cadastrados, disponíveis, concluídos, convidados, quem já escolheu, quem não escolheu, total de escolhas.
- Presentes: criar, editar, excluir. Vocês informam só nome e quantidade desejada; reservado/disponível é calculado. Status: Disponível, Parcialmente presenteado, Quantidade concluída.
- Convidados: criar, editar, excluir, com link exclusivo gerado automaticamente, botão "Copiar link" e compartilhar no celular.
- Escolhas confirmadas: ver convidado, WhatsApp, presentes, quantidades e data/hora; editar quantidades, remover ou adicionar itens e cancelar — sempre devolvendo a disponibilidade automaticamente.

## Visual

Paleta #D1CBB6 (fundos), #526635 (botões e destaques), #8D9E6F (detalhes suaves), #303B1D (títulos e textos fortes). Título em tipografia elegante e romântica; textos em fonte moderna bem legível. Folhagens e traços orgânicos discretos, sem monograma "G & E". Animações leves, respeitando quem prefere menos movimento.

## Detalhes técnicos

- TanStack Start + React + TypeScript; Lovable Cloud (Postgres) para dados e login do admin — sem custo recorrente e sem risco de perder registros (SQLite não é usado porque o ambiente não garante disco persistente).
- Tabelas: `guests` (nome, whatsapp, token único, status), `gifts` (nome, quantidade desejada), `reservations` (convidado, nome, whatsapp, status, confirmado_em), `reservation_items` (reserva, presente, quantidade). Disponível = desejado − soma das reservas ativas.
- Confirmação feita numa função transacional no banco: revalida a disponibilidade, trava as linhas dos presentes e recusa qualquer excesso — impossível ficar negativo ou haver reserva dupla.
- Leitura pública dos presentes e do convite via funções de servidor com o token; nada de tabela aberta ao público. Endpoints de administração exigem sessão autenticada e papel de admin em tabela separada de papéis.
- `noindex,nofollow` nas páginas e no robots.txt; /admin com bloqueio extra.
- Imagens otimizadas, carregamento adiado abaixo da dobra, HTML semântico, rótulos nos campos, foco visível e contraste conferido.
- Todos os textos ficam num único arquivo de conteúdo para vocês trocarem facilmente depois.
- Ao final, valido os 10 cenários da lista (criação, reserva, esgotamento, cancelamento, limite, concorrência, reabertura do link, edição pelo admin, acesso sem login e convite inválido).

## Fotos

As cinco fotos ainda não chegaram. Começo com imagens de apoio provisórias e troco assim que vocês enviarem os arquivos — é só anexar aqui.

## Fora do escopo

Sem pagamento, preços, fotos de presentes, carrinho, login de convidado ou vários idiomas.
