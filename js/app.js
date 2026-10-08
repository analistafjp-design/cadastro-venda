/*
 * app.js — controlador da interface: carga de arquivos, estado, filtros,
 * abas (Diário · Bases e equipes · Novos alvos · Auditoria).
 */
(function () {
  'use strict';
  const CV = window.CV;
  const R = CV.regras;
  const N = CV.normalize;
  const M = CV.metricas;
  const { h, fmt } = CV.ui;
  const $ = (id) => document.getElementById(id);

  const estado = {
    atividades: new Map(),
    resultados: new Map(),
    arquivos: [],
    frentes: [],
    frentesAtivas: null, // null = todas
    janela: R.janelaDias,
    cruzado: null,
    modelo: null,
    datas: { min: null, max: null },
    opcoes: { projetos: [], recursos: [], cidades: [] },
    tipoRecurso: new Map(),
    filtros: { preset: '30', de: null, ate: null, projetos: new Set(), recursos: new Set(), cidades: new Set() },
    gran: 'dia',
    granManual: false,
    modoGrafico: 'volume',
    aba: 'diario',
    subBases: 'projetos',
    subAlvos: 'revisitar',
    dimTerr: 'cidade',
    ordem: {},
    persistente: true,
  };

  // ---------------------------------------------------------------- mensagens

  function mensagem(tipo, texto) {
    const icone = { erro: '✕', aviso: '!', ok: '✓' }[tipo] || 'i';
    const el = h('div', { class: 'msg ' + tipo, role: tipo === 'erro' ? 'alert' : 'status' },
      h('span', { class: 'ic', text: icone }),
      h('span', { text: texto }),
      h('button', { class: 'btn fantasma mini', text: 'Fechar', on: { click: () => el.remove() } })
    );
    $('mensagens').appendChild(el);
    if (tipo === 'ok') setTimeout(() => el.remove(), 9000); // avisos e erros ficam até serem fechados
    return el;
  }

  function sobreposicao(texto) {
    const el = h('div', { class: 'carregando', role: 'status' },
      h('div', { class: 'cx' }, h('b', { text: texto }), h('div', { class: 'barra-prog' }, h('i'))));
    document.body.appendChild(el);
    const msg = el.querySelector('b');
    return { texto: (t) => { msg.textContent = t; }, fechar: () => el.remove() };
  }

  const pausa = () => new Promise((r) => setTimeout(r, 20));

  // ---------------------------------------------------------------- carga de arquivos

  async function receberArquivos(lista) {
    const arquivos = Array.from(lista).filter((f) => /\.xlsx$/i.test(f.name) || f.type.includes('spreadsheetml'));
    const ignorados = Array.from(lista).length - arquivos.length;
    if (ignorados > 0) mensagem('aviso', ignorados + ' arquivo(s) ignorado(s): só aceito planilhas .xlsx do Excel.');
    if (!arquivos.length) return;
    const ov = sobreposicao('Lendo arquivos…');
    let mudou = false;
    try {
      for (const f of arquivos) {
        ov.texto('Lendo ' + f.name + '…');
        await pausa();
        try {
          if (await carregarArquivo(f, ov)) mudou = true;
        } catch (e) {
          console.error(e);
          mensagem('erro', f.name + ': ' + (e && e.message ? e.message : 'não consegui ler este arquivo.'));
        }
      }
      if (mudou) {
        ov.texto('Cruzando matrículas…');
        await pausa();
        recalcular();
        if (!estado.jaTinhaDados) aplicarPreset(estado.filtros.preset);
        estado.jaTinhaDados = true;
        montarFiltros();
        renderTudo();
      }
    } finally {
      ov.fechar();
    }
  }

  async function carregarArquivo(f, ov) {
    const buf = await f.arrayBuffer();
    const cab = await CV.xlsx.lerPlanilha(buf, { soCabecalho: true });
    const tipo = CV.dados.detectarTipo(cab.cabecalho);
    if (!tipo) {
      mensagem('erro', f.name + ': não reconheci o formato. Esperava a planilha de Atividades (com "ID da Atividade", "Matrícula", "Status da Atividade") ou a de Resultados (com "MATRICULA S/ DIGITO", "Hora de início").');
      return false;
    }
    const campos = tipo === 'atividades' ? CV.dados.CAMPOS_ATIVIDADES : CV.dados.CAMPOS_RESULTADOS;
    const obrig = tipo === 'atividades' ? CV.dados.OBRIGATORIOS_ATIVIDADES : CV.dados.OBRIGATORIOS_RESULTADOS;
    const dados = await CV.xlsx.lerPlanilha(buf, {
      colunas: campos,
      aoProgresso: (n) => ov.texto('Lendo ' + f.name + ' — ' + fmt.int(n) + ' linhas…'),
    });
    const faltam = obrig.filter((c) => dados.faltando.includes(c));
    if (faltam.length) {
      mensagem('erro', f.name + ': não encontrei a(s) coluna(s) ' + faltam.map((c) => '"' + campos[c][0] + '"').join(', ') + '.');
      return false;
    }
    const alvo = tipo === 'atividades' ? estado.atividades : estado.resultados;
    const limp = tipo === 'atividades' ? CV.dados.limparAtividades(dados.linhas) : CV.dados.limparResultados(dados.linhas);
    // linhas repetidas dentro do próprio arquivo (mesmo ID) valem uma vez só
    const unicas = new Map();
    for (const r of limp.limpas) unicas.set(r.id, r);
    const repetidas = limp.limpas.length - unicas.size;
    let novos = 0;
    let atualizados = 0;
    for (const r of unicas.values()) {
      if (alvo.has(r.id)) atualizados++; else novos++;
      alvo.set(r.id, r);
    }
    limp.limpas = Array.from(unicas.values());
    const info = { nome: f.name, tipo, linhas: dados.linhas.length, validas: limp.limpas.length, novos, atualizados, repetidas, quando: new Date().toISOString(), descartes: limp.descartes };
    estado.arquivos.push(info);
    await persistir(tipo === 'atividades' ? 'atividades' : 'resultados', limp.limpas, info);

    const partes = [fmt.int(limp.limpas.length) + ' ' + (tipo === 'atividades' ? 'atividades' : 'retornos') + ' (' + fmt.int(novos) + ' novos, ' + fmt.int(atualizados) + ' já carregados antes e atualizados)'];
    if (repetidas) partes.push(fmt.int(repetidas) + ' linha(s) repetida(s) no arquivo (mesmo ID) contadas uma vez só');
    if (tipo === 'atividades') {
      const ign = Object.values(limp.descartes.tipoIgnorado).reduce((a, b) => a + b, 0);
      if (ign) partes.push(fmt.int(ign) + ' de outros tipos de serviço ignoradas');
      if (limp.descartes.semData) partes.push(fmt.int(limp.descartes.semData) + ' sem data válida descartadas');
    }
    mensagem('ok', f.name + ': ' + partes.join(' · ') + '.');
    const novosCampos = dados.faltando.filter((c) => !obrig.includes(c));
    if (novosCampos.length) mensagem('aviso', f.name + ': colunas opcionais ausentes (' + novosCampos.map((c) => campos[c][0]).join(', ') + ') — as análises que dependem delas ficam em branco.');
    return true;
  }

  async function persistir(store, registros, info) {
    if (!estado.persistente) return;
    try {
      await CV.store.salvar(store, registros);
      await CV.store.salvar('arquivos', [info]);
    } catch (e) {
      console.warn('Armazenamento local indisponível:', e);
      estado.persistente = false;
      mensagem('aviso', 'Não consegui guardar os dados neste navegador; eles valem só enquanto esta aba estiver aberta.');
    }
  }

  async function restaurar() {
    try {
      const salvo = await CV.store.carregar();
      for (const a of salvo.atividades) estado.atividades.set(a.id, a);
      for (const r of salvo.resultados) estado.resultados.set(r.id, r);
      estado.arquivos = (salvo.arquivos || []).sort((a, b) => (a.quando < b.quando ? -1 : 1));
    } catch (e) {
      estado.persistente = false;
    }
  }

  async function limparTudo() {
    if (!window.confirm('Apagar todos os dados guardados neste navegador? (Os arquivos originais não são afetados.)')) return;
    try { await CV.store.limpar(); } catch (e) { /* sem armazenamento: nada a apagar */ }
    estado.atividades.clear();
    estado.resultados.clear();
    estado.arquivos = [];
    estado.cruzado = null;
    estado.jaTinhaDados = false;
    $('mensagens').textContent = '';
    renderTudo();
  }

  // ---------------------------------------------------------------- cálculo

  function recalcular() {
    const at = Array.from(estado.atividades.values());
    const rs = Array.from(estado.resultados.values());
    estado.frentes = Array.from(new Set(rs.map((r) => r.frente).filter(Boolean))).sort();
    if (estado.frentesAtivas) {
      estado.frentesAtivas = new Set(Array.from(estado.frentesAtivas).filter((f) => estado.frentes.includes(f)));
      if (!estado.frentesAtivas.size) estado.frentesAtivas = null;
    }
    estado.cruzado = CV.cruzamento.montar(at, rs, { janelaDias: estado.janela, frentes: estado.frentesAtivas });
    const vs = estado.cruzado.visitas;
    estado.modelo = M.criarModeloChance(vs);

    let min = null;
    let max = null;
    const proj = new Map();
    const rec = new Map();
    const cid = new Map();
    estado.tipoRecurso = new Map();
    for (const v of vs) {
      if (!min || v.data < min) min = v.data;
      if (!max || v.data > max) max = v.data;
      proj.set(v.projeto, (proj.get(v.projeto) || 0) + 1);
      rec.set(v.recurso, (rec.get(v.recurso) || 0) + 1);
      const c = v.cidade || '(sem cidade)';
      cid.set(c, (cid.get(c) || 0) + 1);
      if (!estado.tipoRecurso.has(v.recurso)) estado.tipoRecurso.set(v.recurso, v.equipe);
    }
    estado.datas = { min, max };
    const ord = (mapa) => Array.from(mapa.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([valor, n]) => ({ valor, n }));
    estado.opcoes = { projetos: ord(proj), recursos: ord(rec), cidades: ord(cid) };
    for (const [chave, lista] of [['projetos', estado.opcoes.projetos], ['recursos', estado.opcoes.recursos], ['cidades', estado.opcoes.cidades]]) {
      const validos = new Set(lista.map((o) => o.valor));
      for (const v of Array.from(estado.filtros[chave])) if (!validos.has(v)) estado.filtros[chave].delete(v);
    }
    delete estado._vs;
  }

  function aplicarPreset(p) {
    const f = estado.filtros;
    f.preset = p;
    const fim = estado.datas.max;
    if (!fim) { f.de = null; f.ate = null; return; }
    if (p === 'tudo') { f.de = null; f.ate = null; }
    else if (p === 'mes') { f.de = fim.slice(0, 8) + '01'; f.ate = null; }
    else if (p === 'custom') { /* mantém as datas digitadas */ }
    else { f.de = N.somaDias(fim, -(Number(p) - 1)); f.ate = null; }
    if (p !== 'custom') estado.granManual = false;
    delete estado._vs;
  }

  function granularidadeAtual() {
    if (estado.granManual) return estado.gran;
    const ini = estado.filtros.de || estado.datas.min;
    const fim = estado.filtros.ate || estado.datas.max;
    if (!ini || !fim) return 'dia';
    const dias = N.diasEntre(ini, fim) + 1;
    return dias <= 62 ? 'dia' : dias <= 200 ? 'semana' : 'mes';
  }

  function visitasFiltradas() {
    if (!estado._vs) estado._vs = M.filtrar(estado.cruzado.visitas, estado.filtros);
    return estado._vs;
  }

  const visitasSemPeriodo = () => M.filtrar(estado.cruzado.visitas, Object.assign({}, estado.filtros, { de: null, ate: null }));

  // ---------------------------------------------------------------- filtros

  function criarMulti(rotulo, chave) {
    const det = h('details', { class: 'multi' });
    const sum = h('summary');
    const painel = h('div', { class: 'painel-multi' });
    det.appendChild(sum);
    det.appendChild(painel);

    function atualizar() {
      const sel = estado.filtros[chave];
      const opcoes = estado.opcoes[chave];
      sum.textContent = rotulo + ': ' + (sel.size === 0 ? 'todos' : sel.size === 1 ? Array.from(sel)[0] : sel.size + ' selecionados');
      det.classList.toggle('ativo', sel.size > 0);
      painel.textContent = '';
      for (const o of opcoes) {
        const cb = h('input', { type: 'checkbox', checked: sel.has(o.valor) });
        cb.addEventListener('change', () => {
          if (cb.checked) sel.add(o.valor); else sel.delete(o.valor);
          delete estado._vs;
          atualizar();
          renderConteudo();
        });
        painel.appendChild(h('label', null, cb, h('span', { text: o.valor }), h('span', { class: 'n', text: fmt.int(o.n) })));
      }
      painel.appendChild(h('div', { class: 'rodape' },
        h('button', { class: 'btn mini fantasma', text: 'Limpar seleção', on: { click: () => { sel.clear(); delete estado._vs; atualizar(); renderConteudo(); } } })
      ));
    }
    atualizar();
    return { el: det, atualizar };
  }

  let multis = [];

  function montarFiltros() {
    const alvo = $('filtros-conteudo');
    alvo.textContent = '';
    const f = estado.filtros;
    const presets = [['1', 'Último dia'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Mês'], ['tudo', 'Tudo']];
    const seg = h('div', { class: 'segmentado', role: 'group', 'aria-label': 'Período' });
    const botoes = presets.map(([id, nome]) => h('button', { type: 'button', text: nome, attrs: { 'aria-pressed': String(f.preset === id) }, on: { click: () => { aplicarPreset(id); montarFiltros(); renderConteudo(); } } }));
    botoes.forEach((b) => seg.appendChild(b));

    const inDe = h('input', { type: 'date', value: f.de || '', min: estado.datas.min || '', max: estado.datas.max || '', attrs: { 'aria-label': 'Data inicial' } });
    const inAte = h('input', { type: 'date', value: f.ate || '', min: estado.datas.min || '', max: estado.datas.max || '', attrs: { 'aria-label': 'Data final' } });
    const mudouData = () => {
      f.de = inDe.value || null;
      f.ate = inAte.value || null;
      f.preset = 'custom';
      estado.granManual = false;
      delete estado._vs;
      botoes.forEach((b) => b.setAttribute('aria-pressed', 'false'));
      renderConteudo();
    };
    inDe.addEventListener('change', mudouData);
    inAte.addEventListener('change', mudouData);

    multis = [criarMulti('Projeto', 'projetos'), criarMulti('Equipe', 'recursos'), criarMulti('Cidade', 'cidades')];
    alvo.appendChild(h('div', { class: 'grupo-filtro' }, h('span', { class: 'rotulo-filtro', text: 'Visitas em' }), seg, inDe, h('span', { text: 'a' }), inAte));
    alvo.appendChild(h('div', { class: 'grupo-filtro' }, multis.map((m) => m.el)));
  }

  document.addEventListener('click', (e) => {
    document.querySelectorAll('details.multi[open]').forEach((d) => { if (!d.contains(e.target)) d.removeAttribute('open'); });
  });

  // ---------------------------------------------------------------- render

  function renderTudo() {
    const temDados = estado.cruzado && estado.cruzado.visitas.length > 0;
    $('vazio').hidden = temDados;
    $('app').hidden = !temDados;
    $('btn-exportar').hidden = !temDados;
    $('btn-limpar').hidden = !(temDados || estado.resultados.size);
    $('btn-adicionar').textContent = temDados ? 'Adicionar arquivos' : 'Escolher arquivos';
    if (!temDados) {
      $('sub-topo').textContent = estado.resultados.size ? 'Faltam as atividades (planilha de Atividades/Cadastral) para cruzar.' : 'Nenhum dado carregado';
      return;
    }
    const nr = estado.resultados.size;
    $('sub-topo').textContent = `${fmt.int(estado.atividades.size)} atividades · ${fmt.int(nr)} retornos · visitas de ${fmt.longa(estado.datas.min)} a ${fmt.longa(estado.datas.max)}` +
      (estado.cruzado.dataReferencia ? ` · último retorno em ${fmt.longa(estado.cruzado.dataReferencia)}` : '');
    renderConteudo();
  }

  function renderConteudo() {
    if (!estado.cruzado) return;
    renderResumo();
    renderAbas();
    renderPainel();
  }

  function renderResumo() {
    const vs = visitasFiltradas();
    const r = M.resumo(vs);
    const alvo = $('resumo');
    alvo.textContent = '';
    const num = (valor, rotulo, extra) => h('div', { class: 'num' }, h('div', { class: 'valor', text: valor }), h('div', { class: 'rotulo' }, rotulo, extra ? [' ', h('b', { text: extra })] : null));
    alvo.appendChild(h('div', { class: 'heroi' },
      h('div', { class: 'rotulo', text: 'Taxa de resultado' }),
      h('div', { class: 'valor', text: fmt.pct(r.taxaResultado) }),
      h('div', { class: 'sub', text: `${fmt.int(r.resultado)} de ${fmt.int(r.exec)} visitas executadas geraram resultado` })
    ));
    alvo.appendChild(h('div', { class: 'numeros' },
      num(fmt.int(r.total), 'atividades (alvos)', r.matriculas ? fmt.int(r.matriculas) + ' matrículas' : null),
      num(fmt.int(r.exec), 'executadas', fmt.pct(r.taxaExec) + ' das atividades'),
      num(fmt.int(r.oc), 'ocorrências', 'visita sem execução'),
      num(fmt.pct(r.taxaRetorno), 'com retorno do backoffice', fmt.int(r.comRetorno) + ' de ' + fmt.int(r.exec)),
      num(fmt.int(r.atualizacao), 'só atualização cadastral', r.exec ? fmt.pct(r.atualizacao / r.exec) : null),
      num(fmt.int(r.semRetorno), 'sem retorno ainda', r.maturando ? fmt.int(r.maturando) + ' em maturação' : null),
      num(fmt.sinal(r.deltaEcon), 'economias (líquido)', 'DE/PARA dos incrementos')
    ));
  }

  const ABAS = [['diario', 'Diário'], ['bases', 'Bases e equipes'], ['alvos', 'Novos alvos'], ['auditoria', 'Auditoria']];

  function renderAbas() {
    const alvo = $('abas');
    alvo.textContent = '';
    for (const [id, nome] of ABAS) {
      alvo.appendChild(h('button', {
        type: 'button', role: 'tab', text: nome, attrs: { 'aria-selected': String(estado.aba === id) },
        on: { click: () => { estado.aba = id; renderAbas(); renderPainel(); } },
      }));
    }
  }

  function renderPainel() {
    const alvo = $('painel');
    alvo.textContent = '';
    if (estado.aba === 'diario') renderDiario(alvo);
    else if (estado.aba === 'bases') renderBases(alvo);
    else if (estado.aba === 'alvos') renderAlvos(alvo);
    else renderAuditoria(alvo);
  }

  function segmentado(opcoes, atual, aoMudar, rotulo) {
    return h('div', { class: 'segmentado', role: 'group', 'aria-label': rotulo || null },
      opcoes.map(([id, nome]) => h('button', { type: 'button', text: nome, attrs: { 'aria-pressed': String(atual === id) }, on: { click: () => aoMudar(id) } })));
  }

  function ordemDe(id, padrao) {
    if (!estado.ordem[id]) estado.ordem[id] = Object.assign({}, padrao);
    return estado.ordem[id];
  }

  function exportarTabela(nome, colunas, linhas) {
    const cols = colunas.map((c) => {
      const fn = c.csv || c.valor;
      if (c.tipo === 'taxa') return { titulo: c.titulo + ' (%)', valor: (l) => { const v = fn(l); return v === null || v === undefined ? '' : Math.round(v * 1000) / 10; } };
      return { titulo: c.titulo, valor: fn };
    });
    CV.csv.baixar(nome, cols, linhas);
  }

  const etiquetaMat = () => h('span', { class: 'etiqueta mat', text: 'em maturação', title: 'Visitas dos últimos ' + R.diasMaturacao + ' dias: os retornos do backoffice ainda estão chegando.' });
  const etiquetaPeq = () => h('span', { class: 'etiqueta', text: 'amostra pequena', title: 'Menos de ' + R.minAmostra + ' visitas executadas: a taxa oscila muito.' });

  // ---- Diário

  function renderDiario(alvo) {
    const vs = visitasFiltradas();
    const gran = granularidadeAtual();
    const linhas = M.porPeriodo(vs, gran);
    const geral = M.resumo(vs);

    alvo.appendChild(h('div', { class: 'cabeca' },
      h('h2', { text: gran === 'dia' ? 'Evolução por dia' : gran === 'semana' ? 'Evolução por semana' : 'Evolução por mês' }),
      segmentado([['dia', 'Dia'], ['semana', 'Semana'], ['mes', 'Mês']], gran, (g) => { estado.gran = g; estado.granManual = true; renderPainel(); }, 'Agrupar por'),
      segmentado([['volume', 'Volume'], ['taxa', '% Resultado']], estado.modoGrafico, (m) => { estado.modoGrafico = m; renderPainel(); }, 'Medida'),
      h('span', { class: 'espaco' })
    ));

    if (estado.modoGrafico === 'volume') {
      alvo.appendChild(h('div', { class: 'legenda' },
        h('span', null, h('i', { style: { background: 'var(--serie-1)' } }), 'Executadas com resultado'),
        h('span', null, h('i', { style: { background: 'var(--serie-2)' } }), 'Demais executadas')
      ));
    }
    const area = h('div', { class: 'grafico' });
    alvo.appendChild(area);
    const desenhar = () => CV.ui.desenharGrafico(area, linhas, { modo: estado.modoGrafico, gran, mediaTaxa: geral.taxaResultado });
    requestAnimationFrame(desenhar);
    if (window.ResizeObserver) {
      let ultimo = 0;
      const ro = new ResizeObserver(() => {
        if (!area.isConnected) { ro.disconnect(); return; }
        const w = area.clientWidth;
        if (Math.abs(w - ultimo) > 4) { ultimo = w; desenhar(); }
      });
      ro.observe(area);
    }

    const rotulo = (l) => {
      if (gran === 'mes') return fmt.mes(l.chave + '-01');
      if (gran === 'semana') return fmt.curta(l.chave) + ' a ' + fmt.curta(N.somaDias(l.chave, 6));
      return N.diaDaSemana(l.chave) + ' ' + fmt.longa(l.chave);
    };
    const primeira = {
      id: 'periodo', titulo: gran === 'dia' ? 'Data da visita' : gran === 'semana' ? 'Semana (seg–dom)' : 'Mês', tipo: 'txt',
      valor: (l) => l.chave, ordena: (l) => l.chave,
      render: (l) => (l.ehTotal ? 'Total do período' : [rotulo(l), l.maturando > 0 ? etiquetaMat() : null]),
      csv: (l) => (gran === 'dia' ? fmt.longa(l.chave) : rotulo(l)),
    };
    const cols = CV.ui.colunasResumo(primeira, linhas.concat([geral]), geral);
    const tab = CV.ui.criarTabela({
      colunas: cols, linhas, total: Object.assign({ chave: 'Total do período', ehTotal: true }, geral),
      ordem: ordemDe('diario-' + gran, { id: 'periodo', dir: 'desc' }),
    });
    alvo.appendChild(tab);
    alvo.appendChild(h('p', { class: 'nota', text: 'As visitas são contadas pela data em que aconteceram; o resultado volta para a data da visita que o originou (cruzamento pela matrícula). Dias recentes ficam "em maturação" porque o backoffice leva em média 1 a 3 dias para lançar o retorno.' }));
    alvo.appendChild(h('div', { class: 'cabeca' }, h('span', { class: 'espaco' }),
      h('button', { class: 'btn mini', text: 'Exportar esta tabela (CSV)', on: { click: () => exportarTabela('acompanhamento-' + gran + '.csv', cols, linhas) } })));
  }

  // ---- Bases e equipes

  function renderBases(alvo) {
    const vs = visitasFiltradas();
    const geral = M.resumo(vs);
    alvo.appendChild(h('div', { class: 'cabeca' },
      h('h2', { text: 'Efetividade' }),
      segmentado([['projetos', 'Bases (projetos)'], ['equipes', 'Equipes'], ['matriz', 'Equipe × base']], estado.subBases, (s) => { estado.subBases = s; renderPainel(); }),
      h('span', { class: 'espaco' })
    ));

    if (estado.subBases === 'matriz') return renderMatriz(alvo, vs);

    const porEquipe = estado.subBases === 'equipes';
    const linhas = M.agruparPor(vs, porEquipe ? (v) => v.recurso : (v) => v.projeto);
    const primeira = {
      id: 'nome', titulo: porEquipe ? 'Equipe (recurso)' : 'Base (projeto)', tipo: 'txt', valor: (l) => l.chave,
      render: (l) => (l.ehTotal ? 'Total' : [l.chave,
        porEquipe && estado.tipoRecurso.get(l.chave) ? h('span', { class: 'etiqueta', text: estado.tipoRecurso.get(l.chave) }) : null,
        l.exec > 0 && l.exec < R.minAmostra ? etiquetaPeq() : null]),
      csv: (l) => l.chave,
    };
    const cols = CV.ui.colunasResumo(primeira, linhas, geral, { indice: true });
    alvo.appendChild(CV.ui.criarTabela({
      colunas: cols, linhas, total: Object.assign({ chave: 'Total', ehTotal: true }, geral),
      ordem: ordemDe('bases-' + estado.subBases, { id: 'exec', dir: 'desc' }),
      classeLinha: (l) => (l.exec < R.minAmostra ? 'pequena' : ''),
    }));
    alvo.appendChild(h('p', { class: 'nota', text: 'Índice compara a taxa de resultado da linha com a média do recorte (▲ ≥ 1,25× e ▼ ≤ 0,6×); só é calculado com ' + R.minAmostra + '+ visitas executadas. As colunas de desfecho não somam o total: uma visita pode ter mais de um desfecho (ex.: titularidade + débitos).' }));
    alvo.appendChild(h('div', { class: 'cabeca' }, h('span', { class: 'espaco' }),
      h('button', { class: 'btn mini', text: 'Exportar esta tabela (CSV)', on: { click: () => exportarTabela(porEquipe ? 'efetividade-equipes.csv' : 'efetividade-bases.csv', cols, linhas) } })));
  }

  function renderMatriz(alvo, vs) {
    const exec = vs.filter((v) => v.grupoStatus === 'exec');
    const cnt = (chave) => {
      const m = new Map();
      for (const v of exec) m.set(v[chave], (m.get(v[chave]) || 0) + 1);
      return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    };
    const projetos = cnt('projeto').slice(0, 10);
    const recursos = cnt('recurso');
    const matriz = M.matriz(vs, projetos, recursos);
    const MIN = 5;
    let maxTaxa = 0;
    for (const l of matriz) for (const c of l.celulas) if (c.exec >= MIN && c.taxa > maxTaxa) maxTaxa = c.taxa;
    const classe = (c) => {
      if (c.exec < MIN || !maxTaxa) return 'm0';
      const q = c.taxa / maxTaxa;
      return q > 0.8 ? 'm5' : q > 0.6 ? 'm4' : q > 0.4 ? 'm3' : q > 0.2 ? 'm2' : 'm1';
    };
    const tabela = h('table', { class: 'tab matriz' },
      h('thead', null, h('tr', null, h('th', { class: 'txt sem-ordem', text: 'Equipe' }), projetos.map((p) => h('th', { class: 'sem-ordem', title: p, text: p })))),
      h('tbody', null, matriz.map((l) => h('tr', null,
        h('td', { class: 'txt', text: l.recurso }),
        l.celulas.map((c) => h('td', { class: 'cel ' + classe(c), title: c.exec ? `${l.recurso} · ${c.projeto}: ${c.resultado} de ${c.exec} (${fmt.pct(c.taxa)})` : 'sem visitas executadas' },
          c.exec ? [fmt.pct(c.taxa), h('small', { text: c.resultado + '/' + c.exec })] : '·')))))
    );
    alvo.appendChild(h('div', { class: 'tabela-wrap' }, tabela));
    alvo.appendChild(h('div', { class: 'legenda', style: { marginTop: '10px' } },
      ['m1', 'm2', 'm3', 'm4', 'm5'].map((c, i) => h('span', null, h('i', { class: c, style: { width: '18px' } }), ['menor', '', '', '', 'maior taxa'][i])),
      h('span', { text: 'Cada célula: % de resultado e resultados/executadas. Sem cor: menos de ' + MIN + ' executadas.' })
    ));
    alvo.appendChild(h('p', { class: 'nota', text: 'Mostra as 10 bases com mais visitas executadas no recorte. Use para ver se a diferença entre equipes vem da equipe ou da base que ela recebeu.' }));
  }

  // ---- Novos alvos

  const colTxt = (id, titulo, fn, extra) => Object.assign({ id, titulo, tipo: 'txt', valor: fn }, extra || {});
  const colNum = (id, titulo, fn, extra) => Object.assign({ id, titulo, tipo: 'num', valor: fn }, extra || {});

  function renderAlvos(alvo) {
    const base = visitasSemPeriodo();
    const vs = visitasFiltradas();
    const modelo = estado.modelo;
    const revisitar = M.alvosOcorrencia(base, modelo, 'revisitar');
    const endereco = M.alvosOcorrencia(base, modelo, 'corrigir_endereco');
    const semRetorno = M.alvosSemRetorno(base, estado.cruzado.dataReferencia);
    const esgotados = M.alvosEsgotados(base);

    const itens = [
      ['revisitar', 'Revisitar (' + fmt.int(revisitar.length) + ')'],
      ['endereco', 'Corrigir endereço (' + fmt.int(endereco.length) + ')'],
      ['retorno', 'Cobrar retorno (' + fmt.int(semRetorno.length) + ')'],
      ['esgotados', 'Parar de insistir (' + fmt.int(esgotados.length) + ')'],
      ['onde', 'Onde atuar'],
    ];
    alvo.appendChild(h('div', { class: 'cabeca' },
      h('h2', { text: 'Para onde direcionar a próxima ação' }),
      segmentado(itens, estado.subAlvos, (s) => { estado.subAlvos = s; renderPainel(); }),
      h('span', { class: 'espaco' })
    ));

    const tabelaLista = (descricao, nomeCsv, cols, linhas, ordemId) => {
      alvo.appendChild(h('p', { class: 'nota', style: { margin: '0 0 10px' }, text: descricao }));
      alvo.appendChild(CV.ui.criarTabela({ colunas: cols, linhas, ordem: ordemDe(ordemId, { id: null, dir: 'desc' }), maxLinhas: 300, vazio: 'Nenhum alvo nesta lista com os filtros atuais.' }));
      alvo.appendChild(h('div', { class: 'cabeca', style: { marginTop: '10px' } },
        h('span', { class: 'nota', style: { margin: 0 }, text: linhas.length > 300 ? 'Mostrando 300 de ' + fmt.int(linhas.length) + ' — exporte para ver todos.' : fmt.int(linhas.length) + ' alvo(s).' }),
        h('span', { class: 'espaco' }),
        h('button', { class: 'btn mini primario', text: 'Exportar lista (CSV)', disabled: !linhas.length, on: { click: () => exportarTabela(nomeCsv, cols, linhas) } })));
    };

    const colsLocal = [
      colTxt('mat', 'Matrícula', (l) => l.mat),
      colTxt('proj', 'Projeto', (l) => l.projeto),
      colTxt('rec', 'Equipe', (l) => l.recurso),
      colTxt('cid', 'Cidade', (l) => l.cidade || ''),
      colTxt('bai', 'Bairro', (l) => l.bairro || ''),
    ];
    const colEndereco = colTxt('end', 'Endereço', (l) => l.endereco || '');

    if (estado.subAlvos === 'revisitar') {
      tabelaLista(
        `Matrículas cuja última visita terminou com motivo recuperável (${Object.keys(R.motivos).filter((k) => R.motivos[k] === 'revisitar').map((k) => k.toLowerCase()).join(', ')}) e que não tiveram visita executada depois. Ordenadas pela chance estimada de resultado (taxa histórica do projeto × nº de economias). Alvos com ${R.limiteTentativas}+ tentativas vão para o fim da lista: escalar em vez de revisitar. Esta lista usa todo o histórico (ignora o filtro de período).`,
        'alvos-revisitar.csv',
        colsLocal.concat([
          colTxt('data', 'Última visita', (l) => l.ultimaVisita, { render: (l) => fmt.longa(l.ultimaVisita), csv: (l) => fmt.longa(l.ultimaVisita) }),
          colTxt('mot', 'Motivo', (l) => l.motivo || ''),
          colNum('tent', 'Tentativas', (l) => l.tentativas, { render: (l) => [String(l.tentativas), l.escalar ? h('span', { class: 'etiqueta crit', text: 'escalar' }) : null], csv: (l) => l.tentativas }),
          colTxt('eco', 'Nº economias', (l) => l.qtdEcon),
          { id: 'ch', titulo: 'Chance estimada', tipo: 'taxa', valor: (l) => l.chance, csv: (l) => l.chance, dica: 'Taxa histórica de resultado do segmento: ' + R.minAmostraRanking + '+ visitas do mesmo projeto e nº de economias (ou o segmento mais próximo com amostra)' },
          colTxt('base', 'Base da estimativa', (l) => l.baseChance, { sem_ordem: true }),
          colEndereco,
        ]),
        revisitar, 'alvos-revisitar');
    } else if (estado.subAlvos === 'endereco') {
      tabelaLista(
        'Última visita terminou em "endereço não localizado" / "ramal ou rede não localizado" e não houve visita executada depois. A ação é do backoffice: confirmar ou corrigir o endereço/coordenada antes de reagendar.',
        'alvos-corrigir-endereco.csv',
        colsLocal.concat([
          colTxt('data', 'Última visita', (l) => l.ultimaVisita, { render: (l) => fmt.longa(l.ultimaVisita), csv: (l) => fmt.longa(l.ultimaVisita) }),
          colTxt('mot', 'Motivo', (l) => l.motivo || ''),
          colNum('tent', 'Tentativas', (l) => l.tentativas),
          colEndereco,
        ]),
        endereco, 'alvos-endereco');
    } else if (estado.subAlvos === 'retorno') {
      tabelaLista(
        `Visitas executadas há mais de ${R.diasSemRetorno} dias (contados até o último retorno carregado, ${fmt.longa(estado.cruzado.dataReferencia)}) sem nenhum lançamento na planilha de Resultados. Ou o backoffice ainda não tratou, ou o lançamento foi feito com outra matrícula. Mais antigas primeiro.`,
        'pendentes-de-retorno.csv',
        [
          colTxt('mat', 'Matrícula', (l) => l.mat || '(inválida)'),
          colTxt('prot', 'Protocolo', (l) => l.protocolo || ''),
          colTxt('proj', 'Projeto', (l) => l.projeto),
          colTxt('rec', 'Equipe', (l) => l.recurso),
          colTxt('cid', 'Cidade', (l) => l.cidade || ''),
          colTxt('bai', 'Bairro', (l) => l.bairro || ''),
          colTxt('data', 'Visita', (l) => l.data, { render: (l) => fmt.longa(l.data), csv: (l) => fmt.longa(l.data) }),
          colNum('dias', 'Dias sem retorno', (l) => l.dias),
        ],
        semRetorno, 'alvos-retorno');
    } else if (estado.subAlvos === 'esgotados') {
      tabelaLista(
        'Matrículas com 2 ou mais visitas executadas em que todos os retornos foram "sem tratativa". Nova visita tende a repetir o resultado: retirar das próximas bases ou tratar de outra forma (ex.: contato telefônico).',
        'alvos-esgotados.csv',
        colsLocal.concat([
          colNum('vis', 'Visitas', (l) => l.visitas),
          colTxt('pri', 'Primeira', (l) => l.primeiraVisita, { render: (l) => fmt.longa(l.primeiraVisita), csv: (l) => fmt.longa(l.primeiraVisita) }),
          colTxt('ult', 'Última', (l) => l.ultimaVisita, { render: (l) => fmt.longa(l.ultimaVisita), csv: (l) => fmt.longa(l.ultimaVisita) }),
          colEndereco,
        ]),
        esgotados, 'alvos-esgotados');
    } else {
      renderOndeAtuar(alvo, vs);
    }
  }

  const DIMENSOES = {
    cidade: ['Cidade', (v) => v.cidade || '(sem cidade)'],
    bairro: ['Bairro', (v) => (v.cidade || '(sem cidade)') + ' · ' + (v.bairro || '(sem bairro)')],
    setor: ['Setor', (v) => v.setor || '(sem setor)'],
    eco: ['Nº de economias', (v) => v.qtdEconRotulo],
    cat: ['Categoria', (v) => v.categoria || '(sem categoria)'],
    sit: ['Situação do imóvel', (v) => v.situacao || '(não informada)'],
    proj_eco: ['Projeto × nº de economias', (v) => v.projeto + ' · ' + v.qtdEconRotulo],
  };

  function renderOndeAtuar(alvo, vs) {
    const [nomeDim, fn] = DIMENSOES[estado.dimTerr];
    const t = M.territorios(vs, fn);
    alvo.appendChild(h('div', { class: 'cabeca', style: { marginTop: '-4px' } },
      h('span', { class: 'rotulo-filtro', text: 'Agrupar por' }),
      segmentado(Object.entries(DIMENSOES).map(([id, [nome]]) => [id, nome]), estado.dimTerr, (d) => { estado.dimTerr = d; renderPainel(); }),
      h('span', { class: 'espaco' })
    ));
    alvo.appendChild(h('p', { class: 'nota', style: { margin: '0 0 10px' }, text: `Onde a taxa de resultado é maior ou menor que a média do recorte (${fmt.pct(t.geral.taxaResultado)}). Só entram grupos com ${R.minAmostraRanking}+ visitas executadas. "Priorizar": gerar mais alvos com esse perfil/território. "Rever": a base está rendendo bem abaixo da média.` }));
    const leitura = (l) => (l.indice >= 1.3 ? 'alta' : l.indice <= 0.5 ? 'baixa' : '');
    const cols = [
      colTxt('dim', nomeDim, (l) => l.chave),
      colNum('exec', 'Executadas', (l) => l.exec),
      colNum('res', 'Resultado', (l) => l.resultado),
      { id: 'taxa', titulo: '% Resultado', tipo: 'taxa', valor: (l) => l.taxaResultado, csv: (l) => l.taxaResultado },
      colNum('ind', 'Índice', (l) => l.indice, { render: (l) => fmt.ind(l.indice), csv: (l) => l.indice }),
      colNum('de', 'Δ economias', (l) => l.deltaEcon, { render: (l) => fmt.sinal(l.deltaEcon) }),
      colTxt('lei', 'Leitura', (l) => leitura(l), {
        render: (l) => (leitura(l) === 'alta' ? h('span', { class: 'etiqueta alta', text: '▲ priorizar' }) : leitura(l) === 'baixa' ? h('span', { class: 'etiqueta baixa', text: '▼ rever' }) : ''),
        csv: (l) => (leitura(l) === 'alta' ? 'priorizar' : leitura(l) === 'baixa' ? 'rever' : ''),
      }),
    ];
    alvo.appendChild(CV.ui.criarTabela({ colunas: cols, linhas: t.linhas, ordem: ordemDe('onde-' + estado.dimTerr, { id: 'taxa', dir: 'desc' }), maxLinhas: 300, vazio: 'Nenhum grupo atinge a amostra mínima neste recorte.' }));
    alvo.appendChild(h('div', { class: 'cabeca', style: { marginTop: '10px' } }, h('span', { class: 'espaco' }),
      h('button', { class: 'btn mini primario', text: 'Exportar (CSV)', disabled: !t.linhas.length, on: { click: () => exportarTabela('onde-atuar-' + estado.dimTerr + '.csv', cols, t.linhas) } })));
  }

  // ---- Auditoria

  function renderAuditoria(alvo) {
    const c = estado.cruzado;
    const a = c.auditoria;
    const at = estado.atividades.size;
    const kv = (pares) => h('div', { class: 'kv' }, pares.map(([k, v]) => [h('div', { text: k }), h('div', { text: v })]));

    alvo.appendChild(h('div', { class: 'cabeca' }, h('h2', { text: 'Ajustes do cruzamento' })));
    const inJan = h('input', { class: 'campo-num', type: 'number', min: '1', max: '365', value: String(estado.janela), attrs: { 'aria-label': 'Janela em dias' } });
    inJan.addEventListener('change', () => {
      const v = Math.max(1, Math.min(365, Math.round(Number(inJan.value) || R.janelaDias)));
      estado.janela = v;
      recalcular();
      renderConteudo();
    });
    const ajustes = h('div', { class: 'ajustes' },
      h('label', null, 'Janela de atribuição (dias):', inJan));
    if (estado.frentes.length > 1) {
      ajustes.appendChild(h('span', { text: 'Frentes de serviço consideradas:' }));
      for (const f of estado.frentes) {
        const cb = h('input', { type: 'checkbox', checked: !estado.frentesAtivas || estado.frentesAtivas.has(f) });
        cb.addEventListener('change', () => {
          const atuais = new Set(estado.frentesAtivas || estado.frentes);
          if (cb.checked) atuais.add(f); else atuais.delete(f);
          estado.frentesAtivas = atuais.size === estado.frentes.length || atuais.size === 0 ? null : atuais;
          recalcular();
          renderConteudo();
        });
        ajustes.appendChild(h('label', null, cb, f));
      }
    }
    alvo.appendChild(ajustes);
    alvo.appendChild(h('p', { class: 'nota', style: { margin: '0 0 8px' }, text: 'Um retorno do backoffice é ligado à visita mais recente da mesma matrícula feita até ' + estado.janela + ' dias antes dele. Se mudar a janela ou as frentes, todos os números são recalculados.' }));

    alvo.appendChild(h('h3', { text: 'Atividades (alvos)' }));
    const proj = c.projetos;
    alvo.appendChild(kv([
      ['Atividades carregadas', fmt.int(at)],
      ['Sem matrícula válida (não cruzam)', fmt.int(a.visitasSemMatricula)],
      ['Projeto reconhecido pelas regras', fmt.int(proj.porOrigem.regra)],
      ['Projeto unido por semelhança de escrita', fmt.int(proj.porOrigem.similar)],
      ['Projeto novo (sem regra cadastrada)', fmt.int(proj.porOrigem.novo)],
      ['Sem projeto identificável', fmt.int(proj.porOrigem.sem)],
    ]));
    if (proj.naoReconhecidos.size) {
      alvo.appendChild(h('p', { class: 'nota', text: 'Textos de abertura sem projeto (os mais frequentes). Se algum for uma base de verdade, cadastre o nome em js/regras.js:' }));
      const top = Array.from(proj.naoReconhecidos.entries()).sort((x, y) => y[1] - x[1]).slice(0, 8);
      alvo.appendChild(h('ul', { class: 'lista-simples' }, top.map(([t, n]) => h('li', null, h('code', { text: t }), ' — ' + fmt.int(n)))));
    }
    const novos = proj.novos.filter((n) => !R.projetos.some((p) => p[1] === n));
    if (novos.length) alvo.appendChild(h('p', { class: 'nota', text: 'Projetos novos detectados (ainda sem regra): ' + novos.join(', ') + '.' }));

    alvo.appendChild(h('h3', { text: 'Retornos do backoffice (planilha de Resultados)' }));
    alvo.appendChild(kv([
      ['Retornos carregados', fmt.int(a.retornosTotal)],
      ['Atribuídos a uma visita', fmt.int(a.atribuidos)],
      ['Matrícula fora das bases visitadas', fmt.int(a.foraDasBases)],
      ['Anteriores à primeira visita da matrícula', fmt.int(a.anteriorVisita)],
      ['Depois da janela de ' + estado.janela + ' dias', fmt.int(a.foraJanela)],
      ['Matrícula inválida (não é 9 dígitos)', fmt.int(a.matriculaInvalida)],
      ['Resgatados pelo número do protocolo', fmt.int(a.resgatadosProtocolo)],
      ['Frente de serviço desconsiderada', fmt.int(a.frenteIgnorada)],
    ]));
    alvo.appendChild(h('p', { class: 'nota', text: 'Os retornos "fora das bases" são trabalho do backoffice sobre matrículas que não vieram destas bases de visita (demanda interna, outras regiões); por isso não entram na efetividade.' }));

    alvo.appendChild(h('h3', { text: 'Arquivos carregados' }));
    if (estado.arquivos.length) {
      alvo.appendChild(CV.ui.criarTabela({
        colunas: [
          colTxt('nome', 'Arquivo', (l) => l.nome),
          colTxt('tipo', 'Tipo', (l) => (l.tipo === 'atividades' ? 'Atividades' : 'Resultados')),
          colNum('lin', 'Linhas válidas', (l) => l.validas),
          colNum('nov', 'Novas', (l) => l.novos),
          colNum('atu', 'Atualizadas', (l) => l.atualizados),
          colNum('rep', 'Repetidas', (l) => l.repetidas || 0),
          colTxt('qdo', 'Carregado em', (l) => l.quando, { render: (l) => new Date(l.quando).toLocaleString('pt-BR') }),
        ],
        linhas: estado.arquivos, ordem: { id: 'qdo', dir: 'desc' },
      }));
    }
    alvo.appendChild(h('div', { class: 'cabeca', style: { marginTop: '16px' } }, h('span', { class: 'espaco' }),
      h('button', { class: 'btn mini', text: 'Baixar cruzamento completo (CSV, com os filtros atuais)', on: { click: exportarCruzamento } })));
  }

  function exportarCruzamento() {
    const vs = visitasFiltradas();
    const nomeClasse = (id) => (R.classes.find((c) => c.id === id) || { curto: id }).curto;
    const cols = [
      { titulo: 'Data da visita', valor: (v) => fmt.longa(v.data) },
      { titulo: 'Matrícula', valor: (v) => v.mat || '' },
      { titulo: 'ID da atividade', valor: (v) => v.id },
      { titulo: 'Protocolo', valor: (v) => v.protocolo || '' },
      { titulo: 'Equipe', valor: (v) => v.recurso },
      { titulo: 'Projeto', valor: (v) => v.projeto },
      { titulo: 'Status', valor: (v) => v.status || '' },
      { titulo: 'Motivo de não execução', valor: (v) => v.motivo || '' },
      { titulo: 'Cidade', valor: (v) => v.cidade || '' },
      { titulo: 'Bairro', valor: (v) => v.bairro || '' },
      { titulo: 'Setor', valor: (v) => v.setor || '' },
      { titulo: 'Categoria', valor: (v) => v.categoria || '' },
      { titulo: 'Nº de economias', valor: (v) => v.qtdEconRotulo },
      { titulo: 'Retornos', valor: (v) => v.nRetornos },
      { titulo: 'Grupo do retorno', valor: (v) => ({ resultado: 'Resultado', atualizacao: 'Atualização', sem: 'Sem tratativa' }[v.grupoRetorno] || (v.grupoStatus === 'exec' ? 'Sem retorno' : '')) },
      { titulo: 'Desfechos', valor: (v) => v.tags.map(nomeClasse).join(' + ') },
      { titulo: 'Δ economias', valor: (v) => v.deltaEcon || 0 },
      { titulo: 'Primeiro retorno', valor: (v) => fmt.longa(v.primeiroRetorno) },
      { titulo: 'Dias até o retorno', valor: (v) => (v.primeiroRetorno ? N.diasEntre(v.data, v.primeiroRetorno) : '') },
    ];
    CV.csv.baixar('cruzamento-visitas-retornos.csv', cols, vs);
  }

  // ---------------------------------------------------------------- inicialização

  function ligarEntrada() {
    const input = $('arquivo');
    input.addEventListener('change', () => { receberArquivos(input.files); input.value = ''; });
    $('btn-adicionar').addEventListener('click', () => input.click());
    $('btn-escolher').addEventListener('click', () => input.click());
    $('btn-exportar').addEventListener('click', exportarCruzamento);
    $('btn-limpar').addEventListener('click', limparTudo);
    let nivel = 0;
    const caixa = $('caixa');
    window.addEventListener('dragenter', (e) => { e.preventDefault(); nivel++; caixa.classList.add('sobre'); });
    window.addEventListener('dragleave', () => { nivel = Math.max(0, nivel - 1); if (!nivel) caixa.classList.remove('sobre'); });
    window.addEventListener('dragover', (e) => e.preventDefault());
    window.addEventListener('drop', (e) => {
      e.preventDefault();
      nivel = 0;
      caixa.classList.remove('sobre');
      if (e.dataTransfer && e.dataTransfer.files.length) receberArquivos(e.dataTransfer.files);
    });
  }

  async function iniciar() {
    ligarEntrada();
    if (typeof DecompressionStream === 'undefined') {
      mensagem('erro', 'Este navegador é antigo demais para ler planilhas (falta DecompressionStream). Use uma versão recente do Chrome, Edge, Firefox ou Safari.');
    }
    await restaurar();
    if (estado.atividades.size) {
      recalcular();
      aplicarPreset(estado.filtros.preset);
      estado.jaTinhaDados = true;
      montarFiltros();
    }
    renderTudo();
    window.CV_estado = estado; // útil para depuração no console
  }

  iniciar();
})();
