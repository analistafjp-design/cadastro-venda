# Regras e dicionário de dados

Tudo o que é critério de negócio está em [`js/regras.js`](../js/regras.js). Este documento explica o que cada regra faz.

## 1. Colunas usadas

Os arquivos são lidos **pelo nome do cabeçalho** (sem diferenciar maiúsculas, acentos ou pontuação), não pela posição. Por isso funcionam tanto a planilha "leve" quanto a exportação completa do sistema (~300 colunas). Colunas ausentes que não são obrigatórias apenas deixam em branco a análise que dependia delas.

### Atividades

| Coluna | Uso | Obrigatória |
|---|---|---|
| ID da Atividade | Identifica a visita; evita duplicar ao recarregar | sim |
| Matrícula | **Chave do cruzamento** (9 dígitos) | sim |
| Data | Data da visita (aceita data do Excel, `dd/mm/aa` e `dd/mm/aaaa`) | sim |
| Recurso | Equipe (ex.: `RIORECIN-004`) | sim |
| Status da Atividade | Executada / ocorrência / outras | sim |
| Tipo de Atividade | *Verificação Cadastral* (e venda) são as visitas. As demais (corte...) só ficam se forem de uma equipe do escopo, para os tempos | não |
| Início, Fim, Duração, Tempo de Deslocamento | Horários de cada atividade (aba *Tempos das equipes*) | não |
| Observação | **Nome do projeto/base** (`PROJETO XXXX: ...`) | não* |
| Parecer De Campo | Alternativa de leitura do projeto quando a *Observação* não traz um | não |
| Cód. Protocolo Origem | Resgatar retornos lançados com o protocolo no lugar da matrícula | não |
| Cidade, Bairro, Área de Trabalho, Endereço | Território e listas de ação | não |
| Motivo de Não Execução - Normal | Define o que é revisitável | não |
| Categoria, Quantidade De Economia, Situação Do Imóvel | Perfil do alvo | não |

\* Sem a *Observação* tudo cai em "SOLICITADA EM CAMPO" e a análise por base perde o sentido.

> **Sobre o "Parecer de campo".** No arquivo recebido, o nome da base está na coluna **Observação** (texto de abertura da atividade). Na exportação completa, "Parecer De Campo" é o texto livre que o técnico escreve ao final da visita. O app procura o projeto primeiro em *Observação* e, se não achar, em *Parecer De Campo* (lista `colunasProjeto` em `regras.js`).

### Resultados

| Coluna | Uso |
|---|---|
| Id | Identifica o lançamento (linhas repetidas são contadas uma vez) |
| Hora de início | Data do retorno |
| MATRICULA S/ DIGITO | **Chave do cruzamento** |
| FRENTE DE SERVIÇO | Permite excluir frentes (ex.: Bairro Legal) na Auditoria |
| TIPO DE ORDEM DE SERVIÇO, QUAL FOI A ALTERAÇÃO DE ECONOMIA?, TRATATIVA CADASTRAL, TIPO DE ALTERAÇÃO | Definem o desfecho |
| DE:, PARA: | Quantas economias foram acrescidas/retiradas |

## 1.1 Escopo do painel

O painel considera só as **10 equipes** e as **12 cidades** da operação (`escopo` em `regras.js`; as 12 cidades são as que aparecem no arquivo do Interior, com as grafias alternativas). Equipes de outros serviços e cidades de outras regiões (ex.: São Gonçalo, Itaboraí) **não entram nos números**.

- O filtro é aplicado **depois** do cruzamento: todas as visitas ajudam a ligar o retorno à matrícula, mas só as do escopo aparecem. A Auditoria mostra quantas ficaram de fora e quais as equipes/cidades com mais visitas.
- Atividades de outros tipos (refeição, DDS...) só são guardadas para equipes do escopo.
- Lista vazia em `escopo` = sem filtro.

## 1.2 Leitura de uma pasta

- Percorre a pasta e as subpastas (até 8 níveis), olhando só arquivos `.xlsx`. Ignora temporários do Excel (`~$...`), arquivos e pastas ocultos (que começam com `.`) e outros formatos.
- **Reconhece o tipo pelo cabeçalho**, não pelo nome do arquivo: tem "ID da Atividade" e "Status da Atividade" → Atividades; tem "MATRICULA S/ DIGITO" (ou "Hora de início" + "Tipo de Ordem de Serviço") → Resultados. Qualquer outra planilha é ignorada e anotada, para não ser aberta de novo.
- **Só lê o que é novo ou mudou**: cada arquivo tem uma assinatura (caminho + tamanho + data de modificação). Igual ao da última leitura → pulado.
- Os arquivos são lidos do **mais antigo para o mais novo**; se a mesma atividade/retorno (mesmo ID) aparecer em mais de um, vale o do arquivo mais recente.
- Falha em um arquivo (aberto/bloqueado, só na nuvem, corrompido) não interrompe os demais: vai para um aviso com o nome dos arquivos.

