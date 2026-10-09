/*
 * paginas.js — as duas páginas do painel e o que muda entre elas.
 *
 *   interior (index.html)  as 10 equipes e as 12 cidades do interior (regras.js)
 *   vcg      (vcg.html)    as equipes RIOVCGVENIN-001, -002 e -004
 *
 * As duas leem a mesma pasta, mas cada uma só olha o que é dela:
 *   - arquivo com "VCG" no nome (ex.: "Resultados VCG.xlsx") é só da página VCG;
 *   - a página VCG só lê planilhas de Resultados que tenham "VCG" no nome;
 *   - as planilhas de Atividades servem às duas (cada uma fica com as suas equipes).
 * Cada página tem o próprio banco no navegador: uma não mexe nos dados da outra.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  /** O nome do arquivo (sem as pastas) tem "VCG"? */
  function ehVcg(caminho) {
    return /vcg/i.test(String(caminho || '').split(/[\\/]/).pop());
  }

  const PAGINAS = {
    interior: {
      id: 'interior',
      nome: 'Interior',
      banco: 'cadastro-venda',
      escopo: null, // vale o de regras.js
      soEscopo: false, // guarda também as visitas de outras equipes (servem para ligar o retorno pela matrícula)
      herdaPastaDe: null,
      prefixoArquivo: '',
      /** Motivo para NÃO ler o arquivo nesta página, ou null. `tipo` é null antes de abrir o arquivo. */
      recusa(caminho) {
        return ehVcg(caminho) ? 'arquivo de VCG: é lido só na página VCG' : null;
      },
    },
    vcg: {
      id: 'vcg',
      nome: 'VCG',
      banco: 'cadastro-venda-vcg',
      escopo: { equipes: ['RIOVCGVENIN-001', 'RIOVCGVENIN-002', 'RIOVCGVENIN-004'], cidades: [] },
      soEscopo: true,
      herdaPastaDe: 'cadastro-venda', // aproveita a pasta já escolhida na página do interior
      prefixoArquivo: 'vcg_',
      recusa(caminho, tipo) {
        return tipo === 'resultados' && !ehVcg(caminho) ? 'Resultados sem “VCG” no nome: é lido só na página Interior' : null;
      },
    },
  };

  /** A página aberta (<body data-pagina="vcg">); sem o atributo, a do interior. */
  function atual(doc) {
    const d = doc || (typeof document !== 'undefined' ? document : null);
    const id = d && d.body && d.body.dataset ? d.body.dataset.pagina : null;
    return PAGINAS[id] || PAGINAS.interior;
  }

  CV.paginas = Object.assign({ ehVcg, atual }, PAGINAS);
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.paginas;
})(typeof window !== 'undefined' ? window : globalThis);
