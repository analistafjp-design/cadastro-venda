/*
 * xlsx.js — leitor de .xlsx sem dependências externas.
 *
 *  - lê a planilha em fluxo (nunca carrega o XML inteiro na memória);
 *  - só materializa as colunas pedidas, localizadas pelo NOME do cabeçalho
 *    (sem acento/caixa/pontuação), então funciona tanto com o arquivo "leve"
 *    quanto com a exportação completa de ~300 colunas;
 *  - datas viram texto ISO ('2026-10-01' ou '2026-10-01T11:13:27').
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  // ---------- utilidades XML ----------

  const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

  function decodificarXml(s) {
    if (s.indexOf('&') >= 0) {
      s = s.replace(/&(#x[0-9a-fA-F]+|#\d+|amp|lt|gt|quot|apos);/g, (m, e) => {
        if (e[0] === '#') {
          const cod = e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
          return Number.isFinite(cod) ? String.fromCodePoint(cod) : m;
        }
        return ENTIDADES[e];
      });
    }
    if (s.indexOf('_x') >= 0) {
      s = s.replace(/_x([0-9A-Fa-f]{4})_/g, (m, h) => String.fromCharCode(parseInt(h, 16)));
    }
    return s;
  }

  function atributo(tag, nome) {
    const re = new RegExp('\\s' + nome + '="([^"]*)"');
    const m = re.exec(tag);
    return m ? decodificarXml(m[1]) : null;
  }

  function colunaParaIndice(letras) {
    let n = 0;
    for (let i = 0; i < letras.length; i++) n = n * 26 + (letras.charCodeAt(i) - 64);
    return n;
  }

  // ---------- estilos (para reconhecer datas) ----------

  const FMT_DATA_BUILTIN = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 27, 28, 29, 30, 31, 32, 33, 34, 35, 36, 45, 46, 47, 50, 51, 52, 53, 54, 55, 56, 57, 58]);

  function formatoEhData(codigo) {
    const limpo = codigo.replace(/"[^"]*"/g, '').replace(/\[[^\]]*\]/g, '').replace(/\\./g, '');
    return /[dmyhs]/i.test(limpo) && !/^general$/i.test(limpo.trim());
  }

  function lerEstilos(xml) {
    const ehData = [];
    if (!xml) return ehData;
    const custom = new Map();
    const rxFmt = /<numFmt\b[^>]*>/g;
    let m;
    while ((m = rxFmt.exec(xml))) {
      const id = atributo(m[0], 'numFmtId');
      const cod = atributo(m[0], 'formatCode');
      if (id !== null && cod !== null) custom.set(Number(id), cod);
    }
    const ini = xml.indexOf('<cellXfs');
    if (ini < 0) return ehData;
    const fim = xml.indexOf('</cellXfs>', ini);
    const bloco = xml.slice(ini, fim < 0 ? xml.length : fim);
    const rxXf = /<xf\b[^>]*>/g;
    while ((m = rxXf.exec(bloco))) {
      const id = Number(atributo(m[0], 'numFmtId') || 0);
      ehData.push(custom.has(id) ? formatoEhData(custom.get(id)) : FMT_DATA_BUILTIN.has(id));
    }
    return ehData;
  }

  // ---------- strings compartilhadas ----------

  function lerStringsCompartilhadas(xml) {
    const out = [];
    if (!xml) return out;
    let i = 0;
    for (;;) {
      i = xml.indexOf('<si', i);
      if (i < 0) break;
      const c = xml.charCodeAt(i + 3);
      if (c !== 62 && c !== 32 && c !== 47) { i += 3; continue; } // ignora <sst
      const fimTag = xml.indexOf('>', i);
      if (xml.charCodeAt(fimTag - 1) === 47) { out.push(''); i = fimTag + 1; continue; }
      const fim = xml.indexOf('</si>', fimTag);
      let corpo = xml.slice(fimTag + 1, fim);
      if (corpo.indexOf('<rPh') >= 0) corpo = corpo.replace(/<rPh[\s\S]*?<\/rPh>/g, '');
      let texto = '';
      const rx = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let m;
      while ((m = rx.exec(corpo))) texto += m[1];
      out.push(decodificarXml(texto));
      i = fim + 5;
    }
    return out;
  }

  // ---------- células ----------

  function conteudoTag(corpo, tag) {
    const ini = corpo.indexOf('<' + tag);
    if (ini < 0) return null;
    const c = corpo.charCodeAt(ini + tag.length + 1);
    if (c !== 62 && c !== 32 && c !== 47) return null;
    const fimAbre = corpo.indexOf('>', ini);
    if (corpo.charCodeAt(fimAbre - 1) === 47) return '';
    const fim = corpo.indexOf('</' + tag + '>', fimAbre);
    return fim < 0 ? null : corpo.slice(fimAbre + 1, fim);
  }

  function valorCelula(tipo, estilo, corpo, ctx) {
    if (!corpo) return null;
    if (tipo === 'inlineStr') {
      const is = conteudoTag(corpo, 'is');
      if (is === null) return null;
      const limpo = is.indexOf('<rPh') >= 0 ? is.replace(/<rPh[\s\S]*?<\/rPh>/g, '') : is;
      let t = '';
      const rx = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
      let m;
      while ((m = rx.exec(limpo))) t += m[1];
      return decodificarXml(t);
    }
    const v = conteudoTag(corpo, 'v');
    if (v === null || v === '') return null;
    switch (tipo) {
      case 's': return ctx.strings[Number(v)] !== undefined ? ctx.strings[Number(v)] : null;
      case 'str': return decodificarXml(v);
      case 'b': return v === '1';
      case 'e': return null;
      case 'd': return v;
      default: {
        const n = Number(v);
        if (!Number.isFinite(n)) return decodificarXml(v);
        if (estilo !== null && ctx.ehData[estilo]) {
          if (n >= 0 && n < 1) {
            const iso = CV.normalize.serialParaIso(n, ctx.sistema1904);
            return iso.indexOf('T') >= 0 ? iso.slice(iso.indexOf('T') + 1) : '00:00:00';
          }
          return CV.normalize.serialParaIso(n, ctx.sistema1904);
        }
        return n;
      }
    }
  }

  /** Lê as células de uma <row>; se `quero` (Set de colunas) existir, só devolve essas. */
  function lerCelulas(corpoLinha, ctx, quero) {
    const celulas = new Map();
    let i = 0;
    for (;;) {
      i = corpoLinha.indexOf('<c', i);
      if (i < 0) break;
      const c = corpoLinha.charCodeAt(i + 2);
      if (c !== 32 && c !== 62 && c !== 47) { i += 2; continue; } // <col, <cellXfs...
      const fimTag = corpoLinha.indexOf('>', i);
      const fechaSozinha = corpoLinha.charCodeAt(fimTag - 1) === 47;
      const attrs = corpoLinha.slice(i + 2, fechaSozinha ? fimTag - 1 : fimTag);
      let corpo = '';
      let prox;
      if (fechaSozinha) {
        prox = fimTag + 1;
      } else {
        const fimC = corpoLinha.indexOf('</c>', fimTag);
        corpo = corpoLinha.slice(fimTag + 1, fimC < 0 ? corpoLinha.length : fimC);
        prox = fimC < 0 ? corpoLinha.length : fimC + 4;
      }
      i = prox;
      if (!corpo) continue;
      const ri = attrs.indexOf(' r="');
      if (ri < 0) continue;
      let k = ri + 4;
      let letras = '';
      for (;;) {
        const cc = attrs.charCodeAt(k);
        if (cc >= 65 && cc <= 90) { letras += attrs[k]; k++; } else break;
      }
      const col = colunaParaIndice(letras);
      if (quero && !quero.has(col)) continue;
      const tm = / t="([^"]*)"/.exec(attrs);
      const sm = / s="(\d+)"/.exec(attrs);
      const val = valorCelula(tm ? tm[1] : 'n', sm ? Number(sm[1]) : null, corpo, ctx);
      if (val !== null && val !== '') celulas.set(col, val);
    }
    return celulas;
  }

  // ---------- planilha ----------

  function lerRelacionamentos(xml) {
    const rels = [];
    if (!xml) return rels;
    const rx = /<Relationship\b[^>]*>/g;
    let m;
    while ((m = rx.exec(xml))) {
      rels.push({ id: atributo(m[0], 'Id'), tipo: atributo(m[0], 'Type') || '', alvo: atributo(m[0], 'Target') });
    }
    return rels;
  }

  /** Resolve um alvo de relacionamento ('worksheets/s1.xml', '../x', '/xl/y') para o caminho no ZIP. */
  function resolverCaminho(base, alvo) {
    if (alvo.charAt(0) === '/') return alvo.slice(1);
    const partes = (base + alvo).split('/');
    const out = [];
    for (const p of partes) {
      if (p === '..') out.pop();
      else if (p !== '.' && p !== '') out.push(p);
    }
    return out.join('/');
  }

  /**
   * Localiza workbook, aba, estilos e strings compartilhadas pelos .rels
   * (o padrão OPC). Há exportações de sistemas que gravam as partes na raiz do
   * ZIP, sem a pasta "xl/", por isso nada é presumido.
   */
  async function localizarPartes(zip, aba) {
    let wbCaminho = null;
    const raizRels = lerRelacionamentos(await CV.zip.textoCompleto(zip, '_rels/.rels'));
    const doc = raizRels.find((r) => /\/officeDocument$/.test(r.tipo));
    if (doc) wbCaminho = resolverCaminho('', doc.alvo);
    if (!wbCaminho || !zip.existe(wbCaminho)) {
      wbCaminho = ['xl/workbook.xml', 'workbook.xml'].find((c) => zip.existe(c)) || null;
    }
    if (!wbCaminho) throw new Error('Arquivo inválido: não parece uma planilha do Excel (.xlsx).');

    const barra = wbCaminho.lastIndexOf('/');
    const dir = barra >= 0 ? wbCaminho.slice(0, barra + 1) : '';
    const nomeWb = wbCaminho.slice(barra + 1);
    const wbXml = await CV.zip.textoCompleto(zip, wbCaminho);
    const rels = lerRelacionamentos(await CV.zip.textoCompleto(zip, dir + '_rels/' + nomeWb + '.rels'));
    const porId = new Map(rels.map((r) => [r.id, r]));
    const porTipo = (t) => {
      const r = rels.find((x) => new RegExp('/' + t + '$').test(x.tipo));
      return r ? resolverCaminho(dir, r.alvo) : null;
    };

    const abas = [];
    const rxS = /<sheet\b[^>]*>/g;
    let m;
    while ((m = rxS.exec(wbXml))) abas.push({ nome: atributo(m[0], 'name'), rid: atributo(m[0], 'r:id') });
    if (!abas.length) throw new Error('Planilha sem abas.');
    let alvo = abas[0];
    if (typeof aba === 'number') alvo = abas[aba] || abas[0];
    else if (typeof aba === 'string') {
      const k = CV.normalize.chave(aba);
      alvo = abas.find((a) => CV.normalize.chave(a.nome) === k) || abas[0];
    }
    const rel = porId.get(alvo.rid);
    if (!rel) throw new Error('Não encontrei os dados da aba "' + alvo.nome + '".');

    return {
      wbXml,
      nomeAba: alvo.nome,
      caminhoAba: resolverCaminho(dir, rel.alvo),
      estilos: porTipo('styles') || dir + 'styles.xml',
      strings: porTipo('sharedStrings') || dir + 'sharedStrings.xml',
    };
  }

  /**
   * Lê uma planilha.
   * @param buffer ArrayBuffer/Uint8Array do .xlsx
   * @param opcoes {
   *   aba: índice ou nome (padrão 0),
   *   colunas: { campo: ['Nome da coluna', 'Outro nome aceito'] },
   *   soCabecalho: true para parar assim que o cabeçalho for identificado,
   *   aoProgresso: (linhasLidas) => void
   * }
   * @returns { aba, cabecalho: string[], campos: {campo: nomeNoArquivo}, faltando: string[], linhas: object[] }
   */
  async function lerPlanilha(buffer, opcoes) {
    const op = opcoes || {};
    const N = CV.normalize;
    const zip = CV.zip.abrirZip(buffer);
    const partes = await localizarPartes(zip, op.aba === undefined ? 0 : op.aba);
    const aba = { nome: partes.nomeAba, caminho: partes.caminhoAba };
    const ctx = {
      sistema1904: /<workbookPr\b[^>]*date1904="(1|true)"/.test(partes.wbXml),
      ehData: lerEstilos(await CV.zip.textoCompleto(zip, partes.estilos)),
      strings: lerStringsCompartilhadas(await CV.zip.textoCompleto(zip, partes.strings)),
    };

    const aliasPorCampo = op.colunas || {};
    const campos = Object.keys(aliasPorCampo);
    const chavesAlias = {};
    for (const c of campos) chavesAlias[c] = aliasPorCampo[c].map((a) => N.chaveCabecalho(a));

    const MAX_CANDIDATOS = 10;
    const candidatos = []; // primeiras linhas não vazias (completas), para achar o cabeçalho
    let cabecalhoDecidido = false;
    let cabecalho = [];
    let colParaCampo = new Map();
    let quero = null;
    const camposAchados = {};
    const linhas = [];
    let lidas = 0;

    function pontuar(celulas) {
      const nomes = new Set(Array.from(celulas.values()).map((v) => N.chaveCabecalho(v)));
      let pts = 0;
      for (const c of campos) if (chavesAlias[c].some((a) => nomes.has(a))) pts++;
      return pts;
    }

    function decidirCabecalho() {
      let melhor = 0;
      let melhorPts = -1;
      candidatos.forEach((cand, idx) => {
        const pts = campos.length ? pontuar(cand.celulas) : 0;
        if (pts > melhorPts) { melhorPts = pts; melhor = idx; }
      });
      const cab = candidatos[melhor];
      const maxCol = Math.max(0, ...cab.celulas.keys());
      cabecalho = new Array(maxCol).fill('');
      for (const [col, v] of cab.celulas) cabecalho[col - 1] = String(v).trim();
      colParaCampo = new Map();
      const chavesCol = cabecalho.map((h) => N.chaveCabecalho(h));
      for (const c of campos) {
        for (const alias of chavesAlias[c]) {
          const idx = chavesCol.indexOf(alias);
          if (idx >= 0) {
            colParaCampo.set(idx + 1, c);
            camposAchados[c] = cabecalho[idx];
            break;
          }
        }
      }
      quero = new Set(colParaCampo.keys());
      cabecalhoDecidido = true;
      // linhas de dados que já estavam nos candidatos (depois do cabeçalho)
      for (let k = melhor + 1; k < candidatos.length; k++) registrar(candidatos[k].celulas);
      candidatos.length = 0;
    }

    function registrar(celulas) {
      if (!op.colunas) return;
      const obj = {};
      let algum = false;
      for (const [col, campo] of colParaCampo) {
        const v = celulas.get(col);
        if (v !== undefined) { obj[campo] = v; algum = true; }
      }
      if (algum) {
        linhas.push(obj);
        lidas++;
        if (op.aoProgresso && lidas % 2000 === 0) op.aoProgresso(lidas);
      }
    }

    function aoLinha(celulasCompletas, celulasFiltradas) {
      if (!cabecalhoDecidido) {
        if (celulasCompletas.size === 0) return false;
        candidatos.push({ celulas: celulasCompletas });
        if (candidatos.length >= MAX_CANDIDATOS) decidirCabecalho();
        return op.soCabecalho && cabecalhoDecidido;
      }
      registrar(celulasFiltradas);
      return false;
    }

    let resto = '';
    let parar = false;

    function processar(texto) {
      resto += texto;
      let ultimo = 0;
      for (;;) {
        const ini = resto.indexOf('<row', ultimo);
        if (ini < 0) break;
        const fimAbre = resto.indexOf('>', ini);
        if (fimAbre < 0) break;
        if (resto.charCodeAt(fimAbre - 1) === 47) { ultimo = fimAbre + 1; continue; } // <row .../>
        const fim = resto.indexOf('</row>', fimAbre);
        if (fim < 0) break;
        const corpo = resto.slice(fimAbre + 1, fim);
        ultimo = fim + 6;
        const completas = cabecalhoDecidido ? null : lerCelulas(corpo, ctx, null);
        const filtradas = cabecalhoDecidido ? lerCelulas(corpo, ctx, quero) : null;
        if (aoLinha(completas, filtradas)) { parar = true; break; }
      }
      resto = resto.slice(ultimo);
      return parar;
    }

    const fluxo = zip.fluxo(aba.caminho);
    if (!fluxo) throw new Error('Não consegui abrir a aba "' + aba.nome + '".');
    await CV.zip.lerTexto(fluxo, processar);
    if (!cabecalhoDecidido && candidatos.length) decidirCabecalho();
    if (!cabecalhoDecidido) throw new Error('A aba "' + aba.nome + '" está vazia.');

    const faltando = campos.filter((c) => !(c in camposAchados));
    return { aba: aba.nome, cabecalho, campos: camposAchados, faltando, linhas };
  }

  CV.xlsx = { lerPlanilha, decodificarXml, formatoEhData, lerStringsCompartilhadas, lerEstilos };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.xlsx;
})(typeof window !== 'undefined' ? window : globalThis);
