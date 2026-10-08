#!/usr/bin/env python3
"""
Gera as planilhas SINTÉTICAS usadas nos testes e em exemplos/.
Nenhum dado real de cliente: nomes, endereços e matrículas são inventados.

Uso:  python3 tests/fixtures/gerar.py        (requer openpyxl)

Cenários cobertos (ver tests/cruzamento.test.js):
  A1  mat 100000001  visita 02/03  Finalizada  INCREMENTO       -> retorno 03/03 Incremento (+1 economia)
  A2  mat 100000002  visita 02/03  Finalizada  INCREMENTO (texto variante) -> retorno Sem Tratativa
  A3  mat 100000003  visita 02/03  Ocorrência (cliente ausente) VIDA NOVA  -> sem retorno, candidata a revisita
  A4  mat 100000004  visita 02/03  Finalizada  VERIFICAÇÃO SOCIAL (grafia quebrada) -> Alteração de categoria
  A5  mat 100000001  visita 10/03  Finalizada  INCREMENTO       -> retorno 11/03 Atualização (2ª visita da mesma matrícula)
  A6  mat 100000005  visita 05/03  Finalizada  RAIO-X           -> retorno só em 01/05 (fora da janela)
  A7  mat 100000006  protocolo 555123  Finalizada  -> retorno digitou o PROTOCOLO no lugar da matrícula (resgate)
  A8  mat 100000007  visita 05/03  Finalizada  -> retorno anterior à visita (04/03)
  A9  atividade de outro tipo (Corte) -> ignorada
  A10 mat 100000008  2 visitas no mesmo dia (ocorrência id 20 e finalizada id 11) -> retorno vai para a finalizada
  A11 sem projeto identificável
  A12 matrícula inválida
  A13 'LNA - VARREDURA - ...' sem a palavra PROJETO -> VARREDURA
  A14 mat 100000011  'LNA - VARREDURA' -> retorno Sem tratativa
  A15 mat 100000009  visita 06/03 Finalizada, 'PROJETO TITULARIDADE' -> retorno Troca de titularidade (frente Bairro Legal)
  A16/A17 mat 100000012  duas visitas executadas, ambas "Sem tratativa" -> alvo esgotado
"""
import datetime as dt
import os
import zipfile

from openpyxl import Workbook

AQUI = os.path.dirname(os.path.abspath(__file__))
EXEMPLOS = os.path.join(AQUI, "..", "..", "exemplos")

OBS_INCREMENTO = (
    "PROJETO INCREMENTO: VERIFICAR O TIPO E A QUANTIDADE DE ECONOMIAS EXISTENTES. "
    "CASO HAJA MAIS DE UMA, OFERECER DESMEMBRAMENTO/VENDA."
)
OBS_INCREMENTO_2 = "PROJETO INCREMENTO: FAVOR VERIFICAR TIPO E QUANTIDADE ECONOMIAS."
OBS_VIDA_NOVA = "PROJETO VIDA NOVA: FAVOR IDENTIFICAR O CLIENTE E NEGOCIAR OS DEBITOS VENCIDOS."
OBS_SOCIAL = "PROJETO VERIFICAE SOCIAL - VENDA: FAVOR VERIFICAR A QUANTIDADE DE ECONOMIAS."
OBS_RAIOX = "PROJETO RAIO - X: VERIFICAR CATEGORIA E QUANTIDADE DE ECONOMIA."
OBS_TITULAR = "PROJETO TITULARIDADE: FAVOR IDENTIFICAR O CLIENTE E FAZER TROCA DE TITULARIDADE."
OBS_LNA = "LNA - VARREDURA - FAVOR IDENTIFICAR O CLIENTE E FAZER VENDA DE LIGACAO NOVA."

CAB_ATIV = [
    "Recurso", "Cód. Protocolo Origem", "ID da Atividade", "Matrícula", "Código/Descrição", "Data",
    "Status da Atividade", "Endereço", "Cidade", "Bairro", "Área de Trabalho", "Tipo de Atividade",
    "Motivo de Não Execução - Normal", "Categoria", "Observação", "Quantidade De Economia",
]

D = dt.datetime


