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
| Negociou O Débito?, Valor Total dos Débitos | Aba **Negociações** (§ 6.5); só vêm na exportação completa do sistema | não |

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
| Hora de conclusão, ANTERIOR, ATUAL, QUANTIDADE, Colaborador | Só da aba **Tratativas** (§ 6.4): data de conclusão, categoria antes/depois, quantas economias mudaram e quem lançou (o primeiro nome vira o *Assistente*). São opcionais: sem elas a aba fica em branco, o resto não muda |

## 1.1 Escopo do painel

O painel considera só as **10 equipes** e as **12 cidades** da operação (`escopo` em `regras.js`; as 12 cidades são as que aparecem no arquivo do Interior, com as grafias alternativas). Equipes de outros serviços e cidades de outras regiões (ex.: São Gonçalo, Itaboraí) **não entram nos números**.

- O filtro é aplicado **depois** do cruzamento: todas as visitas ajudam a ligar o retorno à matrícula, mas só as do escopo aparecem. A Auditoria mostra quantas ficaram de fora e quais as equipes/cidades com mais visitas.
- Atividades de outros tipos (refeição, DDS...) só são guardadas para equipes do escopo.
- Lista vazia em `escopo` = sem filtro.

## 1.2 As duas páginas (Interior e VCG)

O mesmo código roda em duas páginas (`index.html` e `vcg.html`); o atributo `data-pagina` do `<body>` escolhe a configuração em [`js/paginas.js`](../js/paginas.js):

| | Interior | VCG |
|---|---|---|
| Equipes | as 10 de `escopo` em `regras.js`, nas 12 cidades | `RIOVCGVENIN-001`, `-002` e `-004`, sem filtro de cidade |
| Resultados lidos | qualquer planilha de Resultados, **menos** as com “VCG” no nome | **só** as com “VCG” no nome (ex.: `Resultados VCG.xlsx`) |
| Atividades lidas | todas, **menos** as com “VCG” no nome | todas |
| Atividades guardadas | visitas de qualquer equipe (servem para ligar o retorno) e os demais tipos só das equipes do escopo | só as das equipes do VCG |
| Banco no navegador | `cadastro-venda` | `cadastro-venda-vcg` (separado) |

“VCG no nome” vale para o nome do arquivo, sem as pastas, sem diferenciar maiúsculas. Um arquivo deixado de lado é anotado (para não ser reaberto toda vez) e aparece na mensagem de leitura e na Auditoria. O VCG aproveita a referência da pasta já escolhida no Interior; a permissão de leitura é pedida de novo, com um clique em **Atualizar**.

Toda a análise (cruzamento por matrícula, janela de 30 dias, efetividade, tipos de resultado, tempos, novos alvos, exportação em Excel) é a mesma nas duas páginas. Para mudar as equipes do VCG, edite `escopo` do `vcg` em `js/paginas.js`.

### Resultados VCG (formulário do VCG)

Cabeçalho: `Id`, `Hora de início`, `Hora de conclusão`, `Email`, `Nome`, `DATA:`, `Matrícula`, `Bairro`, `Equipe`, `Atualização realizada`, `Quantas economias adicionadas`, `Categoria adicionada`, `Observação`. É reconhecido por ter **Equipe** e **Atualização realizada** (e a Matrícula pode vir com espaço invisível no fim). Não há número de OS, de protocolo nem ID de atividade: a ligação com as Atividades é por **matrícula + equipe + data**.

- **Data do lançamento**: `DATA:` quando preenchida (lançamento atrasado); senão a `Hora de início`.
- **Classificação** (`classificarVcg`, em `js/resultados.js`): a *Atualização realizada* diz o que foi feito e a *Observação* desempata (às vezes escolhem a opção genérica e explicam no texto).

