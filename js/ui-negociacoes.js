/*
 * ui-negociacoes.js — a aba "Negociações": a tabela "Negociação - venda e recadastro" (por equipe:
 * negociações, valor negociado e ticket médio, com o total na base), a mesma conta mês a mês e a
 * conferência com o relatório do Power BI. Os números vêm de js/negociacoes.js; aqui só se monta a tela.
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

  /** As negociações do período em que o valor do painel é diferente do valor do relatório (só na tela, não no PDF). */
  function blocoDiferencas(difs, igualPowerBI) {
    if (!difs.length) return null;
    const soma = difs.reduce((s, d) => s + d.diferenca, 0);
    const b = ui.bloco('Diferenças com o Power BI',
      'Negociações do período em que o “Valor Total dos Débitos” é lido de um jeito pelo painel e de outro pela fórmula do relatório (que tira “R$” e os pontos e divide os dígitos por 100; se o texto tiver letras ou outro símbolo, conta R$ 0,00).');
    b.className += ' so-tela';
    b.appendChild(h('p', { class: 'nota', text: igualPowerBI
      ? 'Os números acima seguem a fórmula do relatório (igualPowerBI: true). Lendo o valor como está escrito, o total seria ' + fmt.brl(Math.abs(soma)) + (soma >= 0 ? ' maior' : ' menor') + '.'
      : 'Por isso o valor negociado aqui fica ' + fmt.brl(Math.abs(soma)) + (soma >= 0 ? ' maior' : ' menor') + ' que o do relatório. Para os números baterem com o Power BI, use igualPowerBI: true em negociacoes, no arquivo js/regras.js.' }));
    b.appendChild(ui.criarTabela({
      colunas: [
        { id: 'recurso', titulo: 'Recurso', tipo: 'txt', valor: (d) => d.a.recurso },
        { id: 'data', titulo: 'Data', tipo: 'txt', valor: (d) => fmt.longa(d.a.data), ordena: (d) => d.a.data },
        { id: 'id', titulo: 'ID da Atividade', tipo: 'txt', valor: (d) => d.a.id },
        { id: 'texto', titulo: 'Valor Total dos Débitos', tipo: 'txt', valor: (d) => (d.a.valorDebitosTxt !== null && d.a.valorDebitosTxt !== undefined ? d.a.valorDebitosTxt : fmt.dec2(d.a.valorDebitos)) },
        { id: 'painel', titulo: 'Painel', tipo: 'num', valor: (d) => d.painel, render: (d) => fmt.brl(d.painel) },
        { id: 'pbi', titulo: 'Power BI', tipo: 'num', valor: (d) => d.powerBI, render: (d) => fmt.brl(d.powerBI) },
        { id: 'motivo', titulo: 'Por quê', tipo: 'txt', valor: (d) => d.motivo },
      ],
      linhas: difs, ordem: { id: 'recurso', dir: 'asc' },
    }));
    return b;
  }

  /**
   * ctx: { tabela (negociacoes.porEquipe), meses (negociacoes.porMes), diferencas (negociacoes.diferencasPowerBI),
   *        igualPowerBI, ordemDe(id, padrao) }
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
    const dif = blocoDiferencas(ctx.diferencas || [], ctx.igualPowerBI);
    if (dif) alvo.appendChild(dif);
  }

  ui.renderNegociacoes = renderNegociacoes;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
