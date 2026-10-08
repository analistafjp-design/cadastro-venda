/*
 * normalize.js — funções puras de normalização (texto, matrícula, datas).
 * Funciona no navegador (window.CV) e no Node (testes).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  const SEM_ACENTO = /[̀-ͯ]/g;

  /** Remove acentos (NFD). */
  function semAcento(s) {
    return String(s).normalize('NFD').replace(SEM_ACENTO, '');
  }

  /**
   * Chave de comparação de textos: maiúsculas, sem acento, só letras/dígitos
   * separados por 1 espaço. Caracteres de encoding quebrado (¿ e �) são
   * descartados, assim "SA¿DE" e "SAUDE" ficam próximos o bastante.
   */
  function chave(s) {
    if (s === null || s === undefined) return '';
    return semAcento(s)
      .replace(/[¿�]/g, '')
      .replace(/[^A-Za-z0-9]+/g, ' ')
      .trim()
      .toUpperCase();
  }

  /** Chave de cabeçalho: minúsculas, sem acento, sem pontuação/espaços. */
  function chaveCabecalho(s) {
    if (s === null || s === undefined) return '';
    return semAcento(s)
      .replace(/[¿�]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '');
  }

  /** Texto "limpo": string aparada ou null se vazio. */
  function texto(v) {
    if (v === null || v === undefined) return null;
    const s = String(v).replace(/ /g, ' ').trim();
    return s === '' ? null : s;
  }

  /**
   * Matrícula: só dígitos; válida com exatamente 9 dígitos.
   * Aceita número (100000001), texto ('100000001') ou float ('100000001.0').
   * Retorna { mat: '100000001' | null, bruto: '...' }.
   */
  function matricula(v) {
    if (v === null || v === undefined || v === '') return { mat: null, bruto: null };
    let s;
    if (typeof v === 'number') s = Number.isFinite(v) ? String(Math.round(v)) : '';
    else s = String(v).trim().replace(/\.0+$/, '');
    const digitos = s.replace(/\D+/g, '');
    return { mat: /^\d{9}$/.test(digitos) ? digitos : null, bruto: digitos || null };
  }

  /** Parte numérica do protocolo: '3000001/2026-1' -> '3000001'. */
  function protocolo(v) {
    const s = texto(v);
    if (!s) return null;
    const m = /^(\d+)/.exec(s);
    return m ? m[1] : null;
  }

  function p2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function dataValida(a, m, d) {
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    const dt = new Date(Date.UTC(a, m - 1, d));
    return dt.getUTCFullYear() === a && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /** Serial do Excel -> 'YYYY-MM-DD' (ou com hora). Sistema 1900 por padrão. */
  function serialParaIso(serial, sistema1904) {
    if (!Number.isFinite(serial)) return null;
    const base = sistema1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const totalSeg = Math.round(serial * 86400);
    const ms = base + totalSeg * 1000;
    const dt = new Date(ms);
    const d = dt.getUTCFullYear() + '-' + p2(dt.getUTCMonth() + 1) + '-' + p2(dt.getUTCDate());
    const seg = dt.getUTCHours() * 3600 + dt.getUTCMinutes() * 60 + dt.getUTCSeconds();
    if (seg === 0) return d;
    return d + 'T' + p2(dt.getUTCHours()) + ':' + p2(dt.getUTCMinutes()) + ':' + p2(dt.getUTCSeconds());
  }

  /**
   * Data -> 'YYYY-MM-DD' ou null.
   * Aceita: ISO ('2026-10-01', '2026-10-01T11:13:27'), 'dd/mm/yy', 'dd/mm/yyyy'
   * (com hora opcional), Date e serial do Excel (número entre 20000 e 80000).
   */
  function data(v) {
    if (v === null || v === undefined || v === '') return null;
    if (v instanceof Date) {
      if (isNaN(v)) return null;
      return v.getFullYear() + '-' + p2(v.getMonth() + 1) + '-' + p2(v.getDate());
    }
    if (typeof v === 'number') {
      if (v < 20000 || v > 80000) return null;
      return serialParaIso(v).slice(0, 10);
    }
    const s = String(v).trim();
    let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(s);
    if (m) return dataValida(+m[1], +m[2], +m[3]) ? m[1] + '-' + m[2] + '-' + m[3] : null;
    m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})(?:[ ,T].*)?$/.exec(s);
    if (m) {
      let a = +m[3];
      if (m[3].length === 2) a += 2000;
      return dataValida(a, +m[2], +m[1]) ? a + '-' + p2(+m[2]) + '-' + p2(+m[1]) : null;
    }
    return null;
  }

  /** Diferença em dias entre duas datas ISO (b - a). */
  function diasEntre(a, b) {
    const [ya, ma, da] = a.split('-').map(Number);
    const [yb, mb, db] = b.split('-').map(Number);
    return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / 86400000);
  }

  function somaDias(iso, n) {
    const [y, m, d] = iso.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d + n));
    return dt.getUTCFullYear() + '-' + p2(dt.getUTCMonth() + 1) + '-' + p2(dt.getUTCDate());
  }

  /** 'YYYY-MM-DD' -> 'dd/mm/yyyy'. */
  function dataBR(iso) {
    if (!iso) return '';
    const [y, m, d] = iso.split('-');
    return d + '/' + m + '/' + y;
  }

  /** Segunda-feira da semana da data ISO. */
  function inicioSemana(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = domingo
    return somaDias(iso, dow === 0 ? -6 : 1 - dow);
  }

  const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  function diaDaSemana(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return DIAS_SEMANA[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  }

  /** Similaridade de Dice por bigramas (0..1) entre duas chaves de texto. */
  function similaridade(a, b) {
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const bi = (s) => {
      const mapa = new Map();
      for (let i = 0; i < s.length - 1; i++) {
        const g = s.slice(i, i + 2);
        mapa.set(g, (mapa.get(g) || 0) + 1);
      }
      return mapa;
    };
    const A = bi(a);
    const B = bi(b);
    let inter = 0;
    for (const [g, n] of A) inter += Math.min(n, B.get(g) || 0);
    return (2 * inter) / (a.length - 1 + (b.length - 1));
  }

  CV.normalize = {
    semAcento, chave, chaveCabecalho, texto, matricula, protocolo, data, serialParaIso,
    diasEntre, somaDias, dataBR, inicioSemana, diaDaSemana, similaridade, p2,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.normalize;
})(typeof window !== 'undefined' ? window : globalThis);
