/*
 * csv.js — exporta tabelas em CSV pronto para o Excel em português
 * (separador ";", vírgula decimal, UTF-8 com BOM, datas dd/mm/aaaa).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  function celula(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
    let s = String(v);
    // evita que o Excel interprete o texto como fórmula (injeção de CSV)
    if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s;
    if (/[;"\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  /** colunas: [{ titulo, valor: (linha) => any }] */
  function gerar(colunas, linhas) {
    const out = [colunas.map((c) => celula(c.titulo)).join(';')];
    for (const l of linhas) out.push(colunas.map((c) => celula(c.valor(l))).join(';'));
    return '﻿' + out.join('\r\n') + '\r\n';
  }

  function baixar(nomeArquivo, colunas, linhas) {
    const blob = new Blob([gerar(colunas, linhas)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  CV.csv = { gerar, baixar, celula };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.csv;
})(typeof window !== 'undefined' ? window : globalThis);
