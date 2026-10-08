'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ler } = require('./helpers');

test('lê planilha do Excel/openpyxl: valores, tipos e datas ISO', async () => {
  const r = await CV.xlsx.lerPlanilha(ler('atividades.xlsx'), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  assert.equal(r.aba, 'Cadastral');
  assert.equal(r.linhas.length, 17);
  assert.deepEqual(r.faltando, ['parecer', 'situacao', 'inicio', 'fim', 'duracao', 'desloc']); // colunas ausentes são informadas, não quebram
  const p = r.linhas[0];
  assert.equal(p.id, 1);
  assert.equal(p.mat, 100000001);
  assert.equal(p.data, '2026-03-02'); // data de verdade -> texto ISO
  assert.equal(p.status, 'Finalizada');
  assert.equal(p.recurso, 'RIORECIN-001');
  assert.match(p.obs, /^PROJETO INCREMENTO/);
});

test('data com hora vira ISO com hora', async () => {
  const r = await CV.xlsx.lerPlanilha(ler('resultados.xlsx'), { colunas: CV.dados.CAMPOS_RESULTADOS });
  assert.equal(r.aba, 'Planilha1');
  assert.equal(r.linhas.length, 15);
  assert.equal(r.linhas[0].inicio, '2026-03-03T09:00:00');
  assert.equal(r.linhas[0].econ, 'Incremento');
  assert.deepEqual(r.faltando, []);
});

test('cabeçalho que não está na primeira linha é localizado', async () => {
  const r = await CV.xlsx.lerPlanilha(ler('atividades_cabecalho_na_linha_3.xlsx'), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  assert.equal(r.linhas.length, 3);
  assert.equal(r.linhas[0].id, 1);
  assert.equal(r.cabecalho[0], 'Recurso');
});

test('export do sistema (partes na raiz do ZIP, sem sharedStrings, tudo texto)', async () => {
  const r = await CV.xlsx.lerPlanilha(ler('atividades_export_sistema.xlsx'), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  assert.equal(r.aba, 'Page 1');
  assert.equal(r.linhas.length, 3);
  assert.equal(r.linhas[0].id, '90000001');
  assert.equal(r.linhas[0].data, '05/10/26');
  assert.equal(r.linhas[0].parecer, 'Imóvel & cia <ok>'); // entidades XML decodificadas
  assert.equal(r.linhas[1].status, 'Encerrada com Ocorrência');
  assert.equal(r.faltando.includes('mat'), false);
  // cabeçalho repetido ('Janela de Serviço' x2) não atrapalha
  assert.equal(r.cabecalho.filter((h) => h === 'Janela de Serviço').length, 2);
});

test('soCabecalho devolve só o cabeçalho e permite detectar o tipo de arquivo', async () => {
  for (const [arq, tipo] of [['atividades.xlsx', 'atividades'], ['resultados.xlsx', 'resultados'], ['atividades_export_sistema.xlsx', 'atividades']]) {
    const r = await CV.xlsx.lerPlanilha(ler(arq), { soCabecalho: true });
    assert.equal(CV.dados.detectarTipo(r.cabecalho), tipo, arq);
  }
  assert.equal(CV.dados.detectarTipo(['a', 'b']), null);
});

test('arquivo que não é xlsx dá erro claro', async () => {
  await assert.rejects(() => CV.xlsx.lerPlanilha(Buffer.from('isto nao e um zip')), /não é um \.xlsx/);
  await assert.rejects(() => CV.xlsx.lerPlanilha(new Uint8Array(10)), /não é um \.xlsx/);
});

test('formatoEhData reconhece formatos de data e ignora números', () => {
  const f = CV.xlsx.formatoEhData;
  assert.equal(f('dd/mm/yyyy'), true);
  assert.equal(f('dd/mm/yyyy hh:mm:ss'), true);
  assert.equal(f('[$-416]d "de" mmmm "de" yyyy'), true);
  assert.equal(f('0.00'), false);
  assert.equal(f('#,##0'), false);
  assert.equal(f('General'), false);
  assert.equal(f('0.0 "m"'), false); // "m" entre aspas é texto
});

test('decodificarXml: entidades e _xHHHH_', () => {
  assert.equal(CV.xlsx.decodificarXml('a &amp; b &lt;c&gt; &quot;d&quot; &#233; &#xE9;'), 'a & b <c> "d" é é');
  assert.equal(CV.xlsx.decodificarXml('linha_x000D_fim'), 'linha\rfim');
});