| Atualização realizada | Vira | Grupo |
|---|---|---|
| Venda Factível (ou "venda" na observação) | Venda | resultado |
| Lote não cadastrado - Novo cliente | Novo cliente (lote não cadastrado) — ou Titularidade/Venda se a observação disser | resultado |
| Incremento de economia; Ajuste/Atualização de economia com economia acrescentada | Incremento de economia | resultado |
| Ajuste de economia com "retirado/remoção/desmembramento" | Decremento | resultado |
| Alteração de Categoria | Categoria (+ Incremento se a observação falar em incremento) | resultado |
| Troca de Titularidade | Titularidade | resultado |
| Negociação | Negociação de débitos | resultado |
| E-mail (quando a observação fala em fatura) | Fatura | resultado |
| Nome do Bairro, Telefone, Endereço, Nº de Porta, E-mail, Atualização de Contato... | Atualização cadastral | não é resultado |

- **Lançamentos por equipe e tipo** (Visão geral do VCG, `lancamentosPorEquipeTipo` em `js/metricas.js`): matriz equipe × tipo de resultado, contada **direto dos lançamentos**, sem passar pelas visitas, então vale mesmo sem Atividades carregadas. Respeita o período e a equipe dos filtros (cidade e base não se aplicam: o formulário não tem esses campos). Só entram lançamentos de **resultado** das equipes do painel; só aparecem as equipes com resultado e os tipos que ocorreram. Um lançamento pode ter mais de um tipo (ex.: venda e titularidade) e conta em cada coluna, por isso a soma das colunas pode passar do total. Ficam de fora e são avisados: atualizações cadastrais, equipes fora do painel e lançamentos sem equipe. Na página VCG, o período dos filtros (e o atalho “Último dia”, “30 dias”...) também cobre as datas dos lançamentos, não só as das visitas.
- **Atribuição à visita** (diferente do Resultados de sempre): como o lançamento traz a equipe, só vale a visita **da mesma equipe**; se a matrícula só foi visitada por outra, o lançamento vai para o balde “visitada só por outra equipe” na Auditoria.
- **Conferência na Auditoria** (“Lançamentos do formulário × atividades das equipes”): para cada equipe do painel, quantos lançamentos têm *OS executada pela equipe* (atividade finalizada, mesma matrícula, até 30 dias antes), *só tentativa* (ocorrência, paralisada ou cancelada), *atividade fora da janela*, *só de outra equipe* ou *sem atividade carregada* (a matrícula não aparece nos arquivos de Atividades já lidos).

## 1.3 Leitura de uma pasta

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

- A efetividade **sempre** divide por *Exec*, nunca por *Percorrido*: a Exoc (ocorrência) é visita em que a equipe foi ao local e não executou o serviço, então não entra na conta. Por isso a tabela *Bases* mostra as duas colunas (Percorrido e Exec): com o Exec à vista, a efetividade de cada linha confere com *Com resultados ÷ Exec* (ex.: 21 com resultado ÷ 39 Exec = 53,8%, e não 21 ÷ 43 Percorrido = 48,8%).
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

Todo arquivo exportado é `.xlsx`, uma linha por atividade, com as colunas da planilha de Atividades (`Recurso`, `Data`, `ID da Atividade`, `Cód. Protocolo Origem`, `Matrícula`, `Status da Atividade`, `Tipo de Atividade`, `Observação`, `Cidade`, `Bairro`, `Área de Trabalho`, `Endereço`, `Motivo de Não Execução - Normal`, `Categoria`, `Quantidade De Economia`, `Situação Do Imóvel`, `Início`, `Fim`, `Duração`, `Tempo de Deslocamento`) mais: `Projeto (base)`, `Situação da visita`, `Percorrido`, `Retornos do backoffice`, `Grupo do retorno`, `Com resultado`, `Tipo de resultado`, `Desfechos do retorno`, `Δ economias`, `Data do 1º retorno`, `Dias até o retorno` e `Em maturação`. Datas e horários saem como data/hora do Excel, matrícula e ID como número, texto sempre como texto. A aba *Filtros* guarda o período, a equipe, a cidade e a base usados. A aba Tratativas exporta o próprio formato (§ 6.4). Os cards **Total de incremento**, **Total alteração de categoria** e **Troca de titularidade** da Visão geral têm o botão **Excel**: as visitas executadas com aquele resultado (as mesmas que o card conta; o total de incremento inclui o *incremento e alteração de categoria*, o de categoria inclui a que veio com incremento) neste mesmo formato, e a aba *Filtros* começa com o serviço.

