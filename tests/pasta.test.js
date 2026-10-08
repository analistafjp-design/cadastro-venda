'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const P = CV.pasta;

// ---- pastas falsas que imitam as APIs do navegador ----
const arq = (name, lastModified = 1000, size = 10) => ({ name, size, lastModified });

function fakeHandle(nome, filhos) {
  return {
    kind: 'directory',
    name: nome,
    async *values() { for (const f of filhos) yield f; },
  };
}
const fakeFile = (nome, file, falha) => ({
  kind: 'file',
  name: nome,
  async getFile() { if (falha) throw new Error(falha); return file || arq(nome); },
});

function fakeEntrada(nome, filhos, falha) {
  if (!filhos) {
    return { isFile: true, isDirectory: false, name: nome, file: (ok, err) => (falha ? err(new Error(falha)) : ok(arq(nome))) };
  }
  return {
    isFile: false,
    isDirectory: true,
    name: nome,
    createReader() {
      let lido = false; // readEntries devolve em lotes e [] no fim
      return { readEntries: (ok) => { if (lido) ok([]); else { lido = true; ok(filhos); } } };
    },
  };
}

test('ehPlanilha: só .xlsx; ignora temporários do Excel, ocultos e outros formatos', () => {
  assert.equal(P.ehPlanilha('Atividades.xlsx'), true);
  assert.equal(P.ehPlanilha('Pasta/Sub/Resultados - 2026.XLSX'), true);
  assert.equal(P.ehPlanilha('Pasta\\Sub\\x.xlsx'), true); // caminho do Windows
  assert.equal(P.ehPlanilha('~$Atividades.xlsx'), false); // arquivo de bloqueio do Excel aberto
  assert.equal(P.ehPlanilha('Pasta/~$Atividades.xlsx'), false);
  assert.equal(P.ehPlanilha('.oculto.xlsx'), false);
  assert.equal(P.ehPlanilha('dados.xls'), false);
  assert.equal(P.ehPlanilha('dados.csv'), false);
  assert.equal(P.ehPlanilha('Atividades.xlsx.tmp'), false);
  assert.equal(P.ehPlanilha(''), false);
  assert.equal(P.ehPlanilha(null), false);
});

test('planejar: pula o que já foi lido, ordena do mais antigo ao mais novo e conta o resto', () => {
  const itens = [
    { file: arq('c.xlsx', 3000), caminho: 'P/c.xlsx' },
    { file: arq('a.xlsx', 1000), caminho: 'P/a.xlsx' },
    { file: arq('b.xlsx', 2000), caminho: 'P/b.xlsx' },
    { file: arq('~$a.xlsx', 5000), caminho: 'P/~$a.xlsx' },
    { file: arq('leia-me.txt', 1), caminho: 'P/leia-me.txt' },
  ];
  const ja = new Set([P.assinatura(itens[1])]); // a.xlsx já carregado, igual
  const plano = P.planejar(itens, ja);
  assert.deepEqual(plano.processar.map((i) => i.caminho), ['P/b.xlsx', 'P/c.xlsx']);
  assert.equal(plano.planilhas, 3);
  assert.equal(plano.pulados, 1);
  assert.equal(plano.outros, 2);
});

test('planejar: arquivo alterado (nova data ou tamanho) é lido de novo', () => {
  const antigo = { file: arq('r.xlsx', 1000, 10), caminho: 'P/r.xlsx' };
  const ja = new Set([P.assinatura(antigo)]);
  assert.equal(P.planejar([{ file: arq('r.xlsx', 1000, 10), caminho: 'P/r.xlsx' }], ja).processar.length, 0);
  assert.equal(P.planejar([{ file: arq('r.xlsx', 2000, 10), caminho: 'P/r.xlsx' }], ja).processar.length, 1); // data
  assert.equal(P.planejar([{ file: arq('r.xlsx', 1000, 99), caminho: 'P/r.xlsx' }], ja).processar.length, 1); // tamanho
  assert.equal(P.planejar([{ file: arq('r.xlsx', 1000, 10), caminho: 'Outra/r.xlsx' }], ja).processar.length, 1); // outro caminho
});

test('itensDeLista e nomeDaPasta (input webkitdirectory)', () => {
  const lista = [
    Object.assign(arq('a.xlsx'), { webkitRelativePath: 'Cadastro e Venda/a.xlsx' }),
    Object.assign(arq('b.xlsx'), { webkitRelativePath: 'Cadastro e Venda/2026/b.xlsx' }),
  ];
  const itens = P.itensDeLista(lista);
  assert.deepEqual(itens.map((i) => i.caminho), ['Cadastro e Venda/a.xlsx', 'Cadastro e Venda/2026/b.xlsx']);
  assert.equal(P.nomeDaPasta(itens), 'Cadastro e Venda');
  assert.equal(P.nomeDaPasta(P.itensDeLista([arq('solto.xlsx')])), null);
  assert.equal(P.nomeDaPasta([]), null);
});

test('listarHandle: percorre subpastas, ignora temporários/ocultos e registra erros sem parar', async () => {
  const raiz = fakeHandle('Cadastro e Venda', [
    fakeFile('Atividades-05_10.xlsx'),
    fakeFile('~$Atividades-05_10.xlsx'),
    fakeFile('notas.txt'),
    fakeHandle('2026', [fakeFile('Resultados.xlsx'), fakeHandle('Antigos', [fakeFile('jan.xlsx')])]),
    fakeHandle('.cache', [fakeFile('lixo.xlsx')]),
    fakeFile('bloqueado.xlsx', null, 'arquivo em uso'),
  ]);
  const r = await P.listarHandle(raiz);
  assert.deepEqual(r.itens.map((i) => i.caminho).sort(), [
    'Cadastro e Venda/2026/Antigos/jan.xlsx',
    'Cadastro e Venda/2026/Resultados.xlsx',
    'Cadastro e Venda/Atividades-05_10.xlsx',
  ]);
  assert.equal(r.erros.length, 1);
  assert.equal(r.erros[0].caminho, 'Cadastro e Venda/bloqueado.xlsx');
});

test('listarEntradas: pasta arrastada (leitura em lotes) com subpastas', async () => {
  const pasta = fakeEntrada('Cadastro e Venda', [
    fakeEntrada('Atividades.xlsx'),
    fakeEntrada('~$Atividades.xlsx'),
    fakeEntrada('2026', [fakeEntrada('Resultados.xlsx'), fakeEntrada('quebrado.xlsx', null, 'sem permissão')]),
  ]);
  const solto = fakeEntrada('Avulso.xlsx');
  const r = await P.listarEntradas([pasta, solto]);
  assert.deepEqual(r.itens.map((i) => i.caminho).sort(), [
    'Avulso.xlsx',
    'Cadastro e Venda/2026/Resultados.xlsx',
    'Cadastro e Venda/Atividades.xlsx',
  ]);
  assert.equal(r.erros.length, 1);
});

test('profundidade máxima evita laço infinito em pastas muito aninhadas', async () => {
  let h = fakeHandle('fim', [fakeFile('fundo.xlsx')]);
  for (let i = 0; i < 20; i++) h = fakeHandle('n' + i, [h]);
  const r = await P.listarHandle(h);
  assert.equal(r.itens.length, 0); // passou do limite: não desce
});
