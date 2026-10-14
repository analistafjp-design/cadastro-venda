'use strict';
// DOM mínimo (só o que js/ui-util.js usa) para testar a montagem das telas sem navegador.
class Texto {
  constructor(t) { this.textContent = String(t); }
}

class No {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.filhos = [];
    this.attrs = {};
    this.style = {};
    this.className = '';
    this.ouvintes = {};
    this.proprio = '';
  }
  appendChild(f) { this.filhos.push(f); return f; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  addEventListener(ev, fn) { (this.ouvintes[ev] = this.ouvintes[ev] || []).push(fn); }
  get textContent() { return this.proprio + this.filhos.map((f) => f.textContent).join(''); }
  set textContent(v) { this.filhos = []; this.proprio = String(v); }
  /** Todos os descendentes (em ordem) que passam no teste. */
  achar(teste, acc) {
    const lista = acc || [];
    for (const f of this.filhos) {
      if (f instanceof No) {
        if (teste(f)) lista.push(f);
        f.achar(teste, lista);
      }
    }
    return lista;
  }
  porTag(tag) { return this.achar((n) => n.tagName === String(tag).toUpperCase()); }
}

function instalar() {
  globalThis.document = { createElement: (t) => new No(t), createTextNode: (t) => new Texto(t) };
}

/** Linhas de todas as tabelas dentro de `raiz`: [[texto da célula, ...], ...], cabeçalho primeiro. */
function linhasDaTabela(raiz) {
  return raiz.porTag('tr').map((tr) => tr.filhos.map((c) => c.textContent));
}

module.exports = { instalar, linhasDaTabela, No };
