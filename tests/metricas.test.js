'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarFixtures } = require('./helpers');

const M = () => CV.metricas;

test('resumo geral', async () => {
  const { out } = await carregarFixtures();
  const r = M().resumo(out.visitas);
  assert.equal(r.total, 16);
  assert.equal(r.exec, 14);
  assert.equal(r.oc, 2);
  assert.equal(r.comRetorno, 11);
  assert.equal(r.semRetorno, 3);
  assert.equal(r.resultado, 6);
  assert.equal(r.atualizacao, 1);
  assert.equal(r.sem, 4);
  assert.equal(r.resultado + r.atualizacao + r.sem, r.comRetorno);
  assert.equal(r.comRetorno + r.semRetorno, r.exec);
  assert.equal(r.deltaEcon, 2); // +1 +2 -1
  assert.ok(Math.abs(r.taxaResultado - 6 / 14) < 1e-12);
  assert.ok(Math.abs(r.taxaRetorno - 11 / 14) < 1e-12);
  assert.ok(Math.abs(r.taxaExec - 14 / 16) < 1e-12);
  assert.equal(r.matriculas, 12); // matrículas válidas distintas (a visita 13 tem matrícula inválida)
});

test('colunas de desfecho', async () => {
  const { out } = await carregarFixtures();
  const r = M().resumo(out.visitas);
  assert.equal(r.colunas.incremento, 2); // visitas 1 e 11
  assert.equal(r.colunas.categoria, 1); // visita 4
  assert.equal(r.colunas.titularidade, 2); // visitas 7 e 15
  assert.equal(r.colunas.outros, 1); // decremento da visita 12
  assert.equal(r.colunas.venda, 0);
});

test('agrupamento por projeto e por equipe', async () => {
  const { out } = await carregarFixtures();
  const proj = new Map(M().agruparPor(out.visitas, (v) => v.projeto).map((l) => [l.chave, l]));
  assert.equal(proj.get('INCREMENTO').total, 9); // visitas 1,2,5,8,20,11,13,16,17
  assert.equal(proj.get('INCREMENTO').exec, 8); // todas menos a ocorrência (20)
  assert.equal(proj.get('VIDA NOVA').exec, 0);
  assert.equal(proj.get('VIDA NOVA').oc, 1);
  assert.equal(proj.get('TITULARIDADE').resultado, 2);
  const eq = new Map(M().agruparPor(out.visitas, (v) => v.recurso).map((l) => [l.chave, l]));
  assert.equal(eq.get('RIORECIN-001').exec, 5); // visitas 1,2,5,16,17
  assert.equal(eq.get('RIOVENIN-001').exec, 4); // visitas 4,7,8,15
});

test('série por dia e por semana (data da visita)', async () => {
  const { out } = await carregarFixtures();
  const dia = M().porPeriodo(out.visitas, 'dia');
  assert.deepEqual(dia.map((l) => l.chave), ['2026-03-02', '2026-03-05', '2026-03-06', '2026-03-10', '2026-03-12']);
  assert.deepEqual(dia.map((l) => l.total), [5, 3, 6, 1, 1]);
  const sem = M().porPeriodo(out.visitas, 'semana');
  assert.deepEqual(sem.map((l) => l.chave), ['2026-03-02', '2026-03-09']); // segundas-feiras
  assert.deepEqual(sem.map((l) => l.total), [14, 2]);
  const mes = M().porPeriodo(out.visitas, 'mes');
  assert.deepEqual(mes.map((l) => l.chave), ['2026-03']);
  // a soma das partes é o todo
  assert.equal(dia.reduce((s, l) => s + l.total, 0), out.visitas.length);
});

test('filtros por período, projeto, equipe e cidade', async () => {
  const { out } = await carregarFixtures();
  const v = out.visitas;
  assert.equal(M().filtrar(v, { de: '2026-03-06' }).length, 8);
  assert.equal(M().filtrar(v, { ate: '2026-03-02' }).length, 5);
  assert.equal(M().filtrar(v, { de: '2026-03-05', ate: '2026-03-06' }).length, 9);
  assert.equal(M().filtrar(v, { projetos: new Set(['RAIO-X']) }).length, 1);
  assert.equal(M().filtrar(v, { recursos: new Set(['RIOVENIN-001']) }).every((x) => x.recurso === 'RIOVENIN-001'), true);
  assert.equal(M().filtrar(v, { cidades: new Set(['CORDEIRO']) }).length, 3);
  assert.equal(M().filtrar(v, {}).length, v.length);
});

