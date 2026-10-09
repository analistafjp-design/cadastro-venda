'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ler } = require('./helpers');
const D = CV.dados;
const M = CV.metricas;

async function carregarVcg(opc) {
  const r = await CV.xlsx.lerPlanilha(ler('resultados_vcg.xlsx'), { colunas: D.CAMPOS_RESULTADOS_VCG });
  const a = await CV.xlsx.lerPlanilha(ler('atividades_vcg.xlsx'), { colunas: D.CAMPOS_ATIVIDADES });
  const guarda = CV.regras.escopo;
  CV.regras.escopo = CV.paginas.vcg.escopo;
  try {
    const la = D.limparAtividades(a.linhas, { soEscopo: true });
    const lr = D.limparResultados(r.linhas, 'vcg');
    const out = CV.cruzamento.montar(la.limpas, lr.limpas, opc || {});
    return { r, a, la, lr, out, porId: (id) => out.visitas.find((v) => v.id === String(id)) };
  } finally { CV.regras.escopo = guarda; }
}

test('o formulário do Resultados VCG é reconhecido pelo cabeçalho (inclusive a Matrícula com espaço invisível)', async () => {
  const r = await CV.xlsx.lerPlanilha(ler('resultados_vcg.xlsx'), { colunas: D.CAMPOS_RESULTADOS_VCG });
  assert.equal(D.detectarTipo(r.cabecalho), 'resultados');
  assert.equal(D.layoutResultados(r.cabecalho), 'vcg');
  assert.deepEqual(r.faltando, []);
  assert.equal(r.linhas.length, 11);
  // o formulário de Resultados de sempre continua sendo o "padrão"
  const p = await CV.xlsx.lerPlanilha(ler('resultados.xlsx'), { colunas: D.CAMPOS_RESULTADOS });
  assert.equal(D.layoutResultados(p.cabecalho), 'padrao');
  assert.equal(D.detectarTipo(p.cabecalho), 'resultados');
  // e o de Atividades não é confundido com nenhum dos dois
  const a = await CV.xlsx.lerPlanilha(ler('atividades_vcg.xlsx'), { colunas: D.CAMPOS_ATIVIDADES });
  assert.equal(D.detectarTipo(a.cabecalho), 'atividades');
});

test('limpeza do lançamento: matrícula, equipe, quantidade e a data informada vence a data do lançamento', async () => {
  const { lr } = await carregarVcg();
  const por = (id) => lr.limpas.find((x) => x.id === String(id));
  assert.equal(por(501).mat, '100000001');
  assert.equal(por(501).equipe, 'RIOVCGVENIN-001');
  assert.equal(por(501).qtdEcon, 1);
  assert.equal(por(501).data, '2026-03-03');
  assert.equal(por(511).data, '2026-03-06'); // "DATA:" informada; o lançamento foi em 12/03
  assert.equal(lr.limpas.length, 11);
  assert.equal(D.primeiroNumero('Foi acrescentada mais 1 economia no cadastro'), 1);
  assert.equal(D.primeiroNumero('abc'), null);
  assert.equal(D.primeiroNumero(3), 3);
});

test('classificação do formulário VCG: resultado × atualização cadastral', () => {
  const c = (atualizacao, obs, qtdEcon) => CV.resultados.classificarVcg({ atualizacao, obs, qtdEcon });
  const casos = [
    // [atualização, observação, qtd, tags esperadas, grupo]
    ['Nome do Bairro', 'Atualização do bairro', 1, ['atualizacao'], 'atualizacao'],
    ['Telefone', 'Atualização de telefone', 1, ['atualizacao'], 'atualizacao'],
    ['Endereço', 'Atualização de bairro de rio seco', 0, ['atualizacao'], 'atualizacao'],
    ['Nº de Porta', 'Ajuste de lote', 0, ['atualizacao'], 'atualizacao'],
    ['Venda Factível', 'Venda', 1, ['venda'], 'resultado'],
    ['Lote não cadastrado - Novo cliente', 'Cadastro completo', 1, ['novo_cliente'], 'resultado'],
    ['Lote não cadastrado - Novo cliente', 'Troca de Titularidade', 0, ['titularidade'], 'resultado'], // a observação desempata
    ['Incremento de economia', 'Atualização de economia', 2, ['incremento'], 'resultado'],
    ['Ajuste de Economia', 'Remoção de Economia', 0, ['decremento'], 'resultado'],
    ['Ajuste de Economia', 'Ajuste de Economia', 0, ['economia'], 'resultado'],
    ['Alteração de Categoria', 'Incremento de Economia.', 1, ['incremento', 'categoria'], 'resultado'],
    ['Alteração de Categoria', 'Ajuste de Categoria', 0, ['categoria'], 'resultado'],
    ['Negociação', 'Negociação de débitos', 0, ['debitos'], 'resultado'],
    ['Troca de Titularidade;E negociação', 'x', 0, ['titularidade', 'debitos'], 'resultado'],
    ['E-mail', 'Cliente quer receber fatura por email', 1, ['fatura'], 'resultado'],
  ];
  for (const [a, o, q, tags, grupo] of casos) {
    const r = c(a, o, q);
    assert.deepEqual([...r.tags].sort(), [...tags].sort(), a + ' / ' + o);
    assert.equal(r.grupo, grupo, a + ' / ' + o);
  }
  assert.equal(c('Venda Factível', 'Venda', 1).deltaEcon, 1); // economia acrescentada
  assert.equal(c('Venda Factível', 'Venda', 0).deltaEcon, null);
  assert.equal(c('Nome do Bairro', 'x', 1).deltaEcon, null);
});

