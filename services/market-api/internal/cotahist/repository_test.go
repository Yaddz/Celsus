package cotahist

import (
	"archive/zip"
	"bytes"
	"context"
	"database/sql"
	"strings"
	"testing"

	_ "modernc.org/sqlite"
)

// S1-T05: Reimportar o mesmo arquivo COTAHIST não duplica linhas (INSERT OR REPLACE)
func TestIdempotentBatchUpsert(t *testing.T) {
	ctx := context.Background()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite em memória: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteRepository(db)
	if err := repo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema: %v", err)
	}

	batch1 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      38.50,
			Volume:     500000.00,
		},
		{
			Date:       "2024-01-02",
			Ticker:     "HGLG11",
			AssetClass: "FII",
			Name:       "CSHG LOGISTICA",
			Open:       160.00,
			High:       163.00,
			Low:        159.50,
			Close:      162.50,
			Volume:     150000.00,
		},
	}

	// 1ª Inserção em batch
	if err := repo.UpsertQuotes(ctx, batch1); err != nil {
		t.Fatalf("falha no primeiro lote de upsert: %v", err)
	}

	quotes, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil {
		t.Fatalf("falha ao buscar cotações PETR4: %v", err)
	}
	if len(quotes) != 1 {
		t.Fatalf("esperava 1 cotação para PETR4, obtido %d", len(quotes))
	}
	if quotes[0].Close != 38.50 {
		t.Errorf("preço esperado 38.50, obtido %.2f", quotes[0].Close)
	}

	// 2ª Inserção idêntica com preço corrigido (reimportação do arquivo)
	batch2 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      39.10, // Preço retificado
			Volume:     550000.00,
		},
		{
			Date:       "2024-01-02",
			Ticker:     "HGLG11",
			AssetClass: "FII",
			Name:       "CSHG LOGISTICA",
			Open:       160.00,
			High:       163.00,
			Low:        159.50,
			Close:      162.50,
			Volume:     150000.00,
		},
	}

	if err := repo.UpsertQuotes(ctx, batch2); err != nil {
		t.Fatalf("falha no segundo lote de upsert idempotente: %v", err)
	}

	// Verifica se a reimportação não duplicou o registro
	quotesAfter, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil {
		t.Fatalf("falha ao buscar cotações após reimportação: %v", err)
	}
	if len(quotesAfter) != 1 {
		t.Fatalf("reimportação duplicou linhas! Esperado 1 registro, obtido %d", len(quotesAfter))
	}
	if quotesAfter[0].Close != 39.10 {
		t.Errorf("preço não foi atualizado na reimportação: esperado 39.10, obtido %.2f", quotesAfter[0].Close)
	}

	// Verifica GetLastDate
	lastDate, err := repo.GetLastDate(ctx)
	if err != nil {
		t.Fatalf("falha ao buscar última data: %v", err)
	}
	if lastDate != "2024-01-02" {
		t.Errorf("última data esperada 2024-01-02, obtido %s", lastDate)
	}

	// Verifica catálogo
	catalog, err := repo.SearchCatalog(ctx, "PETR", "STOCK")
	if err != nil {
		t.Fatalf("falha ao buscar catálogo: %v", err)
	}
	if len(catalog) != 1 || catalog[0].Ticker != "PETR4" {
		t.Errorf("busca no catálogo falhou: %+v", catalog)
	}
}

