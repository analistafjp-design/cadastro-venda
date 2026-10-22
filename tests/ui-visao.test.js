'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarFixtures } = require('./helpers');
const { instalar, linhasDaTabela } = require('./dom-falso');
const M = CV.metricas;

/** Monta a Visão geral com as visitas das planilhas sintéticas e devolve o que foi desenhado. */
async function desenharVisao(extra) {
  instalar();
  const { out } = await carregarFixtures();
  const alvo = document.createElement('div');
  CV.ui.renderVisao(alvo, Object.assign({
    vs: out.visitas, equipes: CV.regras.escopo.equipes, gran: 'dia', abertas: new Set(),
    ordemDe: (id, padrao) => Object.assign({}, padrao), aoMudarGran: () => {},
  }, extra));
  return { alvo, vs: out.visitas };
}

const secao = (alvo, titulo) => alvo.achar((n) => n.tagName === 'SECTION' && n.porTag('h2')[0] && n.porTag('h2')[0].textContent === titulo)[0];

test('Bases: o Exec fica à vista e a efetividade é Com resultados ÷ Exec (não ÷ Percorrido)', async () => {
  const { alvo, vs } = await desenharVisao();
  const bases = secao(alvo, 'Bases');
  assert.ok(bases, 'a seção Bases existe');
  const [cab, ...linhas] = linhasDaTabela(bases);
  assert.deepEqual(cab, ['Base', 'Percorrido', 'Exec', 'Com resultados', 'Efetividade']);
  const esperado = new Map(M.agruparPor(vs, (v) => v.projeto).filter((l) => l.percorrido > 0).map((l) => [l.chave, l]));
  assert.equal(linhas.length, esperado.size);
  let diferePercorrido = 0;
  for (const [base, perc, exec, res, taxa] of linhas) {
    const l = esperado.get(base);
    assert.ok(l, base);
    const n = (t) => Number(t.replace(/\./g, ''));
    assert.equal(n(perc), l.percorrido, base);
    assert.equal(n(exec), l.exec, base);
    assert.equal(n(res), l.resultado, base);
    assert.equal(taxa, CV.ui.fmt.pct(l.exec ? l.resultado / l.exec : null), base); // a conta que se vê na linha fecha com o % (sem Exec: “–”)
    if (l.percorrido !== l.exec) diferePercorrido++;
  }
  assert.ok(diferePercorrido > 0, 'o teste só vale se alguma base tem Exoc (Percorrido ≠ Exec)');
  assert.match(bases.textContent, /Com resultados ÷ Exec/);
  assert.match(bases.textContent, /As Exoc entram no Percorrido, mas não na conta/);
});

test('Visão geral: o card de Efetividade usa a mesma conta (Com resultados ÷ Exec)', async () => {
  const { alvo, vs } = await desenharVisao();
  const heroi = alvo.achar((n) => /\bheroi\b/.test(n.className))[0];
  assert.ok(heroi);
  const r = M.resumo(vs);
  assert.ok(heroi.textContent.includes(CV.ui.fmt.pct(r.resultado / r.exec)));
  assert.equal(heroi.attrs.title, 'Efetividade = Com resultados ÷ Exec');
});

const cartaoDe = (alvo, rotulo) => alvo.achar((n) => /\bcartao\b/.test(n.className) && n.porTag('div').some((d) => /\brot\b/.test(d.className) && d.textContent === rotulo))[0];

test('serviços dos cards: as visitas do Excel são as mesmas que o card conta', async () => {
  const { vs } = await desenharVisao();
  const c = M.cartoes(vs);
  assert.deepEqual(M.SERVICOS_CARTAO.map((s) => s.id), ['inc', 'cat', 'titular']);
  assert.equal(M.visitasDoServico(vs, 'inc').length, c.totalInc);
  assert.equal(M.visitasDoServico(vs, 'cat').length, c.totalCat);
  assert.equal(M.visitasDoServico(vs, 'titular').length, c.titular);
  assert.ok(c.totalInc > 0, 'a planilha de teste tem incremento');
  for (const s of M.SERVICOS_CARTAO) {
    for (const v of M.visitasDoServico(vs, s.id)) assert.ok(v.grupoStatus === 'exec' && v.grupoRetorno === 'resultado', s.id); // só visita executada com resultado
  }
  assert.deepEqual(M.visitasDoServico(vs, 'qualquer'), []);
});

test('cards de incremento, categoria e titularidade têm o botão Excel; os demais não', async () => {
  const chamados = [];
  const { alvo, vs } = await desenharVisao({ aoBaixar: (id) => chamados.push(id) });
  const c = M.cartoes(vs);
  const botao = (rotulo) => cartaoDe(alvo, rotulo).porTag('button')[0];
  for (const [rotulo, id, n] of [['Total de incremento', 'inc', c.totalInc], ['Total alteração de categoria', 'cat', c.totalCat], ['Troca de titularidade', 'titular', c.titular]]) {
    const b = botao(rotulo);
    assert.ok(b, rotulo);
    assert.equal(b.textContent, 'Excel');
    assert.equal(b.attrs['aria-label'], 'Baixar em Excel: ' + rotulo);
    assert.equal(!!b.disabled, n === 0, rotulo + ': desligado só sem visita');
    if (n > 0) { b.ouvintes.click[0](); assert.equal(chamados.pop(), id); }
    assert.equal(cartaoDe(alvo, rotulo).textContent.startsWith(rotulo + CV.ui.fmt.int(n)), true, rotulo + ': o número continua no card');
  }
  for (const rotulo of ['Percorrido', 'Exec', 'Exoc', 'Com resultados', 'Incremento de economia', 'Incremento de economia e alteração de categoria']) {
    assert.equal(cartaoDe(alvo, rotulo).porTag('button').length, 0, rotulo + ' não tem botão');
  }
});

test('cards: sem a função de baixar (ex.: tela sem Excel) não aparece botão nenhum', async () => {
  const { alvo } = await desenharVisao({ aoBaixar: null });
  assert.equal(alvo.porTag('button').filter((b) => b.textContent === 'Excel').length, 0);
});
