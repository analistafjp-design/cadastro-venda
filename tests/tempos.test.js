'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');
const N = CV.normalize;
const T = CV.tempos;

const m = N.minutos;
const at = (tipo, ini, fim, dur, desl, status = 'Finalizada', extra = {}) =>
  Object.assign({ recurso: 'RIORECIN-004', data: '2026-10-05', tipo, status, inicio: m(ini), fim: m(fim), duracao: m(dur), desloc: m(desl) }, extra);

test('minutos e hhmm', () => {
  assert.equal(m('00:14'), 14);
  assert.equal(m('08:01'), 481);
  assert.equal(m('11:13:27'), 673);
  assert.equal(m('T11:13:27'), 673);
  assert.equal(m(0.5), 720); // fração do dia do Excel
  assert.equal(m(''), null);
  assert.equal(m(null), null);
  assert.equal(m('abc'), null);
  assert.equal(m('01:99'), null);
  assert.equal(N.hhmm(481), '8:01');
  assert.equal(N.hhmm(5), '0:05');
  assert.equal(N.hhmm(null), '–');
});

test('um dia: janela, deslocamento, serviço, apoio e ociosidade fecham', () => {
  const dia = T.calcularDia([
    at('DDS', '08:00', '08:10', '00:10', '00:00'),
    at('Verificação Cadastral', '08:30', '09:00', '00:30', '00:20'), // saiu 08:10: 20 min de viagem
    at('Verificação Cadastral', '09:10', '09:20', '00:10', '00:10', 'Encerrada com Ocorrência'),
    // ociosidade: 09:20 -> 10:00 sem nada (sem viagem)
    at('Refeição', '12:00', '13:00', '01:00', '00:00'),
    at('Verificação Cadastral', '13:15', '13:45', '00:30', '00:15'),
  ]);
  assert.equal(dia.dia, m('13:45') - m('08:00')); // 5h45
  assert.equal(dia.desloc, 20 + 10 + 15);
  assert.equal(dia.servico, 30 + 10 + 30);
  assert.equal(dia.apoio, 10 + 60);
  // o que sobra do dia é ociosidade: 345 - 45 - 70 - 70 = 160
  assert.equal(dia.ocioso, 160);
  assert.equal(dia.desloc + dia.servico + dia.apoio + dia.ocioso, dia.dia);
});

test('o deslocamento até a 1ª atividade conta como parte do dia', () => {
  const dia = T.calcularDia([at('Verificação Cadastral', '08:30', '09:00', '00:30', '00:30')]);
  assert.equal(dia.dia, 60); // saiu 08:00
  assert.equal(dia.desloc, 30);
  assert.equal(dia.servico, 30);
  assert.equal(dia.ocioso, 0);
});

test('canceladas/pendentes e atividades sem horário não entram; dia sem horário = null', () => {
  const dia = T.calcularDia([
    at('Verificação Cadastral', '08:00', '08:30', '00:30', '00:00'),
    at('Verificação Cadastral', null, null, '00:00', '00:00', 'Cancelada'),
    at('DDS', '09:00', '09:10', '00:10', '00:00', 'Cancelada'),
  ]);
  assert.equal(dia.atividades, 1);
  assert.equal(dia.dia, 30);
  assert.equal(T.calcularDia([at('Verificação Cadastral', null, null, null, null)]), null);
  assert.equal(T.calcularDia([]), null);
});

test('sobreposição não gera ociosidade negativa', () => {
  const dia = T.calcularDia([
    at('Verificação Cadastral', '08:00', '09:00', '01:00', '00:00'),
    at('Verificação Cadastral', '08:30', '09:30', '01:00', '00:00'),
  ]);
  assert.equal(dia.ocioso, 0);
});

