'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ler } = require('./helpers');
const { instalar, linhasDaTabela } = require('./dom-falso');
const T = CV.tratativas;

// resultados_tratativas.xlsx (tests/fixtures/gerar.py, linhas_tratativas) tem cada cenário com o valor conferido à mão.
async function carregar() {
  const r = await CV.xlsx.lerPlanilha(ler('resultados_tratativas.xlsx'), { colunas: CV.dados.CAMPOS_RESULTADOS });
  const lr = CV.dados.limparResultados(r.linhas);
  return { r, lr, linhas: T.preparar(lr.limpas) };
}

const SET = { de: '2026-09-01', ate: '2026-09-30' };
const por = (quadro) => new Map(quadro.linhas.map((l) => [l.de + '>' + l.para, l]));

/** Roda com uma regra trocada e devolve tudo ao normal. */
function comRegra(ajuste, fn) {
  const R = CV.regras.tratativas;
  const antes = Object.assign({}, R);
  Object.assign(R, ajuste);
  try { return fn(); } finally { Object.assign(R, antes); }
}

test('a planilha é lida com as colunas da aba: categoria antes/depois, quantidade, assistente e data de conclusão', async () => {
  const { r, lr } = await carregar();
  assert.deepEqual(r.faltando, []);
  assert.equal(r.linhas.length, 32);
  const p = (id) => lr.limpas.find((x) => x.id === String(id));
  assert.equal(p(13).anterior, 'Social');
  assert.equal(p(13).atual, 'Residencial');
  assert.equal(p(13).qtd, 14);
  assert.equal(p(13).assistente, 'Ana'); // primeiro nome de "Ana Souza"
  assert.equal(p(19).qtd, null); // QUANTIDADE vazia
  assert.equal(p(1).de, '1 Residencial');
  // começou em 03/09 às 23:59 e concluiu em 04/09: a aba usa a data da conclusão
  assert.equal(p(32).data, '2026-09-03');
  assert.equal(p(32).dataFim, '2026-09-04');
});

test('limpeza: quantidade com vírgula, nome com espaços e quantidade ilegível', () => {
  const l = CV.dados.limparResultados([
    { id: 1, inicio: '2026-09-01T09:00:00', fim: '2026-09-01T09:02:00', qtd: '2,0', colaborador: '  Maria   da Silva ', anterior: 'Social', atual: 'Residencial' },
    { id: 2, inicio: '2026-09-01T09:00:00', qtd: 'muitas', colaborador: null },
    { id: 3, inicio: '2026-09-01T09:00:00', qtd: 3 },
  ]).limpas;
  assert.equal(l[0].qtd, 2);
  assert.equal(l[0].assistente, 'Maria');
  assert.equal(l[1].qtd, null);
  assert.equal(l[1].assistente, null);
  assert.equal(l[2].qtd, 3);
});

test('categoria do texto livre: a ordem do Power BI, "Outros" e o comércio popular', () => {
  const c = T.categoriaDe;
  const casos = [
    ['2 Comércios', 'Comercial'], ['1 Comercial', 'Comercial'], ['1 Residência', 'Residencial'], ['3 Residências', 'Residencial'],
    ['Social', 'Social'], ['Industrial', 'Industrial'], ['3 Publica', 'Pública'], ['P. Comercio', 'P. Comércio'], ['P.COMERCIO', 'P. Comércio'],
    ['SEM FINS LUCRATIVOS', 'Outros'], ['ENT.S/FIM LUCRATIVO', 'Outros'], ['BAIRRO LEGAL', 'Outros'], ['CADÚNICO', 'Outros'],
    ['DE 1 RES. SOCIAL P/ 2 RES. NORMAIs', 'Residencial'], // RES vem antes de SOC, como no relatório
    ['COMÉRCIO POPULAR', 'Comercial'], ['COM. POPULAR', 'Comercial'], // igual ao Power BI
    ['', 'Outros'], [null, 'Outros'], [undefined, 'Outros'],
  ];
  for (const [txt, esperado] of casos) assert.equal(c(txt), esperado, String(txt));
  comRegra({ igualPowerBI: false }, () => {
    assert.equal(c('COMÉRCIO POPULAR'), 'Comércio popular');
    assert.equal(c('1 COMÉRCIO POPULAR'), 'Comércio popular');
    assert.equal(c('2 Comércios'), 'Comercial');
  });
});

