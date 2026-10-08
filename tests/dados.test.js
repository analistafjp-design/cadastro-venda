'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

test('limpar atividades: normaliza matrícula, data, quantidade de economias e descarta o que não serve', () => {
  const r = CV.dados.limparAtividades([
    { id: '90000001', mat: '100000101', data: '05/10/26', recurso: ' RIORECIN-004 ', status: 'Finalizada', tipo: 'Verificação Cadastral', qtdEcon: '04. ECON OU MAIS', protocolo: '3000001/2026-1' },
    { id: 2, mat: 100000102, data: '2026-10-05T00:00:00', recurso: 'R', status: 'Finalizada', tipo: 'Verificação Cadastral (Vistoria)' },
    { id: 3, mat: 100000103, data: 'sem data', recurso: 'R', status: 'Finalizada', tipo: 'Verificação Cadastral' },
    { mat: 100000104, data: '05/10/26', recurso: 'R', status: 'Finalizada', tipo: 'Verificação Cadastral' },
    { id: 5, mat: 100000105, data: '05/10/26', recurso: 'R', status: 'Cancelada', tipo: 'Corte e Religação Cavalete' },
  ]);
  assert.equal(r.limpas.length, 2); // a de outro tipo e de equipe fora do escopo é descartada
  assert.equal(r.limpas[0].mat, '100000101');
  assert.equal(r.limpas[0].data, '2026-10-05');
  assert.equal(r.limpas[0].recurso, 'RIORECIN-004');
  assert.equal(r.limpas[0].qtdEcon, 4);
  assert.equal(r.limpas[0].protocolo, '3000001');
  assert.equal(r.limpas[1].id, '2');
  assert.deepEqual(r.descartes, { semId: 1, semData: 1, outrosServicos: 1 });
});

test('qtdEconomias e rótulo', () => {
  assert.equal(CV.dados.qtdEconomias('01. ECON'), 1);
  assert.equal(CV.dados.qtdEconomias('03. ECON'), 3);
  assert.equal(CV.dados.qtdEconomias('04. ECON OU MAIS'), 4);
  assert.equal(CV.dados.qtdEconomias(null), null);
  assert.equal(CV.dados.rotuloQtdEcon(1), '1 economia');
  assert.equal(CV.dados.rotuloQtdEcon(2), '2 economias');
  assert.equal(CV.dados.rotuloQtdEcon(4), '4+ economias');
  assert.equal(CV.dados.rotuloQtdEcon(null), '(não informado)');
});

test('grupo de status e tipo de equipe', () => {
  assert.equal(CV.dados.grupoStatus('Finalizada'), 'exec');
  assert.equal(CV.dados.grupoStatus('Encerrada com Ocorrência'), 'oc');
  assert.equal(CV.dados.grupoStatus('Encerrada com Ocorrencia'), 'oc'); // sem acento
  assert.equal(CV.dados.grupoStatus('Cancelada'), 'outra');
  assert.equal(CV.dados.grupoStatus(null), 'outra');
  assert.equal(CV.dados.tipoEquipe('RIORECIN-004'), 'Cadastro');
  assert.equal(CV.dados.tipoEquipe('RIOVENIN-001'), 'Venda');
  assert.equal(CV.dados.tipoEquipe('RIOVCGVENIN-002'), 'Venda');
  assert.equal(CV.dados.tipoEquipe('XYZ'), 'Outras');
});

test('resultados: limpar usa a data de início e cai para a de conclusão', () => {
  const r = CV.dados.limparResultados([
    { id: 1, inicio: '2026-03-03T09:00:00', mat: 100000001, tipoOS: 'Sem Tratativa' },
    { id: 2, fim: '2026-03-04T09:00:00', mat: 7654321, tipoOS: 'Sem Tratativa' },
    { mat: 100000003 },
  ]);
  assert.equal(r.limpas.length, 2);
  assert.equal(r.limpas[0].data, '2026-03-03');
  assert.equal(r.limpas[1].data, '2026-03-04');
  assert.equal(r.limpas[1].mat, null);
  assert.equal(r.limpas[1].matBruta, '7654321');
  assert.equal(r.descartes.semId, 1);
});
