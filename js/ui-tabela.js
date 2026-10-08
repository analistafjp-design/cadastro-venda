/*
 * ui-tabela.js — tabela ordenável genérica (cabeçalho fixo, 1ª coluna fixa,
 * linha de total fixada no topo, barras de taxa) e os conjuntos de colunas
 * usados nas abas.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = CV.ui;
  const { h, fmt } = ui;

  /**
   * opcoes: {
   *   colunas: [{ id, titulo, dica, tipo: 'txt'|'num'|'taxa', valor(l), render?(l) -> Node|string, ordena?(l), sem_ordem }],
   *   linhas, total?: linha, ordem: {id, dir}, aoOrdenar(ordem), classeLinha?(l), maxLinhas?
   * }
   */
  function criarTabela(op) {
    const ordem = op.ordem || { id: null, dir: 'desc' };
    const cols = op.colunas;

    function valorOrdem(c, l) {
      const v = c.ordena ? c.ordena(l) : c.valor(l);
      return v === null || v === undefined ? -Infinity : v;
    }

    const linhasOrdenadas = () => {
      const ls = op.linhas.slice();
      const c = cols.find((x) => x.id === ordem.id);
      if (c) {
        const sinal = ordem.dir === 'asc' ? 1 : -1;
        ls.sort((a, b) => {
          const va = valorOrdem(c, a);
          const vb = valorOrdem(c, b);
          if (typeof va === 'string' || typeof vb === 'string') return sinal * String(va).localeCompare(String(vb), 'pt-BR');
          return sinal * (va - vb);
        });
      }
      return ls;
    };

    const maxTaxa = (c) => {
      let m = 0;
      for (const l of op.linhas) {
        const v = c.valor(l);
        if (v !== null && v !== undefined && v > m) m = v;
      }
      return m;
    };

    function celula(c, l, maxes) {
      if (c.tipo === 'taxa') {
        const v = c.valor(l);
        const barra = v && maxes[c.id] ? h('span', { class: 'barra', style: { width: Math.max(2, (v / maxes[c.id]) * 100) + '%' } }) : null;
        return h('td', { class: 'taxa' }, h('div', { class: 'celula' }, barra, h('span', { class: 'valor', text: fmt.pct(v) })));
      }
      const v = c.valor(l);
      const conteudo = c.render ? c.render(l) : c.tipo === 'num' ? fmt.int(v) : v;
      const zero = c.tipo === 'num' && !c.render && (v === 0 || v === null || v === undefined);
      const dica = c.tipo === 'txt' && typeof v === 'string' && v.length > 28 ? v : null;
      return h('td', { class: (c.tipo === 'num' ? 'num' : 'txt') + (zero ? ' zero' : ''), title: dica }, conteudo === null ? '' : conteudo);
    }

    const tabela = h('table', { class: 'tab' });
    const wrap = h('div', { class: 'tabela-wrap' }, tabela);

    function desenhar() {
      tabela.textContent = '';
      const maxes = {};
      for (const c of cols) if (c.tipo === 'taxa') maxes[c.id] = maxTaxa(c);
      tabela.appendChild(
        h('thead', null,
          h('tr', null, cols.map((c) =>
            h('th', {
              class: (c.tipo === 'txt' ? 'txt ' : '') + (c.sem_ordem ? 'sem-ordem' : ''),
              title: c.dica || null,
              attrs: { 'aria-sort': ordem.id === c.id ? (ordem.dir === 'asc' ? 'ascending' : 'descending') : 'none' },
              on: c.sem_ordem ? {} : {
                click: () => {
                  ordem.dir = ordem.id === c.id && ordem.dir === 'desc' ? 'asc' : 'desc';
                  ordem.id = c.id;
                  if (op.aoOrdenar) op.aoOrdenar({ id: ordem.id, dir: ordem.dir });
                  desenhar();
                },
              },
              text: c.titulo,
            })
          ))
        )
      );
      const corpo = h('tbody');
      if (op.total) {
        corpo.appendChild(h('tr', { class: 'total' }, cols.map((c) => celula(c, op.total, maxes))));
      }
      const ls = linhasOrdenadas();
      const limite = op.maxLinhas || ls.length;
      for (const l of ls.slice(0, limite)) {
        const cls = op.classeLinha ? op.classeLinha(l) : '';
        corpo.appendChild(h('tr', { class: cls || null }, cols.map((c) => celula(c, l, maxes))));
      }
      if (!ls.length) {
        corpo.appendChild(h('tr', null, h('td', { class: 'txt', colSpan: cols.length, text: op.vazio || 'Nada para mostrar com os filtros atuais.' })));
      }
      tabela.appendChild(corpo);
    }
    desenhar();
    return wrap;
  }

  /**
   * Colunas padrão de uma linha de resumo (período, projeto, equipe...).
   * `primeira`: coluna inicial. `geral`: resumo geral (para o índice). `opc.indice`: mostrar índice.
   */
  function colunasResumo(primeira, linhasParaOcultar, geral, opc) {
    const R = CV.regras;
    const o = opc || {};
    const soma = (id) => linhasParaOcultar.reduce((s, l) => s + (l.colunas[id] || 0), 0);
    const cols = [
      primeira,
      { id: 'total', titulo: 'Atividades', tipo: 'num', valor: (l) => l.total, dica: 'Alvos gerados (todas as atividades, qualquer status)' },
      { id: 'exec', titulo: 'Executadas', tipo: 'num', valor: (l) => l.exec, dica: 'Status "Finalizada"' },
      { id: 'pexec', titulo: '% Exec.', tipo: 'num', valor: (l) => l.taxaExec, render: (l) => fmt.pct(l.taxaExec), dica: 'Executadas ÷ Atividades: quanto do que foi gerado virou visita feita (o resto é ocorrência/cancelamento)' },
      { id: 'oc', titulo: 'Ocorrências', tipo: 'num', valor: (l) => l.oc, dica: 'Status "Encerrada com Ocorrência" (visita sem execução)' },
      { id: 'ret', titulo: 'Com retorno', tipo: 'num', valor: (l) => l.comRetorno, dica: 'Executadas que já têm lançamento do backoffice na planilha de Resultados' },
      { id: 'res', titulo: 'Resultado', tipo: 'num', valor: (l) => l.resultado, dica: 'Executadas com mudança de valor: incremento/alteração de economia, categoria, titularidade, venda, tarifa social, fatura digital, negociação de débitos' },
      { id: 'taxa', titulo: '% Resultado', tipo: 'taxa', valor: (l) => l.taxaResultado, dica: 'Resultado ÷ Executadas' },
    ];
    if (o.indice) {
      cols.push({
        id: 'ind', titulo: 'Índice', tipo: 'num', dica: 'Taxa de resultado ÷ taxa geral do período (2,0× = converte o dobro da média)',
        valor: (l) => (!l.ehTotal && l.exec >= R.minAmostra && geral.taxaResultado ? l.taxaResultado / geral.taxaResultado : null),
        render: (l) => {
          if (l.ehTotal) return ''; // o total é a própria média: índice sempre 1,0×
          const v = l.exec >= R.minAmostra && geral.taxaResultado ? l.taxaResultado / geral.taxaResultado : null;
          if (v === null) return '–';
          return h('span', { class: 'indice ' + (v >= 1.25 ? 'alto' : v <= 0.6 ? 'baixo' : ''), text: (v >= 1.25 ? '▲ ' : v <= 0.6 ? '▼ ' : '') + fmt.ind(v) });
        },
      });
    }
    for (const c of R.colunasDesfecho) {
      if (soma(c.id) === 0) continue; // coluna sem nenhuma ocorrência no recorte não entra
      cols.push({ id: 'c_' + c.id, titulo: c.rotulo, tipo: 'num', valor: (l) => l.colunas[c.id], dica: 'Executadas cujo retorno inclui: ' + c.classes.map((id) => R.classes.find((x) => x.id === id).curto).join(', ') });
    }
    cols.push(
      { id: 'atu', titulo: 'Atualização', tipo: 'num', valor: (l) => l.atualizacao, dica: 'Só atualização/saneamento cadastral (telefone, endereço, classificação...), sem resultado de valor' },
      { id: 'sem', titulo: 'Sem tratativa', tipo: 'num', valor: (l) => l.sem, dica: 'Backoffice analisou e não havia o que tratar' },
      { id: 'sr', titulo: 'Sem retorno', tipo: 'num', valor: (l) => l.semRetorno, dica: 'Executadas sem lançamento do backoffice (ainda). Visitas recentes podem estar em maturação.' },
      { id: 'de', titulo: 'Δ economias', tipo: 'num', valor: (l) => l.deltaEcon, render: (l) => fmt.sinal(l.deltaEcon), dica: 'Economias acrescidas (+) menos retiradas (−), lidas dos campos DE/PARA' }
    );
    return cols;
  }

  ui.criarTabela = criarTabela;
  ui.colunasResumo = colunasResumo;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