test('DE/PARA em texto livre: uma categoria é lida; mais de uma vira contagem por categoria', () => {
  const l = T.lerEconomias;
  const casos = [
    ['2 Residências', { n: 2, cat: 'Residencial' }],
    ['11 Residencias', { n: 11, cat: 'Residencial' }],
    ['DE 11 ECONOMIAS RESIDENCIAIS', { n: 11, cat: 'Residencial' }], // prefixo "DE" e a palavra "ECONOMIAS"
    ['PARA 2 ECONOMIAS COMERCIAIS', { n: 2, cat: 'Comercial' }],
    ['DE UMA COMERCIAL', { n: 1, cat: 'Comercial' }], // número por extenso
    ['PARA UMA RESIDENCIAL', { n: 1, cat: 'Residencial' }],
    ['2 P. Comercio', { n: 2, cat: 'P. Comércio' }],
    ['5 Salas', { n: 5, cat: 'Outros' }], // sem categoria reconhecida: número do começo
    ['1 Residencial e 1 Comercial', { composto: true, porCat: { Residencial: 1, Comercial: 1 } }],
    ['DE 1 ECONOMIA RESIDENCIAL E 1 ECONOMIA COMERCIAL ', { composto: true, porCat: { Residencial: 1, Comercial: 1 } }],
    ['PARA 2 ECONOMIAS RESIDENCIAIS E 1 ECONOMIA COMERCIAL', { composto: true, porCat: { Residencial: 2, Comercial: 1 } }],
    ['6RES. E 1 COM.', { composto: true, porCat: { Residencial: 6, Comercial: 1 } }], // sem espaço depois do número
    ['varias', null], ['', null], [null, null], [undefined, null],
  ];
  for (const [txt, esperado] of casos) assert.deepEqual(l(txt), esperado, String(txt));
});

test('a frase inteira num campo só ("DE ... P/ ..."): vale só com o que ler dos dois lados', () => {
  const f = T.lerFrase;
  assert.deepEqual(f('DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.'), { de: { Residencial: 5, Comercial: 1 }, para: { Residencial: 4, Comercial: 1 } });
  assert.deepEqual(f('DE 2 RES. P/ 1 RES.'), { de: { Residencial: 2 }, para: { Residencial: 1 } });
  assert.deepEqual(f('1 Residência PARA 2 Residências'), { de: { Residencial: 1 }, para: { Residencial: 2 } });
  assert.equal(f('PARA 2 RES.'), null); // o "PARA" do começo é prefixo, não separador
  assert.equal(f('2 Residências'), null);
  assert.equal(f(null), null);
});

