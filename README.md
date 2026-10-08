# Acompanhamento Cadastro e Venda

Painel diário para medir a **efetividade das equipes de cadastro e venda** e **das bases de alvos** geradas para visita.

Ele cruza, pela **matrícula**, duas planilhas:

| Planilha | O que é | De onde vem |
|---|---|---|
| **Atividades** | Os alvos visitados (uma linha por visita): equipe, matrícula, data, status, projeto/base, cidade, motivo de não execução... | Exportação do sistema de campo (modelo completo, ~300 colunas) ou a versão "leve" (Cadastrais) |
| **Resultados** | O que o backoffice lançou depois da visita: incremento de economia, alteração de categoria, troca de titularidade, tarifa social, "sem tratativa"... | Planilha do formulário de resultados |

e responde, **separado por data**: *quantas visitas geraram resultado, por equipe e por base, onde vale a pena agir a seguir e como cada equipe usa o dia (deslocamento, serviço, ociosidade)*.

O painel olha só a operação do interior: **10 equipes** (`RIORECIN-004/007/013/024/034` e `RIOVENIN-001 a 005`) e **12 cidades** (Aperibé, Cachoeiras de Macacu, Cambuci, Cantagalo, Casimiro de Abreu, Cordeiro, Duas Barras, Itaocara, Miracema, Rio Bonito, São Francisco de Itabapoana e São Sebastião do Alto). Outras equipes e cidades (ex.: São Gonçalo) ficam de fora dos números.

## Como usar (3 passos)

1. Abra o painel (`index.html` com duplo clique, ou o link do GitHub Pages).
2. Clique em **Carregar pasta** e escolha a pasta onde ficam as planilhas — por exemplo **OneDrive › Cadastro e Venda**. O app procura nela (e nas subpastas) as planilhas de **Atividades** e de **Resultados**, reconhece cada uma sozinho, ignora o que não for uma das duas e cruza tudo pela matrícula.
3. Use os filtros (período, cidade, equipe, base) e as abas.

**Rotina diária:** o navegador (Chrome/Edge) *lembra a pasta*. No dia seguinte basta abrir o painel: ele já traz o que for novo; se pedir permissão, clique em **Atualizar**. Só são lidas as planilhas **novas ou alteradas** (o app compara nome, tamanho e data de modificação), então a atualização é rápida. Atividades e retornos já carregados são reconhecidos pelo ID e atualizados; nada duplica.

**Outras formas de carregar:** arrastar a pasta (ou as planilhas) para a tela; **Adicionar arquivos** para escolher planilhas soltas; **Trocar pasta** para apontar outra.

**OneDrive.** O painel lê a pasta que o OneDrive *sincroniza no seu computador* (algo como `C:\Users\você\OneDrive\Cadastro e Venda`); ele não acessa o OneDrive pela internet. Se as planilhas estiverem só na nuvem (ícone de nuvem), o Windows baixa cada uma ao ler — funciona, mas pode demorar; para agilizar, clique com o botão direito na pasta → *Sempre manter neste dispositivo*. Planilhas abertas no Excel geram um arquivo temporário `~$...xlsx`, que é ignorado.

**Navegadores.** Chrome e Edge: escolher uma vez e lembrar a pasta. Firefox e Safari: o botão *Carregar pasta* funciona, mas a pasta precisa ser escolhida de novo a cada visita (não permitem lembrar). Se o Chrome recusar uma pasta por ser "do sistema", escolha a subpasta *Cadastro e Venda*.

> **Privacidade.** Os arquivos são lidos no navegador; nada é enviado a servidor algum e **nenhum dado de cliente está neste repositório** (`*.xlsx` está no `.gitignore`, exceto os exemplos sintéticos).

## O que o painel mostra

Quatro abas, no estilo do painel de Pós-Corte (cards, tabelas limpas, claro/escuro). Os filtros do topo (data inicial/final, cidade, equipe, base) e os atalhos *Último dia · 7 dias · 30 dias · Mês · Tudo* valem para a aba aberta.

