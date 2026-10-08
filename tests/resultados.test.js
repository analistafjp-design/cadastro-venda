'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

const cls = (o) => CV.resultados.classificar(o);

test('incremento e decremento de economia (com variação líquida)', () => {
  const inc = cls({ tipoOS: 'Alteração de Economia', econ: 'Incremento', de: '1 Residência', para: '3 Residências' });
  assert.deepEqual(inc.tags, ['incremento']);
  assert.equal(inc.grupo, 'resultado');
  assert.equal(inc.deltaEcon, 2);
  const dec = cls({ tipoOS: 'Alteração de Economia', econ: 'Decremento', de: '4 Residências', para: '2 Residências' });
  assert.deepEqual(dec.tags, ['decremento']);
  assert.equal(dec.deltaEcon, -2);
});

test('incremento com texto corrido "DE x P/ y"', () => {
  const r = cls({ tipoOS: 'Alteração de Economia', econ: 'Incremento', de: 'DE 5 RES. E 1 COM. P/ 6 RES. E 1 COM.', para: 'DE 5 RES. E 1 COM. P/ 6 RES. E 1 COM.' });
  assert.equal(r.deltaEcon, 1);
});

test('incremento sem variação positiva (ex.: residência -> comércio) conta o desfecho mas não soma economias', () => {
  const r = cls({ tipoOS: 'Alteração de Economia', econ: 'Incremento', de: '1 Residência', para: '1 Comércio' });
  assert.deepEqual(r.tags, ['incremento']);
  assert.equal(r.deltaEcon, null);
});

test('totalEconomias e deltaEconomias', () => {
  const { totalEconomias: t, deltaEconomias: d } = CV.resultados;
  assert.equal(t('1 Residência'), 1);
  assert.equal(t('6RES. E 1 COM.'), 7);
  assert.equal(t('18 comércios'), 18);
  assert.equal(t('3 Publicas'), 3);
  assert.equal(t('sem número'), null);
  assert.equal(d('2 Residências', '3 Residências'), 1);
  assert.equal(d('DE 2 RES. E 4 COM. P/ 2 RES. E 3 COM.', null), -1);
  assert.equal(d(null, '2 Residências'), null);
});

test('categoria, categoria+economia, titularidade, venda, tarifa social', () => {
  assert.deepEqual(cls({ tipoOS: 'Alteração de Categoria' }).tags, ['categoria']);
  assert.deepEqual(cls({ tipoOS: 'Alteração de Categoria e Economia' }).tags, ['categoria', 'economia']);
  assert.deepEqual(cls({ tipoOS: 'Alteração Cadastral Interna', tipoAlt: 'Troca de Titularidade -' }).tags, ['titularidade']);
  assert.deepEqual(cls({ tipoOS: 'VERIFICAÇÃO CADASTRAL - VISTORIA CAMPO', tratativa: 'TROCA DE TITULARIDADE' }).tags, ['titularidade']);
  assert.deepEqual(cls({ tipoOS: 'Implantação de Ligação Nova (Geração)' }).tags, ['venda']);
  assert.deepEqual(cls({ tipoOS: 'Venda Factível' }).tags, ['venda']);
  assert.deepEqual(cls({ tipoOS: 'Tarifa Social' }).tags, ['tarifa_social']);
  assert.deepEqual(cls({ tipoOS: 'Fatura Digital' }).tags, ['fatura']);
  assert.deepEqual(cls({ tipoOS: 'Alteração Cadastral Interna', tipoAlt: 'ALTERAÇÃO NA FORMA DE ENTREGA DA FATURA' }).tags, ['fatura']);
});

test('combinação: troca de titularidade + negociação de débitos', () => {
  const r = cls({ tipoOS: 'Alteração Cadastral Interna', tipoAlt: 'Troca de Titularidade - ;NEGOCIAÇÃO DE DÉBITOS' });
  assert.deepEqual(r.tags, ['titularidade', 'debitos']);
  assert.equal(r.principal, 'titularidade');
  assert.equal(r.grupo, 'resultado');
});

test('atualização cadastral não é "resultado"', () => {
  for (const alt of ['Alteração de Classificação -', 'Telefone -', 'N° de Porta', 'RG /', 'E-mail -', 'Alteração de Endereço -', 'Inclusão de Hd -', 'DUPLICIDADE', 'INATIVAÇÃO DE MATRICULA /']) {
    const r = cls({ tipoOS: 'Alteração Cadastral Interna', tipoAlt: alt });
    assert.deepEqual(r.tags, ['atualizacao'], alt);
    assert.equal(r.grupo, 'atualizacao', alt);
  }
  // sem detalhe, mas a OS é de alteração cadastral
  assert.equal(cls({ tipoOS: 'Alteração Cadastral Interna' }).grupo, 'atualizacao');
  assert.equal(cls({ tipoOS: 'VERIFICAÇÃO CADASTRAL - VISTORIA CAMPO', tratativa: 'ALTERAÇÃO CADASTRAL' }).grupo, 'atualizacao');
});

test('sem tratativa em qualquer das colunas', () => {
  for (const o of [
    { tipoOS: 'Sem Tratativa' },
    { tipoOS: 'SEM TRATATIVA' },
    { tipoOS: 'Alteração Cadastral Interna', tipoAlt: 'Sem Tratativa' },
    { tipoOS: 'VERIFICAÇÃO CADASTRAL - VISTORIA CAMPO', tratativa: 'ENCERRADO S. TRATATIVA' },
    { tipoOS: 'Corte de Água na Rede - Consumo Final' },
  ]) {
    const r = cls(o);
    assert.deepEqual(r.tags, ['sem'], JSON.stringify(o));
    assert.equal(r.grupo, 'sem');
  }
});

test('"Sem tratativa" misturado com uma alteração real prevalece a alteração', () => {
  const r = cls({ tipoOS: 'Alteração Cadastral Interna', tipoAlt: 'Alteração de Classificação - ;Sem Tratativa' });
  assert.equal(r.grupo, 'atualizacao');
  const r2 = cls({ tipoOS: 'VERIFICAÇÃO CADASTRAL - VISTORIA CAMPO', tratativa: 'ENCERRADO S. TRATATIVA;ALTERAÇÃO CADASTRAL' });
  assert.equal(r2.grupo, 'atualizacao');
});

test('entrada vazia não quebra e vira "sem"', () => {
  const r = cls({});
  assert.deepEqual(r.tags, ['sem']);
  assert.equal(r.deltaEcon, null);
});