test('lançamentos reais de Outubro: o "11 ECONOMIAS" entra e os textos com duas categorias são calculados por categoria', () => {
  const raw = (id, econ, de, para) => ({ id, inicio: '2026-09-10T09:00:00', fim: '2026-09-10T09:02:00', frente: 'Cadastro', econ, de, para });
  const lr = CV.dados.limparResultados([
    raw(101, 'Decremento', 'DE 11 ECONOMIAS RESIDENCIAIS', '1 Residência'), // −10 Residencial
    raw(102, 'Incremento', 'DE UMA COMERCIAL', 'PARA UMA RESIDENCIAL'), // 1 → 1: sem variação
    raw(103, 'Incremento', 'DE 1 ECONOMIA RESIDENCIAL E 1 ECONOMIA COMERCIAL ', 'PARA 1 ECONOMIA RESIDENCIAL E 2 ECONOMIAS COMERCIAIS'), // +1 Comercial
    raw(104, 'Decremento', 'DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.', 'DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.'), // −1 Residencial
    raw(105, 'Incremento', 'varias', '2 Residências'), // sem número: ilegível
  ]).limpas;
  const a = T.analisar(T.preparar(lr));
  assert.deepEqual([a.quadros.decEco.n, a.quadros.decEco.valor], [-11, -939.51]); // 10 × 85,41 + 1 × 85,41
  assert.deepEqual([a.quadros.incEco.n, a.quadros.incEco.valor], [1, 443.57]);
  assert.deepEqual(a.quadros.incEco.linhas.map((x) => [x.de, x.para]), [['Comercial', 'Comercial']]);
  assert.equal(a.conferencia.porCategoria, 2); // 103 e 104
  assert.equal(a.conferencia.ecoIlegivel, 1); // 105
  assert.deepEqual(a.exemplos.porCategoria, ['103', '104']);
  assert.deepEqual(a.exemplos.ecoIlegivel, ['105']);
  assert.deepEqual(a.exemplos.variacaoGrande, ['101']); // −10 num lançamento só
  // o ilegível aparece no Excel, fora dos quadros; os calculados por categoria saem com a observação
  const det = T.detalhe(T.preparar(lr));
  const fora = det.filter((x) => x.quadro.titulo === '(fora dos quadros)');
  assert.deepEqual(fora.map((x) => x.l.id), ['105']);
  assert.match(fora[0].obs, /não consegue ler/);
  const d103 = det.find((x) => x.l.id === '103');
  assert.match(d103.obs, /categoria por categoria/);
  assert.equal(CV.exporta.abaTratativas(det).colunas.find((c) => c.titulo === 'DE:').valor(d103), 'DE 1 ECONOMIA RESIDENCIAL E 1 ECONOMIA COMERCIAL'); // o texto original, sem o espaço que sobrava no fim

  // compostosPorCategoria: false volta ao "só avisa": 103 e 104 ficam de fora, junto com o 105
  comRegra({ compostosPorCategoria: false }, () => {
    const b = T.analisar(T.preparar(lr));
    assert.deepEqual([b.quadros.decEco.n, b.quadros.decEco.valor], [-10, -854.1]);
    assert.equal(b.quadros.incEco.linhas.length, 0);
    assert.equal(b.conferencia.ecoIlegivel, 3);
    assert.equal(b.conferencia.porCategoria, 0);
  });
});

test('variação suspeita: 100 no lugar de 1 é avisado, mas continua valendo; 9 economias não', () => {
  const raw = (id, de, para) => ({ id, inicio: '2026-04-20T11:00:00', fim: '2026-04-20T11:02:00', frente: 'Cadastro', econ: 'Decremento', de, para });
  const lr = CV.dados.limparResultados([raw(1, '100 RES.', '1 Residência'), raw(2, '10 Residências', '1 Residência'), raw(3, '5 Residências', '1 Residência')]).limpas;
  const a = T.analisar(T.preparar(lr));
  assert.equal(a.quadros.decEco.n, -112); // −99 − 9 − 4
  assert.equal(a.conferencia.variacaoGrande, 1);
  assert.deepEqual(a.exemplos.variacaoGrande, ['1']);
  comRegra({ variacaoSuspeita: 9 }, () => assert.deepEqual(T.analisar(T.preparar(lr)).exemplos.variacaoGrande, ['1', '2'])); // o limite é uma regra
});

test('número no começo do texto e o que é uma tratativa de verdade', () => {
  assert.equal(T.numeroInicial('2 Residências'), 2);
  assert.equal(T.numeroInicial('  10 comércios'), 10);
  assert.equal(T.numeroInicial('Residencial'), null);
  assert.equal(T.numeroInicial(null), null);
  assert.equal(T.numeroInicial(''), null);
  for (const t of ['Telefone -', 'Troca de Titularidade - ;NEGOCIAÇÃO DE DÉBITOS', 'Alteração de Classificação -']) assert.equal(T.ehTratado(t), true, t);
  for (const t of ['Sem Tratativa', 'Encerrado sem tratativa', 'ENCERRADO S. TRATATIVA', ';', '.', '', null, undefined]) assert.equal(T.ehTratado(t), false, String(t));
});

