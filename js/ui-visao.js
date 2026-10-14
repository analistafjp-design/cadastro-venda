/*
 * ui-visao.js — as duas páginas principais:
 *   Visão geral      : cards (Percorrido, Exec, Exoc, Com resultados, tipos de resultado),
 *                      (VCG: lançamentos por equipe e tipo), bases, resultado por equipe (com "+"
 *                      para abrir os serviços) e por data.
 *   Tempos das equipes: deslocamento, serviço, pausas/apoio e ociosidade.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = CV.ui;
  const { h, fmt } = ui;
  const M = () => CV.metricas;
  const N = () => CV.normalize;

  const secao = (texto) => h('div', { class: 'secao', text: texto });

  /** Card no estilo do painel Pós-Corte: bolinha colorida + rótulo, número grande. */
  function cartao(rotulo, valor, cor, dica, sub) {
    return h('div', { class: 'cartao', title: dica || null },
      h('div', { class: 'rot' }, h('i', { class: 'dot', style: { background: cor } }), rotulo),
      h('div', { class: 'valor', text: valor }),
      sub ? h('div', { class: 'sub', text: sub }) : null);
  }

  function bloco(titulo, descricao, extras) {
    return h('section', { class: 'bloco' },
      h('div', { class: 'topo-bloco' },
        h('div', null, h('h2', { text: titulo }), descricao ? h('p', { class: 'desc', text: descricao }) : null),
        h('span', { class: 'espaco' }),
        extras || null));
  }

  function segmentado(opcoes, atual, aoMudar, rotulo) {
    return h('div', { class: 'segmentado', role: 'group', 'aria-label': rotulo || null },
      opcoes.map(([id, nome]) => h('button', { type: 'button', text: nome, attrs: { 'aria-pressed': String(atual === id) }, on: { click: () => aoMudar(id) } })));
  }

  const celulaTaxa = (taxa, max) => h('td', { class: 'taxa' }, h('div', { class: 'celula' },
    taxa && max ? h('span', { class: 'barra', style: { width: Math.max(2, (taxa / max) * 100) + '%' } }) : null,
    h('span', { class: 'valor', text: fmt.pct(taxa) })));

  // ======================================================================= Lançamentos por equipe e tipo (VCG)

  /**
   * Matriz equipe × tipo com os lançamentos do formulário (página VCG). Vem direto da planilha de
   * Resultados, sem passar pelas visitas. `L` é o retorno de metricas.lancamentosPorEquipeTipo.
   * `aviso`: texto extra para o rodapé (ex.: filtros que não se aplicam). `ordemDe(id, padrao)`.
   */
  function blocoLancamentos(L, ordemDe, aviso) {
    const b = bloco('Lançamentos por equipe e tipo',
      'O que o backoffice lançou como resultado no formulário do VCG, equipe por equipe. Vem direto da planilha: não depende de a equipe ter visita carregada.');
    const linhas = L.linhas.filter((l) => l.total > 0); // só quem trouxe resultado
    const notas = [];
    if (L.cadastrais > 0) notas.push(fmt.int(L.cadastrais) + ' lançamento(s) do período são só atualização cadastral (nome do bairro, telefone, endereço...) e não contam como resultado.');
    if (L.multiplos > 0) notas.push('Um lançamento pode ter mais de um tipo (ex.: venda e troca de titularidade), então a soma das colunas pode passar do total.');
    if (L.foraEscopo > 0) notas.push(fmt.int(L.foraEscopo) + ' lançamento(s) de equipes fora do painel (ex.: RIOVCGVENIN-003) não entram.');
    if (L.semEquipe > 0) notas.push(fmt.int(L.semEquipe) + ' lançamento(s) sem equipe preenchida não entram.');
    if (aviso) notas.push(aviso);
    if (!linhas.length) {
      b.appendChild(h('p', { class: 'nota', text: 'Nenhum lançamento de resultado das equipes do painel neste período.' + (notas.length ? ' ' + notas.join(' ') : '') }));
      return b;
    }
    const colunas = [
      { id: 'eq', titulo: 'Equipe', tipo: 'txt', valor: (l) => l.recurso },
      { id: 'tot', titulo: 'Lançamentos', tipo: 'num', valor: (l) => l.total, dica: 'Lançamentos de resultado da equipe no período (sem as atualizações cadastrais)' },
    ].concat(L.tipos.map((t) => ({ id: 't_' + t.id, titulo: t.curto, tipo: 'num', valor: (l) => l.tipos[t.id] || 0, dica: t.rotulo })));
    const total = { recurso: 'Total', ehTotal: true, total: L.total, tipos: Object.fromEntries(L.tipos.map((t) => [t.id, t.n])) };
    b.appendChild(ui.criarTabela({ colunas, linhas, total, ordem: ordemDe ? ordemDe('lancamentos', { id: 'tot', dir: 'desc' }) : { id: 'tot', dir: 'desc' } }));
    if (notas.length) b.appendChild(h('p', { class: 'nota', text: notas.join(' ') }));
    return b;
  }

  // ======================================================================= Visão geral

  /**
   * ctx: { vs (visitas já filtradas), equipes (nomes do escopo), gran, aoMudarGran(g),
   *        ordemDe(id, padrao), abertas (Set de equipes abertas), vcg,
   *        lancamentos (só VCG: metricas.lancamentosPorEquipeTipo), avisoLancamentos }
   */
  function renderVisao(alvo, ctx) {
    const R = CV.regras;
    const c = M().cartoes(ctx.vs);

    alvo.appendChild(secao('Resultado'));
    alvo.appendChild(h('div', { class: 'cartoes' },
      // a efetividade em destaque: das visitas executadas, quantas geraram resultado
      h('div', { class: 'cartao heroi', title: 'Efetividade = Com resultados ÷ Exec' },
        h('div', { class: 'rot' }, h('i', { class: 'dot', style: { background: 'var(--accent)' } }), 'Efetividade'),
        h('div', { class: 'valor', text: fmt.pct(c.taxa) }),
        h('div', { class: 'sub', text: c.exec ? fmt.int(c.resultado) + ' de ' + fmt.int(c.exec) + ' visitas executadas geraram resultado' : 'Nenhuma visita executada no período' })),
      cartao('Percorrido', fmt.int(c.percorrido), 'var(--c-cinza)', 'Exec + Exoc: visitas em que a equipe foi ao local'),
      cartao('Exec', fmt.int(c.exec), 'var(--c-azul)', 'Atividades finalizadas'),
      cartao('Exoc', fmt.int(c.oc), 'var(--c-laranja)', 'Encerradas com ocorrência (cliente ausente, endereço não localizado...)'),
      cartao('Com resultados', fmt.int(c.resultado), 'var(--c-verde)', 'Exec que geraram mudança de valor: incremento, categoria, titularidade, venda, tarifa social...')
    ));

    alvo.appendChild(secao('Tipo de resultado'));
    const tipos = [
      cartao('Incremento de economia', fmt.int(c.inc), 'var(--c-azul)', 'Só incremento de economia, sem alteração de categoria'),
      cartao('Incremento de economia e alteração de categoria', fmt.int(c.incCat), 'var(--c-roxo)', 'Mesmo retorno com economia e categoria alteradas'),
      cartao('Total de incremento', fmt.int(c.totalInc), 'var(--c-azul-esc)', 'Incremento de economia + incremento e alteração de categoria'),
      cartao('Total alteração de categoria', fmt.int(c.totalCat), 'var(--c-verde)', 'Alteração de categoria (inclui a que veio com incremento)'),
      cartao('Troca de titularidade', fmt.int(c.titular), 'var(--c-laranja)', 'Troca de titular da matrícula'),
    ];
    if (ctx.vcg) {
      // no VCG a venda e o cliente novo são o que mais importa: cada um tem o seu card
      tipos.push(
        cartao('Venda factível', fmt.int(c.venda), 'var(--c-verde)', 'Venda registrada no formulário (Venda Factível)'),
        cartao('Novo cliente (lote não cadastrado)', fmt.int(c.novo), 'var(--c-azul)', 'Lote que não estava no cadastro e virou cliente novo'),
        cartao('Negociação de débitos', fmt.int(c.debitos), 'var(--c-claro)', 'Negociação, unificação ou reparcelamento de débitos')
      );
    } else if (c.outros > 0) {
      tipos.push(cartao('Outros resultados', fmt.int(c.outros), 'var(--c-claro)', 'Tarifa social, fatura digital, venda, negociação de débitos, decremento...'));
    }
    alvo.appendChild(h('div', { class: 'cartoes' }, tipos));
    if (ctx.lancamentos) alvo.appendChild(blocoLancamentos(ctx.lancamentos, ctx.ordemDe, ctx.avisoLancamentos));

    // ------------------------------------------------------------- Bases
    const linhasBase = M().agruparPor(ctx.vs, (v) => v.projeto).filter((l) => l.percorrido > 0);
    const colsBase = [
      { id: 'base', titulo: 'Base', tipo: 'txt', valor: (l) => l.chave },
      { id: 'perc', titulo: 'Percorrido', tipo: 'num', valor: (l) => l.percorrido, dica: 'Exec + Exoc' },
      { id: 'res', titulo: 'Com resultados', tipo: 'num', valor: (l) => l.resultado },
      { id: 'taxa', titulo: 'Efetividade', tipo: 'taxa', valor: (l) => l.taxaResultado, dica: 'Com resultados ÷ Exec (visitas executadas)' },
    ];
    const blocoBase = bloco('Bases', 'Efetividade de cada base de alvos (projeto) no período.');
    blocoBase.appendChild(ui.criarTabela({ colunas: colsBase, linhas: linhasBase, ordem: ctx.ordemDe('visao-bases', { id: 'res', dir: 'desc' }), vazio: 'Nenhuma visita no período.' }));
    if (linhasBase.some((l) => l.chave === R.semProjeto)) {
      blocoBase.appendChild(h('p', { class: 'nota', text: '“' + R.semProjeto + '” são as atividades que não pertencem a uma base de alvos (pedidos do atendimento, solicitações das próprias equipes). Veja os textos na aba Auditoria.' }));
    }
    alvo.appendChild(blocoBase);

    // ------------------------------------------------------------- Resultado por equipe
    const equipes = M().resultadoPorEquipe(ctx.vs, ctx.equipes).filter((e) => e.resultado > 0); // só quem trouxe resultado
    const maxTaxa = equipes.reduce((m, e) => Math.max(m, e.taxa || 0), 0);
    const maxServico = (e) => e.tipos.reduce((m, t) => Math.max(m, t.n), 0);
    const corpo = h('tbody');
    for (const e of equipes) {
      const aberta = ctx.abertas.has(e.recurso);
      const linhaServicos = h('tr', { class: 'servicos', hidden: !aberta },
        h('td', { colSpan: 3 },
          e.tipos.length
            ? h('ul', null, e.tipos.map((t) => h('li', null,
              h('span', { class: 'rotulo', text: t.rotulo }),
              h('span', { class: 'barra-s', style: { width: Math.max(6, (t.n / maxServico(e)) * 140) + 'px' } }),
              h('span', { class: 'qtd', text: fmt.int(t.n) }))))
            : h('span', { class: 'vazio-s', text: 'Nenhum serviço trouxe resultado no período.' })));
      const botao = e.resultado > 0
        ? h('button', {
          type: 'button', class: 'mais', text: aberta ? '−' : '+', title: 'Ver os serviços que trouxeram resultado',
          attrs: { 'aria-expanded': String(aberta), 'aria-label': 'Serviços que trouxeram resultado: ' + e.recurso },
          on: {
            click: (ev) => {
              const abrir = linhaServicos.hidden;
              linhaServicos.hidden = !abrir;
              ev.currentTarget.textContent = abrir ? '−' : '+';
              ev.currentTarget.setAttribute('aria-expanded', String(abrir));
              if (abrir) ctx.abertas.add(e.recurso); else ctx.abertas.delete(e.recurso);
            },
          },
        })
        : null;
      corpo.appendChild(h('tr', { class: 'equipe' },
        h('td', { class: 'txt' }, h('span', { class: 'nome-equipe', text: e.recurso, title: fmt.int(e.exec) + ' Exec' }), botao),
        h('td', { class: 'num' + (e.resultado ? '' : ' zero'), text: fmt.int(e.resultado) }),
        celulaTaxa(e.taxa, maxTaxa)));
      corpo.appendChild(linhaServicos);
    }
    const blocoEq = bloco('Resultado por equipe', 'Só as equipes que trouxeram resultado no período. Use o “+” sob o nome para abrir os serviços e as quantidades.');
    if (equipes.length) {
      blocoEq.appendChild(h('div', { class: 'tabela-wrap' }, h('table', { class: 'tab' },
        h('thead', null, h('tr', null,
          h('th', { class: 'txt sem-ordem', text: 'Equipe' }),
          h('th', { class: 'sem-ordem', text: 'Com resultados' }),
          h('th', { class: 'sem-ordem', text: 'Efetividade', title: 'Com resultados ÷ Exec da equipe' }))),
        corpo)));
    } else {
      blocoEq.appendChild(h('p', { class: 'nota', text: 'Nenhuma equipe trouxe resultado neste período. Se for um dia recente, os retornos do backoffice ainda estão chegando (em maturação).' }));
    }
    alvo.appendChild(blocoEq);

    // ------------------------------------------------------------- Por data
    const gran = ctx.gran;
    const linhasData = M().porPeriodo(ctx.vs, gran).filter((l) => l.percorrido > 0);
    const rotulo = (l) => {
      if (gran === 'mes') return fmt.mes(l.chave + '-01');
      if (gran === 'semana') return fmt.curta(l.chave) + ' a ' + fmt.curta(N().somaDias(l.chave, 6));
      return N().diaDaSemana(l.chave) + ' ' + fmt.longa(l.chave);
    };
    const colsData = [
      {
        id: 'data', titulo: gran === 'dia' ? 'Data da visita' : gran === 'semana' ? 'Semana (seg–dom)' : 'Mês', tipo: 'txt',
        valor: (l) => l.chave, ordena: (l) => l.chave,
        render: (l) => [rotulo(l), l.maturando > 0 ? h('span', { class: 'etiqueta mat', text: 'em maturação', title: 'Os retornos do backoffice ainda estão chegando: a taxa tende a subir.' }) : null],
      },
      { id: 'perc', titulo: 'Percorrido', tipo: 'num', valor: (l) => l.percorrido },
      { id: 'exec', titulo: 'Exec', tipo: 'num', valor: (l) => l.exec },
      { id: 'exoc', titulo: 'Exoc', tipo: 'num', valor: (l) => l.oc },
      { id: 'res', titulo: 'Com resultados', tipo: 'num', valor: (l) => l.resultado },
      { id: 'taxa', titulo: 'Efetividade', tipo: 'taxa', valor: (l) => l.taxaResultado, dica: 'Com resultados ÷ Exec (visitas executadas)' },
    ];
    const blocoData = bloco('Por data', 'Cada visita é contada no dia em que aconteceu. Datas recentes ficam “em maturação”: o backoffice leva de 1 a 3 dias para lançar o retorno.',
      segmentado([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']], gran, ctx.aoMudarGran, 'Agrupar por'));
    blocoData.appendChild(ui.criarTabela({ colunas: colsData, linhas: linhasData, ordem: ctx.ordemDe('visao-data-' + gran, { id: 'data', dir: 'desc' }), vazio: 'Nenhuma visita no período.' }));
    alvo.appendChild(blocoData);
  }

  // ======================================================================= Tempos das equipes

  const CORES_TEMPO = { desloc: 'var(--c-azul)', servico: 'var(--c-verde)', apoio: 'var(--c-claro)', ocioso: 'var(--c-laranja)' };
  const TEXTO_TEMPO = { desloc: '#fff', servico: '#fff', apoio: 'var(--ink)', ocioso: '#1b1f2a' };
  const NOMES_TEMPO = { desloc: 'Deslocamento', servico: 'Serviço', apoio: 'Pausas e apoio', ocioso: 'Ociosidade' };

  /**
   * ctx: { agenda (já filtrada por período/equipe), equipes (nomes do escopo), modo: 'media'|'total',
   *        aoMudarModo(m), soCompletos, aoMudarCompletos(bool), ordemDe(id, padrao) }
   */
  function renderTempos(alvo, ctx) {
    const todas = CV.tempos.porEquipe(ctx.agenda);
    const haCompletos = todas.some((l) => l.diasCompletos > 0);
    // sem nenhum dia completo no período, contar todos os dias (e avisar)
    const soCompletos = ctx.soCompletos && haCompletos;
    const por = soCompletos ? CV.tempos.porEquipe(ctx.agenda, { soCompletos: true }) : todas;
    const chave = (r) => N().chave(r).replace(/ /g, '');
    const mapa = new Map(por.map((l) => [chave(l.recurso), l]));
    const linhas = ctx.equipes.map((nome) => {
      const l = mapa.get(chave(nome));
      return { recurso: nome, dias: l ? l.dias : 0, diasTodos: l ? l.diasTodos : 0, media: l ? l.media : null, total: l ? l.total : null };
    });
    const pega = (l, k) => (l.dias ? (ctx.modo === 'media' ? l.media[k] : l.total[k]) : null);
    const colTempo = (id, titulo, k, dica) => ({ id, titulo, tipo: 'num', valor: (l) => pega(l, k), render: (l) => N().hhmm(pega(l, k)), dica });
    const cols = [
      { id: 'equipe', titulo: 'Equipe', tipo: 'txt', valor: (l) => l.recurso },
      {
        id: 'dias', titulo: 'Dias', tipo: 'num', valor: (l) => l.dias,
        render: (l) => (soCompletos && l.diasTodos ? l.dias + ' de ' + l.diasTodos : fmt.int(l.dias)),
        dica: soCompletos ? 'Dias contados (com agenda completa) de todos os dias com horário no período' : 'Dias com atividade com horário no período',
      },
      colTempo('desloc', 'Deslocamento', 'desloc', 'Soma do “Tempo de Deslocamento” das atividades'),
      colTempo('servico', 'Serviço', 'servico', 'Duração das atividades de serviço (visitas, vendas, cobrança...)'),
      colTempo('apoio', 'Pausas e apoio', 'apoio', 'Refeição, DDS, checklist, carregamento de material, clima e abastecimento'),
      colTempo('ocioso', 'Ociosidade', 'ocioso', 'O que sobra do dia depois de deslocamento, serviço e apoio'),
      {
        id: 'dist', titulo: 'Como o dia foi usado', tipo: 'txt', sem_ordem: true, valor: () => null,
        render: (l) => {
          if (!l.dias || !l.total.dia) return '';
          const t = l.total;
          const pc = (v) => Math.max(0, (v / t.dia) * 100);
          // rótulo visível dentro de cada trecho (só onde cabe); o detalhe completo fica na dica
          return h('div', { class: 'dist', title: ['desloc', 'servico', 'apoio', 'ocioso'].map((k) => NOMES_TEMPO[k] + ' ' + fmt.pct(t[k] / t.dia)).join(' · ') },
            ['desloc', 'servico', 'apoio', 'ocioso'].map((k) => h('i', { style: { width: pc(t[k]) + '%', background: CORES_TEMPO[k], color: TEXTO_TEMPO[k] }, text: pc(t[k]) >= 7 ? Math.round(pc(t[k])) + '%' : null })));
        },
      },
    ];
    const blocoT = bloco('Tempos das equipes',
      'Das equipes que trouxeram resultado no período: deslocamento, serviço e ociosidade, em horas:minutos. ' + (ctx.modo === 'media' ? 'Média por dia trabalhado.' : 'Soma no período.'),
      h('div', { class: 'grupo-seg' },
        segmentado([['completos', 'Dias completos'], ['todos', 'Todos os dias']], ctx.soCompletos ? 'completos' : 'todos', (v) => ctx.aoMudarCompletos(v === 'completos'), 'Dias considerados'),
        segmentado([['media', 'Média por dia'], ['total', 'Total no período']], ctx.modo, ctx.aoMudarModo, 'Medida')));
    if (!linhas.length) {
      blocoT.appendChild(h('p', { class: 'nota', text: 'Nenhuma equipe trouxe resultado neste período. Se for um dia recente, os retornos do backoffice ainda estão chegando (em maturação).' }));
      alvo.appendChild(blocoT);
      return;
    }
    blocoT.appendChild(ui.criarTabela({ colunas: cols, linhas, ordem: ctx.ordemDe('tempos', { id: 'equipe', dir: 'asc' }), vazio: 'Sem atividades com horário no período.' }));
    blocoT.appendChild(h('div', { class: 'legenda' }, [
      ['desloc', 'Deslocamento'], ['servico', 'Serviço'], ['apoio', 'Pausas e apoio'], ['ocioso', 'Ociosidade'],
    ].map(([k, n]) => h('span', null, h('i', { style: { background: CORES_TEMPO[k] } }), n))));
    blocoT.appendChild(h('p', { class: 'nota', text: 'Dia = do início da primeira atividade (menos o deslocamento até ela) ao fim da última. Ociosidade = o que sobra do dia depois de deslocamento, serviço e pausas/apoio. Atividades canceladas ou sem horário não contam.' }));

    if (!ctx.agenda.length) {
      blocoT.appendChild(h('p', { class: 'explica' }, h('b', { text: 'Sem horários no período. ' }),
        'Os tempos usam as colunas Início, Fim, Duração e Tempo de Deslocamento das atividades das equipes; se o período escolhido não tem atividades com horário (ou os arquivos não trazem essas colunas), a tabela fica vazia.'));
    } else if (!haCompletos) {
      blocoT.appendChild(h('p', { class: 'explica' }, h('b', { text: 'Atenção: ' }),
        'nenhum dia deste período tem refeição, DDS, carregamento e outras atividades de apoio (só visitas cadastrais). Nesses dias o horário de almoço e as paradas entram como ociosidade, então a ociosidade fica acima do real. Para um número fiel, carregue a exportação completa do sistema (todos os tipos de atividade).'));
    } else {
      blocoT.appendChild(h('p', { class: 'nota', text: soCompletos
        ? '“Dias completos” são os dias em que a equipe tem também refeição, DDS, carregamento etc. registrados (exportação completa do sistema). Nos outros dias só há visitas e o almoço viraria ociosidade; escolha “Todos os dias” para incluí-los.'
        : 'Atenção: em “Todos os dias” entram dias só com visitas, sem refeição e paradas registradas; neles o almoço conta como ociosidade, o que deixa a ociosidade acima do real.' }));
    }
    alvo.appendChild(blocoT);
  }

  ui.blocoLancamentos = blocoLancamentos;
  ui.renderVisao = renderVisao;
  ui.renderTempos = renderTempos;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
