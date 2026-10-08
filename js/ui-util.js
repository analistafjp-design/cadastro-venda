/*
 * ui-util.js — construtor de DOM seguro (sempre textContent, nunca innerHTML
 * com dados) e formatadores pt-BR.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = (CV.ui = CV.ui || {});

  /** h('div', { class: 'x', on: { click: fn }, attrs: { 'aria-label': '...' } }, filhos...) */
  function h(tag, props, ...filhos) {
    const el = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v === null || v === undefined || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
        else if (k === 'attrs') for (const [a, val] of Object.entries(v)) el.setAttribute(a, val);
        else if (k === 'style') Object.assign(el.style, v);
        else if (k in el && k !== 'list') el[k] = v;
        else el.setAttribute(k, v);
      }
    }
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      el.appendChild(typeof f === 'object' ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  const svgNS = 'http://www.w3.org/2000/svg';
  function s(tag, attrs, ...filhos) {
    const el = document.createElementNS(svgNS, tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) el.setAttribute(k, v);
    for (const f of filhos.flat(Infinity)) {
      if (f === null || f === undefined || f === false) continue;
      el.appendChild(typeof f === 'object' ? f : document.createTextNode(String(f)));
    }
    return el;
  }

  const nfInt = new Intl.NumberFormat('pt-BR');
  const nf1 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const fmt = {
    int: (n) => (n === null || n === undefined ? '–' : nfInt.format(n)),
    sinal: (n) => (n === null || n === undefined ? '–' : (n > 0 ? '+' : '') + nfInt.format(n)),
    pct: (x) => (x === null || x === undefined ? '–' : nf1.format(x * 100) + '%'),
    ind: (x) => (x === null || x === undefined ? '–' : nf1.format(x) + '×'),
    dec: (x) => (x === null || x === undefined ? '–' : nf1.format(x)),
    curta: (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : ''),
    longa: (iso) => (iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : ''),
    mes: (iso) => {
      const m = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
      return m[Number(iso.slice(5, 7)) - 1] + '/' + iso.slice(2, 4);
    },
  };

  ui.h = h;
  ui.s = s;
  ui.fmt = fmt;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