test('Setembro: incremento e decremento de economia, grupo por grupo', async () => {
  const { linhas } = await carregar();
  const a = T.analisar(T.filtrar(linhas, SET));
  const inc = a.quadros.incEco;
  const g = por(inc);
  assert.equal(inc.linhas.length, 3);
  // 1 Res→3 Res (+2) e 2 Res→5 Res (+3); 1 Com→2 Com (+1); 1 Res→2 Comercial (+1, categorias diferentes: tarifa do PARA)
  assert.deepEqual([g.get('Residencial>Residencial').n, g.get('Residencial>Residencial').valor], [5, 427.05]);
  assert.deepEqual([g.get('Comercial>Comercial').n, g.get('Comercial>Comercial').valor], [1, 443.57]);
  assert.deepEqual([g.get('Residencial>Comercial').n, g.get('Residencial>Comercial').valor], [1, 443.57]);
  assert.deepEqual([inc.n, inc.valor], [7, 1314.19]);
  assert.equal(g.get('Residencial>Residencial').frente, 'Cadastro');
  assert.equal(g.get('Residencial>Residencial').lancamentos, 2);
  // o rótulo "Decremento" com PARA > DE (id 7), DE = PARA (id 8), outra frente (id 11) e origem "Outros" (id 12) ficam fora

  const dec = a.quadros.decEco;
  const d = por(dec);
  assert.equal(dec.linhas.length, 3);
  // 3 Res→1 Res (−2) e 2 Res→1 Res marcado "Incremento" (−1, entra aqui pela conta); 2 Com→1 Com (−1);
  // 3 Res→2 Comércios (−1): categorias diferentes, valor = −1 × (85,41 − 443,57) = +358,16 (regra do relatório)
  assert.deepEqual([d.get('Residencial>Residencial').n, d.get('Residencial>Residencial').valor], [-3, -256.23]);
  assert.deepEqual([d.get('Comercial>Comercial').n, d.get('Comercial>Comercial').valor], [-1, -443.57]);
  assert.deepEqual([d.get('Residencial>Comercial').n, d.get('Residencial>Comercial').valor], [-1, 358.16]);
  assert.deepEqual([dec.n, dec.valor], [-5, -341.64]);
});

test('Setembro: incremento e decremento de categoria (quantidade × diferença das tarifas)', async () => {
  const { linhas } = await carregar();
  const a = T.analisar(T.filtrar(linhas, SET));
  const inc = a.quadros.incCat;
  const i = por(inc);
  assert.equal(inc.linhas.length, 3);
  assert.deepEqual([i.get('Social>Residencial').n, i.get('Social>Residencial').valor], [14, 774.06]); // 14 × (85,41 − 30,12)
  assert.deepEqual([i.get('P. Comércio>Comercial').n, i.get('P. Comércio>Comercial').valor], [8, 1774.32]); // 7 + 1 (o "comércio popular" é Comercial no relatório)
  assert.deepEqual([i.get('Comercial>Industrial').n, i.get('Comercial>Industrial').valor], [2, 339.2]); // 2 × (613,17 − 443,57)
  assert.deepEqual([inc.n, inc.valor], [24, 2887.58]);

  const dec = a.quadros.decCat;
  const d = por(dec);
  assert.equal(dec.linhas.length, 4);
  assert.deepEqual([d.get('Residencial>Social').n, d.get('Residencial>Social').valor], [31, -1713.99]);
  assert.deepEqual([d.get('Comercial>P. Comércio').n, d.get('Comercial>P. Comércio').valor], [8, -1774.32]);
  assert.deepEqual([d.get('Residencial>Outros').n, d.get('Residencial>Outros').valor], [1, -85.41]); // "Outros" não tem tarifa: vale zero
  assert.deepEqual([d.get('Comercial>Pública').n, d.get('Comercial>Pública').valor], [1, -443.57]); // Pública vale zero nos quadros de categoria (como no relatório)
  assert.deepEqual([dec.n, dec.valor], [41, -4017.29]);
  // a mudança sem QUANTIDADE (id 19) e a de outra frente (id 22) não aparecem
  assert.equal(i.has('Social>Comercial') || d.has('Social>Comercial'), false);
  assert.equal(i.has('Social>Residencial') && i.get('Social>Residencial').n, 14);
});