## 6.4 Aba Tratativas (incremento e decremento, em R$)

Reproduz a página *TRATATIVAS* do relatório do Power BI. Vem **direto da planilha de Resultados** (não usa atividades nem o cruzamento por matrícula, então funciona só com ela) e existe **só na página Interior** (o formulário do VCG não tem DE/PARA nem ANTERIOR/ATUAL). Só entram lançamentos da frente de serviço `Cadastro` (`tratativas.frente`); a data é a da **conclusão** do formulário (`Hora de conclusão`; sem ela, a de início). Linhas repetidas (mesmo `Id`) valem uma vez, como em todo o painel.

**Tarifa** = R$ por economia (`tratativas.tarifas`): Residencial 85,41 · Comercial 443,57 · Industrial 613,17 · Pública 129,16 · P. Comércio 221,78 · Comércio popular 60,24 · Social 30,12. Categoria sem tarifa vale zero, como no relatório. Nos quadros de **categoria** (ANTERIOR/ATUAL) ela aparece com o **nome certo**: *Sem fins lucrativos* (qualquer grafia com "lucrat": `SEM FINS LUCRATIVOS`, `ENT.S/FIM LUCRATIVO`...), *CadÚnico* (`outrasCategorias` em `regras.js`) ou o próprio texto como foi escrito (ex.: *Bairro legal*); "Outros" só sobra para campo vazio e para o texto livre do DE/PARA. Dar nome não muda nenhum valor: para valorar uma dessas categorias, ponha a tarifa dela em `tarifas` com o mesmo nome. A categoria é reconhecida no texto livre por trechos (`categorias`: RES, SOC, IND, PUB, P COM, COM), na ordem do relatório.

| Quadro | Quais lançamentos | Valor |
|---|---|---|
| **Incremento de economia** | `DE:` e `PARA:` com uma categoria cada (`2 Residências`; ver *Como o DE/PARA é lido* abaixo) e PARA > DE, sem estar marcado como *Decremento* e com a categoria de origem reconhecida | (PARA − DE) × tarifa da categoria de PARA |
| **Decremento de economia** | PARA < DE (qualquer rótulo) | (PARA − DE) × tarifa; se DE e PARA são de categorias diferentes, (PARA − DE) × (tarifa DE − tarifa PARA), como no relatório |
| **Incremento de categoria** | `ANTERIOR` e `ATUAL` com `QUANTIDADE` preenchida e resultado positivo | QUANTIDADE × (tarifa ATUAL − tarifa ANTERIOR) |
| **Decremento de categoria** | o mesmo, com resultado negativo | idem (valor negativo) |

**Como o DE/PARA é lido.** Um texto com **uma categoria** e o número antes dela é lido direto: `2 Residências`, `11 Residencias`, `DE 11 ECONOMIAS RESIDENCIAIS` (o prefixo `DE`/`PARA` e a palavra `ECONOMIAS` são ignorados), `DE UMA COMERCIAL` (UM/UMA/DOIS/DUAS/TRÊS/QUATRO/CINCO valem como número), `6RES.` (sem espaço). Texto com **mais de uma categoria** (`1 RESIDENCIAL E 1 COMERCIAL`) ou a **frase inteira** `DE 5 RES. E 1 COM. P/ 4 RES. E 1 COM.` (às vezes repetida em DE e em PARA) é um inventário "antes → depois": o painel calcula a variação **categoria por categoria** (PARA − DE em cada uma) e cada variação entra como incremento ou decremento de economia da própria categoria. Exemplo: `1 RESIDENCIAL E 1 COMERCIAL → 1 RESIDENCIAL E 2 COMERCIAIS` = +1 Comercial; `2 RESIDÊNCIAS → 1 RESIDENCIAL E 2 COMERCIAIS` = −1 Residencial e +2 Comercial. Esses lançamentos aparecem na *Conferência* (com o `Id`) como "calculados por categoria". Com `compostosPorCategoria: false` em `regras.js` eles ficam de fora, como o texto **sem número** (`varias`), que o painel nunca adivinha: vai para a *Conferência* e, no Excel, como `(fora dos quadros)` com os textos originais, para corrigir no formulário.

