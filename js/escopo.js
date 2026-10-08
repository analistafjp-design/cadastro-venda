/*
 * escopo.js — limita o painel às equipes e às cidades da operação (regras.escopo).
 * O export do sistema traz outras regiões (ex.: Itaboraí, São Gonçalo) e equipes de
 * outros serviços; elas não entram nas contas. Lista vazia na regra = não filtra.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  const chaveEquipe = (r) => CV.normalize.chave(r).replace(/ /g, '');
  const chaveCidade = (c) => CV.normalize.chave(c);

  let cache = null;
  function listas() {
    const E = CV.regras.escopo;
    if (!cache || cache.fonte !== E) {
      cache = { fonte: E, equipes: new Set(E.equipes.map(chaveEquipe)), cidades: new Set(E.cidades.map(chaveCidade)) };
    }
    return cache;
  }

  /** Equipe (recurso) do escopo? Sem lista configurada, qualquer uma. */
  function equipeNoEscopo(recurso) {
    const l = listas();
    return l.equipes.size === 0 || l.equipes.has(chaveEquipe(recurso));
  }

  /** Cidade do escopo? Cidade vazia só passa se não houver lista. */
  function cidadeNoEscopo(cidade) {
    const l = listas();
    return l.cidades.size === 0 || l.cidades.has(chaveCidade(cidade));
  }

  /**
   * Separa as visitas: { dentro, foraEquipe, foraCidade, descartadas }.
   * "foraCidade" = equipe do escopo trabalhando numa cidade que não é do escopo.
   * `descartadas` guarda as visitas que ficaram de fora, para a auditoria.
   */
  function aplicar(visitas) {
    const dentro = [];
    const descartadas = [];
    let foraEquipe = 0;
    let foraCidade = 0;
    for (const v of visitas) {
      if (!equipeNoEscopo(v.recurso)) { foraEquipe++; descartadas.push(v); }
      else if (!cidadeNoEscopo(v.cidade)) { foraCidade++; descartadas.push(v); }
      else dentro.push(v);
    }
    return { dentro, foraEquipe, foraCidade, descartadas };
  }

  CV.escopo = { equipeNoEscopo, cidadeNoEscopo, aplicar };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.escopo;
})(typeof window !== 'undefined' ? window : globalThis);
