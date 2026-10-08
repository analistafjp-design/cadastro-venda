/*
 * ui-grafico.js — gráfico de colunas por período (SVG puro, sem biblioteca).
 *   modo "volume": executadas empilhadas — com resultado (azul, na base) + demais (cinza)
 *   modo "taxa"  : % de resultado por período (uma série) + linha de referência da média
 * A tabela logo abaixo é o "gêmeo" textual do gráfico (mesmos números).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const ui = CV.ui;
  const { h, s, fmt } = ui;

  /** Passo "redondo" (1, 2, 2,5, 5, 10 × 10ⁿ) que cabe em ~4 divisões; devolve { max, passo }. */
  function escala(valorTopo) {
    const bruto = Math.max(valorTopo, 1e-9) / 4;
    const exp = Math.pow(10, Math.floor(Math.log10(bruto)));
    const f = bruto / exp;
    const passo = (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * exp;
    return { passo, max: passo * Math.max(1, Math.ceil(valorTopo / passo - 1e-9)) };
  }

  /** Retângulo com topo arredondado (a base fica reta, no eixo). */
  function colunaPath(x, y, w, hgt, r) {
    const rr = Math.min(r, w / 2, hgt);
    return `M${x},${y + hgt}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + hgt}Z`;
  }

  function rotuloPeriodo(chave, gran) {
    if (gran === 'mes') return fmt.mes(chave + '-01');
    if (gran === 'semana') return fmt.curta(chave);
    return fmt.curta(chave);
  }

  function tituloPeriodo(chave, gran) {
    if (gran === 'mes') return fmt.mes(chave + '-01');
    if (gran === 'semana') return 'Semana de ' + fmt.longa(chave);
    return CV.normalize.diaDaSemana(chave) + ', ' + fmt.longa(chave);
  }

  /**
   * @param alvo   elemento onde desenhar
   * @param linhas séries (metricas.porPeriodo) em ordem cronológica
   * @param op     { modo: 'volume'|'taxa', gran, mediaTaxa }
   */
  function desenharGrafico(alvo, linhas, op) {
    alvo.textContent = '';
    if (!linhas.length) {
      alvo.appendChild(h('p', { class: 'nota', text: 'Sem dados no período selecionado.' }));
      return;
    }
    const W = Math.max(320, alvo.clientWidth || 800);
    const H = 270;
    const m = { l: 44, r: 10, t: 12, b: 30 };
    const iw = W - m.l - m.r;
    const ih = H - m.t - m.b;
    const modo = op.modo;
    const n = linhas.length;

    const valorTopo = linhas.reduce((mx, l) => Math.max(mx, modo === 'taxa' ? (l.taxaResultado || 0) : l.exec), 0);
    const esc = modo === 'taxa' ? escala(Math.max(valorTopo * 100, 5)) : escala(valorTopo);
    const max = modo === 'taxa' ? esc.max / 100 : esc.max;
    const nTicks = Math.round(esc.max / esc.passo);
    const y = (v) => m.t + ih - (v / max) * ih;
    const slot = iw / n;
    const larg = Math.max(1.5, Math.min(24, slot - 2));

    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': modo === 'taxa' ? 'Taxa de resultado por período' : 'Visitas executadas por período, com e sem resultado' });

    // grade e eixo Y
    const grade = s('g', { class: 'grade' });
    const eixoY = s('g', { class: 'eixo' });
    for (let i = 0; i <= nTicks; i++) {
      const v = (max / nTicks) * i;
      const yy = y(v);
      grade.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy }));
      eixoY.appendChild(s('text', { x: m.l - 8, y: yy + 4, 'text-anchor': 'end' }, modo === 'taxa' ? Math.round(v * 100) + '%' : fmt.int(Math.round(v * 100) / 100)));
    }
    svg.appendChild(grade);
    svg.appendChild(eixoY);

    // eixo X
    const eixoX = s('g', { class: 'eixo' });
    const passo = Math.max(1, Math.ceil(54 / slot));
    linhas.forEach((l, i) => {
      if (i % passo !== 0) return;
      eixoX.appendChild(s('text', { x: m.l + slot * i + slot / 2, y: H - 10, 'text-anchor': 'middle' }, rotuloPeriodo(l.chave, op.gran)));
    });
    svg.appendChild(eixoX);

    // colunas
    const cols = s('g');
    const alvos = [];
    linhas.forEach((l, i) => {
      const cx = m.l + slot * i + slot / 2;
      const x = cx - larg / 2;
      const g = s('g', { class: 'coluna', opacity: l.maturando > 0 ? 0.55 : 1 });
      if (modo === 'taxa') {
        const v = l.taxaResultado || 0;
        if (v > 0) g.appendChild(s('path', { d: colunaPath(x, y(v), larg, m.t + ih - y(v), 4), fill: 'var(--serie-1)' }));
      } else {
        const hRes = (l.resultado / max) * ih;
        const hOut = ((l.exec - l.resultado) / max) * ih;
        const gap = hRes > 0 && hOut > 0 ? 2 : 0;
        if (hRes > 0) {
          const topoRes = m.t + ih - hRes;
          // com a outra parte por cima, o topo do azul é reto; sem ela, arredondado
          g.appendChild(hOut > 0
            ? s('rect', { x, y: topoRes, width: larg, height: hRes, fill: 'var(--serie-1)' })
            : s('path', { d: colunaPath(x, topoRes, larg, hRes, 4), fill: 'var(--serie-1)' }));
        }
        if (hOut > 0) {
          const topo = m.t + ih - hRes - hOut;
          g.appendChild(s('path', { d: colunaPath(x, topo, larg, Math.max(0, hOut - gap), 4), fill: 'var(--serie-2)' }));
        }
      }
      cols.appendChild(g);
      // área de toque maior que a marca
      const hit = s('rect', { class: 'alvo', x: m.l + slot * i, y: m.t, width: slot, height: ih });
      alvos.push(hit);
      cols.appendChild(hit);
    });
    svg.appendChild(cols);

    // linha de base
    svg.appendChild(s('line', { x1: m.l, x2: W - m.r, y1: m.t + ih, y2: m.t + ih, stroke: 'var(--line-2)', 'stroke-width': 1 }));

    // referência da média (modo taxa)
    if (modo === 'taxa' && op.mediaTaxa) {
      const yy = y(op.mediaTaxa);
      svg.appendChild(s('g', { class: 'ref' },
        s('line', { x1: m.l, x2: W - m.r, y1: yy, y2: yy }),
        s('text', { x: W - m.r - 2, y: yy - 5, 'text-anchor': 'end' }, 'média do período ' + fmt.pct(op.mediaTaxa))
      ));
    }

    alvo.appendChild(svg);

    // dica (tooltip)
    const dica = h('div', { class: 'dica', hidden: true, role: 'status' });
    alvo.appendChild(dica);

    function mostrar(i) {
      const l = linhas[i];
      dica.textContent = '';
      dica.appendChild(h('div', { class: 't', text: tituloPeriodo(l.chave, op.gran) }));
      const linha = (cor, rotulo, valor) =>
        h('div', { class: 'l' }, h('span', null, cor ? h('i', { style: { background: cor } }) : null, rotulo), h('b', { text: valor }));
      if (modo === 'volume') {
        dica.appendChild(linha('var(--serie-1)', 'Com resultado', fmt.int(l.resultado)));
        dica.appendChild(linha('var(--serie-2)', 'Demais executadas', fmt.int(l.exec - l.resultado)));
      }
      dica.appendChild(linha(null, 'Taxa de resultado', fmt.pct(l.taxaResultado)));
      dica.appendChild(h('div', { class: 'm', text: `${fmt.int(l.exec)} executadas · ${fmt.int(l.oc)} ocorrências · ${fmt.int(l.semRetorno)} sem retorno` }));
      if (l.maturando > 0) dica.appendChild(h('div', { class: 'm', text: 'Em maturação: retornos do backoffice ainda chegando.' }));
      dica.hidden = false;
      const cx = m.l + slot * i + slot / 2;
      const escala = alvo.clientWidth / W;
      const largDica = dica.offsetWidth;
      let esq = cx * escala + 12;
      if (esq + largDica > alvo.clientWidth) esq = cx * escala - largDica - 12;
      dica.style.left = Math.max(0, esq) + 'px';
      dica.style.top = '8px';
      alvos.forEach((a, k) => a.classList.toggle('foco', k === i));
    }
    function esconder() {
      dica.hidden = true;
      alvos.forEach((a) => a.classList.remove('foco'));
    }
    alvos.forEach((a, i) => {
      a.addEventListener('pointerenter', () => mostrar(i));
      a.addEventListener('pointermove', () => mostrar(i));
      a.addEventListener('pointerleave', esconder);
    });
    // teclado: setas percorrem os períodos
    alvo.tabIndex = 0;
    let atual = -1;
    alvo.onkeydown = (e) => {
      if (e.key === 'ArrowRight') atual = Math.min(n - 1, atual + 1);
      else if (e.key === 'ArrowLeft') atual = Math.max(0, atual < 0 ? n - 1 : atual - 1);
      else if (e.key === 'Escape') { atual = -1; esconder(); return; }
      else return;
      e.preventDefault();
      mostrar(atual);
    };
    alvo.onblur = () => { atual = -1; esconder(); };
  }

  ui.desenharGrafico = desenharGrafico;
  if (typeof module !== 'undefined' && module.exports) module.exports = ui;
})(typeof window !== 'undefined' ? window : globalThis);
