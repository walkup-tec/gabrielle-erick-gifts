/**
 * Todos os textos públicos do site ficam aqui para facilitar a edição.
 */
export const site = {
  casal: "Gabrielle & Erick",
  casalPorExtenso: "Gabrielle e Erick",
  evento: {
    titulo: "Chá dos Noivos",
    dataCurta: "18 de outubro de 2026",
    dataNumerica: "18/10/2026",
    local: "Capela Nossa Senhora Aparecida",
  },
  casamento: {
    titulo: "Casamento",
    dataCurta: "25 de abril de 2027",
    dataNumerica: "25/04/2027",
    local: "Paróquia Nossa Senhora das Graças",
  },
  hero: {
    convite:
      "Estamos preparando um dia cheio de carinho e queremos você por perto. Antes do grande sim, vamos celebrar juntos o começo da nossa casa.",
    cta: "Ver lista de presentes",
  },
  saudacao: (nome: string) => `Olá, ${nome}! Que alegria ter você com a gente.`,
  saudacaoGenerica: "Que alegria ter você com a gente.",
  apresentacao: {
    titulo: "Um recado nosso para você",
    texto:
      "A nossa história começou devagarzinho e hoje já é lar. Estamos montando cada cantinho com muito amor e ficaríamos felizes de ter um pedacinho de você dentro dele. Escolha, com calma, o presente que combina com o seu carinho por nós.",
  },
  lista: {
    titulo: "Nossa lista de presentes",
    instrucoes:
      "Escolha um ou mais presentes e diga quantas unidades você gostaria de presentear. Assim que confirmar, guardamos a sua escolha com carinho.",
    querem: "Queremos",
    disponiveis: "ainda disponíveis",
    disponivel: "ainda disponível",
    selecionar: "Quero presentear",
    selecionado: "Presente escolhido",
    vazia:
      "Todos os presentes da nossa lista já foram escolhidos. Ficamos muito felizes com tanto carinho — a sua presença já é o maior presente.",
  },
  pacote: {
    titulo: "Presentes escolhidos",
    vazio: "Você ainda não escolheu nenhum presente.",
    continuar: "Continuar",
    remover: "Remover",
  },
  formulario: {
    titulo: "Só falta você se apresentar",
    subtitulo:
      "Assim sabemos quem escolheu cada presente e conseguimos te avisar das novidades do Chá dos Noivos.",
    nome: "Seu nome",
    whatsapp: "Seu WhatsApp",
    aviso: "Depois de confirmar, a escolha fica guardada e não pode ser alterada por aqui.",
    cta: "Confirmar presentes com carinho",
    enviando: "Confirmando...",
  },
  sucesso: {
    titulo: "Obrigado de coração!",
    texto:
      "A sua escolha já está guardadinha com a gente. Em breve entramos em contato pelo WhatsApp com mais informações sobre o Chá dos Noivos. Mal podemos esperar para celebrar com você.",
    resumo: "O que você escolheu",
    alterar:
      "Precisa mudar alguma coisa? É só falar com a gente — fazemos o ajuste com o maior prazer.",
  },
  erros: {
    conexao: "Não conseguimos falar com o servidor agora. Tente novamente em instantes.",
    concorrencia:
      "Parece que alguém acabou de escolher uma das opções que você selecionou. Atualizamos sua lista para você escolher novamente.",
    conviteInvalido: "Convite não encontrado",
    conviteInvalidoTexto:
      "Não conseguimos encontrar este convite. Confira se o link recebido está completo ou fale com Gabrielle e Erick.",
    nomeObrigatorio: "Por favor, escreva o seu nome.",
    whatsappObrigatorio: "Informe um WhatsApp no formato (11) 99999-9999.",
  },
  semConvite: {
    titulo: "A lista é por convite",
    texto:
      "Cada convidado recebe um link exclusivo com a nossa lista de presentes. Se você ainda não recebeu o seu, fale com Gabrielle e Erick.",
  },
  footer: "Feito com carinho por Gabrielle e Erick",
};
