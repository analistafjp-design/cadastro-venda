/*
 * exporta.js — o que vai para o Excel. Tudo sai no formato analítico, uma linha por atividade,
 * com as mesmas colunas da planilha de Atividades (Recurso, Data, ID da Atividade, Matrícula...)
 * mais o que o painel descobriu (projeto, retorno do backoffice, tipo de resultado...).
 * Quem filtra e soma é o Excel; o painel só entrega as linhas.
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  const STATUS = { exec: 'Executada', oc: 'Encerrada com Ocorrência', outra: 'Não concluída' };
  const RETORNO = { resultado: 'Resultado', atualizacao: 'Atualização cadastral', sem: 'Sem tratativa' };
  const sim = (b) => (b ? 'Sim' : 'Não');

  function rotulosDeResultado(v) {
    if (v.grupoStatus !== 'exec' || v.grupoRetorno !== 'resultado') return '';
    const rot = new Map(CV.metricas.TIPOS_RESULTADO.map((t) => [t.id, t.rotulo]));
    return CV.metricas.tiposDoResultado(v).map((id) => rot.get(id)).join('; ');
  }

  const nomeDesfecho = (id) => (CV.regras.classes.find((c) => c.id === id) || { curto: id }).curto;

  /** As colunas da planilha de Atividades, preenchidas a partir de uma visita. */
  function colunasAtividade() {
    return [
      { titulo: 'Recurso', valor: (v) => v.recurso },
      { titulo: 'Data', tipo: 'data', valor: (v) => v.data },
      { titulo: 'ID da Atividade', tipo: 'int', valor: (v) => v.id },
      { titulo: 'Cód. Protocolo Origem', valor: (v) => v.protocolo },
      { titulo: 'Matrícula', tipo: 'int', valor: (v) => v.mat || v.matBruta },
      { titulo: 'Status da Atividade', valor: (v) => v.status },
      { titulo: 'Tipo de Atividade', valor: (v) => v.tipo },
      { titulo: 'Projeto (base)', valor: (v) => v.projeto },
      { titulo: 'Observação', valor: (v) => v.obs },
      { titulo: 'Cidade', valor: (v) => v.cidade },
      { titulo: 'Bairro', valor: (v) => v.bairro },
      { titulo: 'Área de Trabalho', valor: (v) => v.setor },
      { titulo: 'Endereço', valor: (v) => v.endereco },
      { titulo: 'Motivo de Não Execução - Normal', valor: (v) => v.motivo },
      { titulo: 'Categoria', valor: (v) => v.categoria },
      { titulo: 'Quantidade De Economia', valor: (v) => v.qtdEconRotulo },
      { titulo: 'Situação Do Imóvel', valor: (v) => v.situacao },
      { titulo: 'Início', tipo: 'hora', valor: (v) => v.inicio },
      { titulo: 'Fim', tipo: 'hora', valor: (v) => v.fim },
      { titulo: 'Duração', tipo: 'hora', valor: (v) => v.duracao },
      { titulo: 'Tempo de Deslocamento', tipo: 'hora', valor: (v) => v.desloc },
    ];
  }

  /** O que o cruzamento com o backoffice acrescenta a cada visita. */
  function colunasCruzamento() {
    return [
      { titulo: 'Situação da visita', valor: (v) => STATUS[v.grupoStatus] || '' },
      { titulo: 'Percorrido', valor: (v) => (v.grupoStatus === 'exec' || v.grupoStatus === 'oc' ? 'Sim' : 'Não') },
      { titulo: 'Retornos do backoffice', tipo: 'num', valor: (v) => (v.grupoStatus === 'exec' ? v.nRetornos || 0 : null) },
      { titulo: 'Grupo do retorno', valor: (v) => RETORNO[v.grupoRetorno] || (v.grupoStatus === 'exec' ? 'Sem retorno' : '') },
      { titulo: 'Com resultado', valor: (v) => (v.grupoStatus === 'exec' ? sim(v.grupoRetorno === 'resultado') : '') },
      { titulo: 'Tipo de resultado', valor: rotulosDeResultado },
      { titulo: 'Desfechos do retorno', valor: (v) => (v.tags || []).map(nomeDesfecho).join(' + ') },
      { titulo: 'Δ economias', tipo: 'num', valor: (v) => (v.deltaEcon ? v.deltaEcon : null) },
      { titulo: 'Data do 1º retorno', tipo: 'data', valor: (v) => v.primeiroRetorno },
      { titulo: 'Dias até o retorno', tipo: 'num', valor: (v) => (v.primeiroRetorno ? N().diasEntre(v.data, v.primeiroRetorno) : null) },
      { titulo: 'Em maturação', valor: (v) => (v.maturando ? 'Sim' : '') },
    ];
  }

  /**
   * Aba de visitas (formato Atividades + cruzamento).
   * @param linhas  as linhas da lista
   * @param opc     { nome, visitaDe(linha) -> visita (padrão: a própria linha), extras: colunas sobre a linha da lista }
   */
  function abaVisitas(linhas, opc) {
    const o = opc || {};
    const visitaDe = o.visitaDe || ((l) => l);
    const doVisita = (c) => Object.assign({}, c, { valor: (l) => c.valor(visitaDe(l)) });
    return {
      nome: o.nome || 'Atividades',
      colunas: colunasAtividade().concat(colunasCruzamento()).map(doVisita).concat(o.extras || []),
      linhas,
    };
  }

  /** Tempos: as atividades com horário, com a classificação usada na conta. */
  function abaAgenda(agenda) {
    const cols = colunasAtividade().filter((c) => !['Cód. Protocolo Origem', 'Matrícula', 'Observação', 'Endereço', 'Motivo de Não Execução - Normal', 'Categoria', 'Quantidade De Economia', 'Situação Do Imóvel'].includes(c.titulo))
      .filter((c) => c.titulo !== 'Projeto (base)');
    cols.push({ titulo: 'Entra no tempo como', valor: (a) => CV.tempos.classeDoTipo(a.tipo) });
    return { nome: 'Atividades', colunas: cols, linhas: agenda };
  }

  /** Tempos: um dia de cada equipe. */
  function abaDias(agenda) {
    return {
      nome: 'Dia da equipe',
      colunas: [
        { titulo: 'Recurso', valor: (d) => d.recurso },
        { titulo: 'Data', tipo: 'data', valor: (d) => d.data },
        { titulo: 'Dia completo', valor: (d) => sim(d.completo) },
        { titulo: 'Início do dia', tipo: 'hora', valor: (d) => d.inicio },
        { titulo: 'Fim do dia', tipo: 'hora', valor: (d) => d.fim },
        { titulo: 'Dia (total)', tipo: 'hora', valor: (d) => d.dia },
        { titulo: 'Deslocamento', tipo: 'hora', valor: (d) => d.desloc },
        { titulo: 'Serviço', tipo: 'hora', valor: (d) => d.servico },
        { titulo: 'Pausas e apoio', tipo: 'hora', valor: (d) => d.apoio },
        { titulo: 'Ociosidade', tipo: 'hora', valor: (d) => d.ocioso },
        { titulo: 'Atividades', tipo: 'num', valor: (d) => d.atividades },
      ],
      linhas: CV.tempos.diasDaEquipe(agenda),
    };
  }

  /** Aba "Filtros": o recorte que gerou o arquivo. */
  function abaFiltros(pares) {
    return {
      nome: 'Filtros',
      colunas: [{ titulo: 'Filtro', valor: (p) => p[0] }, { titulo: 'Valor', valor: (p) => p[1] }],
      linhas: pares.concat([['Gerado em', new Date().toLocaleString('pt-BR')]]),
    };
  }

  CV.exporta = { colunasAtividade, colunasCruzamento, abaVisitas, abaAgenda, abaDias, abaFiltros, rotulosDeResultado };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.exporta;
})(typeof window !== 'undefined' ? window : globalThis);
