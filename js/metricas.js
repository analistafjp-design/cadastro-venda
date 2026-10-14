/*
 * metricas.js — agregações sobre as visitas já cruzadas (cruzamento.cruzar).
 *
 * Definições (docs/REGRAS.md):
 *   Atividades   = alvos gerados (todas as linhas)
 *   Executadas   = status "Finalizada"; Ocorrências = "Encerrada com Ocorrência"
 *   Com retorno  = executadas com ao menos um retorno do backoffice atribuído
 *   Resultado    = executadas cujo retorno é uma mudança de valor (incremento,
 *                  categoria, titularidade, venda, tarifa social...)
 *   Efetividade (taxa de resultado) = Resultado ÷ Executadas
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  function filtrar(visitas, f) {
    const flt = f || {};
    return visitas.filter((v) => {
      if (flt.de && v.data < flt.de) return false;
      if (flt.ate && v.data > flt.ate) return false;
      if (flt.projetos && flt.projetos.size && !flt.projetos.has(v.projeto)) return false;
      if (flt.recursos && flt.recursos.size && !flt.recursos.has(v.recurso)) return false;
      if (flt.cidades && flt.cidades.size && !flt.cidades.has(v.cidade || '(sem cidade)')) return false;
      if (flt.semAvulsas && v.projeto === CV.regras.semProjeto) return false;
      return true;
    });
  }

  function div(a, b) {
    return b > 0 ? a / b : null;
  }

  /** Resumo de um conjunto de visitas. */
  function resumo(visitas) {
    const R = CV.regras;
    const r = {
      total: visitas.length,
      exec: 0,
      oc: 0,
      outras: 0,
      comRetorno: 0,
      resultado: 0,
      atualizacao: 0,
      sem: 0,
      semRetorno: 0,
      maturando: 0,
      deltaEcon: 0,
      classes: {},
      colunas: {},
    };
    for (const c of R.classes) r.classes[c.id] = 0;
    for (const c of R.colunasDesfecho) r.colunas[c.id] = 0;
    const mats = new Set();

    for (const v of visitas) {
      if (v.mat) mats.add(v.mat);
      if (v.grupoStatus === 'oc') { r.oc++; continue; }
      if (v.grupoStatus !== 'exec') { r.outras++; continue; }
      r.exec++;
      if (v.maturando) r.maturando++;
      if (!v.grupoRetorno) { r.semRetorno++; continue; }
      r.comRetorno++;
      if (v.grupoRetorno === 'resultado') r.resultado++;
      else if (v.grupoRetorno === 'atualizacao') r.atualizacao++;
      else r.sem++;
      r.deltaEcon += v.deltaEcon || 0;
      for (const t of v.tags) r.classes[t]++;
      for (const c of R.colunasDesfecho) if (c.classes.some((t) => v.tags.indexOf(t) >= 0)) r.colunas[c.id]++;
    }
    r.percorrido = r.exec + r.oc; // visitas em que a equipe foi ao local: executadas + ocorrências
    r.matriculas = mats.size;
    r.taxaExec = div(r.exec, r.total);
    r.taxaRetorno = div(r.comRetorno, r.exec);
    r.taxaResultado = div(r.resultado, r.exec);
    r.taxaTratativa = div(r.resultado + r.atualizacao, r.exec);
    return r;
  }

  /** Agrupa por chave (função) e devolve linhas [{chave, ...resumo}] ordenadas por executadas. */
  function agruparPor(visitas, fnChave) {
    const grupos = new Map();
    for (const v of visitas) {
      const k = fnChave(v);
      if (!grupos.has(k)) grupos.set(k, []);
      grupos.get(k).push(v);
    }
    const linhas = [];
    for (const [chave, vs] of grupos) linhas.push(Object.assign({ chave }, resumo(vs)));
    linhas.sort((a, b) => b.exec - a.exec || b.total - a.total || String(a.chave).localeCompare(String(b.chave), 'pt-BR'));
    return linhas;
  }

  function chavePeriodo(granularidade) {
    return (v) => {
      if (granularidade === 'semana') return N().inicioSemana(v.data);
      if (granularidade === 'mes') return v.data.slice(0, 7);
      return v.data;
    };
  }

  /** Série por dia/semana/mês (por data da VISITA), em ordem cronológica. */
  function porPeriodo(visitas, granularidade) {
    const linhas = agruparPor(visitas, chavePeriodo(granularidade));
    linhas.sort((a, b) => (a.chave < b.chave ? -1 : 1));
    return linhas;
  }

  /**
   * O que são as atividades "sem projeto" (demandas avulsas): agrupa pelos 3 primeiros
   * termos do texto de abertura, com um exemplo de cada grupo.
   */
  function textosAvulsas(visitas, limite) {
    const grupos = new Map();
    for (const v of visitas) {
      if (v.projeto !== CV.regras.semProjeto) continue;
      const bruto = v.obs || '(sem texto de abertura)';
      const k = N().chave(bruto).split(' ').slice(0, 3).join(' ') || '(sem texto de abertura)';
      let g = grupos.get(k);
      if (!g) { g = { chave: k, n: 0, exemplo: bruto.slice(0, 110) }; grupos.set(k, g); }
      g.n++;
    }
    return Array.from(grupos.values()).sort((a, b) => b.n - a.n).slice(0, limite || 8);
  }

  // ---------- tipos de resultado (cards e resultado por equipe) ----------

  /** Os "serviços" que trazem resultado, na ordem em que aparecem nas telas. */
  const TIPOS_RESULTADO = [
    { id: 'inc', rotulo: 'Incremento de economia', curto: 'Incremento' },
    { id: 'inc_cat', rotulo: 'Incremento de economia e alteração de categoria', curto: 'Incremento e categoria' },
    { id: 'cat', rotulo: 'Alteração de categoria', curto: 'Categoria' },
    { id: 'titular', rotulo: 'Troca de titularidade', curto: 'Titularidade' },
    { id: 'tarifa', rotulo: 'Tarifa social', curto: 'Tarifa social' },
    { id: 'fatura', rotulo: 'Fatura digital', curto: 'Fatura digital' },
    { id: 'venda', rotulo: 'Venda / ligação nova', curto: 'Venda' },
    { id: 'novo', rotulo: 'Novo cliente (lote não cadastrado)', curto: 'Novo cliente' },
    { id: 'debitos', rotulo: 'Negociação de débitos', curto: 'Negociação' },
    { id: 'decr', rotulo: 'Decremento de economia', curto: 'Decremento' },
    { id: 'eco', rotulo: 'Alteração de economia', curto: 'Economia' },
  ];

  /**
   * Em quais "tipos de resultado" uma visita se encaixa (pode ser mais de um).
   * Economia + categoria no mesmo retorno = "incremento de economia e alteração de categoria".
   */
  function tiposDoResultado(v) {
    const t = new Set(v.tags);
    const inc = t.has('incremento');
    const eco = t.has('economia');
    const cat = t.has('categoria');
    const out = [];
    if (inc && !cat) out.push('inc');
    if (cat && (inc || eco)) out.push('inc_cat');
    if (cat && !inc && !eco) out.push('cat');
    if (t.has('titularidade')) out.push('titular');
    if (t.has('tarifa_social')) out.push('tarifa');
    if (t.has('fatura')) out.push('fatura');
    if (t.has('venda')) out.push('venda');
    if (t.has('novo_cliente')) out.push('novo');
    if (t.has('debitos')) out.push('debitos');
    if (t.has('decremento')) out.push('decr');
    if (eco && !cat && !inc) out.push('eco');
    return out;
  }

  /** Visitas executadas com resultado. */
  const comResultado = (visitas) => visitas.filter((v) => v.grupoStatus === 'exec' && v.grupoRetorno === 'resultado');

  /** Os números dos cards da visão geral. */
  function cartoes(visitas) {
    const r = resumo(visitas);
    const c = { percorrido: r.percorrido, exec: r.exec, oc: r.oc, resultado: r.resultado, taxa: r.taxaResultado, inc: 0, incCat: 0, totalInc: 0, totalCat: 0, titular: 0, venda: 0, novo: 0, debitos: 0, outros: 0 };
    for (const v of comResultado(visitas)) {
      const tp = new Set(tiposDoResultado(v));
      if (tp.has('inc')) c.inc++;
      if (tp.has('inc_cat')) c.incCat++;
      if (tp.has('inc') || tp.has('inc_cat')) c.totalInc++;
      if (tp.has('cat') || tp.has('inc_cat')) c.totalCat++;
      if (tp.has('titular')) c.titular++;
      if (tp.has('venda')) c.venda++;
      if (tp.has('novo')) c.novo++;
      if (tp.has('debitos')) c.debitos++;
      if (!['inc', 'inc_cat', 'cat', 'titular'].some((k) => tp.has(k))) c.outros++;
    }
    return c;
  }

  /**
   * Resultado por equipe: só o que trouxe resultado, com os serviços (tipos) e a quantidade.
   * `ordemEquipes`: nomes das equipes do escopo (todas aparecem, mesmo sem resultado).
   */
  function resultadoPorEquipe(visitas, ordemEquipes) {
    const chave = (r) => N().chave(r).replace(/ /g, '');
    const porEquipe = new Map();
    for (const nome of ordemEquipes) porEquipe.set(chave(nome), { recurso: nome, exec: 0, resultado: 0, tipos: new Map() });
    for (const v of visitas) {
      if (v.grupoStatus !== 'exec') continue;
      const e = porEquipe.get(chave(v.recurso));
      if (!e) continue;
      e.exec++;
      if (v.grupoRetorno !== 'resultado') continue;
      e.resultado++;
      for (const id of tiposDoResultado(v)) e.tipos.set(id, (e.tipos.get(id) || 0) + 1);
    }
    const rotulo = new Map(TIPOS_RESULTADO.map((t) => [t.id, t.rotulo]));
    const linhas = Array.from(porEquipe.values()).map((e) => ({
      recurso: e.recurso,
      exec: e.exec,
      resultado: e.resultado,
      taxa: div(e.resultado, e.exec),
      tipos: Array.from(e.tipos.entries()).map(([id, n]) => ({ id, rotulo: rotulo.get(id), n })).sort((a, b) => b.n - a.n || a.rotulo.localeCompare(b.rotulo, 'pt-BR')),
    }));
    linhas.sort((a, b) => b.resultado - a.resultado || b.exec - a.exec || a.recurso.localeCompare(b.recurso, 'pt-BR'));
    return linhas;
  }

  // ---------- conferência dos lançamentos com as atividades (formulário VCG) ----------

  /**
   * Para cada equipe do escopo, o que aconteceu com os lançamentos do formulário de Resultados
   * que dizem ser dela: existe atividade dela com aquela matrícula? Foi executada? Cabe na janela?
   * @param resultados  lançamentos limpos ({ equipe, mat, data })
   * @param atividades  atividades limpas guardadas ({ recurso, mat, data, status, tipo })
   * @returns { porEquipe: [{ equipe, lancados, executada, naoExecutada, foraJanela, outraEquipe, sem }],
   *            foraEscopo: [[equipe, n]], semMatricula, atividades: { n, dias, min, max } }
   */
  function conferirLancamentos(resultados, atividades, janelaDias) {
    const Nrm = N();
    const R = CV.regras;
    const janela = janelaDias === undefined ? R.janelaDias : janelaDias;
    const chaveEq = (r) => Nrm.chave(r).replace(/ /g, '');
    const porMat = new Map();
    const dias = new Set();
    let min = null;
    let max = null;
    for (const a of atividades) {
      if (!CV.escopo.equipeNoEscopo(a.recurso)) continue;
      if (a.data) {
        dias.add(a.data);
        if (!min || a.data < min) min = a.data;
        if (!max || a.data > max) max = a.data;
      }
      if (!a.mat) continue;
      if (!porMat.has(a.mat)) porMat.set(a.mat, []);
      porMat.get(a.mat).push(a);
    }
    const exec = new Set(R.status.executada);
    const linhas = new Map(R.escopo.equipes.map((e) => [chaveEq(e), { equipe: e, lancados: 0, executada: 0, naoExecutada: 0, foraJanela: 0, outraEquipe: 0, sem: 0 }]));
    const fora = new Map();
    let semMatricula = 0;
    for (const r of resultados) {
      if (!r.equipe) continue;
      const l = linhas.get(chaveEq(r.equipe));
      if (!l) { fora.set(r.equipe, (fora.get(r.equipe) || 0) + 1); continue; }
      l.lancados++;
      if (!r.mat) { semMatricula++; l.sem++; continue; }
      const todas = porMat.get(r.mat) || [];
      if (!todas.length) { l.sem++; continue; }
      const dela = todas.filter((a) => chaveEq(a.recurso) === chaveEq(r.equipe));
      if (!dela.length) { l.outraEquipe++; continue; }
      const naJanela = dela.filter((a) => r.data && a.data <= r.data && Nrm.diasEntre(a.data, r.data) <= janela);
      if (!naJanela.length) { l.foraJanela++; continue; }
      if (naJanela.some((a) => exec.has(Nrm.chave(a.status)))) l.executada++;
      else l.naoExecutada++;
    }
    return {
      porEquipe: Array.from(linhas.values()),
      foraEscopo: Array.from(fora.entries()).sort((a, b) => b[1] - a[1]),
      semMatricula,
      atividades: { n: atividades.filter((a) => CV.escopo.equipeNoEscopo(a.recurso)).length, dias: dias.size, min, max },
    };
  }

  // ---------- lançamentos do formulário por equipe e tipo (página VCG) ----------

  /**
   * Conta os lançamentos do formulário de Resultados (os que dizem a equipe) por equipe e por tipo de
   * resultado, direto da planilha: NÃO olha as atividades, então vale mesmo sem visita carregada.
   * Só entram como resultado os lançamentos de valor (venda, novo cliente, incremento, categoria,
   * titularidade, negociação...); o que é só atualização cadastral fica à parte, em `cadastrais`.
   * @param lancamentos  resultados limpos ({ equipe, data, ... }); a classificação é feita aqui
   * @param opc          { de, ate (datas ISO do período), equipe (uma equipe só, ou vazio = todas) }
   * @returns { linhas: [{ recurso, total, tipos: { id: n } }]   uma por equipe do escopo,
   *            tipos: [{ id, rotulo, curto, n }]                só os tipos que apareceram,
   *            total, cadastrais, multiplos, foraEscopo, semEquipe }
   */
  function lancamentosPorEquipeTipo(lancamentos, opc) {
    const o = opc || {};
    const chave = (r) => N().chave(r).replace(/ /g, '');
    const alvo = o.equipe ? chave(o.equipe) : null;
    const porEquipe = new Map(CV.regras.escopo.equipes.filter((e) => !alvo || chave(e) === alvo).map((e) => [chave(e), { recurso: e, total: 0, tipos: {} }]));
    const doPeriodo = lancamentos.filter((r) => (!o.de || (r.data && r.data >= o.de)) && (!o.ate || (r.data && r.data <= o.ate)));
    const somaTipo = {};
    const out = { linhas: [], tipos: [], total: 0, cadastrais: 0, multiplos: 0, foraEscopo: 0, semEquipe: 0 };
    for (const r of CV.dados.derivarResultados(doPeriodo)) {
      if (!r.equipe) { out.semEquipe++; continue; }
      if (!CV.escopo.equipeNoEscopo(r.equipe)) { out.foraEscopo++; continue; }
      const l = porEquipe.get(chave(r.equipe));
      if (!l) continue; // é do escopo, mas não é a equipe escolhida no filtro
      if (r.grupo !== 'resultado') { out.cadastrais++; continue; }
      const ids = tiposDoResultado(r);
      l.total++;
      out.total++;
      if (ids.length > 1) out.multiplos++;
      for (const id of ids) {
        l.tipos[id] = (l.tipos[id] || 0) + 1;
        somaTipo[id] = (somaTipo[id] || 0) + 1;
      }
    }
    out.linhas = Array.from(porEquipe.values());
    out.tipos = TIPOS_RESULTADO.filter((t) => somaTipo[t.id] > 0).map((t) => Object.assign({ n: somaTipo[t.id] }, t));
    return out;
  }

  // ---------- novos alvos ----------

  /**
   * Modelo simples e transparente de "chance estimada": taxa histórica de
   * resultado do segmento mais específico com amostra suficiente
   * (projeto × nº de economias -> nº de economias -> projeto -> geral).
   */
  function criarModeloChance(visitas) {
    const min = CV.regras.minAmostraRanking;
    const seg = { pq: new Map(), q: new Map(), p: new Map() };
    let exec = 0;
    let res = 0;
    const somar = (mapa, k, ok) => {
      let c = mapa.get(k);
      if (!c) { c = { n: 0, r: 0 }; mapa.set(k, c); }
      c.n++;
      if (ok) c.r++;
    };
    for (const v of visitas) {
      if (v.grupoStatus !== 'exec' || v.maturando) continue;
      const ok = v.grupoRetorno === 'resultado';
      exec++;
      if (ok) res++;
      somar(seg.pq, v.projeto + '\u0001' + v.qtdEconRotulo, ok);
      somar(seg.q, v.qtdEconRotulo, ok);
      somar(seg.p, v.projeto, ok);
    }
    const geral = exec ? res / exec : 0;
    function chance(v) {
      let c = seg.pq.get(v.projeto + '\u0001' + v.qtdEconRotulo);
      if (c && c.n >= min) return { taxa: c.r / c.n, base: 'projeto × nº de economias', n: c.n };
      c = seg.q.get(v.qtdEconRotulo);
      if (c && c.n >= min) return { taxa: c.r / c.n, base: 'nº de economias', n: c.n };
      c = seg.p.get(v.projeto);
      if (c && c.n >= min) return { taxa: c.r / c.n, base: 'projeto', n: c.n };
      return { taxa: geral, base: 'média geral', n: exec };
    }
    return { chance, geral };
  }

  /** Mais recente por matrícula; no mesmo dia, a executada vence a ocorrência. */
  function ultimaVisitaPorMatricula(visitas) {
    const peso = (v) => (v.grupoStatus === 'exec' ? 2 : v.grupoStatus === 'oc' ? 1 : 0);
    const m = new Map();
    for (const v of visitas) {
      if (!v.mat) continue;
      const a = m.get(v.mat);
      if (
        !a || v.data > a.data ||
        (v.data === a.data && (peso(v) > peso(a) || (peso(v) === peso(a) && Number(v.id) > Number(a.id))))
      ) m.set(v.mat, v);
    }
    return m;
  }

  /**
   * Matrículas cuja ÚLTIMA visita terminou em ocorrência recuperável.
   * `acao`: 'revisitar' | 'corrigir_endereco'. Ordena pela chance estimada.
   */
  function alvosOcorrencia(visitas, modelo, acao, historico) {
    const limite = CV.regras.limiteTentativas;
    const base = historico || visitas; // o histórico pode ter visitas de fora do filtro/escopo
    const candidatas = new Set(visitas.map((v) => v.id));
    const porMat = new Map();
    for (const v of base) {
      if (!v.mat) continue;
      if (!porMat.has(v.mat)) porMat.set(v.mat, []);
      porMat.get(v.mat).push(v);
    }
    const ultima = ultimaVisitaPorMatricula(base);
    const out = [];
    for (const [mat, v] of ultima) {
      if (!candidatas.has(v.id)) continue;
      if (v.grupoStatus !== 'oc' || v.acao !== acao) continue;
      const hist = porMat.get(mat);
      const tentativas = hist.filter((x) => x.grupoStatus === 'oc').length;
      const ch = modelo.chance(v);
      out.push({
        mat, projeto: v.projeto, recurso: v.recurso, cidade: v.cidade, bairro: v.bairro, setor: v.setor,
        endereco: v.endereco, ultimaVisita: v.data, motivo: v.motivo, tentativas,
        escalar: tentativas >= limite, chance: ch.taxa, baseChance: ch.base, qtdEcon: v.qtdEconRotulo,
        visita: v, // a atividade em si, para exportar no formato de Atividades
      });
    }
    out.sort((a, b) => Number(a.escalar) - Number(b.escalar) || b.chance - a.chance || (a.ultimaVisita < b.ultimaVisita ? 1 : -1));
    return out;
  }

  /** Visitas executadas há mais de N dias sem nenhum retorno do backoffice. */
  function alvosSemRetorno(visitas, dataReferencia) {
    const dias = CV.regras.diasSemRetorno;
    const out = [];
    if (!dataReferencia) return out;
    for (const v of visitas) {
      if (v.grupoStatus !== 'exec' || v.grupoRetorno) continue;
      const idade = N().diasEntre(v.data, dataReferencia);
      if (idade <= dias) continue;
      out.push({
        mat: v.mat, projeto: v.projeto, recurso: v.recurso, cidade: v.cidade, bairro: v.bairro,
        endereco: v.endereco, data: v.data, dias: idade, protocolo: v.protocolo, visita: v,
      });
    }
    out.sort((a, b) => b.dias - a.dias);
    return out;
  }

  /** Matrículas visitadas (executadas) 2+ vezes sem nenhum resultado/atualização: parar de insistir. */
  function alvosEsgotados(visitas) {
    const porMat = new Map();
    for (const v of visitas) {
      if (!v.mat || v.grupoStatus !== 'exec') continue;
      if (!porMat.has(v.mat)) porMat.set(v.mat, []);
      porMat.get(v.mat).push(v);
    }
    const out = [];
    for (const [mat, vs] of porMat) {
      if (vs.length < 2) continue;
      // esgotado = todas as visitas já tiveram retorno e nenhuma gerou tratativa
      if (!vs.every((v) => v.grupoRetorno === 'sem' && !v.maturando)) continue;
      vs.sort((a, b) => (a.data < b.data ? -1 : 1));
      const u = vs[vs.length - 1];
      out.push({
        mat, projeto: u.projeto, recurso: u.recurso, cidade: u.cidade, bairro: u.bairro, endereco: u.endereco,
        visitas: vs.length, primeiraVisita: vs[0].data, ultimaVisita: u.data, visita: u,
      });
    }
    out.sort((a, b) => b.visitas - a.visitas || (a.ultimaVisita < b.ultimaVisita ? 1 : -1));
    return out;
  }

  /**
   * Territórios / perfis: linhas com amostra mínima, com índice vs. média geral
   * (índice 2,0 = converte o dobro da média).
   */
  function territorios(visitas, fnChave, minExec) {
    const min = minExec === undefined ? CV.regras.minAmostraRanking : minExec;
    const geral = resumo(visitas);
    const linhas = agruparPor(visitas.filter((v) => v.grupoStatus === 'exec'), fnChave)
      .filter((l) => l.exec >= min)
      .map((l) => Object.assign(l, { indice: geral.taxaResultado ? l.taxaResultado / geral.taxaResultado : null }));
    linhas.sort((a, b) => (b.taxaResultado || 0) - (a.taxaResultado || 0) || b.exec - a.exec);
    return { linhas, geral };
  }

  CV.metricas = {
    filtrar, resumo, agruparPor, porPeriodo, textosAvulsas, criarModeloChance,
    TIPOS_RESULTADO, tiposDoResultado, cartoes, resultadoPorEquipe, conferirLancamentos, lancamentosPorEquipeTipo,
    alvosOcorrencia, alvosSemRetorno, alvosEsgotados, territorios,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.metricas;
})(typeof window !== 'undefined' ? window : globalThis);