// S21-T01: Precedência de cotações: COTAHIST nunca é sobrescrito por YAHOO em (ticker, trade_date).
func TestUpsertQuotes_PrecedenceCotahistOverYahoo(t *testing.T) {
	ctx := context.Background()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite em memória: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteRepository(db)
	if err := repo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema: %v", err)
	}

	// 1. Inserção com source="COTAHIST"
	cotahistQuote := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.50,
			High:       39.00,
			Low:        37.00,
			Close:      38.50,
			AdjClose:   38.50,
			Volume:     500000.00,
			Source:     "COTAHIST",
		},
	}
	if err := repo.UpsertQuotes(ctx, cotahistQuote); err != nil {
		t.Fatalf("falha ao inserir cotação COTAHIST: %v", err)
	}

	quotes, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil || len(quotes) != 1 {
		t.Fatalf("esperava 1 cotação para PETR4, obtido %d (err: %v)", len(quotes), err)
	}
	if quotes[0].Close != 38.50 || quotes[0].Source != "COTAHIST" {
		t.Errorf("esperado Close=38.50 e Source=COTAHIST, obtido Close=%.2f e Source=%s", quotes[0].Close, quotes[0].Source)
	}

	// 2. Tentativa de sobrescrever com source="YAHOO" (preço nominal diferente e adj_close calculado)
	yahooQuote := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "PETR4",
			AssetClass: "STOCK",
			Name:       "PETROBRAS PN",
			Open:       37.40,
			High:       38.90,
			Low:        36.90,
			Close:      38.42, // Preço nominal divergente do Yahoo
			AdjClose:   34.10, // Preço ajustado por dividendos/splits
			Volume:     490000.00,
			Source:     "YAHOO",
		},
	}
	if err := repo.UpsertQuotes(ctx, yahooQuote); err != nil {
		t.Fatalf("falha ao tentar upsert de cotação YAHOO: %v", err)
	}

	quotesAfterYahoo, err := repo.GetQuotes(ctx, "PETR4", "2024-01-01", "2024-01-03")
	if err != nil || len(quotesAfterYahoo) != 1 {
		t.Fatalf("esperava 1 cotação para PETR4 após upsert YAHOO, obtido %d", len(quotesAfterYahoo))
	}
	// Regra de Ouro: Close nominal e Source DEVEM permanecer do COTAHIST
	if quotesAfterYahoo[0].Close != 38.50 {
		t.Errorf("violação de precedência! Preço nominal COTAHIST sobrescrito por YAHOO: esperado 38.50, obtido %.2f", quotesAfterYahoo[0].Close)
	}
	if quotesAfterYahoo[0].Source != "COTAHIST" {
		t.Errorf("violação de precedência! Source sobrescrito por YAHOO: esperado COTAHIST, obtido %s", quotesAfterYahoo[0].Source)
	}
	// AdjClose deve ser atualizado pelo dado do Yahoo
	if quotesAfterYahoo[0].AdjClose != 34.10 {
		t.Errorf("adj_close deveria ser preenchido/atualizado pelo Yahoo: esperado 34.10, obtido %.2f", quotesAfterYahoo[0].AdjClose)
	}

	// 3. Atualização entre registros YAHOO e promoção para COTAHIST
	valeYahoo1 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "VALE3",
			AssetClass: "STOCK",
			Name:       "VALE ON",
			Open:       67.00,
			High:       68.50,
			Low:        66.80,
			Close:      68.00,
			AdjClose:   62.00,
			Volume:     300000.00,
			Source:     "YAHOO",
		},
	}
	if err := repo.UpsertQuotes(ctx, valeYahoo1); err != nil {
		t.Fatalf("falha ao inserir VALE3 inicial: %v", err)
	}

	valeYahoo2 := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "VALE3",
			AssetClass: "STOCK",
			Name:       "VALE ON",
			Open:       67.50,
			High:       69.00,
			Low:        67.00,
			Close:      68.50,
			AdjClose:   62.50,
			Volume:     350000.00,
			Source:     "YAHOO",
		},
	}
	if err := repo.UpsertQuotes(ctx, valeYahoo2); err != nil {
		t.Fatalf("falha ao atualizar VALE3 via YAHOO: %v", err)
	}

	valeQuotes, err := repo.GetQuotes(ctx, "VALE3", "2024-01-01", "2024-01-03")
	if err != nil || len(valeQuotes) != 1 {
		t.Fatalf("esperava 1 cotação para VALE3, obtido %d", len(valeQuotes))
	}
	if valeQuotes[0].Close != 68.50 || valeQuotes[0].Source != "YAHOO" {
		t.Errorf("registro YAHOO deveria ser atualizado por outro YAHOO: obtido Close=%.2f, Source=%s", valeQuotes[0].Close, valeQuotes[0].Source)
	}

	// Promoção para COTAHIST
	valeCotahist := []Quote{
		{
			Date:       "2024-01-02",
			Ticker:     "VALE3",
			AssetClass: "STOCK",
			Name:       "VALE ON",
			Open:       68.00,
			High:       69.20,
			Low:        67.50,
			Close:      68.80,
			AdjClose:   68.80,
			Volume:     400000.00,
			Source:     "COTAHIST",
		},
	}
	if err := repo.UpsertQuotes(ctx, valeCotahist); err != nil {
		t.Fatalf("falha ao promover VALE3 para COTAHIST: %v", err)
	}

	valeQuotesPromoted, err := repo.GetQuotes(ctx, "VALE3", "2024-01-01", "2024-01-03")
	if err != nil || len(valeQuotesPromoted) != 1 {
		t.Fatalf("esperava 1 cotação para VALE3 promovido, obtido %d", len(valeQuotesPromoted))
	}
	if valeQuotesPromoted[0].Close != 68.80 || valeQuotesPromoted[0].Source != "COTAHIST" {
		t.Errorf("registro deveria ser promovido para COTAHIST: obtido Close=%.2f, Source=%s", valeQuotesPromoted[0].Close, valeQuotesPromoted[0].Source)
	}
}

