export const RECEIPT_FIXTURES = {
  // 1. Supermercado com VALOR TOTAL e PIX
  supermercadoPaoDeAcucar: [
    'COMPANHIA BRASILEIRA DE DISTRIBUICAO',
    'PAO DE ACUCAR - LOJA 042',
    'CNPJ: 47.508.411/0001-56  IE: 111.222.333.444',
    'AV. PAULISTA, 1230 - BELA VISTA - SAO PAULO/SP',
    'DANFE NFC-e - DOCUMENTO AUXILIAR',
    '001  7891000100103  LEITE INTEGRAL 1L       5,89',
    '002  7894900011517  CAFE TORRADO 500G      18,90',
    '003  7891910000197  ACUCAR REFINADO 1KG     4,66',
    'QTD. TOTAL DE ITENS                          3',
    'VALOR TOTAL R$                          187,45',
    'FORMA PAGAMENTO                     VALOR PAGO',
    'PIX                                     187,45',
    'Tributos Totais Incidentes (Lei 12.741): R$ 28,12',
    '14/11/2026 18:42:10',
  ],

  // 2. Farmácia com desconto, troco zerado, tributos e VALOR A PAGAR
  farmaciaDrogasil: [
    'RAIA DROGASIL S.A.',
    'DROGASIL FILIAL 118',
    'CNPJ 61.585.865/0001-51',
    'CUPOM FISCAL ELETRONICO SAT',
    '001 DIPIRONA 1G C/10          19,90',
    '002 PROTETOR SOLAR FPS50      57,00',
    'SUBTOTAL R$                   76,90',
    'DESCONTO R$                   12,00',
    'VALOR A PAGAR R$              64,90',
    'CARTAO CREDITO                64,90',
    'TROCO R$                       0,00',
    'Val Aprox Tributos R$ 11,42 (17,60%)',
    'Data: 15/11/2026  Hora: 09:15:33',
  ],

  // 3. Posto de combustível com TOTAL R$ e débito
  postoCombustivel: [
    'AUTO POSTO ESTRELA LTDA',
    'CNPJ: 10.456.789/0001-43',
    'ROD ANHANGUERA KM 25',
    'GASOLINA COMUM  41,667 L x 6,000   250,00',
    'TOTAL R$ 250,00',
    'CARTAO DEBITO                      250,00',
    '10/11/2026 14:22',
  ],

  // 4. Restaurante com ponto decimal, dinheiro e troco
  restaurantePontoDecimal: [
    'CANTINA BELLA NAPOLI LTDA',
    'CNPJ 17.261.661/0001-73',
    'PRATO EXECUTIVO               129.80',
    'TAXA SERVICO                   13.00',
    'VALOR TOTAL                   142.80',
    'DINHEIRO                      200.00',
    'TROCO                          57.20',
    '12/11/2026 20:05:44',
  ],

  // 5. Cupom amassado com linhas quebradas
  cupomAmassadoQuebrado: [
    'DIA BRASIL',
    'SOCIEDADE LTDA',
    'CNPJ 03.476.811/',
    '0001-51',
    'ITEM 01 ARROZ 5KG         29,90',
    'ITEM 02 FEIJAO 1KG         8,40',
    'VALOR',
    'TOTAL',
    'R$ 89,30',
    'PGTO: CARTAO',
    'DEBITO',
    '08/11/2026',
    '17:31',
  ],

  // 6. Padaria / Café com Vale Alimentação e TOTAL A PAGAR
  padariaValeAlimentacao: [
    'PADARIA E CONFEITARIA PAO QUENTE',
    'CNPJ: 22.334.455/0001-86',
    'PAO FRANCES               12,50',
    'CAFE EXPRESSO             16,00',
    'TOTAL A PAGAR R$          28,50',
    'VALE ALIMENTACAO          28,50',
    '16/11/2026 07:45:00',
  ],

  // 7. Atacarejo com separador de milhar (1.245,90), desconto e tributos
  atacarejoMilhar: [
    'SENDAS DISTRIBUIDORA S/A',
    'ASSAI ATACADISTA',
    'CNPJ: 06.057.223/0001-71',
    'SUBTOTAL R$             1.291,00',
    'DESCONTO R$                45,10',
    'VALOR TOTAL R$          1.245,90',
    'PIX                     1.245,90',
    'TRIBUTOS R$               210,00',
    '05/11/2026 11:20:19',
  ],

  // 8. Varejo com formato americano (1,299.00)
  varejoFormatoPonto: [
    'MAGAZINE VAREJO TECH',
    'CNPJ: 33.041.260/0001-64',
    'MONITOR 27 POL          1,299.00',
    'TOTAL R$ 1,299.00',
    'CREDITO                 1,299.00',
    '2026-11-03 16:10:00',
  ],

  // 9. Mercado de bairro sem CNPJ e sem hora
  mercadoSemCnpj: [
    'MERCEARIA DO SEU JOAO',
    'RUA DAS FLORES, 88',
    'COMPRAS DIVERSAS          42,00',
    'TOTAL R$ 42,00',
    'DINHEIRO                  42,00',
    '11/11/2026',
  ],

  // 10. Cupom com CNPJ inválido (dígito verificador errado)
  cupomCnpjInvalido: [
    'LOJA TESTE DV INVALIDO',
    'CNPJ: 47.508.411/0001-99',
    'TOTAL R$ 35,00',
    '14/11/2026 10:00',
  ],

  // 11. Cupom ilegível / sem total (nunca deve retornar zero!)
  cupomIlegivelSemTotal: [
    '*** CUPOM BORRADO ***',
    '--- --- ---',
    'OBRIGADO PELA PREFERENCIA',
  ],

  // 12. Cupom de estacionamento com ano de 2 dígitos e VALOR PAGO + TROCO
  estacionamentoAnoCurto: [
    'ESTAPAR ESTACIONAMENTOS',
    'CNPJ: 10.456.789/0001-43',
    'PERMANENCIA 2H',
    'VALOR TOTAL R$ 18,00',
    'VALOR PAGO: R$ 20,00',
    'TROCO: R$ 2,00',
    'DINHEIRO',
    '15/11/26 13:05',
  ],

  // 13. Cupom com cabeçalho DANFE antes do nome do estabelecimento
  petshopComCabecalho: [
    'DANFE NFC-e',
    'DOCUMENTO AUXILIAR DA NOTA FISCAL',
    'PETZ COMERCIO DE PRODUTOS LTDA',
    'CNPJ 18.362.951/0001-76',
    'RACAO 15KG               159,90',
    'VALOR A PAGAR',
    '159,90',
    'CARTAO DE CREDITO',
    '09/11/2026 15:40:12',
  ],

  // 14. Papelaria com SUBTOTAL, DESCONTO, TRIB APROX e VALOR TOTAL
  papelariaTributos: [
    'PAPELARIA CENTRAL LTDA',
    'CNPJ: 44.556.677/0001-86',
    'SUBTOTAL R$               55,00',
    'DESCONTO R$                5,00',
    'VALOR TOTAL R$            50,00',
    'TRIB APROX R$              8,15',
    'PIX                       50,00',
    '01/11/2026 10:30:00',
  ],
};

export const NFCE_QR_FIXTURES = {
  validSpOnline:
    'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35261147508411000156650010001234561876543218|2|1|1|A1B2C3D4E5F6',
  validRjOfflineWithTotal:
    'https://www4.fazenda.rj.gov.br/consultaNFCe/QRCode?p=33261061585865000151650020006543219123456782|2|1|10|154.90|61626364|1|99887766',
  validMgV1WithTotal:
    'https://nfce.fazenda.mg.gov.br/portalnfce/sistema/qrcode.xhtml?chNFe=31261110456789000143650010000007771112233440&nVersao=100&tpAmb=1&vNF=250.00&cIdToken=000001',
  invalidDv:
    'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35261147508411000156650010001234561876543219|2|1|1|HASH',
  wrongModel55:
    'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=35261147508411000156550010001234561876543215|2|1|1|HASH',
  shortKey:
    'https://www.nfce.fazenda.sp.gov.br/NFCeConsultaPublica/Paginas/ConsultaQRCode.aspx?p=352611475084110001566500100012345618765432|2|1|1|HASH',
  randomUrl: 'https://example.com/produto/12345',
};
