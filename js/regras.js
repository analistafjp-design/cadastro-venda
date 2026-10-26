/*
 * regras.js — TODAS as regras de negócio editáveis ficam aqui.
 * Mudou um critério (janela, nome de projeto, motivo recuperável...)? Altere
 * somente este arquivo. Documentação em docs/REGRAS.md.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  CV.regras = {
    /** Um retorno (resultado) só é ligado a uma visita feita até N dias antes dele. */
    janelaDias: 30,
    /** Visitas dos últimos N dias (até o último retorno carregado) ainda "em maturação". */
    diasMaturacao: 3,
    /** Visita executada sem retorno há mais de N dias vira pendência para o backoffice. */
    diasSemRetorno: 5,
    /** Linhas com menos executadas que isso são sinalizadas como "amostra pequena". */
    minAmostra: 10,
    /** Mínimo de visitas executadas para um segmento/território entrar nos rankings. */
    minAmostraRanking: 20,
    /** Tentativas sem sucesso a partir das quais o alvo é escalado, não revisitado. */
    limiteTentativas: 3,

    /**
     * ESCOPO do painel: só entram equipes e cidades daqui (o arquivo do sistema traz
     * outras regiões, ex.: Itaboraí, São Gonçalo). Comparação sem acento/caixa e, nas
     * equipes, sem espaços e hífens. Lista vazia = não filtra.
     */
    escopo: {
      equipes: [
        'RIORECIN-004', 'RIORECIN-007', 'RIORECIN-013', 'RIORECIN-024', 'RIORECIN-034',
        'RIOVENIN-001', 'RIOVENIN-002', 'RIOVENIN-003', 'RIOVENIN-004', 'RIOVENIN-005',
      ],
      cidades: [
        'APERIBE', 'CACHOEIRAS DE MACACU', 'CAMBUCI', 'CANTAGALO', 'CASIMIRO DE ABREU', 'CORDEIRO',
        'DUAS BARRAS', 'ITAOCARA', 'MIRACEMA', 'RIO BONITO',
        'S.FCO.DO ITABAPOANA', 'SAO FRANCISCO DO ITABAPOANA', // grafias da mesma cidade
        'S.SEBASTIAO DO ALTO', 'SAO SEBASTIAO DO ALTO',
      ],
    },

    /**
     * Tempos das equipes (página "Tempos das equipes"), por equipe e dia. Dia = do início da
     * 1ª atividade (menos o deslocamento até ela) ao fim da última.
     *   deslocamento = soma de "Tempo de Deslocamento"
     *   serviço      = duração das atividades de serviço (todas que não são de apoio)
     *   pausas/apoio = duração das atividades de apoio (refeição, DDS, carregamento, clima...)
     *   ociosidade   = o que sobra do dia (e as durações dos tipos de "tiposOciosos")
     * Tipos comparados pela chave sem acento.
     */
    tempos: {
      tiposApoio: ['REFEICAO', 'CHECKLIST INICIO', 'DDS', 'CARREGAMENTO DE MATERIAL', 'CONDICAO CLIMATICA', 'ABASTECIMENTO DE VEICULO'],
      tiposOciosos: [], // ex.: ['CARREGAMENTO DE MATERIAL'] para contar como ociosidade
      tiposDeslocamento: ['DESLOCAMENTO'],
      statusSemTempo: ['CANCELADA', 'PENDENTE'],
    },

    /**
     * Aba "Negociações" (página Interior): a tabela "Negociação - venda e recadastro" do relatório
     * do Power BI. Conta as atividades FINALIZADAS das equipes do escopo (só a equipe; a cidade não
     * filtra, como no relatório) em que "Negociou O Débito?" é uma das respostas abaixo (chave sem
     * acento). Valor = "Valor Total dos Débitos"; ticket médio = valor ÷ negociações.
     */
    negociacoes: {
      respostas: ['SIM'],
    },

    /**
     * Aba "Tratativas": incremento e decremento de ECONOMIA (DE:/PARA:) e de CATEGORIA
     * (ANTERIOR/ATUAL × QUANTIDADE) lançados no formulário de Resultados, valorados pela tarifa da
     * categoria. É a mesma conta do relatório TRATATIVAS do Power BI; vem direto da planilha, sem
     * depender das atividades. Valor = economias × tarifa (R$ por economia).
     */
    tratativas: {
      /** Só entram lançamentos desta frente de serviço (começo do nome, sem acento/caixa). Vazio = todas. */
      frente: 'CADASTRO',
      /** R$ por economia de cada categoria. Categoria que não está aqui (ex.: "Outros") vale zero. */
      tarifas: {
        'Residencial': 85.41,
        'Comercial': 443.57,
        'Industrial': 613.17,
        'Pública': 129.16,
        'P. Comércio': 221.78,
        'Comércio popular': 60.24,
        'Social': 30.12,
      },
      /**
       * Como reconhecer a categoria no texto livre ("2 Comércios", "P. Comercio", "Publica"...): a
       * primeira linha cujo `contem` (maiúsculas, sem acento nem pontuação) aparece no texto vence.
       * Sem nenhuma: "Outros". A ordem é a do Power BI (RES, SOC, IND, PUB antes de COM).
       * `soCorrigido`: a linha só vale com `igualPowerBI: false`.
       */
      categorias: [
        { nome: 'Residencial', contem: ['RES'] },
        { nome: 'Social', contem: ['SOC'] },
        { nome: 'Industrial', contem: ['IND'] },
        { nome: 'Pública', contem: ['PUB'] },
        { nome: 'Comércio popular', contem: ['POPULAR'], soCorrigido: true },
        { nome: 'P. Comércio', contem: ['P COM', 'PCOM'] },
        { nome: 'Comercial', contem: ['COM'] },
      ],
      /**
       * Categorias que o painel conhece só pelo NOME (ANTERIOR/ATUAL dos quadros de categoria) e que não têm
       * tarifa: valem zero, como no Power BI. Servem para mostrar o nome certo em vez de "Outros"; o valor não
       * muda. Para valorar uma delas, ponha a tarifa em `tarifas` com este mesmo nome. Um texto que não é de
       * nenhuma categoria (nem destas) aparece como foi escrito, e "Outros" só sobra para campo vazio.
       */
      outrasCategorias: [
        { nome: 'Sem fins lucrativos', contem: ['LUCRAT'] }, // "SEM FINS LUCRATIVOS", "ENT.S/FIM LUCRATIVO", "ENTIDADE SEM FINS LUCRATIVOS"
        { nome: 'CadÚnico', contem: ['CADUNICO'] },
      ],
      /**
       * true = os números batem com os do relatório do Power BI, inclusive dois detalhes dele que
       * parecem erro: (1) nos quadros de CATEGORIA a "Pública" vale zero (o relatório procura
       * "Publica", sem acento, na tabela de tarifas, que tem "PÚBLICA"); (2) "Comércio popular"
       * é contado como "Comercial" (443,57). A aba avisa quantos lançamentos são afetados.
       * false = corrige os dois: Pública vale 129,16 e Comércio popular tem a tarifa própria (60,24).
       */
      igualPowerBI: true,
      /**
       * DE/PARA com mais de uma categoria no mesmo texto ("DE 1 RESIDENCIAL E 1 COMERCIAL" → "PARA 1 RESIDENCIAL
       * E 2 COMERCIAIS", ou a frase "DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM."): true = a variação é calculada
       * categoria por categoria (aqui, +1 Comercial) e entra nos quadros; false = o lançamento fica de fora e
       * aparece na Conferência, para ser corrigido no formulário.
       */
      compostosPorCategoria: true,
      /**
       * Um único lançamento que acrescenta ou tira este tanto de economias (ou mais) vai para a Conferência:
       * costuma ser digitação errada ("100 RES." no lugar de "1 RES."). Só avisa; o número continua valendo.
       */
      variacaoSuspeita: 10,
    },

    /**
     * Tipos de atividade que contam como "alvo gerado para visita"
     * (comparação por chave sem acento). Lista vazia = aceita todos.
     */
    tiposAtividade: ['VERIFICACAO CADASTRAL'],

    /** Grupos de status (chave sem acento). Qualquer outro = "não concluída". */
    status: {
      executada: ['FINALIZADA'],
      ocorrencia: ['ENCERRADA COM OCORRENCIA'],
    },

    /**
     * Colunas onde procurar o nome do projeto/base, em ordem de preferência.
     * (No arquivo recebido o nome vem no início de "Observação": "PROJETO XXXX: ...")
     */
    colunasProjeto: ['Observação', 'Parecer De Campo'],

    /**
     * Nome usado quando não há projeto identificável: demandas avulsas (pedidos do
     * atendimento/call center, solicitações das próprias equipes, instruções genéricas).
     */
    semProjeto: 'SOLICITADA EM CAMPO',

    /**
     * Unificação de nomes de projeto. Cada item: [regex aplicada à chave do
     * rótulo (maiúsculas, sem acento), nome final]. A primeira que casar vence.
     * Variações de escrita do mesmo projeto caem no mesmo nome.
     * Atenção: nomes como LOCALIZAE, VERIFICAE, ATUALIZAE e NEGOCIAE são os nomes
     * reais dos projetos (terminam em "ê"); acento realmente perdido aparece como "¿".
     */
    projetos: [
      ['^INCREMENTO EDIFIC', 'EDIFÍCIOS'],
      ['^INCREMENTO', 'INCREMENTO'],
      ['^VARREDURA|^VAR$|^LNA VARREDURA', 'VARREDURA'],
      ['^VENDA LNA$|^VENDA$', 'VENDA LNA'],
      ['^VENDA LOCALIZ', 'VENDA LOCALIZAE'],
      ['^VERIFICA\\w* SOCIAL', 'VERIFICAE SOCIAL - VENDA'],
      ['^VERIFICA\\w* PUBLICO', 'VERIFICAE - PÚBLICO'],
      ['^VERIFICACAO$', 'VERIFICAÇÃO'],
      ['^DESMEMBRAMENTO|^SEPARACAO DE ECONOMIA', 'DESMEMBRAMENTO'],
      ['^FATURA DIGITAL', 'FATURA DIGITAL - RECADASTRO'],
      ['^ALTO CONSUMO', 'ALTO CONSUMO'],
      ['^CEHAB', 'CEHAB MIRACEMA'],
      ['^ATUALIZ\\w* CONDOMINIO', 'ATUALIZAE CONDOMÍNIOS'],
      ['^EDIFICIOS', 'EDIFÍCIOS'],
      ['^VIDA NOVA', 'VIDA NOVA'],
      ['^CARNAVAL', 'CARNAVAL'],
      ['^SEMANA SANTA', 'SEMANA SANTA'],
      ['^RECADASTRO', 'RECADASTRO'],
      ['^RAIO X', 'RAIO-X'],
      ['^HOTEIS', 'HOTÉIS E POUSADAS'],
      ['^CLUBES', 'CLUBES LAGOS'],
      ['^ACADEMIAS', 'ACADEMIAS'],
      ['^TITULARIDADE', 'TITULARIDADE'],
      ['^CART\\w* VERMELHO', 'CARTÃO VERMELHO SOCIAL'],
      ['^SA\\w* PUBLICA', 'SAÚDE PÚBLICA'],
      ['^ESCOLAS', 'ESCOLAS PÚBLICAS'],
      ['^FERIAD', 'FERIADÃO'],
      ['^NEGOCIA', 'NEGOCIAE'],
      ['^LOCALIZA', 'LOCALIZAE'],
      ['^CAV$', 'CAV'],
    ],
    /** Rótulos sem regra acima são unidos a um nome conhecido se forem ≥ esta similaridade. */
    similaridadeProjeto: 0.88,

    /**
     * Motivo de não execução -> ação sugerida (chave sem acento).
     *   revisitar: voltar ao local | corrigir_endereco: backoffice corrige e reagenda
     *   descartar: não há o que fazer / não insistir
     */
    motivos: {
      'CLIENTE AUSENTE': 'revisitar',
      'RETORNAR DEPOIS': 'revisitar',
      'IMOVEL FECHADO SEM VISAO ACESSO AO HD': 'revisitar',
      'ENDERECO NAO LOCALIZADO': 'corrigir_endereco',
      'RAMAL REDE NAO LOCALIZADO': 'corrigir_endereco',
    },
    /** Ação para motivo não listado acima. */
    motivoPadrao: 'descartar',

    /** Tipo de equipe pelo código do Recurso (primeira regra que casar). */
    equipes: [
      ['VEN', 'Venda'],
      ['REC', 'Cadastro'],
    ],

    /**
     * Desfechos possíveis de um retorno. "grupo" define o que conta como:
     *   resultado   -> mudança com efeito comercial/econômico (entra na efetividade)
     *   atualizacao -> atualização/saneamento cadastral (conta como tratativa, mas não resultado)
     *   sem         -> sem tratativa
     * Ordem = prioridade para eleger o "desfecho principal" da visita.
     */
    classes: [
      { id: 'incremento', rotulo: 'Incremento de economia', curto: 'Incremento', grupo: 'resultado' },
      { id: 'categoria', rotulo: 'Alteração de categoria', curto: 'Categoria', grupo: 'resultado' },
      { id: 'venda', rotulo: 'Venda / ligação nova', curto: 'Venda', grupo: 'resultado' },
      { id: 'novo_cliente', rotulo: 'Novo cliente (lote não cadastrado)', curto: 'Novo cliente', grupo: 'resultado' },
      { id: 'titularidade', rotulo: 'Troca de titularidade', curto: 'Titularidade', grupo: 'resultado' },
      { id: 'tarifa_social', rotulo: 'Tarifa social', curto: 'Tarifa social', grupo: 'resultado' },
      { id: 'fatura', rotulo: 'Fatura digital / forma de entrega', curto: 'Fatura digital', grupo: 'resultado' },
      { id: 'debitos', rotulo: 'Negociação de débitos', curto: 'Débitos', grupo: 'resultado' },
      { id: 'decremento', rotulo: 'Decremento de economia', curto: 'Decremento', grupo: 'resultado' },
      { id: 'economia', rotulo: 'Alteração de economia (sem sentido informado)', curto: 'Alt. economia', grupo: 'resultado' },
      { id: 'atualizacao', rotulo: 'Atualização cadastral', curto: 'Atualização', grupo: 'atualizacao' },
      { id: 'sem', rotulo: 'Sem tratativa', curto: 'Sem tratativa', grupo: 'sem' },
    ],

    /** Colunas de desfecho exibidas nas tabelas (agrupa classes menores em "Outros"). */
    colunasDesfecho: [
      { id: 'incremento', rotulo: 'Incremento', classes: ['incremento'] },
      { id: 'categoria', rotulo: 'Categoria', classes: ['categoria'] },
      { id: 'titularidade', rotulo: 'Titularidade', classes: ['titularidade'] },
      { id: 'venda', rotulo: 'Venda', classes: ['venda'] },
      {
        id: 'outros',
        rotulo: 'Outros',
        classes: ['tarifa_social', 'fatura', 'debitos', 'decremento', 'economia'],
      },
    ],
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = CV.regras;
})(typeof window !== 'undefined' ? window : globalThis);