test('tipo configurado como ocioso conta como ociosidade; tipo Deslocamento conta como deslocamento', () => {
  const guarda = CV.regras.tempos;
  CV.regras.tempos = Object.assign({}, guarda, { tiposOciosos: ['CARREGAMENTO DE MATERIAL'] });
  try {
    const d = T.calcularDia([
      at('Carregamento de Material', '08:00', '09:00', '01:00', '00:00'),
      at('Verificação Cadastral', '09:00', '09:30', '00:30', '00:00'),
    ]);
    assert.equal(d.ocioso, 60);
    assert.equal(d.apoio, 0);
  } finally { CV.regras.tempos = guarda; }
  const d2 = T.calcularDia([at('Deslocamento', '08:00', '08:40', '00:40', '00:00'), at('Verificação Cadastral', '08:40', '09:00', '00:20', '00:00')]);
  assert.equal(d2.desloc, 40);
  assert.equal(d2.servico, 20);
});

test('por equipe: média por dia trabalhado e só equipes do escopo', () => {
  const agenda = T.agendaDe([
    at('Verificação Cadastral', '08:00', '09:00', '01:00', '00:00', 'Finalizada', { data: '2026-10-05' }),
    at('Verificação Cadastral', '08:00', '10:00', '02:00', '00:00', 'Finalizada', { data: '2026-10-06' }),
    at('Verificação Cadastral', '08:00', '09:00', '01:00', '00:00', 'Finalizada', { recurso: 'RIOCERIN-020' }), // fora do escopo
    at('Verificação Cadastral', null, null, null, null, 'Cancelada', { recurso: 'RIORECIN-007' }), // sem horário
  ]);
  const r = T.porEquipe(agenda);
  assert.equal(r.length, 1);
  assert.equal(r[0].recurso, 'RIORECIN-004');
  assert.equal(r[0].dias, 2);
  assert.equal(r[0].total.servico, 180);
  assert.equal(r[0].media.servico, 90);
  assert.equal(r[0].media.dia, 90);
});

test('dia completo = tem também atividades que não são visita; "só completos" ignora os demais dias', () => {
  const agenda = T.agendaDe([
    // dia 05: exportação completa (tem almoço)
    at('Refeição', '12:00', '13:00', '01:00', '00:00', 'Finalizada', { data: '2026-10-05' }),
    at('Verificação Cadastral', '08:00', '12:00', '04:00', '00:00', 'Finalizada', { data: '2026-10-05' }),
    at('Verificação Cadastral', '13:00', '17:00', '04:00', '00:00', 'Finalizada', { data: '2026-10-05' }),
    // dia 06: só visitas (o almoço some e vira "ociosidade")
    at('Verificação Cadastral', '08:00', '12:00', '04:00', '00:00', 'Finalizada', { data: '2026-10-06' }),
    at('Verificação Cadastral', '13:00', '17:00', '04:00', '00:00', 'Finalizada', { data: '2026-10-06' }),
  ]);
  assert.equal(T.calcularDia(agenda.filter((a) => a.data === '2026-10-05')).completo, true);
  assert.equal(T.calcularDia(agenda.filter((a) => a.data === '2026-10-06')).completo, false);

  const todos = T.porEquipe(agenda)[0];
  assert.equal(todos.dias, 2);
  assert.equal(todos.diasTodos, 2);
  assert.equal(todos.diasCompletos, 1);
  assert.equal(todos.media.ocioso, 30); // (0 no dia 05 + 60 no dia 06) / 2

  const completos = T.porEquipe(agenda, { soCompletos: true })[0];
  assert.equal(completos.dias, 1);
  assert.equal(completos.diasTodos, 2);
  assert.equal(completos.media.ocioso, 0);
  assert.equal(completos.media.apoio, 60);

  // só dias incompletos: a equipe continua na lista, sem média
  const so = T.porEquipe(agenda.filter((a) => a.data === '2026-10-06'), { soCompletos: true })[0];
  assert.equal(so.dias, 0);
  assert.equal(so.diasTodos, 1);
  assert.equal(so.media.servico, null);
});
