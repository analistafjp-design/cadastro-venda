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

  /**
   * O valor como o relatório do Power BI o lê (medida "Negociação Valor"): tira "R$", os pontos, troca a
   * vírgula por ponto e divide por 100; se sobrar algo que não é número (letras, espaço no meio...), vale 0.
   * Na prática: só os dígitos ÷ 100, ou 0. Célula numérica do Excel vira texto antes ("1000,5"), como no Power Query.
   */
  function valorPowerBI(a) {
    const bruto = a.valorDebitosTxt !== null && a.valorDebitosTxt !== undefined ? a.valorDebitosTxt
      : typeof a.valorDebitos === 'number' ? String(a.valorDebitos).replace('.', ',') : '';
    const t = String(bruto).replace(/^ +| +$/g, '').replace(/ {2,}/g, ' ').split('R$').join('').split('.').join('').split(',').join('.');
    if (!/^[ \t\r\n]*[-+]?[\d.]*\d[\d.]*[ \t\r\n]*$/.test(t)) return 0;
    const n = Number(t.replace(/[^\d-]/g, '')) / 100;
    return Number.isFinite(n) ? n : 0;
  }

  /** O valor que entra nas contas: o lido pelo painel ou, com regras.negociacoes.igualPowerBI, o do relatório. */
  function valorDe(a) {
    if (CV.regras.negociacoes.igualPowerBI) return valorPowerBI(a);
    return a.valorDebitos === null || a.valorDebitos === undefined ? 0 : a.valorDebitos;
  }

  /** Total, valor, ticket médio e quantas vieram sem valor (contam na quantidade, não no valor). */
  function somar(lista) {
    let valor = 0;
    let semValor = 0;
    for (const a of lista) {
      if (a.valorDebitos === null || a.valorDebitos === undefined) semValor++;
      valor += valorDe(a);
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

  /**
   * Uma linha por mês ('2026-10'), do mais novo para o mais antigo, e o total: as mesmas contas da tabela
   * por equipe. { linhas: [{ mes, total, valor, ticket, semValor }], total }
   */
  function porMes(lista) {
    const grupos = new Map();
    for (const a of lista) {
      const m = a.data.slice(0, 7);
      if (!grupos.has(m)) grupos.set(m, []);
      grupos.get(m).push(a);
    }
    const linhas = Array.from(grupos.entries()).map(([mes, itens]) => Object.assign({ mes }, somar(itens)));
    linhas.sort((a, b) => (a.mes < b.mes ? 1 : -1));
    return { linhas, total: Object.assign({ mes: null }, somar(lista)) };
  }

  /**
   * Negociações cujo valor o painel lê diferente do relatório do Power BI, com o motivo provável.
   * [{ a, painel, powerBI, diferenca, motivo }] (diferenca = painel − Power BI)
   */
  function diferencasPowerBI(lista) {
    const out = [];
    for (const a of lista) {
      const painel = a.valorDebitos === null || a.valorDebitos === undefined ? 0 : a.valorDebitos;
      const pbi = valorPowerBI(a);
      if (Math.abs(painel - pbi) < 0.005) continue;
      let motivo = 'o texto do valor está num formato que o relatório lê de outro jeito';
      if (pbi === 0) motivo = 'o relatório não consegue ler o texto (tem letras, espaço ou outro símbolo junto do número) e conta R$ 0,00';
      else if (Math.abs(painel - pbi * 100) < 0.005) motivo = 'o valor veio sem os centavos e o relatório divide por 100';
      else if (Math.abs(painel * 10 - pbi * 100) < 0.005) motivo = 'o valor veio com uma casa de centavos só e o relatório divide por 100';
      out.push({ a, painel, powerBI: pbi, diferenca: Math.round((painel - pbi) * 100) / 100, motivo });
    }
    return out;
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

  CV.negociacoes = { ehNegociacao, preparar, filtrar, valorPowerBI, valorDe, somar, porEquipe, porMes, diferencasPowerBI, limites, mesesEntre };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.negociacoes;
})(typeof window !== 'undefined' ? window : globalThis);
