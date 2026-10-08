/*
 * app.js — controlador da interface: carga de arquivos, estado, filtros e abas
 * (Visão geral · Tempos das equipes · Novos alvos · Auditoria).
 */
(function () {
  'use strict';
  const CV = window.CV;
  const R = CV.regras;
  const N = CV.normalize;
  const M = CV.metricas;
  const { h, fmt } = CV.ui;
  const $ = (id) => document.getElementById(id);

  // Muda quando a leitura das planilhas passa a guardar mais coisas (ex.: horários): os dados
  // antigos do navegador são descartados e relidos da pasta.
  const VERSAO_DADOS = 2;

  const chaveEquipe = (r) => N.chave(r).replace(/ /g, '');

  const estado = {
    atividades: new Map(),
    resultados: new Map(),
    arquivos: [],
    frentes: [],
    frentesAtivas: null, // null = todas
    janela: R.janelaDias,
    cruzado: null, // cruzamento de TODAS as visitas (serve para ligar os retornos)
    visitas: [], // só as do escopo (equipes e cidades da operação)
    descartadas: [], // visitas de fora do escopo (para a auditoria)
    agenda: [], // atividades com horário das equipes do escopo (tempos)
    modelo: null,
    totalPercorrido: 0,
    datas: { min: null, max: null },
    opcoes: { cidades: [], equipes: [], bases: [] },
    filtros: { preset: '30', de: null, ate: null, cidade: null, equipe: null, base: null, semAvulsas: false },
    refs: {},
    gran: 'dia',
    granManual: false,
    modoTempos: 'media',
    soCompletos: true, // tempos: só dias com refeição/apoio registrados
    aba: 'visao',
    subAlvos: 'revisitar',
    dimTerr: 'cidade',
    ordem: {},
    abertas: new Set(), // equipes com o "+" aberto
    atualizadoEm: null,
    persistente: true,
    pasta: null, // { handle, nome, ultima } — pasta lembrada (só Chrome/Edge)
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

  const assinaturasLidas = () => new Set(estado.arquivos.map((a) => a.assinatura).filter(Boolean));

  /**
   * Ponto único de entrada: arquivos soltos, pasta escolhida, pasta arrastada.
   * `lista`: Files ou itens { file, caminho }. `opc.pasta`: modo pasta (lê só o que é novo
   * ou mudou, reconhece Atividades/Resultados sozinho e resume tudo numa mensagem).
   */
  async function receberArquivos(lista, opc) {
    const o = opc || {};
    const itens = Array.from(lista).map((x) => (x && x.file ? x : { file: x, caminho: x.webkitRelativePath || x.name }));
    await processarItens(itens, o);
  }

  async function processarItens(itens, o) {
    const P = CV.pasta;
    const pasta = !!o.pasta;
    const nomePasta = o.nomePasta || 'selecionada';
    const falhas = (o.errosListagem || []).map((e) => ({ caminho: e.caminho, msg: e.erro && e.erro.message ? e.erro.message : 'não consegui abrir' }));
    let fila;
    let plano = { planilhas: 0, pulados: 0, outros: 0 };

    if (pasta) {
      plano = P.planejar(itens, assinaturasLidas());
      fila = plano.processar;
    } else {
      fila = itens.filter((i) => P.ehPlanilha(i.caminho) || /spreadsheetml/.test(i.file.type || ''));
      const ign = itens.length - fila.length;
      if (ign > 0) mensagem('aviso', ign + ' arquivo(s) ignorado(s): só aceito planilhas .xlsx do Excel.');
    }

    if (!fila.length) {
      if (!pasta) return;
      if (!plano.planilhas && !falhas.length) mensagem('aviso', 'Não encontrei planilhas .xlsx na pasta “' + nomePasta + '” (procurei também nas subpastas).');
      else if (plano.planilhas && !o.silencioso) mensagem('ok', 'Pasta “' + nomePasta + '”: nada novo desde a última leitura (' + plano.planilhas + ' planilha(s) já carregada(s)).');
      if (falhas.length) mensagem('erro', textoFalhas(falhas));
      return;
    }

    const ov = sobreposicao('Lendo arquivos…');
    const cont = { atividades: 0, resultados: 0, ignorados: [], avisos: new Set() };
    let mudou = false;
    try {
      for (let i = 0; i < fila.length; i++) {
        const it = fila[i];
        const prefixo = fila.length > 1 ? 'Lendo ' + (i + 1) + ' de ' + fila.length + ': ' : 'Lendo ';
        ov.texto(prefixo + it.file.name + '…');
        await pausa();
        try {
          const r = await carregarArquivo(it, ov, pasta);
          if (r.status === 'ok') { mudou = true; cont[r.tipo]++; r.avisos.forEach((a) => cont.avisos.add(a)); }
          else if (r.status === 'ignorado') cont.ignorados.push(it.caminho);
        } catch (e) {
          console.error(e);
          falhas.push({ caminho: it.caminho, msg: e && e.message ? e.message : 'não consegui ler este arquivo.' });
        }
      }
      if (mudou) {
        ov.texto('Cruzando matrículas…');
        await pausa();
        recalcular();
        renderTudo();
      }
    } finally {
      ov.fechar();
    }

    if (pasta) {
      const partes = [];
      if (cont.atividades) partes.push(cont.atividades + ' de Atividades');
      if (cont.resultados) partes.push(cont.resultados + ' de Resultados');
      let t = 'Pasta “' + nomePasta + '”: ' + plano.planilhas + ' planilha(s) .xlsx encontrada(s)';
      t += partes.length ? ' — lidas ' + partes.join(' e ') : ' — nenhuma é de Atividades ou Resultados';
      if (plano.pulados) t += '; ' + plano.pulados + ' já lida(s) antes (puladas)';
      if (cont.ignorados.length) t += '; ' + cont.ignorados.length + ' não é/são Atividades nem Resultados (ignorada(s): ' + cont.ignorados.slice(0, 3).map((c) => c.split('/').pop()).join(', ') + (cont.ignorados.length > 3 ? '…' : '') + ')';
      mensagem(partes.length ? 'ok' : 'aviso', t + '.');
    }
    for (const a of cont.avisos) mensagem('aviso', a);
    if (falhas.length) mensagem('erro', textoFalhas(falhas));
  }

  function textoFalhas(falhas) {
    const lista = falhas.slice(0, 3).map((f) => f.caminho.split('/').pop() + ' (' + f.msg + ')').join('; ');
    return 'Não consegui ler ' + falhas.length + ' arquivo(s): ' + lista + (falhas.length > 3 ? '…' : '') +
      '. Se estão só na nuvem do OneDrive, clique com o botão direito na pasta → “Sempre manter neste dispositivo” e tente de novo; se estiverem abertos no Excel, feche-os.';
  }

  /** Lê um arquivo. Devolve { status: 'ok'|'ignorado', tipo?, avisos[] }; erros viram exceção. */
  async function carregarArquivo(item, ov, emPasta) {
    const f = item.file;
    const nome = emPasta ? item.caminho : f.name;
    const assinatura = CV.pasta.assinatura(item);
    const buf = await f.arrayBuffer();
    const cab = await CV.xlsx.lerPlanilha(buf, { soCabecalho: true });
    const tipo = CV.dados.detectarTipo(cab.cabecalho);
    if (!tipo) {
      if (!emPasta) {
        throw new Error('não reconheci o formato. Esperava a planilha de Atividades (com "ID da Atividade", "Matrícula", "Status da Atividade") ou a de Resultados (com "MATRICULA S/ DIGITO", "Hora de início").');
      }
      // numa pasta pode haver outras planilhas: anota para não reabrir toda vez
      const info = { nome, tipo: 'ignorado', assinatura, quando: new Date().toISOString() };
      estado.arquivos.push(info);
      await persistirInfo(info);
      return { status: 'ignorado', avisos: [] };
    }
    const campos = tipo === 'atividades' ? CV.dados.CAMPOS_ATIVIDADES : CV.dados.CAMPOS_RESULTADOS;
    const obrig = tipo === 'atividades' ? CV.dados.OBRIGATORIOS_ATIVIDADES : CV.dados.OBRIGATORIOS_RESULTADOS;
    const dados = await CV.xlsx.lerPlanilha(buf, {
      colunas: campos,
      aoProgresso: (n) => ov.texto('Lendo ' + f.name + ' — ' + fmt.int(n) + ' linhas…'),
    });
    const faltam = obrig.filter((c) => dados.faltando.includes(c));
    if (faltam.length) throw new Error('não encontrei a(s) coluna(s) ' + faltam.map((c) => '"' + campos[c][0] + '"').join(', '));

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
    const info = { nome, tipo, assinatura, linhas: dados.linhas.length, validas: limp.limpas.length, novos, atualizados, repetidas, quando: new Date().toISOString(), descartes: limp.descartes };
    estado.arquivos.push(info);
    await persistir(tipo === 'atividades' ? 'atividades' : 'resultados', limp.limpas, info);

    const avisos = [];
    const novosCampos = dados.faltando.filter((c) => !obrig.includes(c));
    if (novosCampos.length) avisos.push(f.name + ': colunas opcionais ausentes (' + novosCampos.map((c) => campos[c][0]).join(', ') + ') — as análises que dependem delas ficam em branco.');
    if (!emPasta) {
      const partes = [fmt.int(limp.limpas.length) + ' ' + (tipo === 'atividades' ? 'atividades' : 'retornos') + ' (' + fmt.int(novos) + ' novos, ' + fmt.int(atualizados) + ' já carregados antes e atualizados)'];
      if (repetidas) partes.push(fmt.int(repetidas) + ' linha(s) repetida(s) no arquivo (mesmo ID) contadas uma vez só');
      if (tipo === 'atividades') {
        if (limp.descartes.outrosServicos) partes.push(fmt.int(limp.descartes.outrosServicos) + ' de outras equipes e de outros serviços ignoradas');
        if (limp.descartes.semData) partes.push(fmt.int(limp.descartes.semData) + ' sem data válida descartadas');
      }
      mensagem('ok', f.name + ': ' + partes.join(' · ') + '.');
    }
    return { status: 'ok', tipo, avisos };
  }

  async function persistirInfo(info) {
    if (!estado.persistente) return;
    try { await CV.store.salvar('arquivos', [info]); } catch (e) { estado.persistente = false; }
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
      const versao = await CV.store.lerConfig('versaoDados');
      const tinha = salvo.atividades.length || salvo.resultados.length;
      if (tinha && !(versao && versao.v >= VERSAO_DADOS)) {
        // dados guardados por uma versão antiga: sem horários e sem as atividades de apoio
        await CV.store.limpar();
        estado.precisaRelerPasta = true;
      } else {
        for (const a of salvo.atividades) estado.atividades.set(a.id, a);
        for (const r of salvo.resultados) estado.resultados.set(r.id, r);
        estado.arquivos = (salvo.arquivos || []).sort((a, b) => (a.quando < b.quando ? -1 : 1));
      }
      if (!versao || versao.v !== VERSAO_DADOS) await CV.store.salvarConfig('versaoDados', { v: VERSAO_DADOS });
      const cfg = await CV.store.lerConfig('pasta');
      if (cfg && cfg.handle) estado.pasta = { handle: cfg.handle, nome: cfg.nome || cfg.handle.name, ultima: cfg.ultima || null };
    } catch (e) {
      estado.persistente = false;
    }
  }

  // ---------------------------------------------------------------- pasta (OneDrive)

  const temSeletorDePasta = () => typeof window.showDirectoryPicker === 'function';

  async function guardarPasta(handle) {
    estado.pasta = { handle, nome: handle.name, ultima: null };
    try { await CV.store.salvarConfig('pasta', { handle, nome: handle.name, ultima: null }); } catch (e) { /* vale só nesta sessão */ }
    atualizarBotoes();
  }

  /** O navegador lembra a pasta, mas o acesso precisa ser reconfirmado (1 clique) de vez em quando. */
  async function permissaoDaPasta(pedir) {
    const h = estado.pasta && estado.pasta.handle;
    if (!h) return false;
    const op = { mode: 'read' };
    try {
      if (!h.queryPermission) return true;
      if ((await h.queryPermission(op)) === 'granted') return true;
      if (pedir && h.requestPermission) return (await h.requestPermission(op)) === 'granted';
    } catch (e) { /* trata como sem permissão */ }
    return false;
  }

  async function lerPasta(silencioso) {
    const h = estado.pasta.handle;
    let lista;
    try {
      lista = await CV.pasta.listarHandle(h);
    } catch (e) {
      mensagem('erro', 'Não consegui abrir a pasta “' + estado.pasta.nome + '”: ' + (e && e.message ? e.message : 'erro desconhecido') + '. Ela foi movida, renomeada ou apagada? Use “Trocar pasta”.');
      return;
    }
    await processarItens(lista.itens, { pasta: true, nomePasta: estado.pasta.nome, errosListagem: lista.erros, silencioso });
    estado.pasta.ultima = new Date().toISOString();
    try { await CV.store.salvarConfig('pasta', { handle: h, nome: estado.pasta.nome, ultima: estado.pasta.ultima }); } catch (e) { /* ok */ }
    atualizarBotoes();
    if (estado.cruzado) renderTudo();
  }

  /** Botão principal: escolhe a pasta (1ª vez) ou atualiza a pasta lembrada. */
  async function cliquePasta() {
    if (estado.pasta && temSeletorDePasta()) {
      if (await permissaoDaPasta(true)) return lerPasta(false);
      mensagem('aviso', 'Sem permissão para ler a pasta “' + estado.pasta.nome + '”. Clique em “Trocar pasta” e escolha-a novamente.');
      return undefined;
    }
    return escolherPasta();
  }

  async function escolherPasta() {
    if (!temSeletorDePasta()) { $('pasta').click(); return; } // Firefox/Safari: seletor simples, sem lembrar
    let h;
    try {
      h = await window.showDirectoryPicker({ id: 'cadastro-venda', mode: 'read' });
    } catch (e) {
      if (e && e.name === 'AbortError') return; // o usuário cancelou
      mensagem('erro', 'Não consegui abrir essa pasta: ' + (e && e.message ? e.message : 'erro desconhecido') + '. Se o navegador recusou por ser uma pasta do sistema, escolha a subpasta “Cadastro e Venda”.');
      return;
    }
    await guardarPasta(h);
    await lerPasta(false);
  }

  function atualizarBotoes() {
    const p = estado.pasta;
    const quando = p && p.ultima ? ' · lida em ' + new Date(p.ultima).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';
    const btn = $('btn-pasta');
    $('rot-pasta').textContent = p && temSeletorDePasta() ? 'Atualizar' : 'Carregar pasta';
    btn.title = p ? 'Lê só as planilhas novas ou alteradas da pasta “' + p.nome + '”' + quando : 'Escolha a pasta (ex.: OneDrive › Cadastro e Venda) com as planilhas de Atividades e Resultados';
    $('btn-trocar-pasta').hidden = !(p && temSeletorDePasta());
    const grande = $('btn-escolher-pasta');
    grande.textContent = p && temSeletorDePasta() ? 'Atualizar da pasta “' + p.nome + '”' : 'Escolher a pasta (OneDrive)';
  }

  async function limparTudo() {
    if (!window.confirm('Apagar todos os dados guardados neste navegador? (Os arquivos originais não são afetados.)')) return;
    try { await CV.store.limpar(); } catch (e) { /* sem armazenamento: nada a apagar */ }
    estado.atividades.clear();
    estado.resultados.clear();
    estado.arquivos = [];
    estado.cruzado = null;
    estado.visitas = [];
    estado.descartadas = [];
    estado.agenda = [];
    if (estado.pasta) estado.pasta.ultima = null;
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
    // o cruzamento usa todas as visitas (um retorno pode ter nascido numa visita de outra equipe);
    // depois, o painel mostra só as equipes e cidades do escopo
    estado.cruzado = CV.cruzamento.montar(at, rs, { janelaDias: estado.janela, frentes: estado.frentesAtivas });
    const esc = CV.escopo.aplicar(estado.cruzado.visitas);
    estado.visitas = esc.dentro;
    estado.descartadas = esc.descartadas;
    estado.agenda = CV.tempos.agendaDe(at);
    estado.modelo = M.criarModeloChance(estado.visitas);
    estado.totalPercorrido = M.resumo(estado.visitas).percorrido;

    let min = null;
    let max = null;
    const dia = (d) => {
      if (!min || d < min) min = d;
      if (!max || d > max) max = d;
    };
    const cid = new Map();
    const bas = new Map();
    for (const v of estado.visitas) {
      dia(v.data);
      const c = v.cidade || '(sem cidade)';
      cid.set(c, (cid.get(c) || 0) + 1);
      bas.set(v.projeto, (bas.get(v.projeto) || 0) + 1);
    }
    for (const a of estado.agenda) dia(a.data);
    estado.datas = { min, max };
    const alfa = (a, b) => a.localeCompare(b, 'pt-BR');
    estado.opcoes = {
      cidades: Array.from(cid.keys()).sort(alfa),
      equipes: R.escopo.equipes.slice(),
      bases: Array.from(bas.entries()).sort((a, b) => b[1] - a[1] || alfa(a[0], b[0])).map((x) => x[0]),
    };
    const f = estado.filtros;
    if (f.cidade && !estado.opcoes.cidades.includes(f.cidade)) f.cidade = null;
    if (f.base && !estado.opcoes.bases.includes(f.base)) f.base = null;
    estado.atualizadoEm = new Date();
    if (f.preset !== 'custom') aplicarPreset(f.preset); // "último dia", "7 dias"... acompanham o dado mais novo
    cacheVs = null;
  }

  function aplicarPreset(p) {
    const f = estado.filtros;
    f.preset = p;
    const { min, max } = estado.datas;
    if (!max) { f.de = null; f.ate = null; return; }
    if (p === 'tudo') { f.de = min; f.ate = max; }
    else if (p === 'mes') { f.de = max.slice(0, 8) + '01'; f.ate = max; }
    else if (p !== 'custom') { f.de = N.somaDias(max, -(Number(p) - 1)); f.ate = max; }
    if (p !== 'custom') estado.granManual = false;
  }

  function granularidadeAtual() {
    if (estado.granManual) return estado.gran;
    const ini = estado.filtros.de || estado.datas.min;
    const fim = estado.filtros.ate || estado.datas.max;
    if (!ini || !fim) return 'dia';
    const dias = N.diasEntre(ini, fim) + 1;
    return dias <= 62 ? 'dia' : dias <= 200 ? 'semana' : 'mes';
  }

  /** Visitas do escopo com os filtros da tela. `comPeriodo: false` ignora as datas (listas de novos alvos). */
  function filtrarVisitas(lista, comPeriodo) {
    const f = estado.filtros;
    const base = M.filtrar(lista, {
      de: comPeriodo ? f.de : null,
      ate: comPeriodo ? f.ate : null,
      semAvulsas: f.semAvulsas,
      projetos: f.base ? new Set([f.base]) : null,
      cidades: f.cidade ? new Set([f.cidade]) : null,
    });
    return f.equipe ? base.filter((v) => chaveEquipe(v.recurso) === chaveEquipe(f.equipe)) : base;
  }

  let cacheVs = null;
  const visitasFiltradas = () => cacheVs || (cacheVs = filtrarVisitas(estado.visitas, true));

  /** Tempos: só período e equipe (cidade e base não se aplicam a refeição, deslocamento etc.). */
  function agendaFiltrada() {
    const f = estado.filtros;
    return estado.agenda.filter((a) => (!f.de || a.data >= f.de) && (!f.ate || a.data <= f.ate) &&
      (!f.equipe || chaveEquipe(a.recurso) === chaveEquipe(f.equipe)));
  }

  const equipesVisiveis = () => (estado.filtros.equipe ? [estado.filtros.equipe] : estado.opcoes.equipes);

  // ---------------------------------------------------------------- filtros

  const PRESETS = [['1', 'Último dia'], ['7', '7 dias'], ['30', '30 dias'], ['mes', 'Mês'], ['tudo', 'Tudo']];

  function montarFiltros() {
    const alvo = $('filtros');
    alvo.textContent = '';
    const f = estado.filtros;
    const refs = (estado.refs = {});
    const semTerritorio = estado.aba === 'tempos';

    const inData = (valor, rotulo) => h('input', { type: 'date', value: valor || '', min: estado.datas.min || '', max: estado.datas.max || '', attrs: { 'aria-label': rotulo } });
    refs.de = inData(f.de, 'Data inicial');
    refs.ate = inData(f.ate, 'Data final');
    const mudouData = () => {
      f.de = refs.de.value || null;
      f.ate = refs.ate.value || null;
      f.preset = 'custom';
      estado.granManual = false;
      mudouFiltro();
    };
    refs.de.addEventListener('change', mudouData);
    refs.ate.addEventListener('change', mudouData);

    const seletor = (chave, rotulo, todos, valores, desabilitado) => {
      const sel = h('select', { disabled: desabilitado, attrs: { 'aria-label': rotulo }, title: desabilitado ? 'Não se aplica aos tempos das equipes' : null },
        h('option', { value: '', text: todos }),
        valores.map((v) => h('option', { value: v, text: v })));
      sel.value = f[chave] || '';
      sel.addEventListener('change', () => { f[chave] = sel.value || null; mudouFiltro(); });
      refs[chave] = sel;
      return sel;
    };

    const campo = (rotulo, el) => h('label', { class: 'campo' }, h('span', { text: rotulo }), el);
    alvo.appendChild(campo('Data inicial', refs.de));
    alvo.appendChild(campo('Data final', refs.ate));
    alvo.appendChild(campo('Cidade', seletor('cidade', 'Cidade', 'Todas as cidades', estado.opcoes.cidades, semTerritorio)));
    alvo.appendChild(campo('Equipe', seletor('equipe', 'Equipe', 'Todas as equipes', estado.opcoes.equipes, false)));
    alvo.appendChild(campo('Base', seletor('base', 'Base', 'Todas as bases', estado.opcoes.bases, semTerritorio)));
  }

  /** Reflete nos campos o que mudou por fora deles (atalhos de período, "Limpar filtros"). */
  function sincronizarFiltros() {
    const f = estado.filtros;
    const r = estado.refs;
    if (r.de) r.de.value = f.de || '';
    if (r.ate) r.ate.value = f.ate || '';
    for (const k of ['cidade', 'equipe', 'base']) if (r[k]) r[k].value = f[k] || '';
  }

  function mudouFiltro() {
    cacheVs = null;
    sincronizarFiltros();
    renderChips();
    renderPainel();
  }

  function renderChips() {
    const alvo = $('chips');
    alvo.textContent = '';
    const f = estado.filtros;
    for (const [id, nome] of PRESETS) {
      alvo.appendChild(h('button', {
        type: 'button', class: 'chip preset', text: nome, attrs: { 'aria-pressed': String(f.preset === id) },
        on: { click: () => { aplicarPreset(id); mudouFiltro(); } },
      }));
    }
    alvo.appendChild(h('span', { class: 'sep' }));
    const semTerritorio = estado.aba === 'tempos';
    const ativos = [['equipe', 'Equipe'], ['cidade', 'Cidade'], ['base', 'Base']].filter(([k]) => f[k] && !(semTerritorio && k !== 'equipe'));
    for (const [k, rotulo] of ativos) {
      alvo.appendChild(h('span', { class: 'chip' }, rotulo + ': ' + f[k],
        h('button', { type: 'button', text: '×', title: 'Remover o filtro', attrs: { 'aria-label': 'Remover o filtro de ' + rotulo.toLowerCase() }, on: { click: () => { f[k] = null; mudouFiltro(); } } })));
    }
    if (ativos.length) {
      alvo.appendChild(h('button', { type: 'button', class: 'chip acao', text: 'Limpar filtros', on: { click: () => { f.cidade = null; f.equipe = null; f.base = null; mudouFiltro(); } } }));
    }
    alvo.appendChild(h('span', { class: 'espaco' }));
    if (estado.aba === 'visao' || estado.aba === 'alvos') {
      const cb = h('input', { type: 'checkbox', checked: f.semAvulsas });
      cb.addEventListener('change', () => { f.semAvulsas = cb.checked; mudouFiltro(); });
      alvo.appendChild(h('label', { class: 'check', title: 'Esconde as atividades que não pertencem a nenhuma base de alvos (pedidos do atendimento, solicitações das próprias equipes...)' }, cb, 'Ocultar avulsas'));
    }
    if (estado.aba === 'visao') {
      alvo.appendChild(h('span', { class: 'info', text: fmt.int(M.resumo(visitasFiltradas()).percorrido) + ' de ' + fmt.int(estado.totalPercorrido) + ' percorridas' }));
    }
  }

  // ---------------------------------------------------------------- render

  function renderTudo() {
    const temDados = !!(estado.cruzado && estado.cruzado.visitas.length);
    $('vazio').hidden = temDados;
    $('app').hidden = !temDados;
    $('abas').hidden = !temDados;
    $('btn-exportar').hidden = !temDados;
    $('btn-pdf').hidden = !temDados;
    $('btn-limpar').hidden = !(temDados || estado.resultados.size || estado.atividades.size);
    atualizarBotoes();
    const sub = $('sub-topo');
    if (!temDados) {
      sub.textContent = estado.resultados.size ? 'Faltam as atividades (planilha de Atividades/Cadastral) para cruzar.' : 'Nenhum dado carregado';
      sub.title = '';
      return;
    }
    const partes = [];
    partes.push(fmt.int(estado.totalPercorrido) + ' percorridas');
    if (estado.datas.max) partes.push('visitas até ' + fmt.longa(estado.datas.max));
    if (estado.cruzado.dataReferencia) partes.push('retornos até ' + fmt.longa(estado.cruzado.dataReferencia));
    if (estado.atualizadoEm) partes.push('atualizado às ' + estado.atualizadoEm.toLocaleTimeString('pt-BR'));
    sub.textContent = partes.join(' · ');
    sub.title = sub.textContent;
    renderConteudo();
  }

  function renderConteudo() {
    cacheVs = null;
    montarFiltros();
    renderAbas();
    renderChips();
    renderPainel();
  }

  const ABAS = [['visao', 'Visão geral'], ['tempos', 'Tempos das equipes'], ['alvos', 'Novos alvos'], ['auditoria', 'Auditoria']];

  function renderAbas() {
    const alvo = $('abas');
    alvo.textContent = '';
    for (const [id, nome] of ABAS) {
      alvo.appendChild(h('button', {
        type: 'button', role: 'tab', text: nome, attrs: { 'aria-selected': String(estado.aba === id) },
        on: { click: () => { estado.aba = id; montarFiltros(); renderAbas(); renderChips(); renderPainel(); } },
      }));
    }
  }

  function renderPainel() {
    const alvo = $('painel');
    alvo.textContent = '';
    if (!estado.visitas.length && estado.aba !== 'auditoria') {
      alvo.appendChild(h('p', { class: 'explica' },
        'Nenhuma visita das equipes e cidades da operação nos arquivos carregados. Veja na aba ', h('b', { text: 'Auditoria' }),
        ' o que ficou de fora; as equipes e as cidades consideradas ficam em ', h('code', { text: 'escopo' }), ' no arquivo ', h('code', { text: 'js/regras.js' }), '.'));
      return;
    }
    if (estado.aba === 'visao') {
      CV.ui.renderVisao(alvo, {
        vs: visitasFiltradas(), equipes: equipesVisiveis(), gran: granularidadeAtual(), ordemDe, abertas: estado.abertas,
        aoMudarGran: (g) => { estado.gran = g; estado.granManual = true; renderPainel(); },
      });
    } else if (estado.aba === 'tempos') {
      CV.ui.renderTempos(alvo, {
        agenda: agendaFiltrada(), equipes: equipesVisiveis(), modo: estado.modoTempos, ordemDe, soCompletos: estado.soCompletos,
        aoMudarModo: (m) => { estado.modoTempos = m; renderPainel(); },
        aoMudarCompletos: (v) => { estado.soCompletos = v; renderPainel(); },
      });
    } else {
      const bloco = h('section', { class: 'bloco' });
      alvo.appendChild(bloco);
      if (estado.aba === 'alvos') renderAlvos(bloco); else renderAuditoria(bloco);
    }
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

  // ---- Novos alvos

  const colTxt = (id, titulo, fn, extra) => Object.assign({ id, titulo, tipo: 'txt', valor: fn }, extra || {});
  const colNum = (id, titulo, fn, extra) => Object.assign({ id, titulo, tipo: 'num', valor: fn }, extra || {});

  function renderAlvos(alvo) {
    const base = filtrarVisitas(estado.visitas, false);
    const vs = visitasFiltradas();
    const modelo = estado.modelo;
    const todas = estado.cruzado.visitas; // o histórico inclui visitas de fora do escopo
    const revisitar = M.alvosOcorrencia(base, modelo, 'revisitar', todas);
    const endereco = M.alvosOcorrencia(base, modelo, 'corrigir_endereco', todas);
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
        h('span', { class: 'nota', style: { margin: 0 }, text: linhas.length > 300 ? 'Mostrando os 300 primeiros — exporte para ver todos.' : '' }),
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
    alvo.appendChild(h('p', { class: 'nota', style: { margin: '0 0 10px' }, text: `Onde a taxa de resultado é maior ou menor que a média do recorte. Só entram grupos com ${R.minAmostraRanking}+ visitas executadas. "Priorizar": gerar mais alvos com esse perfil/território. "Rever": a base está rendendo bem abaixo da média.` }));
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

  /** Como um tipo de atividade entra na conta dos tempos. */
  function classeDoTipo(tipo) {
    const k = N.chave(tipo);
    const em = (lista) => lista.some((t) => N.chave(t) === k);
    if (em(R.tempos.tiposDeslocamento)) return 'Deslocamento';
    if (em(R.tempos.tiposOciosos)) return 'Ociosidade';
    if (em(R.tempos.tiposApoio)) return 'Pausas e apoio';
    return 'Serviço';
  }

  function topo(mapa, limite) {
    return Array.from(mapa.entries()).sort((a, b) => b[1] - a[1]).slice(0, limite).map(([k, n]) => k + ' (' + fmt.int(n) + ')').join(', ');
  }

  function renderAuditoria(alvo) {
    const c = estado.cruzado;
    const a = c.auditoria;
    const kv = (pares) => h('div', { class: 'kv' }, pares.map(([k, v]) => [h('div', { text: k }), h('div', { text: typeof v === 'number' ? fmt.int(v) : v })]));
    const semZero = (pares) => pares.filter(([, v], i) => i === 0 || v > 0); // 1ª linha é o total; as demais só se houver

    alvo.appendChild(h('div', { class: 'cabeca', style: { marginTop: 0 } }, h('h2', { text: 'Ajustes do cruzamento' })));
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

    // ---- escopo
    const foraEquipe = new Map();
    const foraCidade = new Map();
    for (const v of estado.descartadas) {
      if (!CV.escopo.equipeNoEscopo(v.recurso)) foraEquipe.set(v.recurso || '(sem equipe)', (foraEquipe.get(v.recurso || '(sem equipe)') || 0) + 1);
      else foraCidade.set(v.cidade || '(sem cidade)', (foraCidade.get(v.cidade || '(sem cidade)') || 0) + 1);
    }
    const nForaEquipe = Array.from(foraEquipe.values()).reduce((x, y) => x + y, 0);
    const nForaCidade = Array.from(foraCidade.values()).reduce((x, y) => x + y, 0);
    alvo.appendChild(h('h3', { text: 'Escopo do painel' }));
    alvo.appendChild(kv([
      ['Visitas cadastrais carregadas (todas as equipes)', c.visitas.length],
      ['Consideradas no painel (equipes e cidades do escopo)', estado.visitas.length],
      ['De outras equipes (fora do painel)', nForaEquipe],
      ['Das nossas equipes em outras cidades (fora do painel)', nForaCidade],
    ]));
    const notas = [];
    if (foraEquipe.size) notas.push('Equipes de fora com mais visitas: ' + topo(foraEquipe, 5) + '.');
    if (foraCidade.size) notas.push('Cidades de fora com mais visitas: ' + topo(foraCidade, 5) + '.');
    if (notas.length) alvo.appendChild(h('p', { class: 'nota', text: notas.join(' ') }));
    alvo.appendChild(h('p', { class: 'nota', text: 'Equipes e cidades do painel: ' + R.escopo.equipes.join(', ') + '. As cidades e as equipes ficam em js/regras.js (escopo). As visitas de fora continuam servindo para ligar os retornos pela matrícula, só não aparecem nos números.' }));

    alvo.appendChild(h('h3', { text: 'Atividades' }));
    const proj = c.projetos;
    alvo.appendChild(kv(semZero([
      ['Atividades carregadas (todos os tipos)', estado.atividades.size],
      ['Visitas sem matrícula válida (não cruzam)', a.visitasSemMatricula],
      ['Projeto unido por semelhança de escrita', proj.porOrigem.similar],
      ['Projeto novo (sem regra cadastrada)', proj.porOrigem.novo],
      ['Demandas avulsas (sem projeto)', proj.porOrigem.sem],
    ])));
    const novos = proj.novos.filter((n) => !R.projetos.some((p) => p[1] === n));
    if (novos.length) alvo.appendChild(h('p', { class: 'nota', text: 'Projetos novos detectados (ainda sem regra): ' + novos.join(', ') + '.' }));

    const tops = M.textosAvulsas(estado.visitas, 6);
    if (tops.length) {
      alvo.appendChild(h('div', { class: 'explica' },
        h('b', { text: '“' + R.semProjeto + '”' }),
        ' são atividades cujo texto de abertura não começa com o nome de uma base: em geral pedidos do atendimento (call center, WhatsApp), solicitações das próprias equipes e instruções avulsas. Os textos mais comuns:',
        h('ul', { class: 'lista-simples' }, tops.map((t) => h('li', null, h('code', { text: t.exemplo }), ' — ' + fmt.int(t.n)))),
        'Use “Ocultar avulsas” nos filtros para olhar só as bases. Se algum desses textos for, na verdade, uma base de alvos, cadastre o nome na lista ',
        h('code', { text: 'projetos' }), ' de ', h('code', { text: 'js/regras.js' }), '.'));
    }

    alvo.appendChild(h('h3', { text: 'Retornos do backoffice (planilha de Resultados)' }));
    alvo.appendChild(kv(semZero([
      ['Retornos carregados', a.retornosTotal],
      ['Atribuídos a uma visita', a.atribuidos],
      ['Matrícula fora das bases visitadas', a.foraDasBases],
      ['Anteriores à primeira visita da matrícula', a.anteriorVisita],
      ['Depois da janela de ' + estado.janela + ' dias', a.foraJanela],
      ['Matrícula inválida (não é 9 dígitos)', a.matriculaInvalida],
      ['Resgatados pelo número do protocolo', a.resgatadosProtocolo],
      ['Frente de serviço desconsiderada', a.frenteIgnorada],
    ])));
    alvo.appendChild(h('p', { class: 'nota', text: 'Os retornos "fora das bases" são trabalho do backoffice sobre matrículas que não vieram destas bases de visita (demanda interna, outras regiões); por isso não entram na efetividade.' }));

    // ---- tipos de atividade (tempos)
    const tipos = CV.tempos.tiposPresentes(estado.agenda);
    if (tipos.size) {
      alvo.appendChild(h('h3', { text: 'Tipos de atividade das equipes (tempos)' }));
      const linhas = Array.from(tipos.entries()).map(([tipo, n]) => ({ tipo, n, classe: classeDoTipo(tipo) }));
      alvo.appendChild(CV.ui.criarTabela({
        colunas: [
          colTxt('tipo', 'Tipo de atividade', (l) => l.tipo),
          colNum('n', 'Atividades', (l) => l.n),
          colTxt('cl', 'Entra como', (l) => l.classe),
        ],
        linhas, ordem: { id: 'n', dir: 'desc' },
      }));
      alvo.appendChild(h('p', { class: 'nota', text: 'Define como cada tipo entra nos tempos das equipes (js/regras.js, tempos): refeição, DDS, checklist, carregamento, clima e abastecimento são “Pausas e apoio”; o que sobra do dia é ociosidade.' }));
    }

    alvo.appendChild(h('h3', { text: 'Arquivos carregados' }));
    const lidos = estado.arquivos.filter((x) => x.tipo !== 'ignorado');
    const ignoradosPasta = estado.arquivos.length - lidos.length;
    if (lidos.length) {
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
        linhas: lidos, ordem: { id: 'qdo', dir: 'desc' },
      }));
    }
    if (ignoradosPasta) alvo.appendChild(h('p', { class: 'nota', text: ignoradosPasta + ' outra(s) planilha(s) da pasta não são de Atividades nem de Resultados e foram ignoradas.' }));
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
    const inputPasta = $('pasta');
    input.addEventListener('change', () => { receberArquivos(input.files); input.value = ''; });
    inputPasta.addEventListener('change', () => {
      const itens = CV.pasta.itensDeLista(inputPasta.files);
      processarItens(itens, { pasta: true, nomePasta: CV.pasta.nomeDaPasta(itens) || 'selecionada' });
      inputPasta.value = '';
    });
    $('btn-adicionar').addEventListener('click', () => input.click());
    $('btn-escolher').addEventListener('click', () => input.click());
    $('btn-pasta').addEventListener('click', cliquePasta);
    $('btn-escolher-pasta').addEventListener('click', cliquePasta);
    $('btn-trocar-pasta').addEventListener('click', escolherPasta);
    $('btn-exportar').addEventListener('click', exportarCruzamento);
    $('btn-pdf').addEventListener('click', () => window.print());
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
      const dt = e.dataTransfer;
      if (!dt) return;
      // as entradas só valem durante o evento: captura tudo agora, de forma síncrona
      const itens = Array.from(dt.items || []);
      const handles = itens.map((i) => (i.getAsFileSystemHandle ? i.getAsFileSystemHandle() : null));
      const entradas = itens.map((i) => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
      const arquivos = Array.from(dt.files || []);
      if (entradas.some((en) => en.isDirectory)) soltouPasta(handles, entradas);
      else if (arquivos.length) receberArquivos(arquivos);
    });
  }

  /** Pasta arrastada para a tela. No Chrome/Edge também dá para lembrá-la (handle). */
  async function soltouPasta(handles, entradas) {
    try {
      const resolvidos = (await Promise.all(handles.map((h) => (h ? h.catch(() => null) : null)))).filter(Boolean);
      const dirs = resolvidos.filter((h) => h.kind === 'directory');
      if (dirs.length === 1 && entradas.filter((e) => e.isDirectory).length === 1 && resolvidos.length === 1) {
        await guardarPasta(dirs[0]);
        await lerPasta(false);
        return;
      }
    } catch (e) { /* cai no caminho sem lembrar a pasta */ }
    const r = await CV.pasta.listarEntradas(entradas);
    const dir = entradas.find((e) => e.isDirectory);
    await processarItens(r.itens, { pasta: true, nomePasta: dir ? dir.name : 'arrastada', errosListagem: r.erros });
  }

  async function iniciar() {
    ligarEntrada();
    if (typeof DecompressionStream === 'undefined') {
      mensagem('erro', 'Este navegador é antigo demais para ler planilhas (falta DecompressionStream). Use uma versão recente do Chrome, Edge, Firefox ou Safari.');
    }
    await restaurar();
    if (estado.atividades.size) recalcular();
    atualizarBotoes();
    renderTudo();
    window.CV_estado = estado; // útil para depuração no console
    // pasta lembrada e com acesso ainda válido: já traz o que for novo, sem precisar clicar
    if (estado.pasta && temSeletorDePasta() && (await permissaoDaPasta(false))) await lerPasta(true);
    if (estado.precisaRelerPasta && !estado.atividades.size) {
      mensagem('aviso', 'O painel foi atualizado (agora com horários, equipes e cidades). Os dados guardados antes precisam ser lidos de novo: clique em “' + (estado.pasta ? 'Atualizar' : 'Carregar pasta') + '”.');
    }
  }

  iniciar();
})();