test('saldo é a soma dos quatro quadros e os cards contam as tratativas e os dias', async () => {
  const { linhas } = await carregar();
  const a = T.analisar(T.filtrar(linhas, SET));
  assert.equal(a.saldo, -157.16); // 1314,19 − 341,64 + 2887,58 − 4017,29
  const soma = Object.values(a.quadros).reduce((s, q) => s + Math.round(q.valor * 100), 0);
  assert.equal(soma / 100, a.saldo);
  // tratados: ids 1, 13, 23 (dia 1), 15 (dia 2), 26 (dia 3) e 32 (concluído no dia 4); "sem tratativa", ";" e vazios não contam
  assert.deepEqual(a.cartoes, { tratados: 6, dias: 4, media: 1.5 });
});

test('conferência: o que o Power BI faz de diferente ou que merece olhar', async () => {
  const { linhas } = await carregar();
  const c = T.analisar(T.filtrar(linhas, SET)).conferencia;
  assert.deepEqual(c, {
    ecoIlegivel: 0,
    porCategoria: 0,
    variacaoGrande: 0,
    foraFrente: 2, // ids 11 e 22 (Bairro Legal - VCG)
    rotuloIncMenor: 1, // id 6
    rotuloDecMaior: 1, // id 7
    mistas: 2, // ids 9 e 10
    semTarifa: 1, // id 18 (para "Outros")
    semQuantidade: 1, // id 19
    publicaZero: 1, // id 21
    popular: 1, // id 20
  });
});

test('filtros: assistente e período', async () => {
  const { linhas } = await carregar();
  const bia = T.analisar(T.filtrar(linhas, Object.assign({ assistente: 'Bia' }, SET)));
  assert.equal(bia.quadros.incEco.valor, 256.23);
  assert.equal(bia.quadros.decEco.valor, 187.34); // −170,82 + 358,16
  assert.equal(bia.quadros.incCat.valor, 0);
  assert.equal(bia.quadros.decCat.valor, -3931.88);
  assert.equal(bia.saldo, -3488.31);

  const dia1 = T.analisar(T.filtrar(linhas, { de: '2026-09-01', ate: '2026-09-01' }));
  assert.equal(dia1.quadros.incEco.valor, 614.39); // ids 1 e 2
  assert.equal(dia1.quadros.incCat.valor, 774.06); // id 13
  assert.equal(dia1.quadros.decEco.valor + dia1.quadros.decCat.valor, 0);
  assert.equal(dia1.saldo, 1388.45);
  assert.deepEqual(dia1.cartoes, { tratados: 3, dias: 1, media: 3 });

  const nada = T.analisar(T.filtrar(linhas, { de: '2027-01-01' }));
  assert.equal(nada.saldo, 0);
  assert.deepEqual(nada.cartoes, { tratados: 0, dias: 0, media: null });
});

test('saldo por mês: do mais novo ao mais antigo, com a variação; o período não filtra, o assistente sim', async () => {
  const { linhas } = await carregar();
  const m = T.porMes(linhas);
  assert.deepEqual(m.map((x) => x.rotulo), ['OUT/2026', 'SET/2026']);
  const [out, set] = m;
  assert.deepEqual([out.incEco, out.incCat, out.decEco, out.decCat, out.saldo], [85.41, 0, 0, -110.58, -25.17]);
  assert.equal(out.variacao, 131.99); // −25,17 − (−157,16)
  assert.equal(set.saldo, -157.16);
  assert.equal(set.variacao, null); // primeiro mês
  assert.equal(set.lancamentos, 16);
  const bia = T.porMes(linhas, { assistente: 'Bia' });
  assert.equal(bia[0].saldo, -110.58);
  assert.equal(bia[1].saldo, -3488.31);
  assert.equal(T.rotuloMes('2026-01'), 'JAN/2026');
});