test('cruzamento do VCG: o lançamento só vale para a visita da MESMA equipe', async () => {
  const { out, porId, lr } = await carregarVcg();
  const a = out.auditoria;
  // 501 -> visita 1 (equipe 001, finalizada): incremento
  const v1 = porId(1);
  assert.equal(v1.recurso, 'RIOVCGVENIN-001');
  assert.equal(v1.grupoRetorno, 'resultado');
  assert.ok(v1.tags.includes('incremento'));
  // 504 -> visita finalizada da equipe 002: venda
  const venda = out.visitas.find((v) => v.mat === '100000008' && v.grupoStatus === 'exec');
  assert.equal(venda.grupoRetorno, 'resultado');
  assert.ok(venda.tags.includes('venda'));
  // 508 (telefone, 10/03) -> a visita de 10/03 da mesma matrícula: atualização, não resultado
  const v5 = porId(5);
  assert.equal(v5.grupoRetorno, 'atualizacao');
  // 505: a matrícula 100000009 foi visitada pela equipe 004, mas o lançamento é da 001
  assert.equal(out.visitas.find((v) => v.mat === '100000009').grupoRetorno, null);
  assert.equal(a.outraEquipe, 2); // 505 e 509 (equipe 003, fora do painel)
  assert.equal(a.foraDasBases, 1); // 507: matrícula nunca visitada
  assert.equal(a.retornosTotal, lr.limpas.length);
  // a conta fecha: tudo cai em exatamente um balde
  const baldes = a.atribuidos + a.foraDasBases + a.anteriorVisita + a.outraEquipe + a.foraJanela + a.matriculaInvalida + a.semData + a.frenteIgnorada;
  assert.equal(baldes, a.retornosTotal);
});

test('sem equipe no lançamento (formulário de sempre) o cruzamento continua só pela matrícula', async () => {
  const { carregarFixtures } = require('./helpers');
  const { out } = await carregarFixtures();
  assert.equal(out.auditoria.outraEquipe, 0);
  assert.equal(out.auditoria.atribuidos, 11);
});

test('conferência dos lançamentos com as atividades das equipes do painel', async () => {
  const { lr, la } = await carregarVcg();
  const guarda = CV.regras.escopo;
  CV.regras.escopo = CV.paginas.vcg.escopo;
  try {
    const cf = M.conferirLancamentos(lr.limpas, la.limpas, 30);
    const por = Object.fromEntries(cf.porEquipe.map((l) => [l.equipe, l]));
    assert.deepEqual(cf.porEquipe.map((l) => l.equipe), ['RIOVCGVENIN-001', 'RIOVCGVENIN-002', 'RIOVCGVENIN-004']);
    assert.equal(por['RIOVCGVENIN-001'].lancados, 4); // 501, 502, 505 e 508
    const soma = (k) => cf.porEquipe.reduce((s, l) => s + l[k], 0);
    assert.equal(soma('lancados'), 10); // 11 lançamentos, 1 da equipe 003 fora do painel
    assert.deepEqual(cf.foraEscopo, [['RIOVCGVENIN-003', 1]]);
    // cada lançamento cai em exatamente uma categoria
    for (const l of cf.porEquipe) assert.equal(l.executada + l.naoExecutada + l.foraJanela + l.outraEquipe + l.sem, l.lancados, l.equipe);
    assert.ok(soma('executada') >= 4); // 501, 502, 503, 504 têm visita finalizada da própria equipe
    assert.equal(soma('sem'), 1); // 507: matrícula sem atividade carregada
    assert.equal(soma('outraEquipe'), 1); // 505: visita da equipe 004, lançamento da 001
    assert.equal(cf.atividades.dias > 0, true);
  } finally { CV.regras.escopo = guarda; }
});

test('cards do VCG: venda, novo cliente e negociação saem separados', async () => {
  const { out } = await carregarVcg();
  const c = M.cartoes(out.visitas);
  assert.ok(c.resultado >= 4);
  assert.equal(c.venda, 1);
  assert.equal(c.novo, 0 + out.visitas.filter((v) => v.grupoStatus === 'exec' && v.grupoRetorno === 'resultado' && v.tags.includes('novo_cliente')).length);
  assert.equal(M.tiposDoResultado({ tags: ['novo_cliente'] }).join(), 'novo');
  assert.ok(M.TIPOS_RESULTADO.some((t) => t.id === 'novo'));
});

test('páginas: o formulário do VCG só é lido pela página VCG, mesmo sem "VCG" no nome', () => {
  const P = CV.paginas;
  assert.match(P.interior.recusa('Resultados - 2026.xlsx', 'resultados', 'vcg'), /VCG/);
  assert.equal(P.interior.recusa('Resultados - 2026.xlsx', 'resultados', 'padrao'), null);
  assert.equal(P.vcg.recusa('Resultados - VCG..xlsx', 'resultados', 'vcg'), null);
  assert.equal(P.vcg.recusa('Resultados - VCG..xlsx', 'resultados', 'padrao'), null);
  assert.match(P.vcg.recusa('Resultados - 2026.xlsx', 'resultados', 'padrao'), /VCG/);
  assert.equal(P.ehVcg('Resultados - VCG..xlsx'), true);
});