def linhas_atividades():
    f, oc = "Finalizada", "Encerrada com Ocorrência"
    vc = "Verificação Cadastral"
    cod = "202012-VISTORIA DE RECADASTRO"
    mk = lambda rec, prot, id_, mat, data, st, cidade, bairro, setor, tipo, motivo, cat, obs, qtd, end="RUA TESTE, 1": [
        rec, prot, id_, mat, cod, data, st, end, cidade, bairro, setor, tipo, motivo, cat, obs, qtd,
    ]
    return [
        mk("RIORECIN-001", "1000001/2026-1", 1, 100000001, D(2026, 3, 2), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "02. ECON"),
        mk("RIORECIN-001", "1000002/2026-1", 2, 100000002, D(2026, 3, 2), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO_2, "01. ECON"),
        mk("RIORECIN-002", "1000003/2026-1", 3, 100000003, D(2026, 3, 2), oc, "ITAOCARA", "GUARANI", "ITAOCARA - SETOR 004", vc, "CLIENTE AUSENTE", "RE-SOCIAL", OBS_VIDA_NOVA, "01. ECON"),
        mk("RIOVENIN-001", "1000004/2026-1", 4, 100000004, D(2026, 3, 2), f, "ITAOCARA", "GUARANI", "ITAOCARA - SETOR 004", vc, None, "RE-SOCIAL", OBS_SOCIAL, "03. ECON"),
        mk("RIORECIN-001", "1000005/2026-1", 5, 100000001, D(2026, 3, 10), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "02. ECON"),
        mk("RIORECIN-002", "1000006/2026-1", 6, 100000005, D(2026, 3, 5), f, "ITAOCARA", "CENTRO", "ITAOCARA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_RAIOX, "02. ECON"),
        mk("RIOVENIN-001", "555123/2026-1", 7, 100000006, D(2026, 3, 5), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", vc, None, "R-RESIDENCIAL", OBS_TITULAR, "01. ECON"),
        mk("RIOVENIN-001", "1000008/2026-1", 8, 100000007, D(2026, 3, 5), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
        mk("RIOCORTE-001", "1000009/2026-1", 9, 100000008, D(2026, 3, 5), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", "Corte e Religação Cavalete", None, "R-RESIDENCIAL", "Sem observação de abertura", None),
        mk("RIORECIN-002", "1000010/2026-1", 20, 100000008, D(2026, 3, 6), oc, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", vc, "RETORNAR DEPOIS", "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
        mk("RIORECIN-002", "1000011/2026-1", 11, 100000008, D(2026, 3, 6), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
        mk("RIORECIN-002", "1000012/2026-1", 12, 100000010, D(2026, 3, 6), f, "CORDEIRO", "CENTRO", "CORDEIRO - SETOR 001", vc, None, "R-RESIDENCIAL", "Sem observação de abertura", "01. ECON"),
        mk("RIORECIN-002", "1000013/2026-1", 13, 12345, D(2026, 3, 6), f, "CORDEIRO", "CENTRO", "CORDEIRO - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
        mk("RIORECIN-002", "1000014/2026-1", 14, 100000011, D(2026, 3, 6), f, "CORDEIRO", "CENTRO", "CORDEIRO - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_LNA, "01. ECON"),
        mk("RIOVENIN-001", "1000015/2026-1", 15, 100000009, D(2026, 3, 6), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 002", vc, None, "R-RESIDENCIAL", OBS_TITULAR, "01. ECON"),
        mk("RIORECIN-001", "1000016/2026-1", 16, 100000012, D(2026, 3, 2), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
        mk("RIORECIN-001", "1000017/2026-1", 17, 100000012, D(2026, 3, 12), f, "MIRACEMA", "CENTRO", "MIRACEMA - SETOR 001", vc, None, "R-RESIDENCIAL", OBS_INCREMENTO, "01. ECON"),
    ]


CAB_RES = [
    "Id", "Hora de início", "Hora de conclusão", "Email", "Nome", "Colaborador", "MATRICULA S/ DIGITO",
    "FRENTE DE SERVIÇO", "TIPO DE ORDEM DE SERVIÇO", "QUAL FOI A ALTERAÇÃO DE ECONOMIA?", "DE:", "PARA:",
    "ANTERIOR", "ATUAL", "QUANTIDADE", "TIPO DE ECONOMIA", "TRATATIVA CADASTRAL", "TIPO DE ALTERAÇÃO",
]


def linhas_resultados():
    def r(id_, ini, mat, tipo, econ=None, de=None, para=None, trat=None, alt=None, frente="Cadastro"):
        return [id_, ini, ini + dt.timedelta(minutes=2), "anônima", None, "Analista Teste", mat, frente, tipo,
                econ, de, para, None, None, None, None, trat, alt]

    return [
        r(1, D(2026, 3, 3, 9, 0, 0), 100000001, "Alteração de Economia", "Incremento", "1 Residência", "2 Residências"),
        r(2, D(2026, 3, 3, 9, 5, 0), 100000002, "Sem Tratativa"),
        r(3, D(2026, 3, 4, 10, 0, 0), 100000004, "Alteração de Categoria"),
        r(4, D(2026, 3, 11, 8, 0, 0), 100000001, "Alteração Cadastral Interna", alt="Telefone -"),
        r(5, D(2026, 5, 1, 8, 0, 0), 100000005, "Alteração de Categoria"),          # fora da janela (57 dias)
        r(6, D(2026, 3, 6, 8, 0, 0), 555123, "Alteração Cadastral Interna", alt="Troca de Titularidade -"),  # protocolo
        r(7, D(2026, 3, 4, 8, 0, 0), 100000007, "Alteração de Categoria"),          # anterior à visita (05/03)
        r(8, D(2026, 3, 6, 15, 0, 0), 100000008, "Alteração de Economia", "Incremento", "1 Residência", "3 Residências"),  # mesmo dia
        r(9, D(2026, 3, 9, 8, 0, 0), 999999999, "Alteração de Categoria"),          # matrícula fora das bases
        r(10, D(2026, 3, 9, 8, 5, 0), 7654321, "Alteração de Categoria"),           # inválida e não é protocolo
        r(11, D(2026, 3, 8, 8, 0, 0), 100000009, "Alteração Cadastral Interna", alt="Troca de Titularidade -", frente="Bairro Legal - VCG"),
        r(12, D(2026, 3, 7, 8, 0, 0), 100000010, "Alteração de Economia", "Decremento", "3 Residências", "2 Residências"),
        r(13, D(2026, 3, 7, 9, 0, 0), 100000011, "Verificação Cadastral", trat="ENCERRADO S. TRATATIVA"),
        r(14, D(2026, 3, 3, 9, 30, 0), 100000012, "Sem Tratativa"),
        r(15, D(2026, 3, 13, 9, 30, 0), 100000012, "Sem Tratativa"),
    ]


def planilha(caminho, aba, cab, linhas, topo=0):
    wb = Workbook()
    ws = wb.active
    ws.title = aba
    for i in range(topo):  # linhas de título acima do cabeçalho
        ws.append([f"Relatório de teste (linha {i + 1})"])
    ws.append(cab)
    for ln in linhas:
        ws.append(ln)
    for row in ws.iter_rows(min_row=topo + 2):
        for c in row:
            if isinstance(c.value, dt.datetime):
                c.number_format = "dd/mm/yyyy hh:mm:ss" if (c.value.hour or c.value.minute) else "dd/mm/yyyy"
    wb.save(caminho)


def xml_escape(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def col_letra(n):
    s = ""
    while n:
        n, r = divmod(n - 1, 26)
        s = chr(65 + r) + s
    return s


def export_estilo_sistema(caminho):
    """Imita o export completo do sistema de campo: partes na raiz do ZIP, sem
    sharedStrings, tudo como texto (t="str"), datas 'dd/mm/aa', cabeçalhos repetidos."""
    cab = [
        "Recurso", "Cód. Protocolo Origem", "ID da Atividade", "Matrícula", "Data", "Status da Atividade",
        "Tipo de Atividade", "Janela de Serviço", "Janela de Serviço", "Cidade", "Observação", "Parecer De Campo",
    ]
    linhas = [
        ["RIORECIN-004", "3000001/2026-1", "90000001", "100000101", "05/10/26", "Finalizada", "Verificação Cadastral", "", "", "MIRACEMA", OBS_INCREMENTO, "Imóvel & cia <ok>"],
        ["RIOVENIN-004", "3000002/2026-1", "90000002", "100000102", "05/10/26", "Encerrada com Ocorrência", "Verificação Cadastral", "", "", "CAMBUCI", OBS_VIDA_NOVA, ""],
        ["D11 - TESTE", "3000003/2026-1", "90000003", "100000103", "05/10/26", "Cancelada", "Corte e Religação Cavalete", "", "", "CAMBUCI", "Sem observação de abertura", ""],
    ]
    linhas_xml = []
    for i, ln in enumerate([cab] + linhas, start=1):
        cel = "".join(
            f'<c r="{col_letra(j)}{i}" t="str" s="{1 if i == 1 else 0}"><v>{xml_escape(v)}</v></c>'
            for j, v in enumerate(ln, start=1)
        )
        linhas_xml.append(f'<row r="{i}">{cel}</row>')
    sheet = (
        '<?xml version="1.0" encoding="UTF-8"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f"<sheetData>{''.join(linhas_xml)}</sheetData></worksheet>"
    )
    partes = {
        "[Content_Types].xml": '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Override PartName="/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
        "_rels/.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="workbook.xml"/></Relationships>',
        "_rels/workbook.xml.rels": '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
        "workbook.xml": '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Page 1" sheetId="1" r:id="rId1"/></sheets></workbook>',
        "styles.xml": '<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><cellXfs><xf fontId="0"/><xf fontId="1"/></cellXfs></styleSheet>',
        "sheet1.xml": sheet,
    }
    with zipfile.ZipFile(caminho, "w", zipfile.ZIP_DEFLATED) as z:
        for nome, conteudo in partes.items():
            z.writestr(nome, conteudo)


if __name__ == "__main__":
    os.makedirs(EXEMPLOS, exist_ok=True)
    planilha(os.path.join(AQUI, "atividades.xlsx"), "Cadastral", CAB_ATIV, linhas_atividades())
    planilha(os.path.join(AQUI, "resultados.xlsx"), "Planilha1", CAB_RES, linhas_resultados())
    # os mesmos dados sintéticos servem de exemplo para experimentar o painel
    planilha(os.path.join(EXEMPLOS, "exemplo-atividades.xlsx"), "Cadastral", CAB_ATIV, linhas_atividades())
    planilha(os.path.join(EXEMPLOS, "exemplo-resultados.xlsx"), "Planilha1", CAB_RES, linhas_resultados())
    planilha(os.path.join(AQUI, "atividades_cabecalho_na_linha_3.xlsx"), "Cadastral", CAB_ATIV, linhas_atividades()[:3], topo=2)
    export_estilo_sistema(os.path.join(AQUI, "atividades_export_sistema.xlsx"))
    print("fixtures geradas em", AQUI)
