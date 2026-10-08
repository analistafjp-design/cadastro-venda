/*
 * pasta.js — varredura de uma PASTA de planilhas (ex.: a pasta "Cadastro e Venda"
 * sincronizada do OneDrive). Três origens, mesmo resultado: uma lista de
 * { file, caminho }:
 *   - listarHandle   : FileSystemDirectoryHandle (showDirectoryPicker; Chrome/Edge)
 *   - listarEntradas : pasta arrastada para a tela (webkitGetAsEntry)
 *   - dos arquivos de <input webkitdirectory> (Firefox/Safari), via itensDeLista
 * A lógica de "o que ler" (planejar) é independente da origem.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  const MAX_PROFUNDIDADE = 8;

  /** Nome de planilha .xlsx "de verdade": ignora temporários do Excel (~$x.xlsx) e ocultos. */
  function ehPlanilha(caminho) {
    if (!caminho) return false;
    const nome = String(caminho).split(/[\\/]/).pop();
    if (nome.startsWith('~$') || nome.startsWith('.')) return false;
    return /\.xlsx$/i.test(nome);
  }

  /** Pastas ocultas (".git", ".tmp") não são percorridas. */
  function pastaIgnorada(nome) {
    return nome.startsWith('.') || nome.startsWith('~$');
  }

  /** Identifica uma versão de arquivo: se o caminho, o tamanho e a data não mudaram, não relê. */
  function assinatura(item) {
    return item.caminho + '|' + item.file.size + '|' + item.file.lastModified;
  }

  /**
   * Decide o que ler. Mais antigos primeiro, para que, em caso de IDs repetidos,
   * o arquivo mais recente prevaleça.
   * @param itens         [{ file, caminho }]
   * @param jaCarregados  Set de assinaturas já lidas
   */
  function planejar(itens, jaCarregados) {
    const planilhas = itens.filter((i) => ehPlanilha(i.caminho));
    const ja = jaCarregados || new Set();
    const processar = planilhas.filter((i) => !ja.has(assinatura(i)));
    processar.sort(
      (a, b) => a.file.lastModified - b.file.lastModified || a.caminho.localeCompare(b.caminho, 'pt-BR')
    );
    return {
      planilhas: planilhas.length,
      processar,
      pulados: planilhas.length - processar.length,
      outros: itens.length - planilhas.length,
    };
  }

  /** Itens a partir de uma FileList de <input webkitdirectory> (ou de arquivos soltos). */
  function itensDeLista(lista) {
    return Array.from(lista).map((f) => ({ file: f, caminho: f.webkitRelativePath || f.name }));
  }

  /** Nome da pasta raiz escolhida num <input webkitdirectory>. */
  function nomeDaPasta(itens) {
    const p = itens.length ? itens[0].caminho : '';
    return p.includes('/') ? p.split('/')[0] : null;
  }

  /** Percorre um FileSystemDirectoryHandle (recursivo). Devolve { itens, erros }. */
  async function listarHandle(dir, prefixo, profundidade, saida) {
    const out = saida || { itens: [], erros: [] };
    const pre = prefixo === undefined ? dir.name + '/' : prefixo;
    const prof = profundidade || 0;
    if (prof > MAX_PROFUNDIDADE) return out;
    for await (const h of dir.values()) {
      try {
        if (h.kind === 'directory') {
          if (!pastaIgnorada(h.name)) await listarHandle(h, pre + h.name + '/', prof + 1, out);
        } else if (ehPlanilha(h.name)) {
          out.itens.push({ file: await h.getFile(), caminho: pre + h.name });
        }
      } catch (e) {
        out.erros.push({ caminho: pre + h.name, erro: e });
      }
    }
    return out;
  }

  const promessa = (fn) => new Promise((resolve, reject) => fn(resolve, reject));

  async function lerTodasEntradas(leitor) {
    const todas = [];
    for (;;) {
      const lote = await promessa((ok, err) => leitor.readEntries(ok, err));
      if (!lote.length) break;
      todas.push(...lote);
    }
    return todas;
  }

  async function listarEntrada(entrada, prefixo, profundidade, saida) {
    if (profundidade > MAX_PROFUNDIDADE) return;
    try {
      if (entrada.isDirectory) {
        if (pastaIgnorada(entrada.name)) return;
        const filhos = await lerTodasEntradas(entrada.createReader());
        for (const f of filhos) await listarEntrada(f, prefixo + entrada.name + '/', profundidade + 1, saida);
      } else if (ehPlanilha(entrada.name)) {
        const file = await promessa((ok, err) => entrada.file(ok, err));
        saida.itens.push({ file, caminho: prefixo + entrada.name });
      }
    } catch (e) {
      saida.erros.push({ caminho: prefixo + entrada.name, erro: e });
    }
  }

  /** Itens soltos/pastas arrastados (entradas de webkitGetAsEntry). */
  async function listarEntradas(entradas) {
    const saida = { itens: [], erros: [] };
    for (const e of entradas) await listarEntrada(e, '', 0, saida);
    return saida;
  }

  CV.pasta = { ehPlanilha, pastaIgnorada, assinatura, planejar, itensDeLista, nomeDaPasta, listarHandle, listarEntradas };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.pasta;
})(typeof window !== 'undefined' ? window : globalThis);