Isso difere de quem limpa o formulário à mão (como a cópia usada no Power BI), que costuma reduzir esses textos a uma categoria só, às vezes tratando-os como conversão (variação zero) ou descartando uma das partes. No `Resultados - 2026`, só 9 lançamentos são assim em quase 26 mil linhas.

**Variação suspeita.** Um único lançamento que acrescenta ou tira `variacaoSuspeita` economias (10) ou mais vai para a *Conferência* com o `Id`: costuma ser digitação errada (`100 RES.` no lugar de `1 RES.` valeu −99 economias, R$ 8.455,59, em Abril). O painel só avisa; o número continua valendo.

Os quadros agrupam por De/Anterior e Para/Atual, com o total de cada um na base (a coluna *Frente de serviço* só aparece se algum dia houver mais de uma frente nos dados). Na tela, **incrementos à esquerda** (economia sobre categoria) e **decrementos à direita**; a coluna do valor traz uma barra proporcional (azul soma, vermelho tira), na mesma escala nos quatro quadros. **Saldo** = soma dos quatro. Os valores são somados em centavos inteiros (sem erro de ponto flutuante).

**Resumo do período** (uma faixa compacta no topo): o **saldo**, os incrementos e os decrementos (R$ e nº de economias) e, no pé, *Acumulado* = lançamentos com tratativa feita (`TIPO DE ALTERAÇÃO` preenchido e diferente de ";", "." e de qualquer texto com "sem tratativa" ou "encerrado": o *Total Tratado* do relatório); *Dias com tratativa* = dias distintos; *Média por dia* = Acumulado ÷ dias.

**Saldo por mês:** todos os meses com lançamento, lado a lado, com o **faturado no ano** = saldo do mês × os meses que faltam até dezembro (12 − o mês): março × 9, outubro × 2, dezembro × 0 (a conta é feita em centavos inteiros). A última linha é o **Total**: a soma de cada coluna (em centavos inteiros), inclusive o faturado no ano de todos os meses juntos; a aba *Saldo por mês* do Excel também termina nessa linha. Não há mais o comparativo com o mês anterior. Só o filtro de assistente vale ali (o de período não): substitui a soma feita à mão de cada mês. **Filtros da aba:** datas e atalhos de período, *Mês* (põe as datas no primeiro e no último dia do mês) e *Assistente* (primeiro nome de `Colaborador`). Cidade, equipe e base não se aplicam e não aparecem.

### Onde o painel difere do relatório (e onde copia o que parece erro)

Conferido contra os dados do próprio relatório (17,6 mil linhas): mês a mês, assistente a assistente e dia a dia os quadros fecham ao centavo (Setembro/2026 = R$ 6.263,06, o mesmo valor digitado no relatório), com **estas exceções**:

- **Linhas repetidas** (mesmo `Id`) são contadas uma vez; o relatório as conta duas (Abril/2026 sai R$ 170,82 menor).
- **Filtro por grupo.** O relatório esconde um grupo De/Para inteiro quando a soma líquida das economias dele no período não é positiva (um lançamento errado de −2 apaga um +1 do mesmo grupo). O painel decide linha a linha. Nos dados reais isso só muda 3 dias soltos e nenhum mês.
- **`igualPowerBI: true` (padrão)** copia dois detalhes do relatório que parecem erro, para os números baterem; a aba avisa quantos lançamentos são afetados:
  1. nos quadros de **categoria** a *Pública* vale **zero** (o relatório procura `Publica`, sem acento, na tabela de tarifas, que tem `PÚBLICA`; a Pública dos quadros de economia funciona);
  2. **Comércio popular** é contado como *Comercial* (443,57) em vez de ter a tarifa própria (60,24): `P. Comércio → Comércio popular` aparece como incremento de +221,79 quando, pela tarifa, é um decremento de −161,54.

  Com `igualPowerBI: false` os dois são corrigidos (Pública = 129,16 e Comércio popular = 60,24) e os números deixam de bater com os do relatório.

