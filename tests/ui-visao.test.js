'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { carregarFixtures } = require('./helpers');
const { instalar, linhasDaTabela } = require('./dom-falso');
const M = CV.metricas;

/** Monta a Visão geral com as visitas das planilhas sintéticas e devolve o que foi desenhado. */
async function desenharVisao() {
  instalar();
  const { out } = await carregarFixtures();
  const alvo = document.createElement('div');
  CV.ui.renderVisao(alvo, {
    vs: out.visitas, equipes: CV.regras.escopo.equipes, gran: 'dia', abertas: new Set(),
    ordemDe: (id, padrao) => Object.assign({}, padrao), aoMudarGran: () => {},
  });
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
