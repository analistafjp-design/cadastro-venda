'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarFixtures } = require('./helpers');

// Cenários documentados em tests/fixtures/gerar.py

test('limpeza: serviço de outra equipe (fora do escopo) é descartado e contado; visitas cadastrais ficam', async () => {
  const { la } = await carregarFixtures();
  assert.equal(la.limpas.length, 16); // as 16 visitas cadastrais; o corte da equipe RIOCORTE-001 saiu
  assert.equal(la.descartes.outrosServicos, 1);
  assert.equal(la.descartes.semId, 0);
});

test('projetos unificados nas visitas', async () => {
  const { porId } = await carregarFixtures();
  assert.equal(porId(1).projeto, 'INCREMENTO');
  assert.equal(porId(2).projeto, 'INCREMENTO'); // texto de instrução diferente
  assert.equal(porId(3).projeto, 'VIDA NOVA');
  assert.equal(porId(4).projeto, 'VERIFICAE SOCIAL - VENDA'); // nome do projeto, como aparece no texto
  assert.equal(porId(6).projeto, 'RAIO-X');
  assert.equal(porId(12).projeto, CV.regras.semProjeto);
  assert.equal(porId(14).projeto, 'VARREDURA'); // sem a palavra PROJETO
});

test('atribuição: retorno vai para a visita mais recente anterior/igual à data do retorno', async () => {
  const { porId } = await carregarFixtures();
  // matrícula 100000001 tem 2 visitas (02/03 e 10/03)
  assert.equal(porId(1).nRetornos, 1);
  assert.equal(porId(1).grupoRetorno, 'resultado');
  assert.equal(porId(1).principal, 'incremento');
  assert.equal(porId(1).deltaEcon, 1);
  assert.equal(porId(5).nRetornos, 1); // retorno de 11/03 pertence à 2ª visita
  assert.equal(porId(5).grupoRetorno, 'atualizacao');
  assert.equal(porId(5).primeiroRetorno, '2026-03-11');
});

test('retornos sem desfecho de valor', async () => {
  const { porId } = await carregarFixtures();
  assert.equal(porId(2).grupoRetorno, 'sem');
  assert.deepEqual(porId(2).tags, ['sem']);
  assert.equal(porId(14).grupoRetorno, 'sem');
});

test('mesmo dia: o retorno vai para a visita executada, não para a ocorrência', async () => {
  const { porId } = await carregarFixtures();
  assert.equal(porId(11).grupoStatus, 'exec');
  assert.equal(porId(11).nRetornos, 1);
  assert.equal(porId(11).deltaEcon, 2);
  assert.equal(porId(20).grupoStatus, 'oc');
  assert.equal(porId(20).nRetornos, 0);
});

test('janela de 30 dias: retorno tardio não é atribuído', async () => {
  const { porId, out } = await carregarFixtures();
  assert.equal(porId(6).nRetornos, 0);
  assert.equal(out.auditoria.foraJanela, 1);
});

test('retorno anterior à visita não é atribuído', async () => {
  const { porId, out } = await carregarFixtures();
  assert.equal(porId(8).nRetornos, 0);
  assert.equal(out.auditoria.anteriorVisita, 1);
});

test('retorno com o PROTOCOLO digitado no lugar da matrícula é resgatado', async () => {
  const { porId, out } = await carregarFixtures();
  assert.equal(porId(7).nRetornos, 1);
  assert.equal(porId(7).principal, 'titularidade');
  assert.equal(out.auditoria.resgatadosProtocolo, 1);
});

test('matrícula fora das bases e inválida são contadas na auditoria', async () => {
  const { out } = await carregarFixtures();
  assert.equal(out.auditoria.foraDasBases, 1);
  assert.equal(out.auditoria.matriculaInvalida, 1);
  assert.equal(out.auditoria.visitasSemMatricula, 1); // visita 13 (matrícula 12345)
});

test('contas fecham: todo retorno cai em exatamente um balde', async () => {
  const { out } = await carregarFixtures();
  const a = out.auditoria;
  const soma = a.atribuidos + a.foraJanela + a.anteriorVisita + a.foraDasBases + a.matriculaInvalida + a.semData + a.frenteIgnorada;
  assert.equal(soma, a.retornosTotal);
  assert.equal(a.retornosTotal, 15);
  assert.equal(a.atribuidos, 11);
  // e a soma dos retornos nas visitas é igual aos atribuídos
  assert.equal(out.visitas.reduce((s, v) => s + v.nRetornos, 0), a.atribuidos);
});

test('filtro de frente de serviço', async () => {
  const { out, porId } = await carregarFixtures({ frentes: new Set(['Cadastro']) });
  assert.equal(out.auditoria.frenteIgnorada, 1);
  assert.equal(porId(15).nRetornos, 0); // retorno era da frente "Bairro Legal - VCG"
});

test('janela configurável', async () => {
  const { porId, out } = await carregarFixtures({ janelaDias: 60 });
  assert.equal(porId(6).nRetornos, 1); // 57 dias agora cabe
  assert.equal(out.auditoria.foraJanela, 0);
});

test('maturação: visitas dos últimos dias (até o último retorno) são marcadas', async () => {
  const a = CV.dados.limparAtividades([
    { id: 1, mat: 100000001, data: '2026-03-10', recurso: 'R1', status: 'Finalizada' },
    { id: 2, mat: 100000002, data: '2026-03-12', recurso: 'R1', status: 'Finalizada' },
  ]);
  const r = CV.dados.limparResultados([{ id: 1, mat: 100000001, inicio: '2026-03-13T08:00:00', tipoOS: 'Sem Tratativa' }]);
  const out = CV.cruzamento.montar(a.limpas, r.limpas, {});
  assert.equal(out.dataReferencia, '2026-03-13');
  assert.equal(out.visitas[0].maturando, false); // 3 dias
  assert.equal(out.visitas[1].maturando, true); // 1 dia
});

test('sem nenhum retorno carregado nada quebra', async () => {
  const a = CV.dados.limparAtividades([{ id: 1, mat: 100000001, data: '2026-03-10', recurso: 'R1', status: 'Finalizada' }]);
  const out = CV.cruzamento.montar(a.limpas, [], {});
  assert.equal(out.dataReferencia, null);
  assert.equal(out.visitas[0].grupoRetorno, null);
  assert.equal(out.visitas[0].maturando, false);
});
