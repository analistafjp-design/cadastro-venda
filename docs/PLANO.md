# Plano de desenvolvimento

## Objetivo

Acompanhamento **diário** da efetividade do time de cadastro e venda e das bases de alvos geradas, cruzando as visitas com os resultados lançados pelo backoffice **pela matrícula**, separado por **data**, e apontando onde agir a seguir. Simples, moderno e funcional: poucos números, só os que ajudam a decidir.

## O que a análise dos arquivos mostrou

| Arquivo | Achados que moldaram o desenho |
|---|---|
| Cadastrais - Interior (versão leve) | 40 colunas, só *Verificação Cadastral*; status só *Finalizada* e *Encerrada com Ocorrência*; 11 equipes (`RIORECIN-*` cadastro, `RIOVENIN-*` venda); matrícula repetida em ~11% das visitas (revisitas). **Não tem a coluna "Parecer de campo"**: o nome do projeto está no início de *Observação* (`PROJETO INCREMENTO: ...`) |
| Atividades - modelo completo | 294 colunas, **formato de ZIP fora do padrão** (partes na raiz, sem `sharedStrings`, tudo como texto, datas `dd/mm/aa`, cabeçalhos repetidos). Mistura todos os serviços (corte, repavimentação...), com outros status (*Cancelada*, *Pendente*...). Ali "Parecer De Campo" é texto livre do técnico |
| Resultados - 2026 | Formulário do backoffice: ~25,6 mil linhas, 2 frentes (*Cadastro* e *Bairro Legal*), desfechos espalhados em 4 colunas com grafias variadas, `Id` com 25 linhas 100% duplicadas, matrículas com 5 a 11 dígitos (algumas são protocolos), retorno chega em 1 a 3 dias da visita |

Cruzamento: o retorno é lançado **depois** da visita (mediana de 1 dia), então cada retorno é ligado à visita mais recente da matrícula dentro de uma janela de 30 dias (decisão sobre multi-visitas e retornos fora das bases em [`REGRAS.md`](REGRAS.md)).

## Decisões

1. **Aplicação web estática, sem servidor, sem build.** Abre com duplo clique, roda no navegador e os dados nunca saem do computador (as planilhas têm nomes, CPF e endereços). Uma planilha por dia é acrescentada ao que já está guardado (IndexedDB), deduplicando por ID.
2. **Leitor de .xlsx próprio, sem dependências.** As CDNs não estavam acessíveis e o pacote público `xlsx` no npm está desatualizado e com vulnerabilidades conhecidas. O leitor lê em fluxo, localiza as partes pelos `.rels` (necessário para o export do sistema) e pega só as colunas pedidas, **pelo nome**.
3. **Regras de negócio em um único arquivo** (`js/regras.js`) e documentadas — janela, projetos, motivos revisitáveis, o que é "resultado".
4. **Cards enxutos no estilo do painel de Pós-Corte, sem números repetidos:** a *Visão geral* traz Percorrido / Exec / Exoc / Com resultados, os tipos de resultado, o resultado por base e por equipe (com um **+** que abre os serviços que trouxeram resultado) e o resultado por data. As matrizes de calor e as colunas de desfecho foram retiradas por confundirem mais do que ajudarem na decisão.
5. **Escopo fixo da operação:** 10 equipes e 12 cidades (`regras.js`); o que é de fora (outras equipes, São Gonçalo...) não entra nos números, mas continua ajudando a ligar os retornos.
6. **Tempos das equipes em uma aba própria:** deslocamento, serviço, pausas/apoio e ociosidade por equipe, conferidos contra uma conta independente em Python. Só dias com a exportação completa (que traz refeição, DDS etc.) entram por padrão, para o almoço não virar ociosidade.
7. **Exportação analítica em .xlsx:** o Excel recebe uma linha por atividade, com as colunas da planilha de Atividades e o cruzamento ao lado, para quem analisa filtrar e somar como preferir. O .xlsx é gerado no navegador por um escritor próprio (`js/xlsx-escrita.js`), conferido com openpyxl e LibreOffice.
8. **Duas páginas, um só código:** o painel do VCG (`vcg.html`) é o mesmo painel com outras equipes e outro arquivo de Resultados, escolhidos por `data-pagina` e `js/paginas.js`. Cada página tem o seu banco no navegador, e o arquivo com “VCG” no nome é lido só pela página VCG, para não misturar os retornos do VCG nos números do Interior. Evitou-se copiar o `app.js`: um ajuste nos painéis vale para os dois.
9. **"Novos alvos" = listas acionáveis e exportáveis**, não gráficos: revisitar, corrigir endereço, cobrar retorno, parar de insistir, onde atuar.

## Como se garantiu a ausência de erros

- **Leitor conferido célula a célula** contra openpyxl/pandas nos três arquivos reais (≈ 220 mil células, 0 divergências).
- **Cruzamento e agregações reimplementados de forma independente em Python** (busca binária, outra lógica) e comparados visita a visita nos dados reais: 9.536 visitas, 0 divergências; 244 grupos de agregação (projeto, equipe, dia), 0 divergências; mesmos contadores de auditoria.
- **104 testes automatizados** (`npm test`) com planilhas sintéticas, cada cenário de cruzamento com resultado calculado à mão: dois retornos da mesma matrícula, mesmo dia (ocorrência × executada), retorno antes da visita, fora da janela, protocolo no lugar da matrícula, matrícula inválida, frente de serviço, maturação, nome de projeto com encoding quebrado etc.
- **A conta fecha na tela**: todo retorno cai em exatamente um balde na Auditoria; resultado + atualização + sem tratativa = com retorno; com retorno + sem retorno = executadas.
- **Teste no navegador** (Chromium headless, `file://`): carga, recarga com persistência, recarga do mesmo arquivo sem duplicar, arquivo inválido, limpar dados, modo escuro, celular.

## Evoluções possíveis

- Cadastrar no `regras.js` o objetivo de cada projeto (ex.: *Fatura digital* → desfecho "fatura") e medir a efetividade contra o objetivo da base, não só contra "qualquer resultado".
- Trazer o universo de matrículas ainda não visitadas (extração do sistema) para a lista de novos alvos apontar matrículas, não só perfis.
- Comparar semana contra semana e meta por projeto.
