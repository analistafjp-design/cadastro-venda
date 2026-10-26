'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ler } = require('./helpers');
const { instalar, linhasDaTabela } = require('./dom-falso');
const G = CV.negociacoes;
const { fmt } = CV.ui;

// atividades_negociacoes.xlsx (tests/fixtures/gerar.py, linhas_negociacoes) tem cada cenário com o valor conferido à mão.
async function carregar() {
  const r = await CV.xlsx.lerPlanilha(ler('atividades_negociacoes.xlsx'), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  const la = CV.dados.limparAtividades(r.linhas);
  return { r, la, lista: G.preparar(la.limpas) };
}

const OUT = { de: '2026-10-01', ate: '2026-10-31' };
const ids = (lista) => lista.map((a) => a.id).sort();

test('valor em reais: aceita R$, milhar com ponto, centavos com vírgula ou ponto e célula numérica', () => {
  const v = CV.normalize.valorReais;
  assert.equal(v('R$ 1.234,56'), 1234.56);
  assert.equal(v('645,15'), 645.15);
  assert.equal(v('R$500,00'), 500);
  assert.equal(v('1234.56'), 1234.56);
  assert.equal(v('1.500'), 1500); // ponto de milhar, sem centavos
  assert.equal(v('500'), 500);
  assert.equal(v('R$ 1.234.567,89'), 1234567.89);
  assert.equal(v(1000.5), 1000.5);
  assert.equal(v('não informado'), null);
  assert.equal(v(''), null);
  assert.equal(v(null), null);
});

test('a planilha é lida com "Negociou O Débito?" e "Valor Total dos Débitos"', async () => {
  const { r, la } = await carregar();
  assert.equal(r.linhas.length, 11);
  assert.ok(!r.faltando.includes('negociou') && !r.faltando.includes('valorDebitos'));
  const p = (id) => la.limpas.find((a) => a.id === String(80000000 + id));
  assert.equal(p(1).negociou, 'SIM');
  assert.equal(p(1).valorDebitos, 1234.56);
  assert.equal(p(1).valorDebitosTxt, 'R$ 1.234,56'); // o texto original vai para o Excel
  assert.equal(p(2).negociou, 'Sim'); // espaço no fim é aparado
  assert.equal(p(4).valorDebitos, 1000.5); // célula numérica
  assert.equal(p(4).valorDebitosTxt, null);
  assert.equal(p(5).valorDebitos, null); // sem valor
  assert.equal(p(9).valorDebitos, 1234.5); // "1234.5": ponto dos centavos
  assert.equal(p(4).tipo, 'Venda Potenciais/Factíveis'); // venda da equipe do escopo também é guardada
});

test('negociação = Finalizada + "Sim" (qualquer caixa) + equipe do escopo; a cidade não filtra', async () => {
  const { lista } = await carregar();
  const esperado = [1, 2, 3, 4, 5, 9, 10].map((n) => String(80000000 + n)).sort();
  assert.deepEqual(ids(lista), esperado);
  // de fora: 6 (ocorrência), 7 ("NÃO"), 8 (RIOCORTE fora do escopo), 11 (resposta vazia)
  assert.ok(lista.some((a) => a.cidade === 'ITABORAI')); // como no relatório: só a equipe filtra
  assert.deepEqual(G.limites(lista), { min: '2026-09-15', max: '2026-10-09' });
});

test('tabela por equipe: total, valor, ticket médio e o total na base (outubro)', async () => {
  const { lista } = await carregar();
  const t = G.porEquipe(G.filtrar(lista, OUT));
  assert.deepEqual(t.linhas.map((l) => [l.recurso, l.total, l.valor, Math.round(l.ticket * 100) / 100, l.semValor]), [
    ['RIORECIN-013', 3, 2000, 666.67, 0],
    ['RIOVENIN-004', 2, 1000.5, 500.25, 1], // a sem valor conta na quantidade e no ticket
    ['RIORECIN-034', 1, 1234.5, 1234.5, 0],
  ]);
  assert.equal(t.total.recurso, 'Total');
  assert.equal(t.total.total, 6);
  assert.equal(t.total.valor, 4235);
  assert.equal(Math.round(t.total.ticket * 100) / 100, 705.83);
  assert.equal(t.total.semValor, 1);
  // o período inteiro traz setembro também
  const tudo = G.porEquipe(lista).total;
  assert.deepEqual([tudo.total, tudo.valor], [7, 4435]);
});

test('filtros: período e equipe (sem diferenciar espaço e caixa)', async () => {
  const { lista } = await carregar();
  assert.equal(G.filtrar(lista, { de: '2026-09-01', ate: '2026-09-30' }).length, 1);
  assert.equal(G.filtrar(lista, Object.assign({ equipe: 'riorecin-013' }, OUT)).length, 3);
  assert.equal(G.filtrar(lista, { equipe: 'RIORECIN-007' }).length, 0);
  assert.equal(G.porEquipe([]).linhas.length, 0);
  assert.equal(G.porEquipe([]).total.ticket, 0);
});

test('meses do seletor: todos entre o primeiro e o último dia, do mais novo para o mais antigo', () => {
  assert.deepEqual(G.mesesEntre('2025-11-20', '2026-02-03'), ['2026-02', '2026-01', '2025-12', '2025-11']);
  assert.deepEqual(G.mesesEntre('2026-10-01', '2026-10-31'), ['2026-10']);
  assert.deepEqual(G.mesesEntre(null, null), []);
});

test('tela: Recurso, Total negociação, Valor negociado e Ticket médio, ordenada pelo total, com o total embaixo', async () => {
  instalar();
  const { lista } = await carregar();
  const alvo = document.createElement('div');
  CV.ui.renderNegociacoes(alvo, { tabela: G.porEquipe(G.filtrar(lista, OUT)), ordemDe: (id, padrao) => Object.assign({}, padrao) });
  const [cab, ...linhas] = linhasDaTabela(alvo);
  assert.deepEqual(cab, ['Recurso', 'Total negociação', 'Valor negociado', 'Ticket médio']);
  assert.deepEqual(linhas, [
    ['RIORECIN-013', '3', fmt.brl(2000), fmt.brl(2000 / 3)],
    ['RIOVENIN-004', '2', fmt.brl(1000.5), fmt.brl(500.25)],
    ['RIORECIN-034', '1', fmt.brl(1234.5), fmt.brl(1234.5)],
    ['Total', '6', fmt.brl(4235), fmt.brl(4235 / 6)],
  ]);
  assert.match(alvo.textContent, /Negociação — venda e recadastro/);
  assert.match(alvo.textContent, /1 negociação\(ões\) sem “Valor Total dos Débitos”/);
});

test('tela: período sem negociação mostra a tabela vazia, sem total', () => {
  instalar();
  const alvo = document.createElement('div');
  CV.ui.renderNegociacoes(alvo, { tabela: G.porEquipe([]), ordemDe: (id, padrao) => Object.assign({}, padrao) });
  const [, ...linhas] = linhasDaTabela(alvo);
  assert.deepEqual(linhas, [['Nenhuma negociação neste período.']]);
});

test('Excel: a tabela por equipe (com o total) e uma linha por negociação com o valor', async () => {
  const { lista } = await carregar();
  const out = G.filtrar(lista, OUT);
  const eq = CV.exporta.abaNegociacoesEquipe(G.porEquipe(out));
  assert.equal(eq.linhas.length, 4);
  const val = (aba, titulo, l) => aba.colunas.find((c) => c.titulo === titulo).valor(l);
  const total = eq.linhas[3];
  assert.deepEqual([val(eq, 'Recurso', total), val(eq, 'Total negociação', total), val(eq, 'Valor negociado (R$)', total), val(eq, 'Ticket médio (R$)', total)], ['Total', 6, 4235, 705.83]);
  const det = CV.exporta.abaNegociacoes(out);
  const a1 = out.find((a) => a.id === '80000001');
  assert.equal(val(det, 'Valor Total dos Débitos', a1), 'R$ 1.234,56');
  assert.equal(val(det, 'Valor negociado (R$)', a1), 1234.56);
  assert.equal(val(det, 'Negociou O Débito?', a1), 'SIM');
  // vira arquivo e volta
  const blob = await CV.xlsxw.gerar([eq, det]);
  const lido = await CV.xlsx.lerPlanilha(new Uint8Array(await blob.arrayBuffer()), { colunas: { recurso: ['Recurso'], total: ['Total negociação'] } });
  assert.equal(lido.linhas.length, 4);
  assert.equal(lido.linhas[3].total, 6);
});

test('a aba Negociações é só da página Interior', () => {
  assert.equal(CV.paginas.interior.negociacoes, true);
  assert.equal(CV.paginas.vcg.negociacoes, false);
});
