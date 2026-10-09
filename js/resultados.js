/*
 * resultados.js — interpreta uma linha da planilha de Resultados (formulário do
 * backoffice) e diz QUE TIPO de desfecho ela representa e quantas economias
 * foram acrescidas/retiradas.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  const RX = {
    categoria: /CATEGORIA/,
    economia: /ECONOMIA|\bECO\b/,
    venda: /LIGACAO NOVA|VENDA FACTIVEL/,
    titularidade: /TITULARIDADE/,
    tarifaSocial: /TARIFA SOCIAL/,
    fatura: /FATURA DIGITAL|\bENTREGA\b|\bENVIO\b|\bCORREIOS?\b/,
    debitos: /NEGOCIACAO|UNIFICACAO|REPARCELAMENTO/,
    // atualizações/saneamentos feitos no cadastro (aplicado em TRATATIVA + TIPO DE ALTERAÇÃO)
    atualizacao:
      /CLASSIFICACAO|TELEFONE|\bPORTA\b|\bRG\b|\bCPF\b|\bCNPJ\b|E ?MAIL|ENDERECO|COMPLEMENTO|BAIRRO|\bNOME\b|\bHD\b|INATIVACAO|DESATIVACAO|ATIVACAO|DUPLICIDADE|DESDOBRO|VENCIMENTO|SITUACAO DA LIGACAO|CONTRATO|ALTERACAO CADASTRAL/,
    semTratativa: /SEM TRATATIVA|ENCERRADO S TRATATIVA/,
    // tipos de OS que, sozinhos, indicam atualização cadastral feita
    tipoCadastral: /^(ALTERACAO CADASTRAL INTERNA|VERIFICACAO CADASTRAL|VERIFICACAO CADASTRAL VISTORIA CAMPO)$/,
  };

  /** Soma as economias citadas num texto ("5 RES. E 1 COM." -> 6). null se nada reconhecido. */
  function totalEconomias(txt) {
    if (!txt) return null;
    const up = N().semAcento(txt).toUpperCase();
    let soma = 0;
    let achou = false;
    const rx = /(\d+)\s*(?:RES|COM|PUB|IND|SOC|P\s*COM)/g;
    let m;
    while ((m = rx.exec(up))) {
      soma += Number(m[1]);
      achou = true;
    }
    return achou ? soma : null;
  }

  /**
   * Variação líquida de economias a partir de "DE:" e "PARA:".
   * Aceita colunas separadas ("1 Residência" / "2 Residências") ou texto
   * corrido ("DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.").
   */
  function deltaEconomias(de, para) {
    const D = de ? N().semAcento(de).toUpperCase() : '';
    const P = para ? N().semAcento(para).toUpperCase() : '';
    for (const t of [D, P]) {
      if (t && /P\s*\/|\bPARA\b/.test(t)) {
        const partes = t.split(/P\s*\/|\bPARA\b/);
        if (partes.length === 2) {
          const antes = totalEconomias(partes[0]);
          const depois = totalEconomias(partes[1]);
          return antes !== null && depois !== null ? depois - antes : null;
        }
      }
    }
    const a = totalEconomias(D);
    const b = totalEconomias(P);
    return a !== null && b !== null ? b - a : null;
  }

  /**
   * Classifica um retorno. Entrada: { tipoOS, econ, tratativa, tipoAlt, de, para }.
   * Saída: { tags: [ids de classes], grupo, principal, deltaEcon }.
   */
  function classificar(r) {
    const T = N().chave(r.tipoOS);
    const E = N().chave(r.econ);
    const TR = N().chave(r.tratativa);
    const TA = N().chave(r.tipoAlt);
    const tudo = [T, E, TR, TA].join(' | ');
    const rest = TR + ' | ' + TA;
    const tags = new Set();

    if (E === 'INCREMENTO') tags.add('incremento');
    if (E === 'DECREMENTO') tags.add('decremento');
    if (RX.categoria.test(T) || RX.categoria.test(TA)) tags.add('categoria');
    if (!tags.has('incremento') && !tags.has('decremento') && (RX.economia.test(T) || RX.economia.test(TA))) {
      tags.add('economia');
    }
    if (RX.venda.test(tudo)) tags.add('venda');
    if (RX.titularidade.test(tudo)) tags.add('titularidade');
    if (RX.tarifaSocial.test(tudo)) tags.add('tarifa_social');
    if (RX.fatura.test(rest) || /FATURA DIGITAL/.test(T)) tags.add('fatura');
    if (RX.debitos.test(tudo)) tags.add('debitos');

    if (tags.size === 0) {
      const restoSemFrase = rest.replace(/SEM TRATATIVA|ENCERRADO S TRATATIVA/g, ' ');
      if (RX.atualizacao.test(restoSemFrase)) tags.add('atualizacao');
      else if (RX.semTratativa.test(tudo)) tags.add('sem');
      else if (RX.tipoCadastral.test(T) || TR || TA) tags.add('atualizacao');
      else tags.add('sem');
    }

    const classes = CV.regras.classes;
    const lista = classes.filter((c) => tags.has(c.id));
    const principal = lista.length ? lista[0].id : 'sem';
    const grupo = lista.some((c) => c.grupo === 'resultado')
      ? 'resultado'
      : lista.some((c) => c.grupo === 'atualizacao')
        ? 'atualizacao'
        : 'sem';

    let deltaEcon = null;
    if (tags.has('incremento') || tags.has('decremento')) {
      const d = deltaEconomias(r.de, r.para);
      if (d !== null && ((tags.has('incremento') && d > 0) || (tags.has('decremento') && d < 0))) deltaEcon = d;
    }
    return { tags: lista.map((c) => c.id), grupo, principal, deltaEcon };
  }

  /**
   * Classifica um lançamento do formulário "Resultados VCG": { atualizacao, obs, qtdEcon }.
   * "Atualização realizada" diz o que foi feito; a observação desempata (as pessoas às vezes
   * escolhem a opção genérica e explicam no texto). Saída igual à de `classificar`.
   */
  function classificarVcg(r) {
    const A = N().chave(r.atualizacao);
    const O = N().chave(r.obs);
    const Q = typeof r.qtdEcon === 'number' && Number.isFinite(r.qtdEcon) ? r.qtdEcon : null;
    const tags = new Set();

    const titularidade = /TITULARIDADE/.test(A) || /TITULARIDADE/.test(O);
    const venda = /\bVENDA\b/.test(A) || /\bVENDA\b/.test(O);
    if (titularidade) tags.add('titularidade');
    if (venda) tags.add('venda');
    if (/NEGOCIACAO|UNIFICACAO|REPARCELAMENTO/.test(A + ' ' + O)) tags.add('debitos');
    if (/NOVO CLIENTE|LOTE NAO CADASTRADO/.test(A) && !titularidade && !venda) tags.add('novo_cliente');
    if (/CATEGORIA/.test(A)) tags.add('categoria');
    if (/INCREMENTO/.test(A)) {
      tags.add('incremento');
    } else if (/ECONOMIA/.test(A) || (/CATEGORIA/.test(A) && /ECONOMIA/.test(O))) {
      if (/RETIRAD|REMOCAO|REMOVID|TIRANDO|TIRAD|DESMEMBRAMENTO/.test(O)) tags.add('decremento');
      else if (/ACRESCENT|INCLUSAO|INCREMENT|MAIS UMA|ADICIONAD/.test(O) || (Q !== null && Q > 0)) tags.add('incremento');
      else tags.add('economia');
    }
    if (/FATURA/.test(O)) tags.add('fatura');
    if (tags.size === 0) tags.add(A ? 'atualizacao' : 'sem');

    const classes = CV.regras.classes;
    const lista = classes.filter((c) => tags.has(c.id));
    const principal = lista.length ? lista[0].id : 'sem';
    const grupo = lista.some((c) => c.grupo === 'resultado') ? 'resultado' : lista.some((c) => c.grupo === 'atualizacao') ? 'atualizacao' : 'sem';
    const acrescimo = tags.has('incremento') || tags.has('venda') || tags.has('novo_cliente');
    return { tags: lista.map((c) => c.id), grupo, principal, deltaEcon: acrescimo && Q !== null && Q > 0 ? Q : null };
  }

  CV.resultados = { classificar, classificarVcg, deltaEconomias, totalEconomias };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.resultados;
})(typeof window !== 'undefined' ? window : globalThis);