test('opções dos filtros: assistentes, meses e limites das datas (só a frente considerada)', async () => {
  const { linhas } = await carregar();
  assert.deepEqual(T.opcoes(linhas), { assistentes: ['Ana', 'Bia'], meses: ['2026-10', '2026-09'], min: '2026-09-01', max: '2026-10-02' });
  assert.deepEqual(T.opcoes([]), { assistentes: [], meses: [], min: null, max: null });
});

test('igualPowerBI: false corrige Pública e Comércio popular (e os avisos somem)', async () => {
  const { lr } = await carregar();
  comRegra({ igualPowerBI: false }, () => {
    const a = T.analisar(T.filtrar(T.preparar(lr.limpas), SET));
    const dec = por(a.quadros.decCat);
    assert.equal(dec.get('Comercial>Pública').valor, -314.41); // 129,16 − 443,57
    assert.equal(dec.get('P. Comércio>Comércio popular').valor, -161.54); // 60,24 − 221,78: agora é decremento
    assert.equal(a.quadros.incCat.valor, 2665.79); // sem os 221,79 que o relatório contava como incremento
    assert.equal(a.quadros.decCat.valor, -4049.67);
    assert.equal(a.saldo, -411.33);
    assert.equal(a.conferencia.publicaZero, 0);
    assert.equal(a.conferencia.popular, 0);
  });
});

test('a frente de serviço é uma regra: vazia, entram todas', async () => {
  const { lr } = await carregar();
  comRegra({ frente: '' }, () => {
    const a = T.analisar(T.filtrar(T.preparar(lr.limpas), SET));
    assert.equal(a.conferencia.foraFrente, 0);
    assert.equal(a.quadros.decEco.n, -6); // + id 11 (Bairro Legal): 2 Res→1 Res
    assert.equal(a.quadros.incCat.valor, 3164.03); // + id 22: 5 × (85,41 − 30,12)
    assert.equal(a.saldo, 33.88); // −157,16 − 85,41 + 276,45
  });
});

test('detalhe (Excel): um evento por linha, com o quadro, o valor e a observação', async () => {
  const { linhas } = await carregar();
  const det = T.detalhe(T.filtrar(linhas, SET));
  assert.equal(det.length, 18); // 4 + 4 de economia, 4 + 4 de categoria, e 2 que ficaram de fora (ids 7 e 19) para serem corrigidas
  const fora = det.filter((x) => x.quadro.titulo === '(fora dos quadros)');
  assert.deepEqual(fora.map((x) => x.l.id).sort(), ['19', '7']);
  assert.equal(fora[0].valor, null);
  assert.match(fora.find((x) => x.l.id === '19').obs, /sem QUANTIDADE/);
  const aba = CV.exporta.abaTratativas(det);
  const val = (x, titulo) => aba.colunas.find((c) => c.titulo === titulo).valor(x);
  const id6 = det.find((x) => x.l.id === '6');
  assert.equal(val(id6, 'Quadro'), 'Decremento de economia');
  assert.equal(val(id6, 'Valor (R$)'), -85.41);
  assert.match(val(id6, 'Observação'), /Marcado como Incremento, mas PARA é menor que DE/);
  assert.equal(val(id6, 'DE:'), '2 Residencial');
  assert.equal(val(id6, 'ANTERIOR'), null);
  const id15 = det.find((x) => x.l.id === '15');
  assert.equal(val(id15, 'Quadro'), 'Incremento de categoria');
  assert.equal(val(id15, 'Economias'), 7);
  assert.equal(val(id15, 'QUANTIDADE'), 7);
  assert.equal(val(id15, 'ANTERIOR'), 'P. Comercio');
  assert.equal(val(id15, 'Assistente'), 'Ana');
  const quadros = CV.exporta.abaQuadros(T.analisar(T.filtrar(linhas, SET)));
  assert.deepEqual(quadros.linhas[quadros.linhas.length - 1], { quadro: 'Saldo do período', frente: null, a: null, b: null, n: null, valor: -157.16 });
  // vira arquivo e volta
  const blob = await CV.xlsxw.gerar([aba, quadros, CV.exporta.abaMeses(T.porMes(linhas))]);
  const lido = await CV.xlsx.lerPlanilha(new Uint8Array(await blob.arrayBuffer()), { colunas: { quadro: ['Quadro'], valor: ['Valor (R$)'] } });
  assert.equal(lido.linhas.length, det.length);
});

