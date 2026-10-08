'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const N = CV.normalize;

test('matricula: aceita número, texto e float; exige 9 dígitos', () => {
  assert.deepEqual(N.matricula(100000001), { mat: '100000001', bruto: '100000001' });
  assert.equal(N.matricula('100000001').mat, '100000001');
  assert.equal(N.matricula('100000001.0').mat, '100000001');
  assert.equal(N.matricula(' 100 000 001 ').mat, '100000001');
  assert.equal(N.matricula(1234567).mat, null); // 7 dígitos: pode ser protocolo
  assert.equal(N.matricula(1234567).bruto, '1234567');
  assert.equal(N.matricula(21900000000).mat, null); // 11 dígitos (telefone)
  assert.equal(N.matricula('').mat, null);
  assert.equal(N.matricula(null).mat, null);
  assert.equal(N.matricula('abc').mat, null);
});

test('protocolo: pega só a parte numérica antes da barra', () => {
  assert.equal(N.protocolo('3000001/2026-1'), '3000001');
  assert.equal(N.protocolo(' 555123/2026-1 '), '555123');
  assert.equal(N.protocolo(null), null);
  assert.equal(N.protocolo('abc'), null);
});

test('data: ISO, dd/mm/aa, dd/mm/aaaa, Date, serial do Excel e inválidas', () => {
  assert.equal(N.data('2026-10-01'), '2026-10-01');
  assert.equal(N.data('2026-10-01T11:13:27'), '2026-10-01');
  assert.equal(N.data('05/10/26'), '2026-10-05');
  assert.equal(N.data('5/1/2026'), '2026-01-05');
  assert.equal(N.data('05/10/2026 13:07'), '2026-10-05');
  assert.equal(N.data(new Date(2026, 9, 5)), '2026-10-05');
  assert.equal(N.data(46300), '2026-10-05'); // serial do Excel
  assert.equal(N.data('31/02/2026'), null);
  assert.equal(N.data('2026-13-01'), null);
  assert.equal(N.data('texto'), null);
  assert.equal(N.data(''), null);
  assert.equal(N.data(null), null);
  assert.equal(N.data(12), null); // número pequeno não é data
});

test('serialParaIso: data, hora, fração arredondada e sistema 1904', () => {
  assert.equal(N.serialParaIso(46300), '2026-10-05');
  assert.equal(N.serialParaIso(46300.5), '2026-10-05T12:00:00');
  assert.equal(N.serialParaIso(46300 + 0.99999999), '2026-10-06'); // não vira 23:59:59
  assert.equal(N.serialParaIso(46300 - 1462, true), '2026-10-05');
});

test('chave: remove acento, pontuação, encoding quebrado e normaliza espaços', () => {
  assert.equal(N.chave('Verificação  Cadastral'), 'VERIFICACAO CADASTRAL');
  assert.equal(N.chave('SA¿DE PUBLICA'), 'SADE PUBLICA');
  assert.equal(N.chave('RAIO - X'), 'RAIO X');
  assert.equal(N.chave(null), '');
  assert.equal(N.chaveCabecalho('MATRICULA S/ DIGITO'), 'matriculasdigito');
  assert.equal(N.chaveCabecalho('Hora de início'), 'horadeinicio');
  assert.equal(N.chaveCabecalho('Pavimento:'), 'pavimento');
});

test('datas: diferença, soma, semana (segunda-feira) e dia da semana', () => {
  assert.equal(N.diasEntre('2026-03-02', '2026-03-12'), 10);
  assert.equal(N.diasEntre('2026-02-27', '2026-03-02'), 3);
  assert.equal(N.somaDias('2026-03-30', 3), '2026-04-02');
  assert.equal(N.inicioSemana('2026-10-08'), '2026-10-05'); // quinta -> segunda
  assert.equal(N.inicioSemana('2026-10-11'), '2026-10-05'); // domingo -> segunda anterior
  assert.equal(N.inicioSemana('2026-10-05'), '2026-10-05');
  assert.equal(N.diaDaSemana('2026-10-08'), 'qui');
  assert.equal(N.dataBR('2026-10-08'), '08/10/2026');
});

test('similaridade: iguais = 1, parecidos alto, diferentes baixo', () => {
  assert.equal(N.similaridade('ALTO CONSUMO', 'ALTO CONSUMO'), 1);
  assert.ok(N.similaridade('ALTO CONSUMO', 'ALTO CONSUMOO') > 0.9);
  assert.ok(N.similaridade('VENDA LNA', 'RAIO X') < 0.3);
});