test('alvos para revisitar: última visita é ocorrência recuperável', async () => {
  const { out } = await carregarFixtures();
  const modelo = M().criarModeloChance(out.visitas);
  const rev = M().alvosOcorrencia(out.visitas, modelo, 'revisitar');
  // matrícula 100000003 (cliente ausente). A matrícula 100000008 teve ocorrência mas depois foi executada no mesmo dia.
  assert.deepEqual(rev.map((x) => x.mat), ['100000003']);
  assert.equal(rev[0].motivo, 'CLIENTE AUSENTE');
  assert.equal(rev[0].tentativas, 1);
  assert.equal(rev[0].escalar, false);
  assert.equal(M().alvosOcorrencia(out.visitas, modelo, 'corrigir_endereco').length, 0);
});

test('pendências de retorno do backoffice (executadas sem retorno há mais de 5 dias)', async () => {
  const { out } = await carregarFixtures();
  const p = M().alvosSemRetorno(out.visitas, out.dataReferencia);
  assert.equal(p.length, 3); // visitas 6, 8 e 13 (a 13 não tem matrícula válida, mas continua pendente)
  assert.deepEqual(new Set(p.map((x) => x.mat)), new Set(['100000005', '100000007', null]));
  assert.ok(p.every((x) => x.dias > 5));
  for (let i = 1; i < p.length; i++) assert.ok(p[i - 1].dias >= p[i].dias); // mais antigas primeiro
});

test('alvos esgotados: 2+ visitas executadas, todas sem tratativa', async () => {
  const { out } = await carregarFixtures();
  const e = M().alvosEsgotados(out.visitas);
  assert.deepEqual(e.map((x) => x.mat), ['100000012']);
  assert.equal(e[0].visitas, 2);
  // 100000001 também tem 2 visitas, mas gerou resultado/atualização
});

test('modelo de chance usa o segmento mais específico com amostra suficiente', async () => {
  const { out } = await carregarFixtures();
  const m = M().criarModeloChance(out.visitas);
  const c = m.chance(out.visitas[0]);
  assert.equal(c.base, 'média geral'); // fixture pequena: nenhum segmento atinge a amostra mínima
  assert.ok(c.taxa > 0 && c.taxa < 1);
  // com amostra mínima baixa, usa o segmento
  const antes = CV.regras.minAmostraRanking;
  CV.regras.minAmostraRanking = 2;
  try {
    const m2 = M().criarModeloChance(out.visitas);
    assert.notEqual(m2.chance(out.visitas[0]).base, 'média geral');
  } finally {
    CV.regras.minAmostraRanking = antes;
  }
});

test('territórios: índice relativo à média e corte por amostra mínima', async () => {
  const { out } = await carregarFixtures();
  const t = M().territorios(out.visitas, (v) => v.cidade, 1);
  assert.equal(t.linhas.length, 3); // MIRACEMA, ITAOCARA, CORDEIRO
  const ger = t.geral.taxaResultado;
  for (const l of t.linhas) assert.ok(Math.abs(l.indice - l.taxaResultado / ger) < 1e-12);
  // ordenado por taxa desc
  for (let i = 1; i < t.linhas.length; i++) assert.ok(t.linhas[i - 1].taxaResultado >= t.linhas[i].taxaResultado);
  assert.equal(M().territorios(out.visitas, (v) => v.cidade, 100).linhas.length, 0);
});

test('matriz equipe × projeto', async () => {
  const { out } = await carregarFixtures();
  const m = M().matriz(out.visitas, ['INCREMENTO', 'TITULARIDADE'], ['RIOVENIN-001', 'RIORECIN-001']);
  const cel = (rec, proj) => m.find((x) => x.recurso === rec).celulas.find((c) => c.projeto === proj);
  assert.equal(cel('RIOVENIN-001', 'TITULARIDADE').exec, 2);
  assert.equal(cel('RIOVENIN-001', 'TITULARIDADE').resultado, 2);
  assert.equal(cel('RIOVENIN-001', 'TITULARIDADE').taxa, 1);
  assert.equal(cel('RIORECIN-001', 'TITULARIDADE').taxa, null);
});
