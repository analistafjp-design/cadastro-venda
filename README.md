# Acompanhamento Cadastro e Venda

Painel diário para medir a **efetividade das equipes de cadastro e venda** e **das bases de alvos** geradas para visita.

Ele cruza, pela **matrícula**, duas planilhas:

| Planilha | O que é | De onde vem |
|---|---|---|
| **Atividades** | Os alvos visitados (uma linha por visita): equipe, matrícula, data, status, projeto/base, cidade, motivo de não execução... | Exportação do sistema de campo (modelo completo, ~300 colunas) ou a versão "leve" (Cadastrais) |
| **Resultados** | O que o backoffice lançou depois da visita: incremento de economia, alteração de categoria, troca de titularidade, tarifa social, "sem tratativa"... | Planilha do formulário de resultados |

e responde, **separado por data**: *quantas visitas geraram resultado, por equipe e por base, e onde vale a pena agir a seguir*.

## Como usar (3 passos)

1. Abra o `index.html` (duplo clique funciona; ou publique no GitHub Pages — veja abaixo).
2. Arraste as duas planilhas `.xlsx` para a tela. O app reconhece qual é qual, em qualquer ordem.
3. Use o filtro de período e as abas.

**Rotina diária:** abra o painel e arraste o arquivo novo de Atividades e a planilha de Resultados atualizada. O app **acumula**: atividades e retornos já carregados são reconhecidos pelo ID e atualizados, nada duplica. Os dados ficam guardados no próprio navegador deste computador.

> **Privacidade.** Os arquivos são lidos no navegador; nada é enviado a servidor algum e **nenhum dado de cliente está neste repositório** (`*.xlsx` está no `.gitignore`, exceto os exemplos sintéticos).

## O que o painel mostra

- **Diário** — evolução por dia/semana/mês (gráfico + tabela com o mesmo número): atividades, executadas, ocorrências, com retorno, **resultado** e **% de resultado**, aberto por tipo de desfecho (incremento, categoria, titularidade, venda...). Dias recentes aparecem como *em maturação* (o backoffice ainda está lançando).
- **Bases e equipes** — a mesma medida por projeto e por equipe (recurso), com *índice* contra a média, e a matriz **equipe × base** (para separar o efeito da equipe do efeito da base que ela recebeu).
- **Novos alvos** — listas de ação exportáveis em CSV:
  - *Revisitar*: última visita parou em cliente ausente / retornar depois / imóvel fechado, ordenadas pela **chance estimada** (taxa histórica do projeto × nº de economias);
  - *Corrigir endereço*: "endereço não localizado" (ação do backoffice);
  - *Cobrar retorno*: visitas executadas sem nenhum lançamento do backoffice;
  - *Parar de insistir*: matrículas visitadas 2+ vezes sempre "sem tratativa";
  - *Onde atuar*: taxa de resultado por cidade, bairro, setor, nº de economias, categoria... com a leitura "priorizar" / "rever".
- **Auditoria** — de onde vem cada número: retornos atribuídos × não atribuídos (e por quê), projetos reconhecidos, arquivos carregados, ajuste da janela de cruzamento e das frentes de serviço, e o **CSV do cruzamento completo** (visita por visita) para conferir no Excel.

## Como a efetividade é medida (resumo)

- **Executada** = status *Finalizada*. **Ocorrência** = *Encerrada com Ocorrência* (a equipe foi, mas não executou).
- Um retorno do backoffice pertence à **visita mais recente da mesma matrícula até 30 dias antes** dele.
- **Resultado** = visita executada cujo retorno trouxe mudança de valor (incremento/alteração de economia, categoria, titularidade, venda/ligação nova, tarifa social, fatura digital, negociação de débitos). **Atualização cadastral** (telefone, endereço, classificação...) conta como tratativa, mas não como resultado.
- **% de resultado = resultado ÷ executadas.**
- O nome da **base/projeto** vem do início do texto de abertura (`PROJETO INCREMENTO: ...` na coluna *Observação*); grafias diferentes do mesmo projeto são unificadas.

Detalhes, colunas usadas e todas as regras: [`docs/REGRAS.md`](docs/REGRAS.md). Análise e decisões de projeto: [`docs/PLANO.md`](docs/PLANO.md).

## Ajustando as regras

Tudo o que é critério de negócio está em **`js/regras.js`**: janela de cruzamento, nomes/sinônimos de projeto, motivos de não execução recuperáveis, o que conta como resultado. Apareceu um projeto novo? A aba *Auditoria* mostra os textos que não foram reconhecidos; basta acrescentar uma linha em `projetos`.

## Publicar para a equipe (opcional)

O app é um site estático, sem build. No GitHub: *Settings → Pages → Deploy from a branch → `main` / root*. (Em repositório privado, o Pages exige plano pago; sem ele, compartilhe a pasta e abra o `index.html`.)

## Desenvolvimento

```bash
npm test                         # 59 testes (Node 18+; sem dependências)
python3 tests/fixtures/gerar.py  # regenera as planilhas sintéticas (requer openpyxl)
```

Estrutura:

```
index.html            tela (abre direto do disco)
css/app.css           estilos (claro/escuro automático)
js/
  normalize.js        texto, matrícula, datas
  regras.js           ← regras de negócio editáveis
  zip.js xlsx.js      leitor de .xlsx próprio, sem bibliotecas, em fluxo
  projetos.js         nome do projeto + unificação de variações
  resultados.js       classificação do desfecho de cada retorno
  dados.js            colunas, limpeza e derivação
  cruzamento.js       atribuição retorno → visita (matrícula + janela)
  metricas.js         agregações e listas de novos alvos
  store.js csv.js     armazenamento local e exportação CSV
  ui-*.js app.js      interface
tests/                testes automatizados + planilhas sintéticas
exemplos/             planilhas sintéticas para experimentar
```

Requisitos do navegador: versões atuais de Chrome, Edge, Firefox ou Safari (usa `DecompressionStream`).