- **Visão geral** — o que importa para decidir, sem um monte de números:
  - **Efetividade** em destaque no topo (das visitas executadas, quantas geraram resultado) e, ao lado, *Percorrido* (= Exec + Exoc), *Exec*, *Exoc* e *Com resultados*;
  - **Tipo de resultado**: *Incremento de economia*, *Incremento de economia e alteração de categoria*, *Total de incremento*, *Total alteração de categoria*, *Troca de titularidade* (e *Outros resultados*, se houver: tarifa social, fatura digital, venda, negociação de débitos);
  - **Bases**: percorrido, com resultados e efetividade de cada base (projeto). A linha **SOLICITADA EM CAMPO** reúne as atividades que não são de nenhuma base (pedidos do atendimento, solicitações das próprias equipes); o filtro *Ocultar “SOLICITADA EM CAMPO”* as tira da análise;
  - **Resultado por equipe**: só as equipes que trouxeram resultado no período (resultado maior que zero). O **+** sob o nome abre os serviços que trouxeram resultado e a quantidade;
  - **Por data**: dia, semana ou mês. Datas recentes aparecem como *em maturação* (o backoffice ainda está lançando).
- **Tempos das equipes** — das equipes que trouxeram resultado no período: **deslocamento**, **serviço**, **pausas e apoio** (refeição, DDS, checklist...) e **ociosidade**, em horas:minutos, com a média por dia trabalhado (ou o total do período) e uma barra de como o dia foi usado, com o percentual escrito em cada trecho.
- **Novos alvos** — listas de ação exportáveis em Excel:
  - *Revisitar*: última visita parou em cliente ausente / retornar depois / imóvel fechado, ordenadas pela **chance estimada** (taxa histórica do projeto × nº de economias);
  - *Corrigir endereço*: "endereço não localizado" (ação do backoffice);
  - *Cobrar retorno*: visitas executadas sem nenhum lançamento do backoffice;
  - *Parar de insistir*: matrículas visitadas 2+ vezes sempre "sem tratativa";
  - *Onde atuar*: efetividade por cidade, bairro, setor, nº de economias, categoria... com a leitura "priorizar" / "rever".
- **Auditoria** — de onde vem cada número: o que ficou de fora do escopo, retornos atribuídos × não atribuídos (e por quê), projetos reconhecidos e os textos de “SOLICITADA EM CAMPO”, tipos de atividade usados nos tempos, arquivos carregados, ajuste da janela de cruzamento e das frentes de serviço, e o **cruzamento completo em Excel** (visita por visita) para conferir.

**Exportação em Excel (.xlsx).** O botão **Exportar Excel** do topo (e os botões das listas) gera a planilha da aba aberta, **no formato analítico, uma linha por atividade, com as mesmas colunas da planilha de Atividades** (Recurso, Data, ID da Atividade, Matrícula, Status, Cidade, Bairro, Início, Fim, Duração, Tempo de Deslocamento...) mais o que o painel descobriu: projeto (base), situação da visita, percorrido, retorno do backoffice, *com resultado*, tipo de resultado, desfechos, Δ economias e dias até o retorno. Quem soma e filtra é o Excel (cada coluna já vem com filtro). Uma aba **Filtros** registra o recorte usado.

- *Visão geral* e *Auditoria*: as visitas do período e dos filtros.
- *Tempos das equipes*: aba *Dia da equipe* (início, fim, deslocamento, serviço, pausas e apoio e ociosidade de cada equipe em cada dia) e aba *Atividades* (as atividades com horário e como entram na conta).
- *Novos alvos*: a última atividade de cada alvo da lista aberta, com tentativas, chance estimada, dias sem retorno etc.; *Onde atuar* leva as atividades dos grupos listados com a taxa, o índice e a leitura do grupo.

