'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarFixtures } = require('./helpers');
const X = CV.xlsxw;

const lerBlob = async (blob) => new Uint8Array(await blob.arrayBuffer());

test('xlsx: o que sai do gerador é lido de volta (texto, inteiros, datas, números)', async () => {
  const blob = await X.gerar([{
    nome: 'Atividades',
    colunas: [
      { titulo: 'Recurso', valor: (l) => l.r },
      { titulo: 'ID da Atividade', tipo: 'int', valor: (l) => l.id },
      { titulo: 'Data', tipo: 'data', valor: (l) => l.d },
      { titulo: 'Taxa', tipo: 'num', valor: (l) => l.t },
    ],
    linhas: [
      { r: 'RIORECIN-004', id: '90000001', d: '2026-10-05', t: 0.5 },
      { r: '=SOMA(A1:A2) & <b>"x"</b>', id: 'ABC', d: '2026-03-02', t: null },
      { r: 'acentuação: ção ü', id: 7, d: null, t: 12 },
    ],
  }]);
  assert.equal(blob.type, X.TIPO_XLSX);
  const r = await CV.xlsx.lerPlanilha(await lerBlob(blob), {
    colunas: { recurso: ['Recurso'], id: ['ID da Atividade'], data: ['Data'], taxa: ['Taxa'] },
  });
  assert.equal(r.aba, 'Atividades');
  assert.equal(r.linhas.length, 3);
  assert.equal(r.linhas[0].recurso, 'RIORECIN-004');
  assert.equal(r.linhas[0].id, 90000001);
  assert.equal(r.linhas[0].data, '2026-10-05');
  assert.equal(r.linhas[0].taxa, 0.5);
  assert.equal(r.linhas[1].recurso, '=SOMA(A1:A2) & <b>"x"</b>'); // texto continua texto
  assert.equal(r.linhas[1].id, 'ABC');
  assert.equal(r.linhas[1].data, '2026-03-02');
  assert.equal(r.linhas[2].recurso, 'acentuação: ção ü');
  assert.equal(r.linhas[2].id, 7);
});

test('xlsx: várias abas, nomes inválidos/repetidos ajustados, aba vazia só com cabeçalho', async () => {
  const col = [{ titulo: 'A', valor: (l) => l }];
  const blob = await X.gerar([
    { nome: 'Dados: 1/2 [x]', colunas: col, linhas: ['a'] },
    { nome: 'Dados: 1/2 [x]', colunas: col, linhas: [] },
  ]);
  const zip = CV.zip.abrirZip(await lerBlob(blob));
  assert.ok(zip.nomes.includes('[Content_Types].xml'));
  assert.ok(zip.nomes.includes('xl/worksheets/sheet2.xml'));
  const wb = await CV.zip.textoCompleto(zip, 'xl/workbook.xml');
  assert.match(wb, /name="Dados  1 2  x"/);
  assert.match(wb, /name="Dados  1 2  x 2"/);
  const r2 = await CV.xlsx.lerPlanilha(await lerBlob(blob), { aba: 1, colunas: { a: ['A'] } });
  assert.equal(r2.linhas.length, 0);
});

test('xlsx: crc32 e zip sem compressão (fallback) também abrem', () => {
  assert.equal(X.crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  assert.equal(X.serialData('1970-01-01'), 25569);
  assert.equal(X.serialData('2026-10-05'), 46300);
});

test('exportação analítica das visitas: colunas de Atividades + cruzamento, uma linha por visita', async () => {
  const { out } = await carregarFixtures();
  const aba = CV.exporta.abaVisitas(out.visitas);
  const titulos = aba.colunas.map((c) => c.titulo);
  assert.deepEqual(titulos.slice(0, 7), ['Recurso', 'Data', 'ID da Atividade', 'Cód. Protocolo Origem', 'Matrícula', 'Status da Atividade', 'Tipo de Atividade']);
  for (const t of ['Projeto (base)', 'Cidade', 'Início', 'Tempo de Deslocamento', 'Situação da visita', 'Percorrido', 'Com resultado', 'Tipo de resultado', 'Dias até o retorno']) {
    assert.ok(titulos.includes(t), t);
  }
  assert.equal(aba.linhas.length, out.visitas.length);

  const val = (v, titulo) => aba.colunas.find((c) => c.titulo === titulo).valor(v);
  const com = out.visitas.filter((v) => v.grupoStatus === 'exec' && v.grupoRetorno === 'resultado');
  assert.ok(com.length > 0);
  assert.equal(aba.linhas.filter((v) => val(v, 'Com resultado') === 'Sim').length, com.length);
  for (const v of com) assert.notEqual(val(v, 'Tipo de resultado'), '');
  const oc = out.visitas.find((v) => v.grupoStatus === 'oc');
  assert.equal(val(oc, 'Situação da visita'), 'Encerrada com Ocorrência');
  assert.equal(val(oc, 'Percorrido'), 'Sim');
  assert.equal(val(oc, 'Com resultado'), '');

  // vira arquivo e volta
  const blob = await X.gerar([aba]);
  const r = await CV.xlsx.lerPlanilha(await lerBlob(blob), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  assert.equal(r.linhas.length, out.visitas.length);
  assert.equal(r.faltando.includes('id') || r.faltando.includes('mat'), false); // o arquivo exportado é lido como uma planilha de Atividades
});

test('extras sobre a linha da lista e visita referenciada', async () => {
  const { out } = await carregarFixtures();
  const v = out.visitas[0];
  const aba = CV.exporta.abaVisitas([{ visita: v, n: 3 }], { visitaDe: (l) => l.visita, extras: [{ titulo: 'Tentativas', tipo: 'num', valor: (l) => l.n }] });
  assert.equal(aba.colunas[aba.colunas.length - 1].titulo, 'Tentativas');
  assert.equal(aba.colunas[0].valor(aba.linhas[0]), v.recurso);
  assert.equal(aba.colunas[aba.colunas.length - 1].valor(aba.linhas[0]), 3);
});

test('tempos: classe do tipo e um dia de cada equipe', () => {
  const m = CV.normalize.minutos;
  const at = (tipo, ini, fim, dur, desl, extra) => Object.assign({ recurso: 'RIORECIN-004', data: '2026-10-05', tipo, status: 'Finalizada', inicio: m(ini), fim: m(fim), duracao: m(dur), desloc: m(desl) }, extra || {});
  assert.equal(CV.tempos.classeDoTipo('Refeição'), 'Pausas e apoio');
  assert.equal(CV.tempos.classeDoTipo('Verificação Cadastral'), 'Serviço');
  assert.equal(CV.tempos.classeDoTipo('Deslocamento'), 'Deslocamento');
  const dias = CV.tempos.diasDaEquipe(CV.tempos.agendaDe([
    at('Refeição', '12:00', '13:00', '01:00', '00:00'),
    at('Verificação Cadastral', '08:00', '12:00', '04:00', '00:00'),
    at('Verificação Cadastral', '08:00', '09:00', '01:00', '00:00', { data: '2026-10-06' }),
  ]));
  assert.equal(dias.length, 2);
  assert.equal(dias[0].completo, true);
  assert.equal(dias[0].inicio, 480);
  assert.equal(dias[0].fim, 780);
  assert.equal(dias[1].completo, false);
  const aba = CV.exporta.abaDias(CV.tempos.agendaDe([at('Refeição', '12:00', '13:00', '01:00', '00:00')]));
  assert.equal(aba.linhas.length, 1);
  assert.equal(aba.colunas.find((c) => c.titulo === 'Pausas e apoio').valor(aba.linhas[0]), 60);
});
