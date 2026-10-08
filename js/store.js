/*
 * store.js — guarda os registros já limpos no próprio navegador (IndexedDB),
 * para o acompanhamento diário ir se acumulando sem recarregar tudo.
 * Nada sai do computador. Se o navegador não permitir (aba anônima etc.), o
 * app continua funcionando só em memória.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});

  const NOME_BD = 'cadastro-venda';
  const VERSAO = 1;
  const STORES = { atividades: 'id', resultados: 'id', arquivos: 'seq' };

  let dbPromessa = null;

  function abrir() {
    if (dbPromessa) return dbPromessa;
    dbPromessa = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB indisponível'));
      let req;
      try { req = indexedDB.open(NOME_BD, VERSAO); } catch (e) { return reject(e); }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const [nome, chave] of Object.entries(STORES)) {
          if (!db.objectStoreNames.contains(nome)) db.createObjectStore(nome, { keyPath: chave, autoIncrement: nome === 'arquivos' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error('Falha ao abrir o armazenamento local'));
      req.onblocked = () => reject(new Error('Armazenamento local bloqueado por outra aba'));
    });
    return dbPromessa;
  }

  function transacao(db, stores, modo, fn) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, modo);
      let saida;
      tx.oncomplete = () => resolve(saida);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error || new Error('Transação cancelada'));
      saida = fn(tx);
    });
  }

  function todos(tx, nome) {
    return new Promise((resolve, reject) => {
      const r = tx.objectStore(nome).getAll();
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  }

  /** Lê tudo o que está salvo. */
  async function carregar() {
    const db = await abrir();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(Object.keys(STORES), 'readonly');
      const out = {};
      Promise.all(Object.keys(STORES).map((n) => todos(tx, n).then((v) => { out[n] = v; })))
        .then(() => resolve(out), reject);
    });
  }

  /** Grava (ou substitui, pela chave) os registros de um store. */
  async function salvar(nome, registros) {
    const db = await abrir();
    await transacao(db, [nome], 'readwrite', (tx) => {
      const s = tx.objectStore(nome);
      for (const r of registros) s.put(r);
    });
  }

  async function limpar() {
    const db = await abrir();
    await transacao(db, Object.keys(STORES), 'readwrite', (tx) => {
      for (const n of Object.keys(STORES)) tx.objectStore(n).clear();
    });
  }

  CV.store = { abrir, carregar, salvar, limpar };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.store;
})(typeof window !== 'undefined' ? window : globalThis);