O **Exportar PDF** usa a impressão do navegador.

> **Tempos: use a exportação completa.** Refeição, DDS, carregamento de material e as demais atividades de apoio só vêm na exportação completa do sistema (não na planilha "Cadastrais"). Num dia só com visitas o almoço viraria ociosidade; por isso a aba mostra por padrão só os **dias completos** (os que têm essas atividades) e deixa a opção *Todos os dias*.

## Como a efetividade é medida (resumo)

- **Executada** = status *Finalizada*. **Ocorrência** = *Encerrada com Ocorrência* (a equipe foi, mas não executou).
- Um retorno do backoffice pertence à **visita mais recente da mesma matrícula até 30 dias antes** dele.
- **Resultado** = visita executada cujo retorno trouxe mudança de valor (incremento/alteração de economia, categoria, titularidade, venda/ligação nova, tarifa social, fatura digital, negociação de débitos). **Atualização cadastral** (telefone, endereço, classificação...) conta como tratativa, mas não como resultado.
- **Percorrido** = Exec + Exoc (a equipe foi ao local). **Efetividade (% de resultado) = com resultados ÷ executadas.**
- O nome da **base/projeto** vem do início do texto de abertura (`PROJETO INCREMENTO: ...` na coluna *Observação*); grafias diferentes do mesmo projeto são unificadas.

Detalhes, colunas usadas e todas as regras: [`docs/REGRAS.md`](docs/REGRAS.md). Análise e decisões de projeto: [`docs/PLANO.md`](docs/PLANO.md).

## Ajustando as regras

Tudo o que é critério de negócio está em **`js/regras.js`**: equipes e cidades do escopo, janela de cruzamento, nomes/sinônimos de projeto, motivos de não execução recuperáveis, o que conta como resultado e o que é pausa/apoio nos tempos. Apareceu um projeto novo? A aba *Auditoria* mostra os textos que não foram reconhecidos; basta acrescentar uma linha em `projetos`.

## Publicar para a equipe (opcional)

O app é um site estático, sem build. No GitHub: *Settings → Pages → Deploy from a branch → `main` / root*. (Em repositório privado, o Pages exige plano pago; sem ele, compartilhe a pasta e abra o `index.html`.)

## Desenvolvimento

```bash
npm test                         # 88 testes (Node 18+; sem dependências)
python3 tests/fixtures/gerar.py  # regenera as planilhas sintéticas (requer openpyxl)
```

Estrutura:

```
index.html            tela (abre direto do disco)
css/app.css           estilos (claro/escuro automático)
js/
  normalize.js        texto, matrícula, datas, horários
  regras.js           ← regras de negócio editáveis (escopo, tempos, projetos...)
  zip.js xlsx.js      leitor de .xlsx próprio, sem bibliotecas, em fluxo
  projetos.js         nome do projeto + unificação de variações
  resultados.js       classificação do desfecho de cada retorno
  escopo.js           equipes e cidades da operação
  tempos.js           deslocamento, serviço, apoio e ociosidade por equipe/dia
  dados.js            colunas, limpeza e derivação
  cruzamento.js       atribuição retorno → visita (matrícula + janela)
  metricas.js         agregações e listas de novos alvos
  pasta.js            varredura de pasta (handle, arrastar, input) e o que já foi lido
  store.js            armazenamento local (dados e pasta lembrada)
  xlsx-escrita.js     gerador de .xlsx próprio (sem bibliotecas)
  exporta.js          colunas da exportação analítica (formato Atividades)
  ui-util.js ui-tabela.js ui-visao.js app.js   interface (ui-visao: cards, equipes, tempos)
tests/                testes automatizados + planilhas sintéticas
exemplos/             planilhas sintéticas para experimentar
```

Requisitos do navegador: versões atuais de Chrome, Edge, Firefox ou Safari (usa `DecompressionStream`).
