package expo.modules.celsusmarket

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import mobilebridge.Mobilebridge

class CelsusMarketModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("CelsusMarket")

    OnCreate {
      val context = appContext.reactContext
      if (context != null) {
        val dbFile = File(context.filesDir, "celsus_market.db")
        try {
          Mobilebridge.initEngine(dbFile.absolutePath, true)
        } catch (e: Throwable) {
          android.util.Log.e("CelsusMarketModule", "Failed to init Go engine", e)
        }
      }
    }

    OnDestroy {
      try {
        Mobilebridge.closeEngine()
      } catch (e: Throwable) {
        android.util.Log.e("CelsusMarketModule", "Failed to close Go engine", e)
      }
    }

    AsyncFunction("checkHealth") {
      Mobilebridge.checkHealthJSON()
    }

    AsyncFunction("fetchQuotes") { tickersCsv: String, forceRefresh: Boolean ->
      Mobilebridge.fetchQuotesJSON(tickersCsv, forceRefresh)
    }

    AsyncFunction("fetchQuotesWithClass") { tickersCsv: String, assetClass: String, forceRefresh: Boolean ->
      Mobilebridge.fetchQuotesWithClassJSON(tickersCsv, assetClass, forceRefresh)
    }

    AsyncFunction("getHistoricalPrice") { ticker: String, date: String ->
      Mobilebridge.getHistoricalPriceJSON(ticker, date)
    }

    AsyncFunction("getHistoricalPriceWithClass") { ticker: String, date: String, assetClass: String ->
      Mobilebridge.getHistoricalPriceWithClassJSON(ticker, date, assetClass)
    }

    AsyncFunction("searchCatalog") { query: String, assetClass: String ->
      Mobilebridge.searchCatalogJSON(query, assetClass)
    }

    AsyncFunction("fetchMacroRates") { fromDate: String ->
      Mobilebridge.fetchMacroRatesJSON(fromDate)
    }

    AsyncFunction("getCorporateEvents") { tickersCsv: String, fromDate: String ->
      Mobilebridge.getCorporateEventsJSON(tickersCsv, fromDate)
    }

    AsyncFunction("ingestCotahistZip") { zipPath: String, allowedTickersCsv: String ->
      Mobilebridge.ingestCotahistZipJSON(zipPath, allowedTickersCsv)
    }

    AsyncFunction("getAssetProfile") { ticker: String ->
      Mobilebridge.getAssetProfileJSON(ticker)
    }

    AsyncFunction("getPriceHistory") { ticker: String, rangeParam: String ->
      Mobilebridge.getPriceHistoryJSON(ticker, rangeParam)
    }

    AsyncFunction("getPriceHistoryWithClass") { ticker: String, rangeParam: String, assetClass: String ->
      Mobilebridge.getPriceHistoryWithClassJSON(ticker, rangeParam, assetClass)
    }

    AsyncFunction("getDividends") { ticker: String ->
      Mobilebridge.getDividendsJSON(ticker)
    }

    AsyncFunction("getDividendsWithClass") { ticker: String, assetClass: String ->
      Mobilebridge.getDividendsWithClassJSON(ticker, assetClass)
    }

    AsyncFunction("getRanking") { assetClass: String, by: String, limit: Int ->
      Mobilebridge.getRankingJSON(assetClass, by, limit.toLong())
    }
  }
}
