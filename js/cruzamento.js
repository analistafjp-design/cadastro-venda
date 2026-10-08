/*
 * cruzamento.js — liga cada RETORNO (planilha de Resultados) à VISITA que o
 * originou, pela matrícula.
 *
 * Regra de atribuição (documentada em docs/REGRAS.md):
 *   um retorno pertence à visita MAIS RECENTE da mesma matrícula cuja data seja
 *   igual ou anterior à data do retorno e esteja a no máximo `janelaDias` dias
 *   dele. Retornos anteriores à primeira visita, fora da janela ou de matrículas
 *   que não estão nas bases não são atribuídos (e aparecem na auditoria).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  /** Ordem de preferência quando há mais de uma visita no mesmo dia: executada vence. */
  function pesoStatus(v) {
    return v.grupoStatus === 'exec' ? 2 : v.grupoStatus === 'oc' ? 1 : 0;
  }

  function compararVisitas(a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    const pa = pesoStatus(a);
    const pb = pesoStatus(b);
    if (pa !== pb) return pa - pb;
    const na = Number(a.id);
    const nb = Number(b.id);
    if (Number.isFinite(na) && Number.isFinite(nb) && na !== nb) return na - nb;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  }

  /**
   * @param visitas    visitas derivadas (dados.derivarVisitas)
   * @param resultados retornos derivados (dados.derivarResultados)
   * @param opc        { janelaDias, frentes: Set|null }
   * @returns { visitas: visitas enriquecidas (novas cópias), auditoria, dataReferencia }
   */
  function cruzar(visitas, resultados, opc) {
    const R = CV.regras;
    const o = opc || {};
    const janela = o.janelaDias === undefined ? R.janelaDias : o.janelaDias;
    const frentes = o.frentes && o.frentes.size ? o.frentes : null;

    const vs = visitas.map((v) =>
      Object.assign({}, v, {
        retornos: [],
        nRetornos: 0,
        grupoRetorno: null, // null = sem retorno | 'resultado' | 'atualizacao' | 'sem'
        tags: [],
        principal: null,
        deltaEcon: 0,
        primeiroRetorno: null,
        ultimoRetorno: null,
        maturando: false,
      })
    );

    const porMat = new Map();
    const porProt = new Map(); // protocolo -> matrícula (somente quando inequívoco)
    for (const v of vs) {
      if (v.mat) {
        if (!porMat.has(v.mat)) porMat.set(v.mat, []);
        porMat.get(v.mat).push(v);
      }
      if (v.protocolo && v.mat) {
        if (!porProt.has(v.protocolo)) porProt.set(v.protocolo, v.mat);
        else if (porProt.get(v.protocolo) !== v.mat) porProt.set(v.protocolo, null);
      }
    }
    for (const lista of porMat.values()) lista.sort(compararVisitas);

    const aud = {
      retornosTotal: resultados.length,
      frenteIgnorada: 0,
      semData: 0,
      matriculaInvalida: 0,
      resgatadosProtocolo: 0,
      foraDasBases: 0,
      anteriorVisita: 0,
      foraJanela: 0,
      atribuidos: 0,
      visitasSemMatricula: vs.filter((v) => !v.mat).length,
    };

    let dataReferencia = null;
    for (const r of resultados) if (r.data && (!dataReferencia || r.data > dataReferencia)) dataReferencia = r.data;

    for (const r of resultados) {
      if (frentes && r.frente && !frentes.has(r.frente)) { aud.frenteIgnorada++; continue; }
      let mat = r.mat;
      if (!mat) {
        const viaProt = r.matBruta ? porProt.get(r.matBruta) : null;
        if (viaProt) { mat = viaProt; aud.resgatadosProtocolo++; } else { aud.matriculaInvalida++; continue; }
      }
      if (!r.data) { aud.semData++; continue; }
      const lista = porMat.get(mat);
      if (!lista) { aud.foraDasBases++; continue; }
      let alvo = null;
      for (let i = lista.length - 1; i >= 0; i--) {
        if (lista[i].data <= r.data) { alvo = lista[i]; break; }
      }
      if (!alvo) { aud.anteriorVisita++; continue; }
      if (N().diasEntre(alvo.data, r.data) > janela) { aud.foraJanela++; continue; }
      alvo.retornos.push(r);
      aud.atribuidos++;
    }

    const classes = R.classes;
    for (const v of vs) {
      if (dataReferencia) v.maturando = N().diasEntre(v.data, dataReferencia) < R.diasMaturacao;
      if (!v.retornos.length) continue;
      v.nRetornos = v.retornos.length;
      const tags = new Set();
      let grupo = 'sem';
      for (const r of v.retornos) {
        for (const t of r.tags) tags.add(t);
        if (r.grupo === 'resultado') grupo = 'resultado';
        else if (r.grupo === 'atualizacao' && grupo !== 'resultado') grupo = 'atualizacao';
        if (r.deltaEcon) v.deltaEcon += r.deltaEcon;
        if (!v.primeiroRetorno || r.data < v.primeiroRetorno) v.primeiroRetorno = r.data;
        if (!v.ultimoRetorno || r.data > v.ultimoRetorno) v.ultimoRetorno = r.data;
      }
      v.grupoRetorno = grupo;
      v.tags = classes.filter((c) => tags.has(c.id)).map((c) => c.id);
      // "sem tratativa" só aparece se não houver nenhum outro desfecho
      if (v.tags.length > 1) v.tags = v.tags.filter((t) => t !== 'sem');
      v.principal = v.tags[0] || 'sem';
    }

    return { visitas: vs, auditoria: aud, dataReferencia };
  }

  /**
   * Atalho usado pelo app e pelos testes: recebe os registros LIMPOS (o que fica
   * salvo), aplica as regras de negócio e cruza.
   */
  function montar(atividadesLimpas, resultadosLimpos, opc) {
    const d = CV.dados.derivarVisitas(atividadesLimpas);
    const retornos = CV.dados.derivarResultados(resultadosLimpos);
    const c = cruzar(d.visitas, retornos, opc);
    return {
      visitas: c.visitas,
      auditoria: c.auditoria,
      dataReferencia: c.dataReferencia,
      projetos: { porOrigem: d.porProjeto, naoReconhecidos: d.naoReconhecidos, novos: d.novos },
      retornos,
    };
  }

  CV.cruzamento = { cruzar, montar };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.cruzamento;
})(typeof window !== 'undefined' ? window : globalThis);
