'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const E = CV.escopo;

test('equipes do escopo: só RIORECIN/RIOVENIN listadas, sem diferenciar caixa/espaço/hífen', () => {
  for (const r of ['RIORECIN-004', 'RIORECIN-007', 'RIORECIN-013', 'RIORECIN-024', 'RIORECIN-034',
    'RIOVENIN-001', 'RIOVENIN-002', 'RIOVENIN-003', 'RIOVENIN-004', 'RIOVENIN-005']) assert.equal(E.equipeNoEscopo(r), true, r);
  assert.equal(E.equipeNoEscopo('riorecin-004'), true);
  assert.equal(E.equipeNoEscopo(' RIORECIN 004 '), true);
  assert.equal(E.equipeNoEscopo('RIORECIN-008'), false); // existe no arquivo, mas não é uma das 10
  assert.equal(E.equipeNoEscopo('RIOVCGVENIN-002'), false);
  assert.equal(E.equipeNoEscopo('RIOCERIN-020'), false);
  assert.equal(E.equipeNoEscopo('D11 - APERIBÉ. CAMBUCI. ITAOCARA. MIRCMA'), false);
  assert.equal(E.equipeNoEscopo(null), false);
});

test('as 12 cidades (e grafias alternativas); São Gonçalo e Itaboraí ficam de fora', () => {
  const nossas = ['APERIBE', 'CACHOEIRAS DE MACACU', 'CAMBUCI', 'CANTAGALO', 'CASIMIRO DE ABREU', 'CORDEIRO', 'DUAS BARRAS',
    'ITAOCARA', 'MIRACEMA', 'RIO BONITO', 'S.FCO.DO ITABAPOANA', 'S.SEBASTIAO DO ALTO'];
  assert.equal(nossas.length, 12);
  for (const c of nossas) assert.equal(E.cidadeNoEscopo(c), true, c);
  assert.equal(E.cidadeNoEscopo('São Francisco do Itabapoana'), true);
  assert.equal(E.cidadeNoEscopo('SAO SEBASTIAO DO ALTO'), true);
  assert.equal(E.cidadeNoEscopo('Aperibé'), true); // com acento
  assert.equal(E.cidadeNoEscopo('SAO GONCALO'), false);
  assert.equal(E.cidadeNoEscopo('São Gonçalo'), false);
  assert.equal(E.cidadeNoEscopo('ITABORAI'), false);
  assert.equal(E.cidadeNoEscopo(null), false);
});

test('aplicar: separa as visitas e conta o que ficou de fora', () => {
  const v = (recurso, cidade) => ({ recurso, cidade });
  const r = E.aplicar([
    v('RIORECIN-004', 'MIRACEMA'), // dentro
    v('RIOVENIN-001', 'CORDEIRO'), // dentro
    v('RIORECIN-004', 'SAO GONCALO'), // equipe nossa, cidade fora
    v('RIOCERIN-020', 'MIRACEMA'), // equipe fora
    v('RIORECIN-013', null), // sem cidade: não dá para provar que é nossa
  ]);
  assert.equal(r.dentro.length, 2);
  assert.equal(r.foraCidade, 2);
  assert.equal(r.foraEquipe, 1);
  assert.equal(r.descartadas.length, 3);
});

test('escopo vazio na regra não filtra', () => {
  const guarda = CV.regras.escopo;
  CV.regras.escopo = { equipes: [], cidades: [] };
  try {
    assert.equal(E.equipeNoEscopo('QUALQUER'), true);
    assert.equal(E.cidadeNoEscopo('QUALQUER'), true);
  } finally { CV.regras.escopo = guarda; }
});