test('a aba é só da página Interior', () => {
  assert.equal(CV.paginas.interior.tratativas, true);
  assert.equal(CV.paginas.vcg.tratativas, false);
  // o formulário do VCG não tem DE/PARA nem categoria: não entra
  assert.deepEqual(T.preparar([{ id: '1', layout: 'vcg', data: '2026-09-01', frente: 'VCG' }]), []);
});

// ------------------------------------------------------------------- a tela

const brl = (n) => CV.ui.fmt.brl(n).replace(/ /g, ' ');
const textoTabela = (secao) => linhasDaTabela(secao).map((l) => l.map((c) => c.replace(/ /g, ' ')));
const secao = (alvo, titulo) => alvo.achar((n) => n.tagName === 'SECTION' && n.porTag('h2')[0] && n.porTag('h2')[0].textContent === titulo)[0];

async function desenhar(filtro) {
  instalar();
  const { linhas } = await carregar();
  const alvo = document.createElement('div');
  CV.ui.renderTratativas(alvo, {
    analise: T.analisar(T.filtrar(linhas, filtro || SET)),
    meses: T.porMes(linhas),
    ordemDe: (id, padrao) => Object.assign({}, padrao),
  });
  return alvo;
}

test('formato em reais: duas casas, vírgula e negativo com sinal', () => {
  assert.equal(brl(1774.28), 'R$ 1.774,28');
  assert.equal(brl(-1281.15), '-R$ 1.281,15');
  assert.equal(brl(3416.4), 'R$ 3.416,40'); // o relatório mostrava "R$ 3.416,4"
  assert.equal(brl(0), 'R$ 0,00');
  assert.equal(brl(-0), 'R$ 0,00');
  assert.equal(brl(null), '–');
  assert.equal(CV.ui.fmt.dec2(7.5833), '7,58');
});

test('tela: os quatro quadros com as mesmas colunas do relatório e o total de cada um', async () => {
  const alvo = await desenhar();
  const q = (titulo) => textoTabela(secao(alvo, titulo));

  const inc = q('Incremento de economia');
  assert.deepEqual(inc[0], ['Frente de serviço', 'De', 'Para', 'Incremento', 'Valor incremento']);
  assert.deepEqual(inc[inc.length - 1], ['Total', '', '', '7', 'R$ 1.314,19']); // o total fica embaixo, como no relatório
  assert.notEqual(inc[1][0], 'Total');
  assert.ok(inc.some((l) => l.join('|') === 'Cadastro|Residencial|Residencial|5|R$ 427,05'));

  const dec = q('Decremento de economia');
  assert.deepEqual(dec[0], ['Frente de serviço', 'De', 'Para', 'Decremento', 'Valor decremento']);
  assert.deepEqual(dec[dec.length - 1], ['Total', '', '', '-5', '-R$ 341,64']);

  const ic = q('Incremento de categoria');
  assert.deepEqual(ic[0], ['Frente de serviço', 'Anterior', 'Atual', 'Total', 'Valor incremento']);
  assert.deepEqual(ic[ic.length - 1], ['Total', '', '', '24', 'R$ 2.887,58']);

  const dc = q('Decremento de categoria');
  assert.deepEqual(dc[0], ['Frente de serviço', 'Anterior', 'Atual', 'Total', 'Valor decremento']);
  assert.deepEqual(dc[dc.length - 1], ['Total', '', '', '41', '-R$ 4.017,29']);
  assert.ok(dc.some((l) => l.join('|') === 'Cadastro|Residencial|Social|31|-R$ 1.713,99'));
});

