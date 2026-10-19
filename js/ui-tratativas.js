/*
 * ui-tratativas.js — a aba "Tratativas": os quatro quadros (incremento e decremento de economia e de
 * categoria, em R$), os cards, o saldo por mês e a conferência dos dados. Os números vêm de
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

  /** `comFrente`: a coluna "Frente de serviço" só aparece quando há mais de uma frente nos quadros. */
  function colunasQuadro(q, comFrente) {
    return [
      comFrente ? { id: 'frente', titulo: 'Frente de serviço', tipo: 'txt', valor: (l) => l.frente } : null,
      { id: 'a', titulo: q.colA, tipo: 'txt', valor: (l) => l.de },
      { id: 'b', titulo: q.colB, tipo: 'txt', valor: (l) => l.para },
      { id: 'n', titulo: q.colN, tipo: 'num', valor: (l) => l.n, dica: q.tipo === 'economia' ? 'Economias a mais (+) ou a menos (−)' : 'Economias que mudaram de categoria' },
      { id: 'valor', titulo: q.colValor, tipo: 'num', valor: (l) => l.valor, render: (l) => celulaValor(l.valor), dica: 'R$ por mês: economias × tarifa' },
    ].filter(Boolean);
  }

  function blocoQuadro(q, dados, ordemDe, comFrente) {
    const b = ui.bloco(q.titulo, DESCRICAO[q.id]);
    // o rótulo "Total" fica na primeira coluna que existir
    const total = { frente: 'Total', ehTotal: true, de: comFrente ? '' : 'Total', para: '', n: dados.n, valor: dados.valor };
    b.appendChild(ui.criarTabela({
      colunas: colunasQuadro(q, comFrente), linhas: dados.linhas, total: dados.linhas.length ? total : null, totalEmbaixo: true,
      ordem: ordemDe('tratativas-' + q.id + (comFrente ? '-frente' : ''), { id: comFrente ? 'frente' : 'a', dir: 'asc' }), vazio: 'Nenhum lançamento neste período.',
    }));
    return b;
  }

  /** Card do saldo, em destaque: vermelho quando o saldo é negativo. */
  function cartaoSaldo(saldo) {
    return h('div', { class: 'cartao heroi', title: 'Incremento de economia + incremento de categoria − decrementos (economia e categoria)' },
      h('div', { class: 'rot' }, h('i', { class: 'dot', style: { background: 'var(--accent)' } }), 'Saldo do período'),
      h('div', { class: 'valor' + (saldo < 0 ? ' neg' : ''), text: fmt.brl(saldo) }),
      h('div', { class: 'sub', text: 'Incrementos − decrementos, de economia e de categoria' }));
  }

  function blocoMeses(meses, ordemDe) {
    const b = ui.bloco('Saldo por mês',
      'Todos os meses com lançamento, lado a lado (só o filtro de assistente vale aqui; o de período não). Substitui a conta feita à mão de cada mês.');
    const col = (id, titulo, k) => ({ id, titulo, tipo: 'num', valor: (m) => m[k], render: (m) => celulaValor(m[k]) });
    b.appendChild(ui.criarTabela({
      colunas: [
        { id: 'mes', titulo: 'Mês', tipo: 'txt', valor: (m) => m.rotulo, ordena: (m) => m.mes },
        col('incEco', 'Incremento de economia', 'incEco'),
        col('incCat', 'Incremento de categoria', 'incCat'),
        col('decEco', 'Decremento de economia', 'decEco'),
        col('decCat', 'Decremento de categoria', 'decCat'),
        col('saldo', 'Saldo', 'saldo'),
        { id: 'var', titulo: 'Vs. mês anterior', tipo: 'num', valor: (m) => m.variacao, render: (m) => (m.variacao === null ? '–' : celulaValor(m.variacao)), dica: 'Saldo menos o saldo do mês anterior com lançamento' },
      ],
      linhas: meses, ordem: ordemDe('tratativas-meses', { id: 'mes', dir: 'desc' }), vazio: 'Nenhum mês com lançamento.',
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
    const c = a.cartoes;

    alvo.appendChild(ui.secao('Tratativas do período'));
    alvo.appendChild(h('div', { class: 'cartoes' },
      ui.cartao('Acumulado', fmt.int(c.tratados), 'var(--c-azul)', 'Lançamentos com tratativa feita: TIPO DE ALTERAÇÃO preenchido e diferente de “sem tratativa” / “encerrado”'),
      ui.cartao('Dias com tratativa', fmt.int(c.dias), 'var(--c-cinza)', 'Dias do período em que houve ao menos uma tratativa'),
      ui.cartao('Média por dia', fmt.dec2(c.media), 'var(--c-verde)', 'Acumulado ÷ dias com tratativa')));

    alvo.appendChild(ui.secao('Valor das tratativas (R$ por mês)'));
    const q = a.quadros;
    const sub = (x) => fmt.int(Math.abs(x.n)) + ' economia(s)';
    alvo.appendChild(h('div', { class: 'cartoes' },
      ui.cartao('Incremento de economia', fmt.brl(q.incEco.valor), 'var(--c-azul)', DESCRICAO.incEco, sub(q.incEco)),
      ui.cartao('Incremento de categoria', fmt.brl(q.incCat.valor), 'var(--c-roxo)', DESCRICAO.incCat, sub(q.incCat)),
      ui.cartao('Decremento de economia', fmt.brl(q.decEco.valor), 'var(--c-laranja)', DESCRICAO.decEco, sub(q.decEco)),
      ui.cartao('Decremento de categoria', fmt.brl(q.decCat.valor), 'var(--c-claro)', DESCRICAO.decCat, sub(q.decCat)),
      cartaoSaldo(a.saldo)));

    // hoje a frente é uma só ("Cadastro"): a coluna só aparece se algum quadro trouxer mais de uma
    const comFrente = T.QUADROS.some((def) => new Set(q[def.id].linhas.map((l) => l.frente)).size > 1);
    alvo.appendChild(h('div', { class: 'grade-quadros' }, T.QUADROS.map((def) => blocoQuadro(def, q[def.id], ctx.ordemDe, comFrente))));
    alvo.appendChild(blocoMeses(ctx.meses, ctx.ordemDe));
    const conf = blocoConferencia(a.conferencia, a.exemplos);
    if (conf) alvo.appendChild(conf);
    alvo.appendChild(h('p', { class: 'nota', text: 'As datas são as da conclusão do formulário. Só entra a frente “' + CV.regras.tratativas.frente + '”. Valor = economias × tarifa da categoria (tarifas em js/regras.js).' }));
  }

  ui.renderTratativas = renderTratativas;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
