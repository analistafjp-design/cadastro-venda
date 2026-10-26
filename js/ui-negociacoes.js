/*
 * ui-negociacoes.js — a aba "Negociações": a tabela "Negociação - venda e recadastro" (por equipe:
 * negociações, valor negociado e ticket médio, com o total na base) e a mesma conta mês a mês.
 * Os números vêm de js/negociacoes.js; aqui só se monta a tela.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = CV.ui;
  const { h, fmt } = ui;

  /** `primeira`: a coluna da esquerda (Recurso na tabela por equipe, Mês na tabela por mês). */
  function colunas(primeira) {
    return [
      primeira || { id: 'recurso', titulo: 'Recurso', tipo: 'txt', valor: (l) => l.recurso },
      { id: 'total', titulo: 'Total negociação', tipo: 'num', valor: (l) => l.total, dica: 'Atividades finalizadas com “Negociou O Débito?” = Sim' },
      { id: 'valor', titulo: 'Valor negociado', tipo: 'num', valor: (l) => l.valor, render: (l) => fmt.brl(l.valor), dica: 'Soma do “Valor Total dos Débitos” das negociações' },
      { id: 'ticket', titulo: 'Ticket médio', tipo: 'num', valor: (l) => l.ticket, render: (l) => fmt.brl(l.ticket), dica: 'Valor negociado ÷ total de negociações' },
    ];
  }

  function blocoMeses(meses, ordemDe) {
    const b = ui.bloco('Negociação por mês',
      'Todos os meses com negociação, do mais recente para o mais antigo, e o total. Vale o filtro de equipe; o de período não (a ideia é comparar os meses).');
    b.className += ' estreito';
    const mes = { id: 'mes', titulo: 'Mês', tipo: 'txt', valor: (l) => (l.mes ? CV.tratativas.rotuloMes(l.mes) : 'Total'), ordena: (l) => l.mes };
    b.appendChild(ui.criarTabela({
      colunas: colunas(mes), linhas: meses.linhas, total: meses.linhas.length ? meses.total : null, totalEmbaixo: true,
      ordem: ordemDe('negociacoes-meses', { id: 'mes', dir: 'desc' }), vazio: 'Nenhuma negociação.',
    }));
    return b;
  }

  /**
   * ctx: { tabela (negociacoes.porEquipe), meses (negociacoes.porMes), ordemDe(id, padrao) }
   */
  function renderNegociacoes(alvo, ctx) {
    const t = ctx.tabela;
    const b = ui.bloco('Negociação — venda e recadastro',
      'Negociações de débito feitas pelas equipes no período: atividades finalizadas com “Negociou O Débito?” = Sim. Ticket médio = valor negociado ÷ negociações.');
    b.className += ' estreito';
    b.appendChild(ui.criarTabela({
      colunas: colunas(), linhas: t.linhas, total: t.linhas.length ? t.total : null, totalEmbaixo: true,
      ordem: ctx.ordemDe('negociacoes', { id: 'total', dir: 'desc' }), vazio: 'Nenhuma negociação neste período.',
    }));
    if (t.total.semValor > 0) {
      b.appendChild(h('p', { class: 'nota', text: fmt.int(t.total.semValor) + ' negociação(ões) sem “Valor Total dos Débitos” preenchido: contam no total e no ticket médio, com R$ 0,00. O Excel traz a lista.' }));
    }
    alvo.appendChild(b);
    if (ctx.meses) alvo.appendChild(blocoMeses(ctx.meses, ctx.ordemDe));
  }

  ui.renderNegociacoes = renderNegociacoes;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
