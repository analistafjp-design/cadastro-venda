'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('./helpers');

const nome = (obs) => CV.projetos.criarExtrator().extrair(obs).nome;

test('variações de escrita do mesmo projeto viram um nome só', () => {
  const casos = [
    // INCREMENTO: textos de instrução diferentes
    ['PROJETO INCREMENTO: VERIFICAR O TIPO E A QUANTIDADE DE ECONOMIAS EXISTENTES. CASO HAJA MAIS DE UMA', 'INCREMENTO'],
    ['PROJETO INCREMENTO: FAVOR VERIFICAR TIPO E QUANTIDADE ECONOMIAS E SE EXISTIR MAIS DE UMA', 'INCREMENTO'],
    ['PROJETO INCREMENTO EDIFICIOS: FAVOR REALIZAR A VERIFICA¿O CADASTRAL COMPLETA', 'EDIFÍCIOS'],
    ['PROJETO EDIFICIOS-METROPOLITANA: FAVOR IDENTIFICAR O RESPONSAVEL', 'EDIFÍCIOS'],
    // VENDA
    ['PROJETO - VENDA LNA: FAVOR LOCALIZAR O ENDERECO', 'VENDA LNA'],
    ['PROJETO - VENDA: FAVOR IDENTIFICAR O TITULAR DA MATRICULA', 'VENDA LNA'],
    ['PROJETO VENDA LOCALIZAE: FAVOR VERIFICAR SE POSSUI MORADOR', 'VENDA LOCALIZAE'],
    ['LOCALIZAE:Favor localizar o imovel atualizar os seguintes pontos', 'LOCALIZAE'],
    // VARREDURA (inclui abreviação "VAR" e texto sem a palavra PROJETO)
    ['PROJETO VARREDURA: FAVOR VERIFICAR TIPO E QUANTIDADE DE ECONOMIA', 'VARREDURA'],
    ['PROJETO VARREDURA - INCREMENTO: FAVOR LOCALIZAR O IMOVEL', 'VARREDURA'],
    ['PROJETO - VAR: MATRICULA COM GRANDE POTENCIAL PARA INCREMENTO', 'VARREDURA'],
    ['LNA - VARREDURA - FAVOR IDENTIFICAR O CLIENTE, COLETAR DOCUMENTAO E FAZER VENDA', 'VARREDURA'],
    // encoding quebrado (¿) e cortes de acento
    ['PROJETO VERIFICAE SOCIAL - VENDA: FAVOR VERIFICAR A QUANTIDADE', 'VERIFICAE SOCIAL - VENDA'],
    ['PROJETO VERIFICAE - PUBLICO: FAVOR VERIFICAR QUANTIDADE DE SALAS', 'VERIFICAE - PÚBLICO'],
    ['PROJETO SA¿E PUBLICA: FAVOR LOCALIZAR O ENDERE¿', 'SAÚDE PÚBLICA'],
    ['PROJETO CART¿ VERMELHO SOCIAL: ATEN¿O!', 'CARTÃO VERMELHO SOCIAL'],
    ['PROJETO ATUALIZAE CONDOMINIOS: FAVOR IDENTIFICAR O RESPONSAVEL', 'ATUALIZAE CONDOMÍNIOS'],
    // maiúsculas/minúsculas e espaçamento
    ['projeto raio - x: Verificar categoria e quantidade de economias', 'RAIO-X'],
    ['PROJETO RAIO - X: VERIFICAR CATEGORIA', 'RAIO-X'],
    // sem dois-pontos
    ['PROJETO_NEGOCIAE-PRIORIDADE 3', 'NEGOCIAE'],
    ['PROJETO_NEGOCIAE-PRIORIDADE 2', 'NEGOCIAE'],
    ['PROJETO CAV', 'CAV'],
    ['Projeto Feriad¿ Favor entrar em contato com o cliente', 'FERIADÃO'],
    // sinônimos de DESMEMBRAMENTO
    ['PROJETO DESMEMBRAMENTO: FAVOR VERIFICAR TIPO E QUANTIDADE', 'DESMEMBRAMENTO'],
    ['PROJETO SEPARACAO DE ECONOMIAS: FAVOR IDENTIFICAR O CLIENTE', 'DESMEMBRAMENTO'],
    ['PROJETO CEHAB MIRACEMA: FAVOR IDENTIFICAR O CLIENTE', 'CEHAB MIRACEMA'],
    ['PROJETO FATURA DIGITAL - RECADASTRO: FAVOR IDENTIFICAR O CLIENTE', 'FATURA DIGITAL - RECADASTRO'],
  ];
  for (const [obs, esperado] of casos) assert.equal(nome(obs), esperado, obs);
});

test('sem projeto: texto livre, vazio ou instrução genérica', () => {
  const SEM = CV.regras.semProjeto;
  assert.equal(nome('Sem observação de abertura'), SEM);
  assert.equal(nome(null), SEM);
  assert.equal(nome('   '), SEM);
  assert.equal(nome('SOLICITADO PELA EQUIPE RIOVENIN-005MOTIVO: TROCA DE TITULARIDADE'), SEM);
  assert.equal(nome('Realizar vistoria para localização do imóvel, com anexação de registro fotográfico'), SEM);
});

test('projeto novo (sem regra) é criado; grafia parecida é unida ao já conhecido', () => {
  const ex = CV.projetos.criarExtrator();
  const a = ex.extrair('PROJETO MUTIRAO DO BAIRRO: FAVOR IDENTIFICAR');
  assert.equal(a.origem, 'novo');
  assert.equal(a.nome, 'MUTIRAO DO BAIRRO');
  const b = ex.extrair('PROJETO MUTIRAO DO BAIRO: FAVOR IDENTIFICAR'); // erro de digitação
  assert.equal(b.origem, 'similar');
  assert.equal(b.nome, 'MUTIRAO DO BAIRRO');
  const c = ex.extrair('PROJETO ALTO CONSUMOO: X'); // variação de um nome com regra
  assert.equal(c.nome, 'ALTO CONSUMO');
});

test('rótulo é extraído até os dois-pontos (máx. 60 caracteres)', () => {
  assert.equal(CV.projetos.extrairRotulo('PROJETO  VIDA   NOVA: FAVOR', true), 'VIDA NOVA');
});
