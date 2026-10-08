/*
 * tempos.js — deslocamento, serviço e ociosidade de cada equipe, por dia.
 *
 * Para cada equipe e dia (considerando só atividades com horário e que não foram
 * canceladas/pendentes):
 *   dia          = do início da 1ª atividade (menos o deslocamento até ela) ao fim da última
 *   deslocamento = soma de "Tempo de Deslocamento" (+ atividades do tipo Deslocamento)
 *   serviço      = duração das atividades de serviço (tudo que não é apoio)
 *   apoio        = duração de refeição, DDS, checklist, carregamento, clima... (regras.tempos)
 *   ociosidade   = o que sobra do dia, sem contar apoio (+ durações dos tipos ociosos, se houver)
 * Um dia é "completo" quando traz também atividades que não são visita cadastral (refeição, DDS,
 * carregamento...): só a exportação completa do sistema tem isso. Num dia só com visitas, o almoço e
 * as paradas ficam sem registro e entram como ociosidade — por isso dá para contar só os completos.
 * Tudo em minutos. Regras em js/regras.js (tempos).
 */
(function (global) {
  'use strict';
  const CV = (global.CV = global.CV || {});
  const N = () => CV.normalize;

  function conjuntos() {
    const T = CV.regras.tempos;
    const set = (l) => new Set(l.map((t) => N().chave(t)));
    return { apoio: set(T.tiposApoio), ocioso: set(T.tiposOciosos), desloc: set(T.tiposDeslocamento), semTempo: set(T.statusSemTempo) };
  }

  /** Como um tipo de atividade entra na conta: 'Deslocamento' | 'Pausas e apoio' | 'Ociosidade' | 'Serviço'. */
  function classeDoTipo(tipo) {
    const c = conjuntos();
    const k = N().chave(tipo);
    if (c.desloc.has(k)) return 'Deslocamento';
    if (c.ocioso.has(k)) return 'Ociosidade';
    if (c.apoio.has(k)) return 'Pausas e apoio';
    return 'Serviço';
  }

  /** Atividades de equipes do escopo, com horário, prontas para somar. */
  function agendaDe(limpas) {
    const out = [];
    for (const a of limpas) {
      if (!CV.escopo.equipeNoEscopo(a.recurso)) continue;
      if (a.inicio === null || a.inicio === undefined) continue;
      out.push(a);
    }
    return out;
  }

  /**
   * Um dia de uma equipe.
   * @param atividades atividades da equipe nesse dia
   * @returns { dia, desloc, servico, apoio, ocioso } em minutos, ou null se não houver horários
   */
  function calcularDia(atividades) {
    const c = conjuntos();
    let ini = Infinity;
    let fim = -Infinity;
    let desloc = 0;
    let servico = 0;
    let apoio = 0;
    let ociosoTipo = 0;
    let n = 0;
    let completo = false;
    for (const a of atividades) {
      if (c.semTempo.has(N().chave(a.status))) continue;
      if (a.inicio === null || a.inicio === undefined) continue;
      let f = a.fim;
      if (f === null || f === undefined) f = a.inicio + (a.duracao || 0);
      if (f < a.inicio) f += 1440; // virou o dia
      const d = a.duracao !== null && a.duracao !== undefined ? a.duracao : f - a.inicio;
      const viagem = a.desloc || 0;
      ini = Math.min(ini, a.inicio - viagem);
      fim = Math.max(fim, f);
      desloc += viagem;
      const tipo = N().chave(a.tipo);
      if (c.desloc.has(tipo)) desloc += d;
      else if (c.ocioso.has(tipo)) ociosoTipo += d;
      else if (c.apoio.has(tipo)) apoio += d;
      else servico += d;
      if (!CV.dados.ehCadastral(a.tipo)) completo = true;
      n++;
    }
    if (!n) return null;
    const dia = Math.max(0, fim - ini);
    const ocioso = Math.max(0, dia - desloc - servico - apoio - ociosoTipo) + ociosoTipo;
    return { inicio: ini, fim, dia, desloc, servico, apoio, ocioso, atividades: n, completo };
  }

  /**
   * Agrega por equipe: soma e média por dia trabalhado.
   * @param agenda  saída de agendaDe (já filtrada por período, se for o caso)
   * @param opc     { soCompletos: conta só os dias completos (veja acima) }
   * @returns [{ recurso, dias, diasTodos, diasCompletos, total:{...}, media:{...} }] ordenado pelo nome da equipe
   */
  function porEquipe(agenda, opc) {
    const soCompletos = !!(opc && opc.soCompletos);
    const dias = new Map(); // recurso -> data -> atividades
    for (const a of agenda) {
      if (!dias.has(a.recurso)) dias.set(a.recurso, new Map());
      const d = dias.get(a.recurso);
      if (!d.has(a.data)) d.set(a.data, []);
      d.get(a.data).push(a);
    }
    const linhas = [];
    for (const [recurso, porData] of dias) {
      const total = { dia: 0, desloc: 0, servico: 0, apoio: 0, ocioso: 0 };
      let n = 0;
      let diasTodos = 0;
      let diasCompletos = 0;
      for (const ats of porData.values()) {
        const r = calcularDia(ats);
        if (!r) continue;
        diasTodos++;
        if (r.completo) diasCompletos++;
        if (soCompletos && !r.completo) continue;
        for (const k of Object.keys(total)) total[k] += r[k];
        n++;
      }
      if (!diasTodos) continue;
      const media = {};
      for (const k of Object.keys(total)) media[k] = n ? total[k] / n : null;
      linhas.push({ recurso, dias: n, diasTodos, diasCompletos, total, media });
    }
    linhas.sort((a, b) => a.recurso.localeCompare(b.recurso, 'pt-BR'));
    return linhas;
  }

  /** Um dia de cada equipe (para exportar): [{ recurso, data, completo, inicio, fim, dia, desloc, servico, apoio, ocioso }]. */
  function diasDaEquipe(agenda) {
    const dias = new Map(); // "recurso|data" -> atividades
    for (const a of agenda) {
      const k = a.recurso + '|' + a.data;
      if (!dias.has(k)) dias.set(k, { recurso: a.recurso, data: a.data, ats: [] });
      dias.get(k).ats.push(a);
    }
    const out = [];
    for (const d of dias.values()) {
      const r = calcularDia(d.ats);
      if (r) out.push(Object.assign({ recurso: d.recurso, data: d.data }, r));
    }
    out.sort((a, b) => a.recurso.localeCompare(b.recurso, 'pt-BR') || (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
    return out;
  }

  /** Tipos de atividade presentes (para avisar quando só há visitas cadastrais, sem refeição etc.). */
  function tiposPresentes(agenda) {
    const m = new Map();
    for (const a of agenda) m.set(a.tipo || '(sem tipo)', (m.get(a.tipo || '(sem tipo)') || 0) + 1);
    return m;
  }

  CV.tempos = { agendaDe, calcularDia, porEquipe, diasDaEquipe, classeDoTipo, tiposPresentes };
  if (typeof module !== 'undefined' && module.exports) module.exports = CV.tempos;
})(typeof window !== 'undefined' ? window : globalThis);