## 2. Nome do projeto/base

1. Pega o texto de abertura e extrai o rótulo: o que vem depois de `PROJETO` até os dois-pontos (`PROJETO INCREMENTO: VERIFICAR ...` → `INCREMENTO`).
2. Compara a chave do rótulo (maiúsculas, sem acento, sem caracteres quebrados `¿`) com a lista `projetos` de `regras.js`. A primeira regra que casar define o nome final.
3. Sem regra: se o rótulo for muito parecido (≥ 88%) com um nome já conhecido, é unido a ele; senão vira um projeto novo (aparece na Auditoria).
4. Textos sem a palavra `PROJETO` só são aceitos se baterem numa regra com rótulo curto (ex.: `LNA - VARREDURA - ...`). O resto vira `SOLICITADA EM CAMPO`.

Unificações já feitas (variações do mesmo projeto → um só):

| Nome final | Variações reunidas |
|---|---|
| INCREMENTO | `INCREMENTO` com qualquer das instruções de texto |
| VARREDURA | `VARREDURA`, `VARREDURA - INCREMENTO`, `VAR`, `LNA - VARREDURA` |
| VENDA LNA | `VENDA LNA`, `VENDA` |
| VERIFICAE SOCIAL - VENDA | `VERIFICAE SOCIAL - VENDA`, `VERIFICACAO SOCIAL` |
| VERIFICAE - PÚBLICO | `VERIFICAE - PUBLICO` |
| DESMEMBRAMENTO | `DESMEMBRAMENTO`, `SEPARACAO DE ECONOMIAS` |
| EDIFÍCIOS | `EDIFICIOS-METROPOLITANA`, `INCREMENTO EDIFICIOS` |
| NEGOCIAE | `NEGOCIAE-PRIORIDADE 2`, `-PRIORIDADE 3` |
| RAIO-X | `RAIO - X`, `raio - x` |
| FATURA DIGITAL - RECADASTRO | `FATURA DIGITAL - RECADASTRO` |
| ATUALIZAE CONDOMÍNIOS, LOCALIZAE, VENDA LOCALIZAE | `ATUALIZAE CONDOMINIOS`, `LOCALIZAE:`, `VENDA LOCALIZAE` |
| SAÚDE PÚBLICA, CARTÃO VERMELHO SOCIAL, FERIADÃO | grafias com `¿` (acento perdido) |

**Nomes terminados em "AE"** (`LOCALIZAE`, `VERIFICAE`, `ATUALIZAE`, `NEGOCIAE`) são os nomes dos projetos e aparecem assim no texto de abertura; acento realmente perdido aparece como `¿` (`SA¿E`, `CART¿`). Por isso os primeiros são mantidos como estão.

**SOLICITADA EM CAMPO** (antes “SEM PROJETO (avulsas)”; o nome está em `semProjeto` de `regras.js`). Atividades cujo texto de abertura não começa com o nome de um projeto: pedidos do atendimento (call center, WhatsApp), solicitações das próprias equipes (`SOLICITADO PELA EQUIPE ...`), instruções genéricas e atividades sem texto. Não são uma base de alvos gerada; entram nas contas de equipe e de dia, e o filtro *Ocultar “SOLICITADA EM CAMPO”* as retira.

Se discordar de alguma união (por exemplo, separar `VARREDURA - INCREMENTO` de `VARREDURA`), edite a lista `projetos`.

## 3. Status da visita

| Status | Grupo |
|---|---|
| Finalizada | **Executada** |
| Encerrada com Ocorrência | **Ocorrência** (a equipe foi, não executou) |
| Qualquer outro (Cancelada, Pendente, Paralisada...) | Não concluída (conta como atividade, não como visita) |

## 4. Desfecho de um retorno

Cada linha da planilha de Resultados recebe uma ou mais etiquetas, lendo as quatro colunas de tratativa em conjunto:

