package expo.modules.celsusmarket

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
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
      withContext(Dispatchers.IO) {
        Mobilebridge.checkHealthJSON()
      }
    }

    AsyncFunction("fetchQuotes") { tickersCsv: String, forceRefresh: Boolean ->
      withContext(Dispatchers.IO) {
        Mobilebridge.fetchQuotesJSON(tickersCsv, forceRefresh)
      }
    }

    AsyncFunction("getHistoricalPrice") { ticker: String, date: String ->
      withContext(Dispatchers.IO) {
        Mobilebridge.getHistoricalPriceJSON(ticker, date)
      }
    }

    AsyncFunction("searchCatalog") { query: String, assetClass: String ->
      withContext(Dispatchers.IO) {
        Mobilebridge.searchCatalogJSON(query, assetClass)
      }
    }

    AsyncFunction("fetchMacroRates") { fromDate: String ->
      withContext(Dispatchers.IO) {
        Mobilebridge.fetchMacroRatesJSON(fromDate)
      }
    }

    AsyncFunction("getCorporateEvents") { tickersCsv: String, fromDate: String ->
      withContext(Dispatchers.IO) {
        Mobilebridge.getCorporateEventsJSON(tickersCsv, fromDate)
      }
    }

    AsyncFunction("ingestCotahistZip") { zipPath: String, allowedTickersCsv: String ->
      withContext(Dispatchers.IO) {
        Mobilebridge.ingestCotahistZipJSON(zipPath, allowedTickersCsv)
      }
    }
  }
}
