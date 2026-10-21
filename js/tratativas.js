/*
 * tratativas.js — incremento e decremento de ECONOMIA e de CATEGORIA, em R$, direto da planilha de
 * Resultados (formulário do backoffice). É a conta do relatório TRATATIVAS do Power BI, em funções
 * puras (sem DOM), e não depende das atividades nem do cruzamento por matrícula.
 *
 *   Economia  (DE: / PARA:)            "2 Residências" -> "5 Residências": +3 economias
 *     incremento = PARA > DE, e o lançamento não está marcado como "Decremento"
 *                  valor = (PARA − DE) × tarifa da categoria de PARA
 *     decremento = PARA < DE (qualquer rótulo)
 *                  valor = (PARA − DE) × tarifa              (mesma categoria nos dois lados)
 *                          (PARA − DE) × (tarifa DE − tarifa PARA)   (categorias diferentes, como no Power BI)
 *   Categoria (ANTERIOR / ATUAL × QUANTIDADE)
 *     valor = QUANTIDADE × (tarifa ATUAL − tarifa ANTERIOR); positivo = incremento, negativo = decremento
 *   Saldo = soma dos quatro quadros.
 *
 * Só entram lançamentos da frente de serviço de `regras.tratativas.frente` (Cadastro). A data é a da
 * conclusão do formulário. Os valores são somados em centavos inteiros (sem erro de ponto flutuante).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  const OUTROS = 'Outros';
  const PUBLICA = 'Pública';
  const EXEMPLOS = 5;

  /** Os números batem com os do relatório do Power BI (inclusive os dois detalhes de regras.igualPowerBI)? */
  const igualPowerBI = () => CV.regras.tratativas.igualPowerBI !== false;

  /** Na ordem em que aparecem na tela: economia à esquerda, categoria à direita (2 × 2). */
  const QUADROS = [
    { id: 'incEco', titulo: 'Incremento de economia', tipo: 'economia', sinal: 1, colA: 'De', colB: 'Para', colN: 'Incremento', colValor: 'Valor incremento' },
    { id: 'incCat', titulo: 'Incremento de categoria', tipo: 'categoria', sinal: 1, colA: 'Anterior', colB: 'Atual', colN: 'Total', colValor: 'Valor incremento' },
    { id: 'decEco', titulo: 'Decremento de economia', tipo: 'economia', sinal: -1, colA: 'De', colB: 'Para', colN: 'Decremento', colValor: 'Valor decremento' },
    { id: 'decCat', titulo: 'Decremento de categoria', tipo: 'categoria', sinal: -1, colA: 'Anterior', colB: 'Atual', colN: 'Total', colValor: 'Valor decremento' },
  ];

  const MESES = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
  /** '2026-10' -> 'OUT/2026' */
  const rotuloMes = (ym) => MESES[Number(ym.slice(5, 7)) - 1] + '/' + ym.slice(0, 4);

  // ---------------------------------------------------------------- leitura dos textos

  /** Categoria de um texto livre ("2 Comércios", "P. Comercio", "Publica"...); "Outros" se não reconhecer. */
  function categoriaDe(txt) {
    const k = N().chave(txt);
    if (!k) return OUTROS;
    for (const c of CV.regras.tratativas.categorias) {
      if (c.soCorrigido && igualPowerBI()) continue;
      if (c.contem.some((s) => k.indexOf(s) >= 0)) return c.nome;
    }
    return OUTROS;
  }

  /**
   * Nome da categoria nos quadros de CATEGORIA (campos ANTERIOR e ATUAL): a categoria com tarifa; senão uma de
   * `outrasCategorias` ("Sem fins lucrativos", "CadÚnico"); senão o próprio texto, como foi escrito. "Outros" só
   * para campo vazio. É só o nome: a tarifa de quem não está em `tarifas` continua zero.
   */
  function nomeCategoria(txt) {
    const cat = categoriaDe(txt);
    if (cat !== OUTROS) return cat;
    const k = N().chave(txt);
    if (!k) return OUTROS;
    const conhecida = (CV.regras.tratativas.outrasCategorias || []).find((o) => o.contem.some((s) => k.indexOf(s) >= 0));
    if (conhecida) return conhecida.nome;
    const t = String(txt).trim().replace(/\s+/g, ' ');
    return t === t.toUpperCase() ? t.charAt(0) + t.slice(1).toLowerCase() : t; // "BAIRRO LEGAL" -> "Bairro legal"
  }

  const temTarifa = (cat) => typeof CV.regras.tratativas.tarifas[cat] === 'number';
  /** Tarifa em centavos por economia; sem tarifa (ex.: "Outros") = 0, como o Power BI (valor em branco). */
  const centavosDe = (cat) => (temTarifa(cat) ? Math.round(CV.regras.tratativas.tarifas[cat] * 100) : 0);
  /** Nos quadros de categoria o relatório não acha a tarifa da Pública (acento): vale zero. */
  const centavosCategoria = (cat) => (igualPowerBI() && cat === PUBLICA ? 0 : centavosDe(cat));

  /** "2 Residências" -> 2; sem número no começo -> null. */
  function numeroInicial(txt) {
    const m = /^\s*(\d+)/.exec(txt === null || txt === undefined ? '' : String(txt));
    return m ? Number(m[1]) : null;
  }

  const NUMEROS_POR_EXTENSO = { UM: 1, UMA: 1, DOIS: 2, DUAS: 2, TRES: 3, QUATRO: 4, CINCO: 5 };

  /**
   * O que um texto de DE: / PARA: diz sobre as economias.
   *   { n, cat }          uma categoria só: "2 Residências", "DE 11 ECONOMIAS RESIDENCIAIS", "UMA COMERCIAL"
   *   { composto, porCat } mais de uma categoria no mesmo texto ("1 RESIDENCIAL E 1 COMERCIAL"): porCat é
   *                       { categoria: quantidade }; o lançamento é calculado por categoria (ver preparar)
   *   null                vazio ou sem número que dê para ler
   * Um texto "N Categoria" dá o mesmo resultado de sempre (número do começo, categoria do texto todo).
   */
  function lerEconomias(txt) {
    const k = N().chave(txt);
    if (!k) return null;
    const marcas = [];
    const rx = /(?:\b(\d+))|(?:\b(UM|UMA|DOIS|DUAS|TRES|QUATRO|CINCO)\b)/g;
    for (let m = rx.exec(k); m; m = rx.exec(k)) marcas.push({ n: m[1] !== undefined ? Number(m[1]) : NUMEROS_POR_EXTENSO[m[2]], de: m.index + m[0].length, ini: m.index });
    const grupos = [];
    marcas.forEach((m, i) => {
      const cat = categoriaDe(k.slice(m.de, i + 1 < marcas.length ? marcas[i + 1].ini : k.length));
      if (cat !== OUTROS) grupos.push({ n: m.n, cat });
    });
    if (grupos.length > 1) {
      const porCat = {};
      for (const g of grupos) porCat[g.cat] = (porCat[g.cat] || 0) + g.n;
      return { composto: true, porCat };
    }
    if (grupos.length === 1) return grupos[0];
    const n = numeroInicial(k); // sem categoria reconhecida ("5 Salas"): número do começo, categoria "Outros"
    return n === null ? null : { n, cat: categoriaDe(k) };
  }

  /** Contagem por categoria de uma leitura de lerEconomias: { categoria: quantidade }. */
  const porCategoria = (x) => (x.composto ? x.porCat : { [x.cat]: x.n });

  /**
   * A frase inteira num campo só: "DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM." (às vezes repetida em DE e em PARA).
   * Só vale quando há o que ler dos dois lados do "P/" ou do "PARA" (um "PARA 2 RES." do começo não é separador).
   * Devolve { de, para } por categoria, ou null.
   */
  function lerFrase(txt) {
    const t = N().semAcento(txt === null || txt === undefined ? '' : String(txt)).toUpperCase();
    const partes = t.split(/P\s*\/|\bPARA\b/).map((p) => lerEconomias(p)).filter(Boolean);
    return partes.length === 2 ? { de: porCategoria(partes[0]), para: porCategoria(partes[1]) } : null;
  }

  /**
   * O lançamento é uma tratativa de verdade? (TIPO DE ALTERAÇÃO preenchido e que não seja
   * "sem tratativa" nem "encerrado"): é o que o relatório chama de "Total Tratado".
   */
  function ehTratado(tipoAlt) {
    const t = N().texto(tipoAlt);
    if (t === null || t === ';' || t === '.') return false;
    const baixo = t.toLowerCase();
    return baixo.indexOf('sem tratativa') < 0 && baixo.indexOf('encerrado') < 0;
  }

  // ---------------------------------------------------------------- preparo dos lançamentos

  /**
   * Resultados limpos (dados.limparResultados) -> lançamentos prontos para somar.
   * Cada um guarda o que precisa dos textos: o que mudou na economia (eco) e na categoria (cat).
   */
  function preparar(resultados) {
    const regra = CV.regras.tratativas;
    const frente = regra.frente ? N().chave(regra.frente) : '';
    const out = [];
    for (const r of resultados) {
      if (r.layout === 'vcg') continue; // o formulário do VCG não tem DE/PARA nem categoria antes/depois
      const data = r.dataFim || r.data;
      if (!data) continue;
      const l = {
        id: r.id,
        data,
        mes: data.slice(0, 7),
        mat: r.mat || r.matBruta || null,
        assistente: r.assistente || null,
        frente: r.frente || '',
        dentro: !frente || N().chave(r.frente).startsWith(frente),
        rotulo: N().chave(r.econ), // 'INCREMENTO' | 'DECREMENTO' | ''
        tratado: ehTratado(r.tipoAlt),
        popular: /POPULAR/.test(N().chave([r.de, r.para, r.anterior, r.atual].join(' '))),
        deTxt: r.de || null,
        paraTxt: r.para || null,
        eco: null,
        ecoCats: null, // DE/PARA com mais de uma categoria: { de: { categoria: n }, para: { categoria: n } }
        ecoIlegivel: false,
        cat: null,
      };
      const de = lerEconomias(r.de);
      const para = lerEconomias(r.para);
      if (de && para && !de.composto && !para.composto) {
        l.eco = { delta: para.n - de.n, deCat: de.cat, paraCat: para.cat };
      } else if (CV.regras.tratativas.compostosPorCategoria !== false) {
        // mais de uma categoria: a variação é calculada em cada uma (antes → depois)
        const frase = lerFrase(r.de) || lerFrase(r.para);
        if (frase) l.ecoCats = frase;
        else if (de && para) l.ecoCats = { de: porCategoria(de), para: porCategoria(para) };
      }
      if (!l.eco && !l.ecoCats && (r.de || r.para)) {
        l.ecoIlegivel = true; // DE/PARA preenchido, mas o painel não consegue ler: fica de fora e vai para a Conferência
      }
      if (r.anterior || r.atual) {
        l.cat = { anteriorTxt: r.anterior || null, atualTxt: r.atual || null, anterior: nomeCategoria(r.anterior), atual: nomeCategoria(r.atual), qtd: typeof r.qtd === 'number' && r.qtd > 0 ? r.qtd : 0 };
      }
      out.push(l);
    }
    return out;
  }

  /** Lançamentos do período e do assistente. Datas ISO; vazio = sem limite. */
  function filtrar(linhas, f) {
    const flt = f || {};
    return linhas.filter((l) => (!flt.de || l.data >= flt.de) && (!flt.ate || l.data <= flt.ate) && (!flt.assistente || l.assistente === flt.assistente));
  }

  // ---------------------------------------------------------------- eventos de valor

  /**
   * O que um lançamento acrescenta aos quadros: até um evento de economia e um de categoria.
   * { quadro, frente, de, para, n (economias), centavos }
   */
  function eventos(l) {
    const out = [];
    if (!l.dentro) return out;
    const e = l.eco;
    if (e) {
      // incremento: PARA > DE e não marcado como Decremento; o relatório também deixa de fora a categoria de origem "Outros"
      if (e.delta > 0 && l.rotulo !== 'DECREMENTO' && e.deCat !== OUTROS) {
        out.push({ quadro: 'incEco', frente: l.frente, de: e.deCat, para: e.paraCat, n: e.delta, centavos: e.delta * centavosDe(e.paraCat) });
      } else if (e.delta < 0) {
        const centavos = e.deCat === e.paraCat
          ? e.delta * centavosDe(e.paraCat)
          : e.delta * (centavosDe(e.deCat) - centavosDe(e.paraCat));
        out.push({ quadro: 'decEco', frente: l.frente, de: e.deCat, para: e.paraCat, n: e.delta, centavos });
      }
    }
    if (l.ecoCats) {
      // cada categoria varia por conta própria: o que passou de PARA sobre DE é incremento, o que faltou é decremento
      const cats = new Set(Object.keys(l.ecoCats.de).concat(Object.keys(l.ecoCats.para)));
      for (const cat of cats) {
        const delta = (l.ecoCats.para[cat] || 0) - (l.ecoCats.de[cat] || 0);
        if (delta > 0 && l.rotulo !== 'DECREMENTO') out.push({ quadro: 'incEco', frente: l.frente, de: cat, para: cat, n: delta, centavos: delta * centavosDe(cat) });
        else if (delta < 0) out.push({ quadro: 'decEco', frente: l.frente, de: cat, para: cat, n: delta, centavos: delta * centavosDe(cat) });
      }
    }
    const c = l.cat;
    if (c && c.qtd > 0) {
      const centavos = c.qtd * (centavosCategoria(c.atual) - centavosCategoria(c.anterior));
      if (centavos !== 0) out.push({ quadro: centavos > 0 ? 'incCat' : 'decCat', frente: l.frente, de: c.anterior, para: c.atual, n: c.qtd, centavos });
    }
    return out;
  }

  /** Pontos de atenção de um lançamento (para a Conferência e a coluna "Observação" do Excel). */
  const SINAIS = {
    ecoIlegivel: 'DE/PARA que o painel não consegue ler (sem número, ou com mais de uma categoria quando compostosPorCategoria está desligado): fica de fora; corrija no formulário',
    variacaoGrande: 'Variação grande de economias num único lançamento (limite em regras.js): confira se não é digitação errada, como 100 no lugar de 1',
    porCategoria: 'DE/PARA com mais de uma categoria no mesmo texto: a variação foi calculada categoria por categoria',
    rotuloIncMenor: 'Marcado como Incremento, mas PARA é menor que DE: entra no decremento',
    rotuloDecMaior: 'Marcado como Decremento, mas PARA é maior que DE: fica de fora',
    mistas: 'DE e PARA de categorias diferentes: valor pela regra do relatório',
    semTarifa: 'Categoria sem tarifa (ex.: sem fins lucrativos, CadÚnico): valor calculado com tarifa zero',
    semQuantidade: 'Categoria alterada sem QUANTIDADE: fica de fora (valor zero)',
    publicaZero: 'Categoria Pública valendo zero, igual ao Power BI (o relatório não acha a tarifa por causa do acento)',
    popular: 'Comércio popular contado como Comercial, igual ao Power BI',
  };

  /** Pontos de atenção que deixam o lançamento de fora dos quadros. */
  const FORA_DOS_QUADROS = ['ecoIlegivel', 'rotuloDecMaior', 'semQuantidade'];

  function sinais(l, evs) {
    const s = [];
    const e = l.eco;
    const doPowerBI = igualPowerBI();
    if (l.ecoIlegivel) s.push('ecoIlegivel');
    if (l.ecoCats && evs.length) s.push('porCategoria');
    if (evs.some((v) => v.quadro.endsWith('Eco') && Math.abs(v.n) >= CV.regras.tratativas.variacaoSuspeita)) s.push('variacaoGrande');
    if (e && e.delta < 0 && l.rotulo === 'INCREMENTO') s.push('rotuloIncMenor');
    if (e && e.delta > 0 && l.rotulo === 'DECREMENTO') s.push('rotuloDecMaior');
    if (evs.some((v) => v.quadro.endsWith('Eco') && v.de !== v.para)) s.push('mistas');
    if (evs.some((v) => !temTarifa(v.de) || !temTarifa(v.para))) s.push('semTarifa');
    if (l.cat && l.cat.anterior !== l.cat.atual && !(l.cat.qtd > 0)) s.push('semQuantidade');
    if (doPowerBI && evs.some((v) => v.quadro.endsWith('Cat') && (v.de === PUBLICA || v.para === PUBLICA))) s.push('publicaZero');
    if (doPowerBI && l.popular && evs.length) s.push('popular');
    return s;
  }

  // ---------------------------------------------------------------- quadros

  const novoQuadro = (q) => ({ id: q.id, linhas: [], n: 0, valor: 0, lancamentos: 0 });

  /**
   * Os quatro quadros, os cards e a conferência de um conjunto de lançamentos (já filtrados).
   * @returns { quadros: { incEco, incCat, decEco, decCat: { linhas: [{ frente, de, para, n, valor, lancamentos }], n, valor } },
   *            saldo, cartoes: { tratados, dias, media }, conferencia: { foraFrente, <sinal>: n, ... } }
   */
  function analisar(linhas) {
    const grupos = {};
    const quadros = {};
    for (const q of QUADROS) { grupos[q.id] = new Map(); quadros[q.id] = novoQuadro(q); }
    const conf = { foraFrente: 0 };
    const exemplos = {}; // até 5 Id de cada ponto de atenção, para achar os lançamentos no formulário
    const anota = (k, l) => { const a = exemplos[k] || (exemplos[k] = []); if (a.length < EXEMPLOS && l.id) a.push(l.id); };
    for (const k of Object.keys(SINAIS)) conf[k] = 0;
    let tratados = 0;
    const dias = new Set();

    for (const l of linhas) {
      if (!l.dentro) { if (l.eco || l.ecoCats || l.cat || l.ecoIlegivel) { conf.foraFrente++; anota('foraFrente', l); } continue; }
      if (l.tratado) { tratados++; dias.add(l.data); }
      const evs = eventos(l);
      for (const v of evs) {
        const mapa = grupos[v.quadro];
        const chave = v.frente + '\u0001' + v.de + '\u0001' + v.para;
        let g = mapa.get(chave);
        if (!g) { g = { frente: v.frente, de: v.de, para: v.para, n: 0, centavos: 0, lancamentos: 0 }; mapa.set(chave, g); }
        g.n += v.n;
        g.centavos += v.centavos;
        g.lancamentos++;
      }
      for (const s of sinais(l, evs)) { conf[s]++; anota(s, l); }
    }

    let saldoCentavos = 0;
    const alfa = (a, b) => a.localeCompare(b, 'pt-BR');
    for (const q of QUADROS) {
      const lista = Array.from(grupos[q.id].values()).sort((a, b) => alfa(a.frente, b.frente) || alfa(a.de, b.de) || alfa(a.para, b.para));
      const alvo = quadros[q.id];
      let cent = 0;
      for (const g of lista) {
        alvo.linhas.push({ frente: g.frente, de: g.de, para: g.para, n: g.n, valor: g.centavos / 100, lancamentos: g.lancamentos });
        alvo.n += g.n;
        alvo.lancamentos += g.lancamentos;
        cent += g.centavos;
      }
      alvo.valor = cent / 100;
      saldoCentavos += cent;
    }
    return {
      quadros,
      saldo: saldoCentavos / 100,
      cartoes: { tratados, dias: dias.size, media: dias.size ? tratados / dias.size : null },
      conferencia: conf,
      exemplos,
    };
  }

  /**
   * Saldo de cada mês (todos os meses que têm lançamento da frente), do mais novo ao mais antigo.
   * `f.assistente` filtra; o período não (a ideia é ver os meses lado a lado).
   * `variacao` = saldo menos o do mês anterior com lançamento (null no primeiro).
   */
  function porMes(linhas, f) {
    const flt = f || {};
    const meses = new Map();
    for (const l of linhas) {
      if (!l.dentro || (flt.assistente && l.assistente !== flt.assistente)) continue;
      let m = meses.get(l.mes);
      if (!m) { m = { mes: l.mes, rotulo: rotuloMes(l.mes), incEco: 0, incCat: 0, decEco: 0, decCat: 0, lancamentos: 0 }; meses.set(l.mes, m); }
      const evs = eventos(l);
      if (evs.length) m.lancamentos++;
      for (const v of evs) m[v.quadro] += v.centavos;
    }
    const cron = Array.from(meses.values()).sort((a, b) => (a.mes < b.mes ? -1 : 1));
    let ant = null;
    for (const m of cron) {
      const saldo = m.incEco + m.incCat + m.decEco + m.decCat;
      for (const k of ['incEco', 'incCat', 'decEco', 'decCat']) m[k] /= 100;
      m.saldo = saldo / 100;
      m.variacao = ant === null ? null : (saldo - ant) / 100;
      ant = saldo;
    }
    return cron.reverse();
  }

  /** Assistentes, meses e primeiro/último dia dos lançamentos da frente (para os filtros da aba). */
  function opcoes(linhas) {
    const assistentes = new Set();
    const meses = new Set();
    let min = null;
    let max = null;
    for (const l of linhas) {
      if (!l.dentro) continue;
      if (l.assistente) assistentes.add(l.assistente);
      meses.add(l.mes);
      if (!min || l.data < min) min = l.data;
      if (!max || l.data > max) max = l.data;
    }
    return {
      assistentes: Array.from(assistentes).sort((a, b) => a.localeCompare(b, 'pt-BR')),
      meses: Array.from(meses).sort().reverse(),
      min,
      max,
    };
  }

  /** Uma linha por evento de valor (para o Excel): o lançamento, o quadro em que caiu e o valor. */
  function detalhe(linhas) {
    const out = [];
    for (const l of linhas) {
      const evs = eventos(l);
      const obs = sinais(l, evs).map((s) => SINAIS[s]).join('; ');
      for (const v of evs) out.push({ l, v, obs, valor: v.centavos / 100, quadro: QUADROS.find((q) => q.id === v.quadro) });
      // sem evento mas com motivo para ficar de fora (texto ilegível, rótulo trocado, categoria sem quantidade): aparece para ser corrigido
      if (!evs.length && l.dentro && sinais(l, evs).some((k) => FORA_DOS_QUADROS.includes(k))) {
        out.push({ l, v: { de: null, para: null, n: null }, obs, valor: null, quadro: { titulo: '(fora dos quadros)', tipo: l.cat ? 'categoria' : 'economia' } });
      }
    }
    return out;
  }

  CV.tratativas = {
    QUADROS, SINAIS, OUTROS, rotuloMes, categoriaDe, nomeCategoria, numeroInicial, lerEconomias, lerFrase, ehTratado,
    preparar, filtrar, eventos, analisar, porMes, opcoes, detalhe,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.tratativas;
})(typeof window !== 'undefined' ? window : globalThis);