| Etiqueta | Grupo | Quando |
|---|---|---|
| Incremento de economia | **Resultado** | "Alteração de economia" = *Incremento* |
| Decremento de economia | **Resultado** | "Alteração de economia" = *Decremento* |
| Alteração de economia (sem sentido) | **Resultado** | Alteração de economia sem direção informada |
| Alteração de categoria | **Resultado** | Tipo de OS ou de alteração com *categoria* |
| Venda / ligação nova | **Resultado** | *Ligação nova*, *venda factível* |
| Troca de titularidade | **Resultado** | *Titularidade* |
| Tarifa social | **Resultado** | *Tarifa social* |
| Fatura digital / forma de entrega | **Resultado** | *Fatura digital*, mudança de entrega/envio |
| Negociação de débitos | **Resultado** | *Negociação*, *unificação*, *reparcelamento* |
| Atualização cadastral | Tratativa (não é resultado) | Telefone, e-mail, RG/CPF, endereço, nº de porta, complemento, classificação, HD, inativação, duplicidade... |
| Sem tratativa | Sem tratativa | "Sem Tratativa" / "Encerrado s. tratativa" sem nenhuma alteração |

Se o mesmo retorno tem "Sem tratativa" **e** uma alteração real, vale a alteração.

**Variação de economias.** Lida dos campos DE/PARA (`1 Residência` → `3 Residências`, ou `DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.`). Só é somada quando o sentido bate com o desfecho (incremento > 0, decremento < 0).

Mudar o que conta como "resultado": campo `grupo` de cada item de `classes` em `regras.js`.

## 5. Cruzamento (atribuição)

Para cada retorno, em ordem:

1. **Matrícula** do retorno com 9 dígitos. Se não tiver (ex.: 7 dígitos), tenta o **protocolo**: se o número bater com o protocolo de uma visita, usa a matrícula dela. Caso contrário, "matrícula inválida".
2. Procura as visitas da matrícula. Sem nenhuma → "fora das bases" (trabalho do backoffice sobre outras matrículas).
3. Escolhe a **visita mais recente com data ≤ data do retorno**. Nenhuma → "anterior à visita".
4. Se a diferença for maior que a **janela** (padrão 30 dias) → "fora da janela".
5. No mesmo dia, a visita *executada* tem preferência sobre a *ocorrência*.

Cada retorno cai em exatamente um destes baldes (a Auditoria mostra os números e a soma fecha com o total).

## 6. Métricas

| Métrica | Definição |
|---|---|
| Atividades | Todas as linhas de visita (alvos gerados), por data da visita |
| Percorrido | Exec + Exoc: visitas em que a equipe foi ao local |
| Exec / Executadas | Status *Finalizada* |
| Exoc | Status *Encerrada com Ocorrência* |
| % Exec. | Executadas ÷ Atividades |
| Com retorno | Executadas com ao menos um retorno atribuído |
| Resultado | Executadas cujo retorno é do grupo *resultado* |
| **Efetividade (% de resultado)** | **Resultado ÷ Executadas** — o número em destaque na Visão geral |
| Atualização | Executadas cujo melhor retorno é só atualização cadastral |
| Sem tratativa | Executadas cujos retornos foram todos "sem tratativa" |
| Sem retorno | Executadas sem retorno atribuído |
| Δ economias | Soma líquida de economias acrescidas |
| Índice | Efetividade da linha ÷ efetividade geral (só com 10+ executadas) |

- As colunas de desfecho (Incremento, Categoria...) contam visitas que **incluem** aquele desfecho; uma visita pode ter mais de um, então não somam o total.

**Tipos de resultado (cards e “+” de cada equipe).** Cada visita com resultado entra em um ou mais tipos:

| Tipo | Quando |
|---|---|
| Incremento de economia | incremento, sem alteração de categoria |
| Incremento de economia e alteração de categoria | o mesmo retorno traz economia e categoria |
| Alteração de categoria | só categoria |
| Troca de titularidade, Tarifa social, Fatura digital, Venda / ligação nova, Negociação de débitos, Decremento | o desfecho correspondente |

*Total de incremento* = incremento + incremento e categoria. *Total alteração de categoria* = categoria + incremento e categoria. *Outros resultados* = com resultado, mas sem incremento, categoria nem titularidade.
- **Em maturação:** visitas dos últimos 3 dias (contados a partir do último retorno carregado). O backoffice leva em média 1 a 3 dias para lançar, então a taxa dessas datas ainda vai subir.

