/*
 * projetos.js — descobre o nome do projeto/base a partir do texto de abertura
 * da atividade ("PROJETO INCREMENTO: VERIFICAR O TIPO ...") e unifica as
 * variações de escrita (acentos quebrados, abreviações, textos diferentes).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  const PREFIXO = /^\s*PROJETO[\s_\-:]*([\s\S]*)$/i;

  /** Separa o rótulo ("INCREMENTO") do restante da instrução. */
  function extrairRotulo(texto, temPrefixo) {
    const resto = temPrefixo ? PREFIXO.exec(texto)[1] : texto;
    const i = resto.indexOf(':');
    let rotulo;
    if (i >= 0 && i <= 60) rotulo = resto.slice(0, i);
    else rotulo = resto.split(/\s+(?:-\s*)?FAVOR\b/i)[0].slice(0, 60);
    return rotulo.replace(/\s+/g, ' ').trim();
  }

  /**
   * Cria um extrator. Mantém o conjunto de nomes conhecidos para unir
   * variações novas (por similaridade) a nomes já vistos.
   */
  function criarExtrator(regras) {
    const R = regras || CV.regras;
    const regs = R.projetos.map(([rx, nome]) => [new RegExp(rx), nome]);
    const conhecidos = new Map(); // chave -> nome
    for (const [, nome] of regs) conhecidos.set(N().chave(nome), nome);
    const cache = new Map();

    function porRegra(chaveRotulo) {
      for (const [rx, nome] of regs) if (rx.test(chaveRotulo)) return nome;
      return null;
    }

    function extrair(obs) {
      const txt = N().texto(obs);
      if (!txt) return { nome: R.semProjeto, rotulo: null, origem: 'sem' };
      if (cache.has(txt)) return cache.get(txt);
      const temPrefixo = PREFIXO.test(txt);
      const rotulo = extrairRotulo(txt, temPrefixo);
      const ch = N().chave(rotulo);
      let r;
      if (!ch) {
        r = { nome: R.semProjeto, rotulo: null, origem: 'sem' };
      } else {
        const nome = porRegra(ch);
        if (nome) {
          // sem o prefixo "PROJETO", só aceitamos rótulos curtos (evita texto livre)
          if (!temPrefixo && ch.split(' ').length > 5) r = { nome: R.semProjeto, rotulo: null, origem: 'sem' };
          else r = { nome, rotulo, origem: 'regra' };
        } else if (!temPrefixo) {
          r = { nome: R.semProjeto, rotulo: null, origem: 'sem' };
        } else {
          let melhor = null;
          let melhorSim = 0;
          for (const [k, v] of conhecidos) {
            const s = N().similaridade(ch, k);
            if (s > melhorSim) { melhorSim = s; melhor = v; }
          }
          if (melhor && melhorSim >= R.similaridadeProjeto) {
            r = { nome: melhor, rotulo, origem: 'similar' };
          } else {
            const novo = ch;
            conhecidos.set(ch, novo);
            r = { nome: novo, rotulo, origem: 'novo' };
          }
        }
      }
      cache.set(txt, r);
      return r;
    }

    return { extrair, conhecidos };
  }

  CV.projetos = { criarExtrator, extrairRotulo };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.projetos;
})(typeof window !== 'undefined' ? window : globalThis);
