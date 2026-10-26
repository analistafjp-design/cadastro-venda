/*
 * negociacoes.js — aba "Negociações": por equipe, quantas negociações de débito foram feitas,
 * o valor negociado e o ticket médio (a tabela "Negociação - venda e recadastro" do relatório).
 *
 * Vem só das Atividades (exportação completa do sistema), colunas "Negociou O Débito?" e
 * "Valor Total dos Débitos". Negociação = atividade Finalizada de uma equipe do escopo com a
 * resposta "Sim" (regras.negociacoes). Não depende dos Resultados nem do cruzamento.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;
  const chaveEquipe = (r) => N().chave(r).replace(/ /g, '');

  /** A atividade é uma negociação de débito que conta? */
  function ehNegociacao(a) {
    if (!a.negociou || !CV.escopo.equipeNoEscopo(a.recurso)) return false;
    if (CV.dados.grupoStatus(a.status) !== 'exec') return false;
    return CV.regras.negociacoes.respostas.map((r) => N().chave(r)).includes(N().chave(a.negociou));
  }

  /** As negociações (atividades limpas), da mais antiga para a mais nova. */
  function preparar(atividades) {
    return atividades.filter(ehNegociacao).sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
  }

  /** Recorte da tela: f = { de, ate, equipe }. */
  function filtrar(lista, f) {
    const o = f || {};
    const eq = o.equipe ? chaveEquipe(o.equipe) : null;
    return lista.filter((a) => (!o.de || a.data >= o.de) && (!o.ate || a.data <= o.ate) && (!eq || chaveEquipe(a.recurso) === eq));
  }

  /** Total, valor, ticket médio e quantas vieram sem valor (contam na quantidade, não no valor). */
  function somar(lista) {
    let valor = 0;
    let semValor = 0;
    for (const a of lista) {
      if (a.valorDebitos === null || a.valorDebitos === undefined) semValor++;
      else valor += a.valorDebitos;
    }
    valor = Math.round(valor * 100) / 100;
    return { total: lista.length, valor, ticket: lista.length ? valor / lista.length : 0, semValor };
  }

  /**
   * Uma linha por equipe (só as que negociaram), da que mais negociou para a que menos, e o total.
   * { linhas: [{ recurso, total, valor, ticket, semValor }], total: { ... } }
   */
  function porEquipe(lista) {
    const grupos = new Map();
    for (const a of lista) {
      const k = chaveEquipe(a.recurso);
      if (!grupos.has(k)) grupos.set(k, { recurso: a.recurso, itens: [] });
      grupos.get(k).itens.push(a);
    }
    const linhas = Array.from(grupos.values()).map((g) => Object.assign({ recurso: g.recurso }, somar(g.itens)));
    linhas.sort((a, b) => b.total - a.total || b.valor - a.valor || a.recurso.localeCompare(b.recurso, 'pt-BR'));
    return { linhas, total: Object.assign({ recurso: 'Total' }, somar(lista)) };
  }

  /** Primeiro e último dia com negociação. */
  function limites(lista) {
    return lista.length ? { min: lista[0].data, max: lista[lista.length - 1].data } : { min: null, max: null };
  }

  /** Todos os meses ('2026-10') entre duas datas ISO, do mais novo para o mais antigo. */
  function mesesEntre(min, max) {
    if (!min || !max) return [];
    const out = [];
    let [a, m] = min.slice(0, 7).split('-').map(Number);
    const fim = max.slice(0, 7);
    for (let ym = min.slice(0, 7); ym <= fim; ym = a + '-' + N().p2(m)) {
      out.push(ym);
      m++;
      if (m > 12) { m = 1; a++; }
    }
    return out.reverse();
  }

  CV.negociacoes = { ehNegociacao, preparar, filtrar, somar, porEquipe, limites, mesesEntre };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.negociacoes;
})(typeof window !== 'undefined' ? window : globalThis);