## 6.1 Tempos das equipes

Calculados por equipe e por dia, em minutos, com as atividades que têm horário (canceladas e pendentes ficam de fora):

| Tempo | Definição |
|---|---|
| Dia | do início da 1ª atividade (menos o deslocamento até ela) ao fim da última |
| Deslocamento | soma de *Tempo de Deslocamento* de cada atividade (+ atividades do tipo *Deslocamento*) |
| Serviço | duração das atividades de serviço (visitas, vendas, cobrança, manobra...) |
| Pausas e apoio | duração de refeição, checklist de início, DDS, carregamento de material, condição climática e abastecimento (`tempos.tiposApoio`) |
| Ociosidade | o que sobra do dia depois de deslocamento, serviço e apoio |

A aba mostra a **média por dia trabalhado** ou o **total do período**. Como o almoço e as paradas só existem na exportação completa do sistema, um dia só com visitas deixaria essas pausas virarem ociosidade: por isso o padrão é contar só os **dias completos** (dias em que a equipe tem também atividades que não são visita) e há a opção *Todos os dias*. Quais tipos são apoio, e se algum conta como ocioso (`tiposOciosos`), está em `regras.js`.

## 6.2 Quais equipes aparecem

*Resultado por equipe* (Visão geral) e *Tempos das equipes* mostram **só as equipes com resultado maior que zero no período e nos filtros** — equipe sem resultado some desses visuais (e volta quando houver). Isso vale só para os visuais: os cards, as bases e a exportação continuam contando todas as visitas do recorte.

## 6.3 Exportação (Excel)

Todo arquivo exportado é `.xlsx`, uma linha por atividade, com as colunas da planilha de Atividades (`Recurso`, `Data`, `ID da Atividade`, `Cód. Protocolo Origem`, `Matrícula`, `Status da Atividade`, `Tipo de Atividade`, `Observação`, `Cidade`, `Bairro`, `Área de Trabalho`, `Endereço`, `Motivo de Não Execução - Normal`, `Categoria`, `Quantidade De Economia`, `Situação Do Imóvel`, `Início`, `Fim`, `Duração`, `Tempo de Deslocamento`) mais: `Projeto (base)`, `Situação da visita`, `Percorrido`, `Retornos do backoffice`, `Grupo do retorno`, `Com resultado`, `Tipo de resultado`, `Desfechos do retorno`, `Δ economias`, `Data do 1º retorno`, `Dias até o retorno` e `Em maturação`. Datas e horários saem como data/hora do Excel, matrícula e ID como número, texto sempre como texto. A aba *Filtros* guarda o período, a equipe, a cidade e a base usados.

## 7. Listas de novos alvos

| Lista | Regra |
|---|---|
| Revisitar | Última visita da matrícula é ocorrência com motivo *cliente ausente*, *retornar depois* ou *imóvel fechado sem acesso ao HD*. Quem já teve visita executada depois sai. 3+ tentativas → "escalar". |
| Corrigir endereço | Última visita em *endereço não localizado* / *ramal ou rede não localizado*. |
| Cobrar retorno | Visita executada há mais de 5 dias (até o último retorno carregado) sem nenhum retorno. |
| Parar de insistir | 2+ visitas executadas, todas com retorno "sem tratativa". |
| Onde atuar | Efetividade por território/perfil (mínimo de 20 executadas); índice ≥ 1,3 → *priorizar*; ≤ 0,5 → *rever*. |

**Chance estimada** (lista *Revisitar*): taxa histórica de resultado do segmento mais específico com 20+ visitas — projeto × nº de economias, depois nº de economias, depois projeto, depois média geral. É uma média histórica transparente, não um modelo estatístico: serve para ordenar, não para prometer.

As listas usam **todo o histórico carregado** (ignoram o filtro de período, senão uma visita antiga já "resolvida" voltaria à lista), mas respeitam os filtros de projeto, equipe e cidade.

## 8. Limitações conhecidas

- O universo de matrículas **não visitadas** não está nos arquivos; por isso "Onde atuar" indica *perfis e territórios* onde gerar novas bases, não matrículas específicas ainda não visitadas.
- Retorno só é ligado à visita se a **matrícula** do lançamento estiver correta (ou for o protocolo). Lançamentos com matrícula errada aparecem como "sem retorno" para a visita.
- A planilha de Resultados não traz a data da visita: usa-se a data em que o backoffice iniciou o lançamento e a janela de 30 dias.
