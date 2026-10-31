package cotahist

import (
	"archive/zip"
	"bytes"
	"strings"
	"testing"
)

// helper to build fixed 245-byte COTAHIST lines
func buildCotahistLine(tipreg, datpre, codbdi, codneg, tpmerc, nomres, preabe, premax, premin, preult, voltot string) string {
	line := make([]byte, 245)
	for i := range line {
		line[i] = ' '
	}
	copy(line[0:2], tipreg)
	copy(line[2:10], datpre)
	copy(line[10:12], codbdi)
	copy(line[12:24], codneg)
	copy(line[24:27], tpmerc)
	copy(line[27:39], nomres)
	copy(line[56:69], preabe)
	copy(line[69:82], premax)
	copy(line[82:95], premin)
	copy(line[108:121], preult)
	copy(line[170:188], voltot)
	return string(line)
}

// S1-T01: Extração exata de DATPRE, CODBDI="02", CODNEG, TPMERC="010" e PREULT dividido por 100
func TestParseValidStockLine_245Bytes(t *testing.T) {
	parser := NewParser()

	rawLine := buildCotahistLine(
		"01",
		"20240102",
		"02",
		"PETR4       ",
		"010",
		"PETROBRAS   ",
		"0000000003750", // 37.50
		"0000000003900", // 39.00
		"0000000003700", // 37.00
		"0000000003850", // 38.50
		"000000000050000000", // 500000.00
	)

	if len(rawLine) != 245 {
		t.Fatalf("esperado tamanho de linha de 245 bytes, obtido %d", len(rawLine))
	}

	quote, shouldInclude, err := parser.ParseLine(rawLine)
	if err != nil {
		t.Fatalf("erro inesperado ao fazer parse de acao valida: %v", err)
	}
	if !shouldInclude {
		t.Fatalf("esperava que a cotação fosse incluída")
	}
	if quote == nil {
		t.Fatalf("quote retornado não pode ser nil")
	}

	if quote.Date != "2024-01-02" {
		t.Errorf("Date esperada 2024-01-02, obtido %s", quote.Date)
	}
	if quote.Ticker != "PETR4" {
		t.Errorf("Ticker esperado PETR4, obtido %s", quote.Ticker)
	}
	if quote.AssetClass != "STOCK" {
		t.Errorf("AssetClass esperada STOCK, obtido %s", quote.AssetClass)
	}
	if quote.Name != "PETROBRAS" {
		t.Errorf("Name esperado PETROBRAS, obtido %s", quote.Name)
	}
	if quote.Open != 37.50 {
		t.Errorf("Open esperado 37.50, obtido %.2f", quote.Open)
	}
	if quote.High != 39.00 {
		t.Errorf("High esperado 39.00, obtido %.2f", quote.High)
	}
	if quote.Low != 37.00 {
		t.Errorf("Low esperado 37.00, obtido %.2f", quote.Low)
	}
	if quote.Close != 38.50 {
		t.Errorf("Close esperado 38.50, obtido %.2f", quote.Close)
	}
	if quote.Volume != 500000.00 {
		t.Errorf("Volume esperado 500000.00, obtido %.2f", quote.Volume)
	}
}

// S1-T02: Classificação correta de FII quando CODBDI == "12" e TPMERC == "010"
func TestParseValidFIILine_CODBDI12(t *testing.T) {
	parser := NewParser()

	rawLine := buildCotahistLine(
		"01",
		"20240102",
		"12", // FII
		"HGLG11      ",
		"010",
		"CSHG LOGIST ",
		"0000000016000", // 160.00
		"0000000016300", // 163.00
		"0000000015950", // 159.50
		"0000000016250", // 162.50
		"000000000015000000", // 150000.00
	)

	quote, shouldInclude, err := parser.ParseLine(rawLine)
	if err != nil {
		t.Fatalf("erro inesperado ao fazer parse de FII: %v", err)
	}
	if !shouldInclude {
		t.Fatalf("esperava que FII CODBDI 12 fosse incluído")
	}
	if quote == nil {
		t.Fatalf("quote retornado não pode ser nil")
	}

	if quote.AssetClass != "FII" {
		t.Errorf("AssetClass esperada FII, obtido %s", quote.AssetClass)
	}
	if quote.Ticker != "HGLG11" {
		t.Errorf("Ticker esperado HGLG11, obtido %s", quote.Ticker)
	}
	if quote.Close != 162.50 {
		t.Errorf("Close esperado 162.50, obtido %.2f", quote.Close)
	}
	if quote.Name != "CSHG LOGIST" {
		t.Errorf("Name esperado CSHG LOGIST, obtido %s", quote.Name)
	}
}

