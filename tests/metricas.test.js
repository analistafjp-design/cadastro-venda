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

test('demandas avulsas: o que são e como ocultar', async () => {
  const { out } = await carregarFixtures();
  const avulsas = M().textosAvulsas(out.visitas, 5);
  assert.equal(avulsas.length, 1);
  assert.equal(avulsas[0].n, 1);
  assert.match(avulsas[0].chave, /^SEM OBSERVACAO/);
  const todas = out.visitas.length;
  assert.equal(M().filtrar(out.visitas, { semAvulsas: true }).length, todas - 1);
  assert.equal(M().filtrar(out.visitas, { semAvulsas: false }).length, todas);
  assert.equal(M().textosAvulsas(M().filtrar(out.visitas, { semAvulsas: true }), 5).length, 0);
});

test('tipos de resultado: economia + categoria no mesmo retorno vira "incremento e categoria"', () => {
  const tp = (...tags) => M().tiposDoResultado({ tags });
  assert.deepEqual(tp('incremento'), ['inc']);
  assert.deepEqual(tp('categoria'), ['cat']);
  assert.deepEqual(tp('categoria', 'economia'), ['inc_cat']); // "Alteração de categoria e economia"
  assert.deepEqual(tp('incremento', 'categoria'), ['inc_cat']);
  assert.deepEqual(tp('titularidade', 'debitos'), ['titular', 'debitos']);
  assert.deepEqual(tp('categoria', 'titularidade'), ['cat', 'titular']);
  assert.deepEqual(tp('decremento'), ['decr']);
  assert.deepEqual(tp('economia'), ['eco']);
  assert.deepEqual(tp('tarifa_social'), ['tarifa']);
  assert.deepEqual(tp('atualizacao'), []);
  assert.deepEqual(tp('sem'), []);
});

test('cards: percorrido = exec + exoc; totais de incremento e categoria; titularidade; outros', async () => {
  const { out } = await carregarFixtures();
  const c = M().cartoes(out.visitas);
  assert.equal(c.percorrido, 16);
  assert.equal(c.exec, 14);
  assert.equal(c.oc, 2);
  assert.equal(c.percorrido, c.exec + c.oc);
  assert.equal(c.resultado, 6);
  assert.equal(c.inc, 2); // visitas 1 e 11
  assert.equal(c.incCat, 0);
  assert.equal(c.totalInc, 2);
  assert.equal(c.totalCat, 1); // visita 4
  assert.equal(c.titular, 2); // visitas 7 e 15
  assert.equal(c.outros, 1); // decremento da visita 12
  assert.ok(Math.abs(c.taxa - 6 / 14) < 1e-12);
});

test('cards: totais somam corretamente quando há retorno de economia e categoria juntos', () => {
  const v = (tags) => ({ grupoStatus: 'exec', grupoRetorno: 'resultado', tags, mat: 'x' + Math.random(), deltaEcon: 0 });
  const c = M().cartoes([
    v(['incremento']), v(['incremento']), // 2 só incremento
    v(['categoria', 'economia']), // 1 incremento + categoria
    v(['categoria']), v(['categoria']), // 2 só categoria
    v(['titularidade']),
    v(['tarifa_social']), // outros
    { grupoStatus: 'oc', grupoRetorno: null, tags: [] },
  ]);
  assert.equal(c.inc, 2);
  assert.equal(c.incCat, 1);
  assert.equal(c.totalInc, 3); // inc + inc_cat
  assert.equal(c.totalCat, 3); // cat + inc_cat
  assert.equal(c.titular, 1);
  assert.equal(c.outros, 1);
  assert.equal(c.resultado, 7);
  assert.equal(c.percorrido, 8);
});

test('resultado por equipe: todas as equipes do escopo, serviços que trouxeram resultado e quantidade', async () => {
  const { out } = await carregarFixtures();
  const r = M().resultadoPorEquipe(out.visitas, ['RIORECIN-001', 'RIORECIN-002', 'RIOVENIN-001', 'RIOVENIN-009']);
  const eq = (n) => r.find((x) => x.recurso === n);
  assert.equal(r.length, 4); // inclui a equipe sem nenhuma visita
  assert.equal(eq('RIOVENIN-009').exec, 0);
  assert.equal(eq('RIOVENIN-009').resultado, 0);
  assert.equal(eq('RIOVENIN-009').taxa, null);
  assert.deepEqual(eq('RIOVENIN-001').tipos.map((t) => [t.id, t.n]).sort(), [['cat', 1], ['titular', 2]].sort());
  assert.equal(eq('RIOVENIN-001').resultado, 3);
  assert.equal(eq('RIORECIN-001').resultado, 1);
  assert.deepEqual(eq('RIORECIN-001').tipos.map((t) => t.rotulo), ['Incremento de economia']);
  assert.equal(eq('RIORECIN-002').resultado, 2); // incremento (11) e decremento (12)
  // ordenadas por resultado, da que mais trouxe para a que menos trouxe
  assert.deepEqual(r.map((x) => x.resultado), [3, 2, 1, 0]);
  // o que não trouxe resultado não aparece nos serviços
  assert.ok(eq('RIORECIN-001').tipos.every((t) => t.n > 0));
});

test('novos alvos usam o histórico completo para saber se a matrícula já foi atendida depois', async () => {
  const { out } = await carregarFixtures();
  const modelo = M().criarModeloChance(out.visitas);
  // só a equipe RIORECIN-002 "enxerga" a matrícula 100000003 (ocorrência da visita 3) ...
  const dela = out.visitas.filter((v) => v.recurso === 'RIORECIN-002');
  assert.equal(M().alvosOcorrencia(dela, modelo, 'revisitar').length, 1);
  // ... mas se, no histórico, outra equipe executou essa matrícula depois, ela deixa de ser alvo
  const depois = Object.assign({}, out.visitas.find((v) => v.id === '3'), { id: '999', data: '2026-03-20', status: 'Finalizada', grupoStatus: 'exec', recurso: 'OUTRA' });
  assert.equal(M().alvosOcorrencia(dela, modelo, 'revisitar', out.visitas.concat([depois])).length, 0);
});
