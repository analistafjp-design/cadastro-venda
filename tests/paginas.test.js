'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
require('./helpers');
const P = CV.paginas;

test('arquivo de VCG = "VCG" em qualquer parte do NOME do arquivo (as pastas não contam)', () => {
  for (const ok of ['Resultados VCG.xlsx', 'resultados vcg.xlsx', 'Resultados_VCG_2026.xlsx', 'ResultadosVCG.xlsx', 'Cadastro e Venda/2026/Resultados VCG.xlsx'])
    assert.equal(P.ehVcg(ok), true, ok);
  for (const nao of ['Resultados - 2026.xlsx', 'Cadastrais - Interior.xlsx', 'Atividades-INTERIOR_05_10_26.xlsx', 'VCG/Resultados - 2026.xlsx', 'Pasta VCG/Atividades.xlsx', '', null])
    assert.equal(P.ehVcg(nao), false, String(nao));
});

test('página Interior: deixa de lado o arquivo de VCG (antes de abrir), lê o resto', () => {
  assert.match(P.interior.recusa('Cadastro e Venda/Resultados VCG.xlsx', null), /VCG/);
  assert.match(P.interior.recusa('Resultados VCG.xlsx', 'resultados'), /VCG/);
  assert.match(P.interior.recusa('Atividades VCG.xlsx', 'atividades'), /VCG/);
  for (const nome of ['Resultados - 2026.xlsx', 'Cadastrais - Interior.xlsx', 'Atividades-INTERIOR_05_10_26.xlsx'])
    for (const tipo of [null, 'atividades', 'resultados']) assert.equal(P.interior.recusa(nome, tipo), null, nome + ' ' + tipo);
});

test('página VCG: Resultados só com "VCG" no nome; Atividades de qualquer arquivo', () => {
  assert.equal(P.vcg.recusa('Resultados VCG.xlsx', null), null);
  assert.equal(P.vcg.recusa('Resultados VCG.xlsx', 'resultados'), null);
  assert.match(P.vcg.recusa('Resultados - 2026.xlsx', 'resultados'), /VCG/);
  assert.equal(P.vcg.recusa('Resultados - 2026.xlsx', null), null); // ainda não se sabe o tipo: abre o cabeçalho
  for (const nome of ['Atividades-INTERIOR_05_10_26.xlsx', 'Cadastrais - Interior.xlsx', 'Atividades VCG.xlsx'])
    assert.equal(P.vcg.recusa(nome, 'atividades'), null, nome);
});

test('cada página tem o seu banco no navegador, e só a VCG aproveita a pasta da outra', () => {
  assert.notEqual(P.interior.banco, P.vcg.banco);
  assert.equal(P.interior.banco, 'cadastro-venda'); // o banco que já existia: ninguém perde dados
  assert.equal(P.vcg.herdaPastaDe, P.interior.banco);
  assert.equal(P.interior.herdaPastaDe, null);
  assert.notEqual(P.interior.prefixoArquivo, P.vcg.prefixoArquivo);
});

test('a página sem data-pagina é a do interior; o body decide qual abre', () => {
  assert.equal(P.atual({ body: { dataset: {} } }), P.interior);
  assert.equal(P.atual({ body: { dataset: { pagina: 'vcg' } } }), P.vcg);
  assert.equal(P.atual({ body: { dataset: { pagina: 'qualquer' } } }), P.interior);
  assert.equal(P.atual(null), P.interior);
});

test('escopo do VCG: só RIOVCGVENIN-001, -002 e -004, em qualquer cidade', () => {
  const guarda = CV.regras.escopo;
  CV.regras.escopo = P.vcg.escopo;
  try {
    for (const r of ['RIOVCGVENIN-001', 'RIOVCGVENIN-002', 'RIOVCGVENIN-004', ' riovcgvenin 002 '])
      assert.equal(CV.escopo.equipeNoEscopo(r), true, r);
    for (const r of ['RIOVCGVENIN-003', 'RIOVCGEXTIN-001', 'RIOVCGCALTIN-001', 'RIORECIN-004', 'RIOVENIN-001', null])
      assert.equal(CV.escopo.equipeNoEscopo(r), false, String(r));
    for (const c of ['RIO BONITO', 'QUALQUER LUGAR', null]) assert.equal(CV.escopo.cidadeNoEscopo(c), true, String(c));
    const r = CV.escopo.aplicar([{ recurso: 'RIOVCGVENIN-001', cidade: 'X' }, { recurso: 'RIORECIN-004', cidade: 'MIRACEMA' }]);
    assert.equal(r.dentro.length, 1);
    assert.equal(r.foraEquipe, 1);
    assert.equal(r.foraCidade, 0);
  } finally { CV.regras.escopo = guarda; }
});

test('página VCG guarda só atividades das suas equipes (inclusive as que não são visita); a do interior guarda visitas de todas', () => {
  const linha = (rec, tipo, id) => ({ recurso: rec, tipo, id, data: '2026-10-05', mat: '100000001', status: 'Finalizada' });
  const linhas = [
    linha('RIOVCGVENIN-001', 'Verificação Cadastral', 1), // visita do VCG
    linha('RIOVCGVENIN-001', 'Ligação de Água', 2), // serviço do VCG (entra nos tempos)
    linha('RIORECIN-004', 'Verificação Cadastral', 3), // visita do interior
    linha('RIOVCGEXTIN-001', 'Ligação de Água', 4), // equipe de fora, outro serviço
    linha('RIOVCGEXTIN-001', 'Verificação Cadastral', 5), // equipe de fora, visita
  ];
  const guarda = CV.regras.escopo;
  CV.regras.escopo = P.vcg.escopo;
  try {
    const vcg = CV.dados.limparAtividades(linhas, { soEscopo: true });
    assert.deepEqual(vcg.limpas.map((a) => a.id).sort(), ['1', '2']);
    assert.equal(vcg.descartes.outrosServicos, 3);
    const inter = CV.dados.limparAtividades(linhas); // sem soEscopo: visitas de outras equipes ficam (servem para cruzar)
    assert.deepEqual(inter.limpas.map((a) => a.id).sort(), ['1', '2', '3', '5']);
  } finally { CV.regras.escopo = guarda; }
});

test('index.html e vcg.html têm os mesmos elementos e scripts; só mudam textos, a página e o link', () => {
  const ler = (n) => fs.readFileSync(path.join(__dirname, '..', n), 'utf8');
  const [a, b] = [ler('index.html'), ler('vcg.html')];
  const ids = (h) => Array.from(h.matchAll(/\sid="([^"]+)"/g)).map((m) => m[1]);
  assert.deepEqual(ids(a), ids(b));
  const scripts = (h) => Array.from(h.matchAll(/<script src="([^"]+)"/g)).map((m) => m[1]);
  assert.deepEqual(scripts(a), scripts(b));
  assert.ok(scripts(a).indexOf('js/paginas.js') > -1 && scripts(a).indexOf('js/paginas.js') < scripts(a).indexOf('js/app.js'));
  assert.match(a, /<body data-pagina="interior">/);
  assert.match(b, /<body data-pagina="vcg">/);
  // o botão de cada página leva à outra
  assert.match(a, /id="btn-outra" href="vcg\.html"/);
  assert.match(b, /id="btn-outra" href="index\.html"/);
  assert.match(a, /<title>Cadastro e Venda Interior<\/title>/);
  assert.match(b, /<title>Cadastro e Venda VCG<\/title>/);
  assert.match(b, /Resultados VCG/);
});