test('tela: o total é a última linha de cada quadro e fica fixo na base; as outras tabelas mantêm o total no topo', async () => {
  const alvo = await desenhar();
  for (const titulo of ['Incremento de economia', 'Decremento de economia', 'Incremento de categoria', 'Decremento de categoria']) {
    const linhas = secao(alvo, titulo).porTag('tr');
    assert.match(linhas[linhas.length - 1].className, /\btotal\b.*\bembaixo\b/, titulo);
    assert.equal(linhas.filter((tr) => /\btotal\b/.test(tr.className)).length, 1, titulo);
  }
  // criarTabela sem a opção continua com o total no topo (ex.: Visão geral, Bases)
  const topo = CV.ui.criarTabela({ colunas: [{ id: 'a', titulo: 'A', tipo: 'txt', valor: (l) => l.a }], linhas: [{ a: 'x' }, { a: 'y' }], total: { a: 'Total' }, ordem: { id: null, dir: 'asc' } });
  const ls = linhasDaTabela(topo);
  assert.deepEqual(ls.map((l) => l[0]), ['A', 'Total', 'x', 'y']);
});

test('tela: cards, saldo em destaque, saldo por mês e conferência', async () => {
  const alvo = await desenhar();
  const txt = alvo.textContent.replace(/ /g, ' ');
  // cards de tratativas
  assert.match(txt, /Acumulado6/);
  assert.match(txt, /Dias com tratativa4/);
  assert.match(txt, /Média por dia1,50/);
  // cards de valor e o saldo (negativo, em vermelho)
  assert.match(txt, /Incremento de economiaR\$ 1\.314,19/);
  assert.match(txt, /Decremento de categoria-R\$ 4\.017,29/);
  const heroi = alvo.achar((n) => /\bheroi\b/.test(n.className))[0];
  assert.ok(heroi.textContent.replace(/ /g, ' ').includes('-R$ 157,16'));
  assert.ok(heroi.achar((n) => /\bneg\b/.test(n.className)).length > 0);
  // saldo por mês: do mais novo ao mais antigo
  const meses = textoTabela(secao(alvo, 'Saldo por mês'));
  assert.deepEqual(meses[0], ['Mês', 'Incremento de economia', 'Incremento de categoria', 'Decremento de economia', 'Decremento de categoria', 'Saldo', 'Vs. mês anterior']);
  assert.deepEqual(meses[1], ['OUT/2026', 'R$ 85,41', 'R$ 0,00', 'R$ 0,00', '-R$ 110,58', '-R$ 25,17', 'R$ 131,99']);
  assert.deepEqual(meses[2], ['SET/2026', 'R$ 1.314,19', 'R$ 2.887,58', '-R$ 341,64', '-R$ 4.017,29', '-R$ 157,16', '–']);
  // conferência
  const conf = secao(alvo, 'Conferência dos dados');
  assert.ok(conf);
  assert.match(conf.textContent, /2 lançamento\(s\) de outra frente de serviço/);
  assert.match(conf.textContent, /\[Id 11, 22\]/); // para achar no formulário
  assert.match(conf.textContent, /Categoria Pública valendo zero, igual ao Power BI/);
  assert.match(conf.textContent, /Comércio popular contado como Comercial/);
  assert.match(conf.textContent, /igualPowerBI: false/);
});

test('tela: sem lançamentos no período os quadros dizem isso e a conferência some', async () => {
  const alvo = await desenhar({ de: '2027-01-01', ate: '2027-01-31' });
  const inc = textoTabela(secao(alvo, 'Incremento de economia'));
  assert.equal(inc.length, 2); // cabeçalho + a linha "nenhum lançamento"
  assert.equal(inc.some((l) => l[0] === 'Total'), false); // sem linhas, sem total
  assert.match(inc[1][0], /Nenhum lançamento neste período/);
  assert.equal(secao(alvo, 'Conferência dos dados'), undefined);
  assert.match(alvo.textContent.replace(/ /g, ' '), /Saldo do períodoR\$ 0,00/);
});
