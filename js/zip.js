/*
 * zip.js — leitor mínimo de ZIP (suficiente para .xlsx), sem dependências.
 * Usa DecompressionStream('deflate-raw') (navegadores atuais e Node ≥ 18).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  const SIG_EOCD = 0x06054b50;
  const SIG_CEN = 0x02014b50;
  const SIG_LOC = 0x04034b50;

  /** Lê o diretório central e devolve { nomes, fluxo(nome), bytes(nome) }. */
  function abrirZip(buffer) {
    const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

    let eocd = -1;
    const minimo = Math.max(0, bytes.length - 65557);
    for (let i = bytes.length - 22; i >= minimo; i--) {
      if (dv.getUint32(i, true) === SIG_EOCD) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo inválido: não é um .xlsx (ZIP) legível.');
    const total = dv.getUint16(eocd + 10, true);
    let pos = dv.getUint32(eocd + 16, true);

    const entradas = new Map();
    const dec = new TextDecoder('utf-8');
    for (let n = 0; n < total; n++) {
      if (dv.getUint32(pos, true) !== SIG_CEN) throw new Error('Arquivo ZIP corrompido (diretório central).');
      const metodo = dv.getUint16(pos + 10, true);
      const tamComp = dv.getUint32(pos + 20, true);
      const tamNome = dv.getUint16(pos + 28, true);
      const tamExtra = dv.getUint16(pos + 30, true);
      const tamCom = dv.getUint16(pos + 32, true);
      const offLocal = dv.getUint32(pos + 42, true);
      const nome = dec.decode(bytes.subarray(pos + 46, pos + 46 + tamNome));
      entradas.set(nome, { metodo, tamComp, offLocal });
      pos += 46 + tamNome + tamExtra + tamCom;
    }

    function dadosCompactados(nome) {
      const e = entradas.get(nome);
      if (!e) return null;
      if (dv.getUint32(e.offLocal, true) !== SIG_LOC) throw new Error('Arquivo ZIP corrompido (cabeçalho local).');
      const ini = e.offLocal + 30 + dv.getUint16(e.offLocal + 26, true) + dv.getUint16(e.offLocal + 28, true);
      return { e, dados: bytes.subarray(ini, ini + e.tamComp) };
    }

    /** ReadableStream de Uint8Array já descomprimido, ou null se a entrada não existe. */
    function fluxo(nome) {
      const c = dadosCompactados(nome);
      if (!c) return null;
      const origem = new ReadableStream({
        start(ctrl) { ctrl.enqueue(c.dados); ctrl.close(); },
      });
      if (c.e.metodo === 0) return origem;
      if (c.e.metodo !== 8) throw new Error('Compressão ZIP não suportada (método ' + c.e.metodo + ').');
      return origem.pipeThrough(new DecompressionStream('deflate-raw'));
    }

    return { nomes: Array.from(entradas.keys()), existe: (n) => entradas.has(n), fluxo };
  }

  /**
   * Lê um fluxo de bytes como texto UTF-8, entregando pedaços ao callback
   * (assim planilhas enormes nunca ficam inteiras na memória). Se o callback
   * devolver true, a leitura é interrompida. A cada alguns pedaços devolve o
   * controle ao navegador para a tela não congelar.
   */
  async function lerTexto(fluxo, aoPedaco) {
    const leitor = fluxo.getReader();
    const dec = new TextDecoder('utf-8');
    let n = 0;
    for (;;) {
      const { done, value } = await leitor.read();
      if (done) break;
      if (aoPedaco(dec.decode(value, { stream: true })) === true) {
        await leitor.cancel();
        return;
      }
      if (++n % 4 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    const resto = dec.decode();
    if (resto) aoPedaco(resto);
  }

  async function textoCompleto(zip, nome) {
    const f = zip.fluxo(nome);
    if (!f) return null;
    let s = '';
    await lerTexto(f, (p) => { s += p; });
    return s;
  }

  CV.zip = { abrirZip, lerTexto, textoCompleto };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.zip;
})(typeof window !== 'undefined' ? window : globalThis);