// S1-T03: Ignorar TIPREG="00", "99" e mercados de opções (TPMERC="070", "080")
func TestIgnoreHeaderTrailerAndOptions(t *testing.T) {
	parser := NewParser()

	// Header TIPREG=00
	headerLine := strings.Repeat(" ", 245)
	headerLine = "00COTAHIST.2024" + headerLine[15:]
	q, shouldInclude, err := parser.ParseLine(headerLine)
	if err != nil {
		t.Fatalf("erro ao analisar header: %v", err)
	}
	if shouldInclude || q != nil {
		t.Errorf("Header TIPREG=00 deve ser ignorado (shouldInclude=false)")
	}

	// Trailer TIPREG=99
	trailerLine := strings.Repeat(" ", 245)
	trailerLine = "99COTAHIST.2024" + trailerLine[15:]
	q, shouldInclude, err = parser.ParseLine(trailerLine)
	if err != nil {
		t.Fatalf("erro ao analisar trailer: %v", err)
	}
	if shouldInclude || q != nil {
		t.Errorf("Trailer TIPREG=99 deve ser ignorado (shouldInclude=false)")
	}

	// Opções de Compra (TPMERC=070)
	optionCallLine := buildCotahistLine(
		"01",
		"20240102",
		"78", // BDI Opções
		"PETRA380    ",
		"070", // Call
		"PETR ON     ",
		"0000000000100",
		"0000000000150",
		"0000000000090",
		"0000000000120",
		"000000000000500000",
	)
	q, shouldInclude, err = parser.ParseLine(optionCallLine)
	if err != nil {
		t.Fatalf("erro ao analisar opcao call: %v", err)
	}
	if shouldInclude || q != nil {
		t.Errorf("Opção TPMERC=070 deve ser ignorada")
	}

	// Opções de Venda (TPMERC=080)
	optionPutLine := buildCotahistLine(
		"01",
		"20240102",
		"78",
		"PETRM380    ",
		"080", // Put
		"PETR ON     ",
		"0000000000050",
		"0000000000060",
		"0000000000040",
		"0000000000055",
		"000000000000300000",
	)
	q, shouldInclude, err = parser.ParseLine(optionPutLine)
	if err != nil {
		t.Fatalf("erro ao analisar opcao put: %v", err)
	}
	if shouldInclude || q != nil {
		t.Errorf("Opção TPMERC=080 deve ser ignorada")
	}
}

// S1-T04: Leitura de arquivo .ZIP contendo COTAHIST_AXXXX.TXT sem estourar memória
func TestParseZipArchiveStreaming(t *testing.T) {
	parser := NewParser()

	// Gera um buffer zip em memória contendo COTAHIST_A2024.TXT
	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	fileWriter, err := zipWriter.Create("COTAHIST_A2024.TXT")
	if err != nil {
		t.Fatalf("falha ao criar arquivo no zip: %v", err)
	}

	header := "00COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"
	stock := buildCotahistLine("01", "20240102", "02", "VALE3       ", "010", "VALE        ", "0000000006800", "0000000006950", "0000000006750", "0000000006900", "000000000080000000") + "\r\n"
	fii := buildCotahistLine("01", "20240102", "12", "KNRI11      ", "010", "KINEA RENDA ", "0000000015500", "0000000015700", "0000000015450", "0000000015600", "000000000012000000") + "\r\n"
	option := buildCotahistLine("01", "20240102", "78", "VALEA700    ", "070", "VALE        ", "0000000000050", "0000000000050", "0000000000050", "0000000000050", "000000000000100000") + "\r\n"
	trailer := "99COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"

	_, _ = fileWriter.Write([]byte(header + stock + fii + option + trailer))
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("falha ao fechar zip: %v", err)
	}

	reader := bytes.NewReader(buf.Bytes())
	var parsedQuotes []Quote

	err = parser.ParseZip(reader, int64(buf.Len()), func(q Quote) error {
		parsedQuotes = append(parsedQuotes, q)
		return nil
	})

	if err != nil {
		t.Fatalf("erro ao executar ParseZip streaming: %v", err)
	}

	if len(parsedQuotes) != 2 {
		t.Fatalf("esperava 2 cotações extraídas do ZIP (VALE3 e KNRI11), obtido %d", len(parsedQuotes))
	}

	if parsedQuotes[0].Ticker != "VALE3" || parsedQuotes[0].AssetClass != "STOCK" || parsedQuotes[0].Close != 69.00 {
		t.Errorf("dados da primeira cotação incorretos: %+v", parsedQuotes[0])
	}
	if parsedQuotes[1].Ticker != "KNRI11" || parsedQuotes[1].AssetClass != "FII" || parsedQuotes[1].Close != 156.00 {
		t.Errorf("dados da segunda cotação incorretos: %+v", parsedQuotes[1])
	}
}