**Conferência dos dados** (rodapé da aba e coluna *Observação* do Excel; **não sai no PDF**: o bloco leva a classe `so-tela`, escondida pela impressão): lançamentos de outra frente que ficam de fora; marcados como *Incremento* com PARA < DE (entram no decremento); marcados como *Decremento* com PARA > DE (ficam de fora); DE e PARA de categorias diferentes; categoria sem tarifa; categoria alterada **sem QUANTIDADE** (valor zero); e os dois itens do `igualPowerBI`. Nenhum é corrigido sozinho: o painel só mostra onde estão.

**Excel:** abas *Quadros* (grupos, totais e saldo), *Saldo por mês* (com *Meses até dezembro* e *Faturado no ano*), *Tratativas* (uma linha por evento de valor: data, Id, matrícula, assistente, quadro, categorias, economias, valor em R$, textos de DE/PARA/ANTERIOR/ATUAL e *Observação*) e *Filtros* (com as tarifas usadas).

## 6.5 Aba Negociações (débitos negociados por equipe)

É a tabela **Negociação - venda e recadastro** (página ADR) do relatório do Power BI: medidas `Total Negociação`, `Negociação Valor` e `Ticket Médio`. Só a página Interior tem a aba. Vem só das **Atividades** (exportação completa do sistema); não depende dos Resultados nem do cruzamento.

- **Negociação** = atividade com status **Finalizada**, de uma das **10 equipes** do escopo, com *Negociou O Débito?* = **Sim** (sem diferenciar maiúsculas, acentos e espaços nas pontas; a lista de respostas aceitas fica em `negociacoes.respostas` em `regras.js`). Como no relatório, **só a equipe filtra**: a cidade não (uma negociação de uma equipe do interior fora das 12 cidades conta). Uma atividade repetida em mais de um arquivo (mesmo ID) conta uma vez.
- **Total negociação** = número dessas atividades. **Valor negociado** = soma do *Valor Total dos Débitos*. **Ticket médio** = valor negociado ÷ total negociação.
- **Valor**: aceita `R$ 1.234,56`, `645,15`, `1234.56`, `500` e célula numérica do Excel. Negociação **sem valor** (vazio ou sem número) conta no total e no ticket médio com R$ 0,00, como no relatório; a tela avisa quantas são e o Excel mostra quais.
- Linhas: só as equipes que negociaram no período, da que mais negociou para a que menos; o **Total** fica na base.
- Filtros: período, **Mês** (todos os meses entre o primeiro e o último dia com dado) e **Equipe**. Ao abrir, o período é o mês do dado mais recente (atalho *Mês*), como o filtro *Mes/Ano* do relatório.
- **Negociação por mês** (embaixo da tabela): a mesma conta (total, valor, ticket médio) para cada mês com negociação, do mais recente para o mais antigo, com o total. Vale o filtro de equipe; o de período não.
- **Excel**: aba *Negociação por equipe* (a tabela, com o total), aba *Negociação por mês*, aba *Negociações* (uma linha por atividade, com as colunas da planilha de Atividades, a resposta, o texto original do valor, o valor lido e o valor no Power BI) e aba *Filtros*.

### Onde o painel difere do relatório

- O relatório lê o *Valor Total dos Débitos* tirando `R$` e os pontos, trocando a vírgula por ponto e dividindo por 100 (na prática: só os dígitos ÷ 100); se sobrar algo que não é número (letras, como em `R$ 238,23 em 3x`, ou espaço no meio do número), conta **R$ 0,00**. A conta só fecha quando o valor vem só com o número e com os centavos (`1.234,56`). O painel lê o valor como está escrito: `500` é R$ 500,00 (e não R$ 5,00), `1234.5` é R$ 1.234,50 e `R$ 238,23 em 3x` é R$ 238,23. A quantidade de negociações é a mesma nos dois; só o valor muda, e só nessas linhas (o Excel traz, linha a linha, o valor lido e o valor no Power BI).
- `igualPowerBI: true` em `negociacoes` (`js/regras.js`) faz o painel usar a fórmula do relatório, para os números baterem com o Power BI. O padrão (`false`) lê o valor como está escrito.
- O relatório esconde a equipe cujo valor negociado é zero (filtro *Negociação Valor > 0* do visual); o painel a mostra, com o valor zerado, para a negociação sem valor não sumir da conta.

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
