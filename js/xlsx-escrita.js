/*
 * xlsx-escrita.js — gera arquivos .xlsx (Excel) no navegador, sem bibliotecas.
 *
 * abas: [{ nome, colunas: [{ titulo, tipo, valor(linha) }], linhas }]
 * tipos de coluna:
 *   'txt'  texto (padrão)            'int'  número inteiro (ID, matrícula); texto se não for número
 *   'num'  número                    'data' data ISO (aaaa-mm-dd) -> data do Excel (dd/mm/aaaa)
 *   'hora' minutos -> horas:minutos  'pct'  fração -> porcentagem (0,0%)
 * Cada aba sai com cabeçalho em negrito, primeira linha congelada, filtro e larguras ajustadas.
 * Texto é sempre gravado como texto (nunca como fórmula).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const enc = new TextEncoder();

  // ---------------------------------------------------------------- ZIP

  const TABELA_CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes) {
    let c = 0xffffffff;
    for (let i = 0; i < bytes.length; i++) c = TABELA_CRC[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  /** Comprime (deflate bruto). Sem CompressionStream, devolve null e o arquivo vai sem compressão. */
  async function comprimir(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const cs = new CompressionStream('deflate-raw');
      const w = cs.writable.getWriter();
      w.write(bytes).catch(() => {});
      w.close().catch(() => {});
      return new Uint8Array(await new Response(cs.readable).arrayBuffer());
    } catch (e) {
      return null;
    }
  }

  async function montarZip(arquivos) {
    const agora = new Date();
    const hora = (agora.getHours() << 11) | (agora.getMinutes() << 5) | (agora.getSeconds() >> 1);
    const dia = ((agora.getFullYear() - 1980) << 9) | ((agora.getMonth() + 1) << 5) | agora.getDate();
    const partes = [];
    const central = [];
    let pos = 0;
    for (const a of arquivos) {
      const nome = enc.encode(a.nome);
      const crc = crc32(a.bytes);
      let dados = await comprimir(a.bytes);
      let metodo = 8;
      if (!dados || dados.length >= a.bytes.length) { dados = a.bytes; metodo = 0; }

      const loc = new Uint8Array(30 + nome.length);
      const dl = new DataView(loc.buffer);
      dl.setUint32(0, 0x04034b50, true);
      dl.setUint16(4, 20, true);
      dl.setUint16(6, 0x0800, true); // nomes em UTF-8
      dl.setUint16(8, metodo, true);
      dl.setUint16(10, hora, true);
      dl.setUint16(12, dia, true);
      dl.setUint32(14, crc, true);
      dl.setUint32(18, dados.length, true);
      dl.setUint32(22, a.bytes.length, true);
      dl.setUint16(26, nome.length, true);
      loc.set(nome, 30);
      partes.push(loc, dados);

      const cen = new Uint8Array(46 + nome.length);
      const dc = new DataView(cen.buffer);
      dc.setUint32(0, 0x02014b50, true);
      dc.setUint16(4, 20, true);
      dc.setUint16(6, 20, true);
      dc.setUint16(8, 0x0800, true);
      dc.setUint16(10, metodo, true);
      dc.setUint16(12, hora, true);
      dc.setUint16(14, dia, true);
      dc.setUint32(16, crc, true);
      dc.setUint32(20, dados.length, true);
      dc.setUint32(24, a.bytes.length, true);
      dc.setUint16(28, nome.length, true);
      dc.setUint32(42, pos, true);
      cen.set(nome, 46);
      central.push(cen);
      pos += loc.length + dados.length;
    }
    const tamCentral = central.reduce((s, c) => s + c.length, 0);
    const fim = new Uint8Array(22);
    const df = new DataView(fim.buffer);
    df.setUint32(0, 0x06054b50, true);
    df.setUint16(8, arquivos.length, true);
    df.setUint16(10, arquivos.length, true);
    df.setUint32(12, tamCentral, true);
    df.setUint32(16, pos, true);
    return new Blob([...partes, ...central, fim], { type: TIPO_XLSX });
  }

  // ---------------------------------------------------------------- XML das planilhas

  const TIPO_XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const NS_R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CABECALHO_XML = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' };

  // estilos: 0 padrão · 1 cabeçalho · 2 data · 3 horas:minutos · 4 porcentagem
  const ESTILOS = CABECALHO_XML +
    '<styleSheet xmlns="' + NS + '">' +
    '<numFmts count="3"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/><numFmt numFmtId="165" formatCode="[h]:mm"/><numFmt numFmtId="166" formatCode="0.0%"/></numFmts>' +
    '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FFE8ECF8"/><bgColor indexed="64"/></patternFill></fill></fills>' +
    '<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="thin"><color rgb="FFB8C0D8"/></bottom><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="5">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
    '<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>' +
    '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

  const S_CAB = 1;
  const S_DATA = 2;
  const S_HORA = 3;
  const S_PCT = 4;

  const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, '').replace(/[&<>"]/g, (c) => ESC[c]);

  function letra(n) {
    let s = '';
    for (let i = n + 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  /** Data ISO (aaaa-mm-dd[...]) -> número de série do Excel. */
  function serialData(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso));
    if (!m) return null;
    return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000) + 25569;
  }

  const vazio = (v) => v === null || v === undefined || v === '' || (typeof v === 'number' && !Number.isFinite(v));

  function celulaTexto(ref, v, estilo) {
    return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + ' t="inlineStr"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
  }

  function celulaNumero(ref, n, estilo) {
    return '<c r="' + ref + '"' + (estilo ? ' s="' + estilo + '"' : '') + '><v>' + n + '</v></c>';
  }

  function celula(ref, v, tipo) {
    if (vazio(v)) return '';
    if (tipo === 'data') {
      const n = serialData(v);
      return n === null ? celulaTexto(ref, v) : celulaNumero(ref, n, S_DATA);
    }
    if (tipo === 'hora') return typeof v === 'number' ? celulaNumero(ref, v / 1440, S_HORA) : celulaTexto(ref, v);
    if (tipo === 'pct') return typeof v === 'number' ? celulaNumero(ref, v, S_PCT) : celulaTexto(ref, v);
    if (tipo === 'num') return typeof v === 'number' ? celulaNumero(ref, v, 0) : celulaTexto(ref, v);
    if (tipo === 'int') {
      const t = String(v).trim();
      return /^\d{1,15}$/.test(t) ? celulaNumero(ref, Number(t), 0) : celulaTexto(ref, v);
    }
    return celulaTexto(ref, typeof v === 'number' ? String(v) : v);
  }

  function nomeDeAba(nome, usados) {
    let base = String(nome || 'Planilha').replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Planilha';
    let n = base;
    for (let i = 2; usados.has(n.toLowerCase()); i++) n = base.slice(0, 31 - String(i).length - 1) + ' ' + i;
    usados.add(n.toLowerCase());
    return n;
  }

  function xmlDaAba(aba) {
    const cols = aba.colunas;
    const linhas = aba.linhas;
    const ultima = Math.max(1, linhas.length + 1);
    const ref = 'A1:' + letra(Math.max(0, cols.length - 1)) + ultima;
    const largura = cols.map((c) => Math.min(60, Math.max(8, String(c.titulo).length + 3)));
    const rows = [];

    rows.push('<row r="1">' + cols.map((c, i) => celulaTexto(letra(i) + '1', c.titulo, S_CAB)).join('') + '</row>');
    for (let r = 0; r < linhas.length; r++) {
      const l = linhas[r];
      const n = r + 2;
      let x = '';
      for (let i = 0; i < cols.length; i++) {
        const c = cols[i];
        const v = c.valor(l);
        if (r < 300 && !vazio(v)) {
          const t = c.tipo === 'data' ? 10 : c.tipo === 'hora' || c.tipo === 'pct' ? 7 : String(v).length;
          if (t + 2 > largura[i]) largura[i] = Math.min(60, t + 2);
        }
        x += celula(letra(i) + n, v, c.tipo);
      }
      rows.push('<row r="' + n + '">' + x + '</row>');
    }

    return CABECALHO_XML + '<worksheet xmlns="' + NS + '">' +
      '<dimension ref="' + ref + '"/>' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>' +
      '<cols>' + largura.map((w, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + w + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.join('') + '</sheetData>' +
      (linhas.length ? '<autoFilter ref="' + ref + '"/>' : '') +
      '</worksheet>';
  }

  /** Gera o arquivo .xlsx. Devolve um Blob. */
  async function gerar(abas) {
    if (!abas || !abas.length) throw new Error('Nada para exportar.');
    const usados = new Set();
    const nomes = abas.map((a) => nomeDeAba(a.nome, usados));
    const arq = [];
    const txt = (nome, conteudo) => arq.push({ nome, bytes: enc.encode(conteudo) });

    txt('[Content_Types].xml', CABECALHO_XML +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      abas.map((a, i) => '<Override PartName="/xl/worksheets/sheet' + (i + 1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '</Types>');
    txt('_rels/.rels', CABECALHO_XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
    txt('xl/workbook.xml', CABECALHO_XML +
      '<workbook xmlns="' + NS + '" xmlns:r="' + NS_R + '"><bookViews><workbookView activeTab="0"/></bookViews><sheets>' +
      nomes.map((n, i) => '<sheet name="' + esc(n) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') +
      '</sheets></workbook>');
    txt('xl/_rels/workbook.xml.rels', CABECALHO_XML +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      abas.map((a, i) => '<Relationship Id="rId' + (i + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (abas.length + 1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
    txt('xl/styles.xml', ESTILOS);
    abas.forEach((a, i) => txt('xl/worksheets/sheet' + (i + 1) + '.xml', xmlDaAba(a)));
    return montarZip(arq);
  }

  /** Gera e baixa o arquivo. `nomeArquivo` sem a extensão. */
  async function baixar(nomeArquivo, abas) {
    const blob = await gerar(abas);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo.replace(/\.xlsx$/i, '') + '.xlsx';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }

  CV.xlsxw = { gerar, baixar, serialData, crc32, TIPO_XLSX };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.xlsxw;
})(typeof window !== 'undefined' ? window : globalThis);