// S21-T02: Leitura filtrada de COTAHIST.ZIP apenas para os tickers da carteira
func TestParseZIPFiltered_OnlyAllowedTickers(t *testing.T) {
	parser := NewParser()

	buf := new(bytes.Buffer)
	zipWriter := zip.NewWriter(buf)

	fileWriter, err := zipWriter.Create("COTAHIST_A2024.TXT")
	if err != nil {
		t.Fatalf("falha ao criar arquivo no zip: %v", err)
	}

	header := "00COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"
	petr4 := buildCotahistLine("01", "20240102", "02", "PETR4       ", "010", "PETROBRAS   ", "0000000003750", "0000000003900", "0000000003700", "0000000003850", "000000000050000000") + "\r\n"
	vale3 := buildCotahistLine("01", "20240102", "02", "VALE3       ", "010", "VALE        ", "0000000006800", "0000000006950", "0000000006750", "0000000006900", "000000000080000000") + "\r\n"
	itub4 := buildCotahistLine("01", "20240102", "02", "ITUB4       ", "010", "ITAU UNIBANC", "0000000003200", "0000000003310", "0000000003180", "0000000003290", "000000000030000000") + "\r\n"
	trailer := "99COTAHIST.2024" + strings.Repeat(" ", 230) + "\r\n"

	_, _ = fileWriter.Write([]byte(header + petr4 + vale3 + itub4 + trailer))
	if err := zipWriter.Close(); err != nil {
		t.Fatalf("falha ao fechar zip: %v", err)
	}

	// 1. Filtrando apenas por PETR4
	reader := bytes.NewReader(buf.Bytes())
	var filteredQuotes []Quote

	err = parser.ParseZIPFiltered(reader, int64(buf.Len()), []string{"PETR4"}, func(q Quote) error {
		filteredQuotes = append(filteredQuotes, q)
		return nil
	})
	if err != nil {
		t.Fatalf("erro ao executar ParseZIPFiltered: %v", err)
	}

	if len(filteredQuotes) != 1 {
		t.Fatalf("esperava apenas 1 cotação para PETR4, obtido %d", len(filteredQuotes))
	}
	if filteredQuotes[0].Ticker != "PETR4" {
		t.Errorf("ticker inesperado extraído: %s", filteredQuotes[0].Ticker)
	}

	// 2. Sem filtro (allowedTickers vazio -> emite todas)
	var allQuotes []Quote
	readerAll := bytes.NewReader(buf.Bytes())
	err = parser.ParseZIPFiltered(readerAll, int64(buf.Len()), []string{}, func(q Quote) error {
		allQuotes = append(allQuotes, q)
		return nil
	})
	if err != nil {
		t.Fatalf("erro ao executar ParseZIPFiltered sem filtro: %v", err)
	}
	if len(allQuotes) != 3 {
		t.Fatalf("esperava 3 cotações sem filtro, obtido %d", len(allQuotes))
	}
}

// S21-T03: Persistência e consulta de eventos corporativos (splits, dividendos)
func TestCorporateEvents_SaveAndQuery(t *testing.T) {
	ctx := context.Background()

	db, err := sql.Open("sqlite", ":memory:")
	if err != nil {
		t.Fatalf("falha ao abrir banco sqlite em memória: %v", err)
	}
	defer db.Close()

	repo := NewSQLiteRepository(db)
	if err := repo.InitSchema(ctx); err != nil {
		t.Fatalf("falha ao inicializar schema: %v", err)
	}

	events := []CorporateEvent{
		{
			Ticker:      "PETR4",
			Type:        "SPLIT",
			Date:        "2024-05-10",
			Numerator:   2,
			Denominator: 1,
			Ratio:       "2:1",
			CashAmount:  0,
		},
		{
			Ticker:      "PETR4",
			Type:        "DIVIDEND",
			Date:        "2024-06-15",
			Numerator:   0,
			Denominator: 0,
			Ratio:       "",
			CashAmount:  1.50,
		},
		{
			Ticker:      "VALE3",
			Type:        "DIVIDEND",
			Date:        "2024-06-20",
			Numerator:   0,
			Denominator: 0,
			Ratio:       "",
			CashAmount:  2.30,
		},
	}

	if err := repo.SaveCorporateEvents(ctx, events); err != nil {
		t.Fatalf("falha ao salvar eventos corporativos: %v", err)
	}

	// Consulta para PETR4 no período 2024
	petrEvents, err := repo.GetCorporateEvents(ctx, "PETR4", "2024-01-01", "2024-12-31")
	if err != nil {
		t.Fatalf("falha ao buscar eventos corporativos de PETR4: %v", err)
	}
	if len(petrEvents) != 2 {
		t.Fatalf("esperava 2 eventos para PETR4, obtido %d", len(petrEvents))
	}
	if petrEvents[0].Type != "SPLIT" || petrEvents[0].Ratio != "2:1" {
		t.Errorf("evento 0 incorreto: %+v", petrEvents[0])
	}
	if petrEvents[1].Type != "DIVIDEND" || petrEvents[1].CashAmount != 1.50 {
		t.Errorf("evento 1 incorreto: %+v", petrEvents[1])
	}

	// Consulta fora do período deve retornar vazio
	outOfRangeEvents, err := repo.GetCorporateEvents(ctx, "PETR4", "2025-01-01", "2025-12-31")
	if err != nil {
		t.Fatalf("falha na consulta fora do período: %v", err)
	}
	if len(outOfRangeEvents) != 0 {
		t.Errorf("esperava 0 eventos fora do intervalo, obtido %d", len(outOfRangeEvents))
	}
}

