/*
 * ui-tratativas.js — a aba "Tratativas": os quatro quadros (incremento e decremento de economia e de
 * categoria, em R$), a faixa de resumo, o saldo por mês e a conferência dos dados. Os números vêm de
 * js/tratativas.js; aqui só se monta a tela.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = CV.ui;
  const { h, fmt } = ui;

  const DESCRICAO = {
    incEco: 'Economias acrescentadas (PARA maior que DE) × tarifa da categoria de PARA.',
    incCat: 'Economias que mudaram de categoria × (tarifa da ATUAL − tarifa da ANTERIOR), quando o resultado é positivo.',
    decEco: 'Economias retiradas (PARA menor que DE) × tarifa da categoria.',
    decCat: 'Economias que mudaram de categoria × (tarifa da ATUAL − tarifa da ANTERIOR), quando o resultado é negativo.',
  };

  /** R$ numa célula: vermelho quando negativo. */
  const celulaValor = (v) => h('span', { class: v < 0 ? 'neg' : null, text: fmt.brl(v) });

  /** R$ com uma barra ao lado, proporcional ao valor (`maximo` = maior valor absoluto dos quatro quadros: mesma escala). */
  function celulaValorBarra(v, maximo) {
    const pct = maximo > 0 ? Math.min(100, (100 * Math.abs(v)) / maximo) : 0;
    return h('div', { class: 'valor-barra' },
      h('span', { class: 'trilho' }, pct > 0 ? h('i', { class: v < 0 ? 'n' : 'p', style: { width: pct.toFixed(1) + '%' } }) : null),
      celulaValor(v));
  }

  /** `comFrente`: a coluna "Frente de serviço" só aparece quando há mais de uma frente nos quadros. */
  function colunasQuadro(q, comFrente, maximo) {
    return [
      comFrente ? { id: 'frente', titulo: 'Frente de serviço', tipo: 'txt', valor: (l) => l.frente } : null,
      { id: 'a', titulo: q.colA, tipo: 'txt', valor: (l) => l.de },
      { id: 'b', titulo: q.colB, tipo: 'txt', valor: (l) => l.para },
      { id: 'n', titulo: q.colN, tipo: 'num', valor: (l) => l.n, dica: q.tipo === 'economia' ? 'Economias a mais (+) ou a menos (−)' : 'Economias que mudaram de categoria' },
      { id: 'valor', titulo: q.colValor, tipo: 'num', valor: (l) => l.valor, render: (l) => (l.ehTotal ? celulaValor(l.valor) : celulaValorBarra(l.valor, maximo)), dica: 'R$ por mês: economias × tarifa (a barra usa a mesma escala nos quatro quadros)' },
    ].filter(Boolean);
  }

  function blocoQuadro(q, dados, ordemDe, comFrente, maximo) {
    const b = ui.bloco(q.titulo, DESCRICAO[q.id]);
    // o rótulo "Total" fica na primeira coluna que existir
    const total = { frente: 'Total', ehTotal: true, de: comFrente ? '' : 'Total', para: '', n: dados.n, valor: dados.valor };
    b.appendChild(ui.criarTabela({
      colunas: colunasQuadro(q, comFrente, maximo), linhas: dados.linhas, total: dados.linhas.length ? total : null, totalEmbaixo: true,
      ordem: ordemDe('tratativas-' + q.id + (comFrente ? '-frente' : ''), { id: comFrente ? 'frente' : 'a', dir: 'asc' }), vazio: 'Nenhum lançamento neste período.',
    }));
    return b;
  }

  /** Uma linha do resumo: rótulo e nº de economias à esquerda, R$ à direita. */
  function linhaResumo(rotulo, quadro, dica) {
    return h('div', { class: 'r-linha', title: dica },
      h('span', { class: 'r-rot', text: rotulo }),
      h('span', { class: 'r-val' + (quadro.valor < 0 ? ' neg' : ''), text: fmt.brl(quadro.valor) }),
      h('span', { class: 'r-sub', text: fmt.int(Math.abs(quadro.n)) + ' economia(s)' }));
  }

  /**
   * Resumo do período em uma faixa só: o saldo à esquerda, os incrementos e os decrementos (as mesmas duas
   * colunas dos quadros logo abaixo) e, no pé, os números de tratativas.
   */
  function faixaResumo(a) {
    const q = a.quadros;
    const c = a.cartoes;
    const grupo = (classe, titulo, linhas) => h('div', { class: 'r-grupo ' + classe },
      h('div', { class: 'r-tit' }, h('i'), titulo), linhas);
    const pe = (rotulo, valor, dica) => h('span', { class: 'r-pe-item', title: dica }, h('span', { text: rotulo }), h('b', { text: valor }));
    return h('div', { class: 'resumo' },
      h('div', { class: 'r-saldo', title: 'Incremento de economia + incremento de categoria − decrementos (economia e categoria)' },
        h('div', { class: 'r-rot', text: 'Saldo do período' }),
        h('div', { class: 'r-valor' + (a.saldo < 0 ? ' neg' : ''), text: fmt.brl(a.saldo) }),
        h('div', { class: 'r-sub', text: 'Incrementos − decrementos' })),
      grupo('inc', 'Incrementos', [
        linhaResumo('Incremento de economia', q.incEco, DESCRICAO.incEco),
        linhaResumo('Incremento de categoria', q.incCat, DESCRICAO.incCat)]),
      grupo('dec', 'Decrementos', [
        linhaResumo('Decremento de economia', q.decEco, DESCRICAO.decEco),
        linhaResumo('Decremento de categoria', q.decCat, DESCRICAO.decCat)]),
      h('div', { class: 'r-pe' },
        pe('Acumulado', fmt.int(c.tratados), 'Lançamentos com tratativa feita: TIPO DE ALTERAÇÃO preenchido e diferente de “sem tratativa” / “encerrado”'),
        pe('Dias com tratativa', fmt.int(c.dias), 'Dias do período em que houve ao menos uma tratativa'),
        pe('Média por dia', fmt.dec2(c.media), 'Acumulado ÷ dias com tratativa')));
  }

  function blocoMeses(meses, ordemDe) {
    const b = ui.bloco('Saldo por mês',
      'Todos os meses com lançamento, lado a lado, e o total de cada coluna (só o filtro de assistente vale aqui; o de período não). Substitui a conta feita à mão de cada mês.');
    const col = (id, titulo, k) => ({ id, titulo, tipo: 'num', valor: (m) => m[k], render: (m) => celulaValor(m[k]) });
    b.appendChild(ui.criarTabela({
      colunas: [
        { id: 'mes', titulo: 'Mês', tipo: 'txt', valor: (m) => m.rotulo, ordena: (m) => m.mes },
        col('incEco', 'Incremento de economia', 'incEco'),
        col('incCat', 'Incremento de categoria', 'incCat'),
        col('decEco', 'Decremento de economia', 'decEco'),
        col('decCat', 'Decremento de categoria', 'decCat'),
        col('saldo', 'Saldo', 'saldo'),
        {
          id: 'anual', titulo: 'Faturado no ano', tipo: 'num', valor: (m) => m.anual,
          render: (m) => h('span', {
            class: m.anual < 0 ? 'neg' : null, text: fmt.brl(m.anual),
            title: m.ehTotal ? 'Soma do faturado no ano de todos os meses' : fmt.brl(m.saldo) + ' × ' + m.mesesAteDezembro + ' (meses até dezembro)',
          }),
          dica: 'Saldo do mês × os meses que faltam até dezembro (12 − mês). Em dezembro não falta nenhum: R$ 0,00',
        },
      ],
      // o total soma cada coluna (em R$) e fica na base, como nos quadros
      linhas: meses, total: meses.length ? Object.assign(CV.tratativas.totalDosMeses(meses), { ehTotal: true }) : null, totalEmbaixo: true,
      ordem: ordemDe('tratativas-meses', { id: 'mes', dir: 'desc' }), vazio: 'Nenhum mês com lançamento.',
    }));
    return b;
  }

  /** Pontos de atenção do período (só os que existem). */
  function blocoConferencia(conf, exemplos) {
    const T = CV.tratativas;
    const itens = [];
    // "Id 26630, 26733…": para achar o lançamento no formulário (o Excel exportado traz todos)
    const ids = (k) => (exemplos && exemplos[k] ? ' [Id ' + exemplos[k].join(', ') + (conf[k] > exemplos[k].length ? '…' : '') + ']' : '');
    if (conf.foraFrente > 0) itens.push(fmt.int(conf.foraFrente) + ' lançamento(s) de outra frente de serviço (ex.: Bairro Legal) ficam de fora dos quadros' + ids('foraFrente') + '.');
    for (const [k, texto] of Object.entries(T.SINAIS)) if (conf[k] > 0) itens.push(fmt.int(conf[k]) + ' lançamento(s): ' + texto + ids(k) + '.');
    if (!itens.length) return null;
    const b = ui.bloco('Conferência dos dados', 'Pontos de atenção nos lançamentos do período. A coluna “Observação” do Excel exportado mostra, linha a linha, onde cada um aparece.');
    b.className += ' so-tela'; // é para quem confere os dados na tela: não vai para o PDF
    b.appendChild(h('ul', { class: 'lista-simples' }, itens.map((t) => h('li', { text: t }))));
    if (conf.publicaZero > 0 || conf.popular > 0) {
      b.appendChild(h('p', { class: 'nota', text: 'Os números batem com os do relatório do Power BI, inclusive nos dois itens acima sobre Pública e Comércio popular. Para corrigi-los, use igualPowerBI: false em tratativas, no arquivo js/regras.js.' }));
    }
    return b;
  }

  /**
   * ctx: { analise (tratativas.analisar), meses (tratativas.porMes), ordemDe(id, padrao) }
   */
  function renderTratativas(alvo, ctx) {
    const T = CV.tratativas;
    const a = ctx.analise;

    alvo.appendChild(ui.secao('Resumo do período (R$ por mês)'));
    const q = a.quadros;
    alvo.appendChild(faixaResumo(a));

    // hoje a frente é uma só ("Cadastro"): a coluna só aparece se algum quadro trouxer mais de uma
    const comFrente = T.QUADROS.some((def) => new Set(q[def.id].linhas.map((l) => l.frente)).size > 1);
    // as barras do valor usam a mesma escala nos quatro quadros
    const maximo = Math.max(0, ...T.QUADROS.flatMap((def) => q[def.id].linhas.map((l) => Math.abs(l.valor))));
    // incrementos à esquerda (economia sobre categoria) e decrementos à direita (economia sobre categoria)
    const coluna = (sinal) => h('div', { class: 'col-quadros' },
      T.QUADROS.filter((def) => def.sinal === sinal).map((def) => blocoQuadro(def, q[def.id], ctx.ordemDe, comFrente, maximo)));
    alvo.appendChild(h('div', { class: 'grade-quadros' }, coluna(1), coluna(-1)));
    alvo.appendChild(blocoMeses(ctx.meses, ctx.ordemDe));
    const conf = blocoConferencia(a.conferencia, a.exemplos);
    if (conf) alvo.appendChild(conf);
    alvo.appendChild(h('p', { class: 'nota', text: 'As datas são as da conclusão do formulário. Só entra a frente “' + CV.regras.tratativas.frente + '”. Valor = economias × tarifa da categoria (tarifas em js/regras.js).' }));
  }

  ui.renderTratativas = renderTratativas;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
