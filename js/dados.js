/*
 * dados.js — mapeia as colunas das planilhas, limpa as linhas e deriva os
 * campos de negócio (projeto, grupo de status, desfecho do retorno...).
 *
 * Duas etapas, de propósito:
 *   limpar*  -> só normaliza o que veio do arquivo (é isso que fica salvo no navegador)
 *   derivar* -> aplica as regras de regras.js (roda a cada abertura, então
 *               mudar uma regra vale também para dados já carregados)
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  const CAMPOS_ATIVIDADES = {
    id: ['ID da Atividade'],
    protocolo: ['Cód. Protocolo Origem'],
    mat: ['Matrícula'],
    data: ['Data'],
    recurso: ['Recurso'],
    status: ['Status da Atividade'],
    tipo: ['Tipo de Atividade'],
    obs: ['Observação'],
    parecer: ['Parecer De Campo'],
    cidade: ['Cidade'],
    bairro: ['Bairro'],
    setor: ['Área de Trabalho'],
    endereco: ['Endereço'],
    motivo: ['Motivo de Não Execução - Normal'],
    categoria: ['Categoria'],
    qtdEcon: ['Quantidade De Economia'],
    situacao: ['Situação Do Imóvel'],
    // horários (para os tempos das equipes)
    inicio: ['Início'],
    fim: ['Fim'],
    duracao: ['Duração'],
    desloc: ['Tempo de Deslocamento'],
  };
  const OBRIGATORIOS_ATIVIDADES = ['id', 'mat', 'data', 'recurso', 'status'];

  const CAMPOS_RESULTADOS = {
    id: ['Id'],
    inicio: ['Hora de início'],
    fim: ['Hora de conclusão'],
    mat: ['MATRICULA S/ DIGITO', 'Matrícula'],
    frente: ['FRENTE DE SERVIÇO'],
    tipoOS: ['TIPO DE ORDEM DE SERVIÇO'],
    econ: ['QUAL FOI A ALTERAÇÃO DE ECONOMIA?'],
    de: ['DE:'],
    para: ['PARA:'],
    tratativa: ['TRATATIVA CADASTRAL'],
    tipoAlt: ['TIPO DE ALTERAÇÃO'],
  };
  const OBRIGATORIOS_RESULTADOS = ['id', 'mat', 'inicio'];

  const ROTULOS = {
    id: 'ID', mat: 'Matrícula', data: 'Data', recurso: 'Recurso', status: 'Status da Atividade', inicio: 'Hora de início',
  };

  /** Descobre se uma planilha é de atividades ou de resultados pelo cabeçalho. */
  function detectarTipo(cabecalho) {
    const k = new Set(cabecalho.map((h) => N().chaveCabecalho(h)));
    if (k.has('iddaatividade') && k.has('statusdaatividade')) return 'atividades';
    if (k.has('matriculasdigito') || (k.has('horadeinicio') && k.has('tipodeordemdeservico'))) return 'resultados';
    return null;
  }

  function cortar(s, n) {
    return s && s.length > n ? s.slice(0, n) : s;
  }

  /** Quantidade de economias do cadastro: '02. ECON' -> 2 ; '04. ECON OU MAIS' -> 4 (4+). */
  function qtdEconomias(v) {
    const t = N().texto(v);
    if (!t) return null;
    const m = /(\d+)/.exec(t);
    return m ? Math.min(Number(m[1]), 4) : null;
  }

  function rotuloQtdEcon(q) {
    if (q === null || q === undefined) return '(não informado)';
    return q >= 4 ? '4+ economias' : q + (q === 1 ? ' economia' : ' economias');
  }

  // ---------- atividades ----------

  function limparAtividade(r) {
    const id = N().texto(r.id);
    const mat = N().matricula(r.mat);
    return {
      id: id === null ? null : String(id).replace(/\.0+$/, ''),
      protocolo: N().protocolo(r.protocolo),
      mat: mat.mat,
      matBruta: mat.bruto,
      data: N().data(r.data),
      recurso: N().texto(r.recurso),
      status: N().texto(r.status),
      tipo: N().texto(r.tipo),
      obs: cortar(N().texto(r.obs), 160),
      parecer: cortar(N().texto(r.parecer), 120),
      cidade: N().texto(r.cidade),
      bairro: N().texto(r.bairro),
      setor: N().texto(r.setor),
      endereco: N().texto(r.endereco),
      motivo: N().texto(r.motivo),
      categoria: N().texto(r.categoria),
      qtdEcon: qtdEconomias(r.qtdEcon),
      situacao: N().texto(r.situacao),
      inicio: N().minutos(r.inicio),
      fim: N().minutos(r.fim),
      duracao: N().minutos(r.duracao),
      desloc: N().minutos(r.desloc),
    };
  }

  /** A atividade é um alvo de visita cadastral (o que alimenta os resultados)? Sem tipo informado, sim. */
  function ehCadastral(tipo) {
    const aceitos = CV.regras.tiposAtividade;
    if (!tipo || !aceitos.length) return true;
    const k = N().chave(tipo);
    return aceitos.some((t) => k.startsWith(N().chave(t)));
  }

  /**
   * Limpa as linhas lidas do arquivo.
   *  - visitas cadastrais de QUALQUER equipe ficam (servem para ligar os retornos pela matrícula);
   *  - as demais atividades (refeição, DDS, carregamento, clima, cobrança...) só ficam se forem de
   *    uma equipe do escopo: servem para calcular os tempos das equipes.
   * Retorna { limpas, descartes: { semId, semData, outrosServicos: n } }.
   */
  function limparAtividades(linhas) {
    const descartes = { semId: 0, semData: 0, outrosServicos: 0 };
    const limpas = [];
    for (const raw of linhas) {
      const a = limparAtividade(raw);
      if (!ehCadastral(a.tipo) && !CV.escopo.equipeNoEscopo(a.recurso)) { descartes.outrosServicos++; continue; }
      if (!a.id) { descartes.semId++; continue; }
      if (!a.data) { descartes.semData++; continue; }
      limpas.push(a);
    }
    return { limpas, descartes };
  }

  function grupoStatus(status) {
    const k = N().chave(status);
    const R = CV.regras.status;
    if (R.executada.includes(k)) return 'exec';
    if (R.ocorrencia.includes(k)) return 'oc';
    return 'outra';
  }

  function tipoEquipe(recurso) {
    const k = N().chave(recurso).replace(/ /g, '');
    for (const [trecho, nome] of CV.regras.equipes) if (k.indexOf(trecho) >= 0) return nome;
    return 'Outras';
  }

  /** Aplica as regras de negócio sobre as atividades limpas. */
  function derivarVisitas(limpas) {
    const R = CV.regras;
    const extrator = CV.projetos.criarExtrator(R);
    const porProjeto = { regra: 0, similar: 0, novo: 0, sem: 0 };
    const visitas = limpas.filter((a) => ehCadastral(a.tipo)).map((a) => {
      let proj = { nome: R.semProjeto, rotulo: null, origem: 'sem' };
      const textos = { 'Observação': a.obs, 'Parecer De Campo': a.parecer };
      for (const col of R.colunasProjeto) {
        const p = extrator.extrair(textos[col]);
        if (p.origem !== 'sem') { proj = p; break; }
      }
      porProjeto[proj.origem]++;
      const gs = grupoStatus(a.status);
      const acao = gs === 'oc' ? R.motivos[N().chave(a.motivo)] || R.motivoPadrao : null;
      return Object.assign({}, a, {
        projeto: proj.nome,
        projetoOrigem: proj.origem,
        grupoStatus: gs,
        equipe: tipoEquipe(a.recurso),
        acao,
        qtdEconRotulo: rotuloQtdEcon(a.qtdEcon),
      });
    });
    return { visitas, porProjeto, novos: Array.from(extrator.conhecidos.values()) };
  }

  // ---------- resultados ----------

  function limparResultado(r) {
    const mat = N().matricula(r.mat);
    return {
      id: N().texto(r.id) === null ? null : String(r.id).replace(/\.0+$/, ''),
      data: N().data(r.inicio) || N().data(r.fim),
      mat: mat.mat,
      matBruta: mat.bruto,
      frente: N().texto(r.frente),
      tipoOS: N().texto(r.tipoOS),
      econ: N().texto(r.econ),
      de: cortar(N().texto(r.de), 80),
      para: cortar(N().texto(r.para), 80),
      tratativa: N().texto(r.tratativa),
      tipoAlt: cortar(N().texto(r.tipoAlt), 140),
    };
  }

  function limparResultados(linhas) {
    const descartes = { semId: 0 };
    const limpas = [];
    for (const raw of linhas) {
      const x = limparResultado(raw);
      if (!x.id) { descartes.semId++; continue; }
      limpas.push(x);
    }
    return { limpas, descartes };
  }

  function derivarResultados(limpas) {
    return limpas.map((x) => Object.assign({}, x, CV.resultados.classificar(x)));
  }

  CV.dados = {
    CAMPOS_ATIVIDADES, OBRIGATORIOS_ATIVIDADES, CAMPOS_RESULTADOS, OBRIGATORIOS_RESULTADOS, ROTULOS,
    detectarTipo, limparAtividades, derivarVisitas, limparResultados, derivarResultados,
    qtdEconomias, rotuloQtdEcon, grupoStatus, tipoEquipe, ehCadastral,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.dados;
})(typeof window !== 'undefined' ? window : globalThis);
