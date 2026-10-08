'use strict';
// Carrega os módulos na ordem certa e expõe atalhos para os testes.
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', 'js');
['normalize', 'regras', 'zip', 'xlsx', 'projetos', 'resultados', 'escopo', 'tempos', 'dados', 'cruzamento', 'metricas', 'pasta', 'xlsx-escrita', 'exporta'].forEach((m) =>
  require(path.join(RAIZ, m + '.js'))
);

const FIX = path.join(__dirname, 'fixtures');
const ler = (nome) => fs.readFileSync(path.join(FIX, nome));

async function carregarFixtures(opcCruzamento) {
  const a = await CV.xlsx.lerPlanilha(ler('atividades.xlsx'), { colunas: CV.dados.CAMPOS_ATIVIDADES });
  const r = await CV.xlsx.lerPlanilha(ler('resultados.xlsx'), { colunas: CV.dados.CAMPOS_RESULTADOS });
  const la = CV.dados.limparAtividades(a.linhas);
  const lr = CV.dados.limparResultados(r.linhas);
  const out = CV.cruzamento.montar(la.limpas, lr.limpas, opcCruzamento || {});
  return { a, r, la, lr, out, porId: (id) => out.visitas.find((v) => v.id === String(id)) };
}

module.exports = { CV: globalThis.CV, ler, carregarFixtures, FIX };
