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
| Tipo de Atividade | Só *Verificação Cadastral* entra (as demais, como corte, são ignoradas e contadas) | não |
| Observação | **Nome do projeto/base** (`PROJETO XXXX: ...`) | não* |
| Parecer De Campo | Alternativa de leitura do projeto quando a *Observação* não traz um | não |
| Cód. Protocolo Origem | Resgatar retornos lançados com o protocolo no lugar da matrícula | não |
| Cidade, Bairro, Área de Trabalho, Endereço | Território e listas de ação | não |
| Motivo de Não Execução - Normal | Define o que é revisitável | não |
| Categoria, Quantidade De Economia, Situação Do Imóvel | Perfil do alvo | não |

\* Sem a *Observação* tudo cai em "SEM PROJETO" e a análise por base perde o sentido.

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

## 2. Nome do projeto/base

1. Pega o texto de abertura e extrai o rótulo: o que vem depois de `PROJETO` até os dois-pontos (`PROJETO INCREMENTO: VERIFICAR ...` → `INCREMENTO`).
2. Compara a chave do rótulo (maiúsculas, sem acento, sem caracteres quebrados `¿`) com a lista `projetos` de `regras.js`. A primeira regra que casar define o nome final.
3. Sem regra: se o rótulo for muito parecido (≥ 88%) com um nome já conhecido, é unido a ele; senão vira um projeto novo (aparece na Auditoria).
4. Textos sem a palavra `PROJETO` só são aceitos se baterem numa regra com rótulo curto (ex.: `LNA - VARREDURA - ...`). O resto vira `SEM PROJETO`.

Unificações já feitas (variações do mesmo projeto → um só):

| Nome final | Variações reunidas |
|---|---|
| INCREMENTO | `INCREMENTO` com qualquer das instruções de texto |
| VARREDURA | `VARREDURA`, `VARREDURA - INCREMENTO`, `VAR`, `LNA - VARREDURA` |
| VENDA LNA | `VENDA LNA`, `VENDA` |
| VERIFICAÇÃO SOCIAL - VENDA | `VERIFICAE SOCIAL - VENDA` (grafia quebrada) |
| VERIFICAÇÃO - PÚBLICO | `VERIFICAE - PUBLICO` |
| DESMEMBRAMENTO | `DESMEMBRAMENTO`, `SEPARACAO DE ECONOMIAS` |
| EDIFÍCIOS | `EDIFICIOS-METROPOLITANA`, `INCREMENTO EDIFICIOS` |
| NEGOCIAÇÃO | `NEGOCIAE-PRIORIDADE 2`, `-PRIORIDADE 3` |
| RAIO-X | `RAIO - X`, `raio - x` |
| FATURA DIGITAL - RECADASTRO | `FATURA DIGITAL - RECADASTRO` |
| SAÚDE PÚBLICA, CARTÃO VERMELHO SOCIAL, FERIADÃO, ATUALIZAÇÃO CONDOMÍNIOS, VENDA LOCALIZAÇÃO | grafias com `¿` ou cortadas |

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
| Executadas | Status *Finalizada* |
| % Exec. | Executadas ÷ Atividades |
| Com retorno | Executadas com ao menos um retorno atribuído |
| Resultado | Executadas cujo retorno é do grupo *resultado* |
| **% Resultado** | **Resultado ÷ Executadas** |
| Atualização | Executadas cujo melhor retorno é só atualização cadastral |
| Sem tratativa | Executadas cujos retornos foram todos "sem tratativa" |
| Sem retorno | Executadas sem retorno atribuído |
| Δ economias | Soma líquida de economias acrescidas |
| Índice | % Resultado da linha ÷ % Resultado geral (só com 10+ executadas) |

- As colunas de desfecho (Incremento, Categoria...) contam visitas que **incluem** aquele desfecho; uma visita pode ter mais de um, então não somam o total.
- **Em maturação:** visitas dos últimos 3 dias (contados a partir do último retorno carregado). O backoffice leva em média 1 a 3 dias para lançar, então a taxa dessas datas ainda vai subir.

## 7. Listas de novos alvos

| Lista | Regra |
|---|---|
| Revisitar | Última visita da matrícula é ocorrência com motivo *cliente ausente*, *retornar depois* ou *imóvel fechado sem acesso ao HD*. Quem já teve visita executada depois sai. 3+ tentativas → "escalar". |
| Corrigir endereço | Última visita em *endereço não localizado* / *ramal ou rede não localizado*. |
| Cobrar retorno | Visita executada há mais de 5 dias (até o último retorno carregado) sem nenhum retorno. |
| Parar de insistir | 2+ visitas executadas, todas com retorno "sem tratativa". |
| Onde atuar | Taxa de resultado por território/perfil (mínimo de 20 executadas); índice ≥ 1,3 → *priorizar*; ≤ 0,5 → *rever*. |

**Chance estimada** (lista *Revisitar*): taxa histórica de resultado do segmento mais específico com 20+ visitas — projeto × nº de economias, depois nº de economias, depois projeto, depois média geral. É uma média histórica transparente, não um modelo estatístico: serve para ordenar, não para prometer.

As listas usam **todo o histórico carregado** (ignoram o filtro de período, senão uma visita antiga já "resolvida" voltaria à lista), mas respeitam os filtros de projeto, equipe e cidade.

## 8. Limitações conhecidas

- O universo de matrículas **não visitadas** não está nos arquivos; por isso "Onde atuar" indica *perfis e territórios* onde gerar novas bases, não matrículas específicas ainda não visitadas.
- Retorno só é ligado à visita se a **matrícula** do lançamento estiver correta (ou for o protocolo). Lançamentos com matrícula errada aparecem como "sem retorno" para a visita.
- A planilha de Resultados não traz a data da visita: usa-se a data em que o backoffice iniciou o lançamento e a janela de 30 dias.
