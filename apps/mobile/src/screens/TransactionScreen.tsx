import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  Modal,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import Decimal from 'decimal.js';
import { colors, typography, spacing, borders } from '../theme/tokens';
import { transactionService } from '../services/transactionService';
import { marketApiService, STATIC_CATALOG_ASSETS } from '../services/marketApi';
import { assetRepository } from '../repositories/assetRepository';
import { portfolioRepository } from '../repositories/portfolioRepository';
import { Asset, Portfolio } from '../db/schema';
import { DirectiveButton } from '../components/ui/DirectiveButton';
import { LedgerInput } from '../components/ui/LedgerInput';

export interface TransactionScreenProps {
  onClose?: () => void;
  onTransactionSuccess?: () => void;
  initialPortfolioId?: string;
  initialAssetId?: string;
  initialTradeDate?: string;
  themeMode?: 'dark' | 'light';
  testID?: string;
  isNativeBridgeAvailable?: boolean;
}

export const TransactionScreen: React.FC<TransactionScreenProps> = ({
  onClose,
  onTransactionSuccess = () => {},
  initialPortfolioId,
  initialAssetId,
  initialTradeDate,
  themeMode = 'dark',
  testID = 'transaction-screen',
  isNativeBridgeAvailable,
}) => {
  const isLight = themeMode === 'light';

  const bridgeAvailable =
    isNativeBridgeAvailable !== undefined
      ? isNativeBridgeAvailable
      : marketApiService.isNativeBridgeAvailable
      ? marketApiService.isNativeBridgeAvailable()
      : true;

  const getTodayLocal = () => new Date().toLocaleDateString('sv-SE');

  const [portfolios, setPortfolios] = useState<Portfolio[]>(() => {
    return portfolioRepository.getPortfoliosSync ? portfolioRepository.getPortfoliosSync() : [];
  });
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>(() => {
    if (initialPortfolioId) return initialPortfolioId;
    const syncPorts = portfolioRepository.getPortfoliosSync ? portfolioRepository.getPortfoliosSync() : [];
    return syncPorts.length > 0 ? syncPorts[0].id : '';
  });
  const [assets, setAssets] = useState<Asset[]>(() => {
    const portId =
      initialPortfolioId ||
      (portfolioRepository.getPortfoliosSync ? portfolioRepository.getPortfoliosSync()[0]?.id : '');
    if (portId) {
      return assetRepository.getAssetsByPortfolioSync(portId);
    }
    return [];
  });
  const [selectedAssetId, setSelectedAssetId] = useState<string>(() => {
    if (initialAssetId) return initialAssetId;
    const portId =
      initialPortfolioId ||
      (portfolioRepository.getPortfoliosSync ? portfolioRepository.getPortfoliosSync()[0]?.id : '');
    if (portId) {
      const syncAssets = assetRepository.getAssetsByPortfolioSync(portId);
      return syncAssets.length > 0 ? syncAssets[0].id : '';
    }
    return '';
  });

  const toDisplayDate = (iso: string): string => {
    if (!iso) return '';
    const clean = iso.trim();
    if (clean.includes('-')) {
      const parts = clean.split('-');
      if (parts.length === 3) {
        return `${parts[2].padStart(2, '0')}/${parts[1].padStart(2, '0')}/${parts[0]}`;
      }
    }
    return clean;
  };

  const toIsoDate = (display: string): string => {
    if (!display) return '';
    const clean = display.trim();
    if (clean.includes('-')) return clean;
    const digits = clean.replace(/\D/g, '');
    if (digits.length === 8) {
      const d = digits.slice(0, 2);
      const m = digits.slice(2, 4);
      const y = digits.slice(4, 8);
      return `${y}-${m}-${d}`;
    }
    return clean;
  };

  const [tickerQuery, setTickerQuery] = useState('');
  const [tickerSuggestions, setTickerSuggestions] = useState<any[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [isDatePickerVisible, setIsDatePickerVisible] = useState(false);
  const [calendarViewDate, setCalendarViewDate] = useState(() => new Date());
  const [isSaveBlocked, setIsSaveBlocked] = useState(false);

  const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
  const [tradeDate, setTradeDate] = useState<string>(
    initialTradeDate || getTodayLocal() // YYYY-MM-DD em horário local
  );
  const [displayDate, setDisplayDate] = useState<string>(() =>
    toDisplayDate(initialTradeDate || getTodayLocal())
  );
  const [quantity, setQuantity] = useState<string>('');
  const [unitPrice, setUnitPrice] = useState<string>('');
  const [fees, setFees] = useState<string>('0.00');
  const [notes, setNotes] = useState<string>('');

  const [isLoadingAutoFill, setIsLoadingAutoFill] = useState(false);
  const [autoFillMessage, setAutoFillMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setQuantity('');
    setUnitPrice('');
    setFees('0.00');
    setNotes('');
    setTickerQuery('');
    setTickerSuggestions([]);
    setSelectedCategory('ALL');
    setIsSaveBlocked(false);
    setAutoFillMessage(null);
    const today = getTodayLocal();
    setTradeDate(today);
    setDisplayDate(toDisplayDate(today));
  };

  const lastQuoteReqRef = useRef(0);

  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      try {
        const list = await portfolioRepository.getAllPortfolios();
        if (!isMounted) return;
        setPortfolios(list);
        const portIdToUse = selectedPortfolioId || (list.length > 0 ? list[0].id : '');
        if (portIdToUse) {
          if (!selectedPortfolioId) setSelectedPortfolioId(portIdToUse);
          const pAssets = await assetRepository.getAssetsByPortfolio(portIdToUse);
          if (!isMounted) return;
          setAssets(pAssets);
          if (initialAssetId && pAssets.some((a) => a.id === initialAssetId)) {
            setSelectedAssetId(initialAssetId);
          } else if (pAssets.length > 0 && !selectedAssetId) {
            setSelectedAssetId(pAssets[0].id);
          }
        }
      } catch {
        if (isMounted) {
          setPortfolios([]);
          setAssets([]);
        }
      }
    };
    init();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!selectedPortfolioId) return;
    let isMounted = true;
    assetRepository
      .getAssetsByPortfolio(selectedPortfolioId)
      .then((pAssets) => {
        if (!isMounted) return;
        setAssets(pAssets);
        if (selectedAssetId && pAssets.some((a) => a.id === selectedAssetId)) {
          // Mantém
        } else if (initialAssetId && pAssets.some((a) => a.id === initialAssetId)) {
          setSelectedAssetId(initialAssetId);
        } else if (pAssets.length > 0) {
          setSelectedAssetId(pAssets[0].id);
        } else {
          setSelectedAssetId('');
        }
      })
      .catch(() => {
        if (isMounted) setAssets([]);
      });
    return () => {
      isMounted = false;
    };
  }, [selectedPortfolioId]);

  // Busca automática da cotação
  const fetchQuoteForAsset = async (asset: Asset | undefined, date: string) => {
    if (!asset || !date) return;
    const reqId = ++lastQuoteReqRef.current;
    setIsLoadingAutoFill(true);
    setAutoFillMessage(null);

    const todayLocal = getTodayLocal();
    const todayUtc = new Date().toISOString().slice(0, 10);
    const isToday = date === todayLocal || date === todayUtc;

    try {
      let price: string | null = null;
      if (isToday) {
        // Cotação em tempo real para o pregão de hoje
        const quotes = await marketApiService.fetchQuotes([asset.ticker]);
        if (quotes && quotes.length > 0) {
          const q = quotes[0];
          price = String(q.currentPrice || (q as any).price || (q as any).close_price || '');
        }
      } else {
        // Cotação histórica para datas anteriores
        price = await marketApiService.getHistoricalPrice(asset.ticker, date);
      }

      // Se outra requisição mais nova foi iniciada, descarta resposta defasada
      if (reqId !== lastQuoteReqRef.current) return;

      if (price && parseFloat(price) > 0) {
        setUnitPrice(price);
        setAutoFillMessage(`Cotação sugerida (${price}) preenchida.`);
      } else {
        setAutoFillMessage('Cotação não encontrada para esta data (digite manualmente).');
      }
    } catch {
      if (reqId === lastQuoteReqRef.current) {
        setAutoFillMessage('Sem conexão com o motor de cotações (digite manualmente).');
      }
    } finally {
      if (reqId === lastQuoteReqRef.current) {
        setIsLoadingAutoFill(false);
      }
    }
  };

  const handleCategorySelect = (catKey: string) => {
    setSelectedCategory(catKey);
    if (catKey === 'ALL') {
      if (tickerQuery.trim().length > 0) {
        handleTickerSearch(tickerQuery, 'ALL');
      } else {
        setTickerSuggestions([]);
      }
    } else {
      if (tickerQuery.trim().length > 0) {
        handleTickerSearch(tickerQuery, catKey);
      } else {
        const categoryAssets = STATIC_CATALOG_ASSETS.filter((a) => a.asset_class === catKey);
        setTickerSuggestions(categoryAssets);
      }
    }
  };

  const handleTickerSearch = async (text: string, overrideCategory?: string) => {
    setTickerQuery(text);
    const cat = overrideCategory !== undefined ? overrideCategory : selectedCategory;
    if (!text || text.trim().length === 0) {
      if (cat !== 'ALL') {
        setTickerSuggestions(STATIC_CATALOG_ASSETS.filter((a) => a.asset_class === cat));
      } else {
        setTickerSuggestions([]);
      }
      return;
    }
    try {
      const results = await marketApiService.searchCatalog(text.trim());
      const filtered = cat === 'ALL'
        ? (results || [])
        : (results || []).filter((r) => r.asset_class === cat);
      setTickerSuggestions(filtered);
    } catch {
      setTickerSuggestions([]);
    }
  };

  const handleDateChangeText = (text: string) => {
    if (text.includes('-') && text.length === 10) {
      setTradeDate(text);
      setDisplayDate(toDisplayDate(text));
      return;
    }

    const digits = text.replace(/\D/g, '').slice(0, 8);
    let formatted = digits;
    if (digits.length > 2 && digits.length <= 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    } else if (digits.length > 4) {
      formatted = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    }
    setDisplayDate(formatted);

    if (digits.length === 8) {
      const day = digits.slice(0, 2);
      const month = digits.slice(2, 4);
      const year = digits.slice(4, 8);
      const iso = `${year}-${month}-${day}`;
      setTradeDate(iso);
    }
  };

  const handleSelectSuggestion = (item: { ticker: string; name?: string; asset_class?: string }) => {
    const upperTicker = item.ticker.trim().toUpperCase();
    const existing = assets.find((a) => a.ticker.toUpperCase() === upperTicker);

    if (existing) {
      setSelectedAssetId(existing.id);
      setIsSaveBlocked(false);
      setTickerSuggestions([]);
      setTickerQuery(upperTicker);
      return;
    }

    if (!selectedPortfolioId) {
      Alert.alert(
        'Nenhuma carteira selecionada',
        'Cadastre ou selecione uma carteira na aba Carteiras antes de adicionar ativos ou movimentações.'
      );
      setTickerSuggestions([]);
      return;
    }

    // Ativo fora da carteira: confirmação interativa com o usuário
    Alert.alert(
      'Adicionar ativo à carteira?',
      `O ativo ${upperTicker} não foi encontrado na carteira selecionada. Deseja adicionar à carteira para continuar?`,
      [
        {
          text: 'Não',
          style: 'cancel',
          onPress: () => {
            // Decisão Q3: Rejeição bloqueia o salvamento
            setSelectedAssetId('');
            setIsSaveBlocked(true);
            setTickerSuggestions([]);
          },
        },
        {
          text: 'Sim',
          onPress: async () => {
            try {
              const newAsset = await assetRepository.createAsset({
                portfolio_id: selectedPortfolioId,
                name: item.name || upperTicker,
                ticker: upperTicker,
                asset_class: (item.asset_class as any) || 'STOCK',
                quantity: '0',
                average_price: '0.00',
              });
              setAssets((prev) => [...prev, newAsset]);
              setSelectedAssetId(newAsset.id);
              setIsSaveBlocked(false);
              setTickerSuggestions([]);
              setTickerQuery(upperTicker);
            } catch (err: any) {
              Alert.alert('Erro', err.message || 'Falha ao vincular ativo à carteira.');
            }
          },
        },
      ]
    );
  };

  useEffect(() => {
    const curAsset = assets.find((a) => a.id === selectedAssetId);
    if (curAsset && tradeDate) {
      fetchQuoteForAsset(curAsset, tradeDate);
    }
  }, [selectedAssetId, tradeDate, assets]);

  const selectedAsset = assets.find((a) => a.id === selectedAssetId);

  // Auto-fill preço manual via COTAHIST
  const handleAutoFillPrice = async () => {
    if (!selectedAsset) {
      Alert.alert('Atenção', 'Selecione um ativo para buscar a cotação.');
      return;
    }
    if (!tradeDate) {
      Alert.alert('Atenção', 'Informe a data da operação (AAAA-MM-DD).');
      return;
    }
    await fetchQuoteForAsset(selectedAsset, tradeDate);
  };

  // Cálculo do total estimado
  const calculateTotal = (): string => {
    try {
      const q = new Decimal(quantity || 0);
      const p = new Decimal(unitPrice || 0);
      const f = new Decimal(fees || 0);
      if (type === 'BUY') {
        return q.mul(p).plus(f).toFixed(2);
      } else {
        return Decimal.max(0, q.mul(p).minus(f)).toFixed(2);
      }
    } catch {
      return '0.00';
    }
  };

  const handleSubmit = async () => {
    if (!selectedPortfolioId) {
      Alert.alert('Erro', 'Selecione ou cadastre uma carteira válida.');
      return;
    }
    if (!selectedAssetId) {
      Alert.alert('Erro', 'Selecione um ativo válido.');
      return;
    }
    if (!quantity || parseFloat(quantity) <= 0) {
      Alert.alert('Erro', 'Informe uma quantidade maior que zero.');
      return;
    }
    if (!unitPrice || parseFloat(unitPrice) <= 0) {
      Alert.alert('Erro', 'Informe um preço unitário maior que zero.');
      return;
    }

    setIsSubmitting(true);
    try {
      await transactionService.executeTransaction({
        portfolioId: selectedPortfolioId,
        assetId: selectedAssetId,
        type,
        tradeDate,
        quantity,
        unitPrice,
        fees: fees || '0.00',
        notes: notes || undefined,
      });

      Alert.alert(
        'Sucesso',
        `Movimentação de ${type === 'BUY' ? 'Compra' : 'Venda'} registrada com sucesso!`
      );
      resetForm();
      onTransactionSuccess();
      onClose();
    } catch (e: any) {
      Alert.alert('Erro na Operação', e.message || 'Falha ao registrar movimentação.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderDatePickerModal = () => {
    const year = calendarViewDate.getFullYear();
    const month = calendarViewDate.getMonth();
    const monthNames = [
      'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
      'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
    ];
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const firstDayIndex = new Date(year, month, 1).getDay();

    const dayCells = [];
    for (let i = 0; i < firstDayIndex; i++) {
      dayCells.push(<View key={`blank-${i}`} style={styles.calendarDayBlank} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dStr = String(d).padStart(2, '0');
      const mStr = String(month + 1).padStart(2, '0');
      const isoStr = `${year}-${mStr}-${dStr}`;
      const isSelected = isoStr === tradeDate;

      dayCells.push(
        <TouchableOpacity
          key={`day-${d}`}
          testID={`calendar-day-${d}`}
          onPress={() => {
            setTradeDate(isoStr);
            setDisplayDate(toDisplayDate(isoStr));
            setIsDatePickerVisible(false);
          }}
          style={[
            styles.calendarDayCell,
            isSelected && styles.calendarDayCellSelected,
          ]}
        >
          <Text
            style={[
              styles.calendarDayText,
              isLight && styles.calendarDayTextLight,
              isSelected && styles.calendarDayTextSelected,
            ]}
          >
            {d}
          </Text>
        </TouchableOpacity>
      );
    }

    return (
      <Modal
        visible={isDatePickerVisible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIsDatePickerVisible(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setIsDatePickerVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={[styles.calendarCard, isLight && styles.calendarCardLight]}>
            <View style={styles.calendarHeaderRow}>
              <TouchableOpacity
                onPress={() => setCalendarViewDate(new Date(year, month - 1, 1))}
                style={styles.calendarNavBtn}
              >
                <MaterialIcons name="chevron-left" size={24} color={isLight ? '#111315' : colors.parchmentPale} />
              </TouchableOpacity>
              <Text style={[styles.calendarMonthTitle, isLight && styles.calendarMonthTitleLight]}>
                {monthNames[month]} {year}
              </Text>
              <TouchableOpacity
                onPress={() => setCalendarViewDate(new Date(year, month + 1, 1))}
                style={styles.calendarNavBtn}
              >
                <MaterialIcons name="chevron-right" size={24} color={isLight ? '#111315' : colors.parchmentPale} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map((wd, idx) => (
                <Text key={idx} style={[styles.calendarWeekText, isLight && styles.calendarWeekTextLight]}>
                  {wd}
                </Text>
              ))}
            </View>

            <View style={styles.calendarDaysGrid}>{dayCells}</View>

            <View style={styles.calendarFooterRow}>
              <TouchableOpacity
                onPress={() => {
                  const today = getTodayLocal();
                  setTradeDate(today);
                  setDisplayDate(toDisplayDate(today));
                  setCalendarViewDate(new Date());
                  setIsDatePickerVisible(false);
                }}
                style={[styles.calendarTodayBtn, isLight && styles.calendarTodayBtnLight]}
              >
                <Text style={styles.calendarTodayBtnText}>Hoje</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsDatePickerVisible(false)}
                style={[styles.calendarCloseBtn, isLight && styles.calendarCloseBtnLight]}
              >
                <Text style={[styles.calendarCloseBtnText, isLight && styles.calendarCloseBtnTextLight]}>
                  Fechar
                </Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    );
  };

  return (
    <View testID={testID} style={[styles.container, isLight && styles.containerLight]}>
      {/* Top Close Action (sem header) */}
      {onClose && (
        <View style={styles.topActionsRow}>
          <TouchableOpacity
            onPress={() => {
              resetForm();
              onClose();
            }}
            style={[styles.closeBtn, isLight && styles.closeBtnLight]}
            testID="close-transaction-btn"
          >
            <MaterialIcons name="close" size={20} color={isLight ? '#111315' : colors.parchmentPale} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Aviso de Motor Go Nativo Indisponível (Expo Go / Fallback) */}
        {!bridgeAvailable && (
          <View testID="native-bridge-unavailable-notice" style={[styles.envNotice, isLight && styles.envNoticeLight]}>
            <MaterialIcons name="info-outline" size={16} color={isLight ? '#8A531B' : '#E5A93C'} />
            <Text style={[styles.envNoticeText, isLight && styles.envNoticeTextLight]}>
              Motor local indisponível neste ambiente (modo desenvolvimento / fallback HTTP).
            </Text>
          </View>
        )}

        {/* Seletor Tipo: COMPRA vs VENDA */}
        <View style={styles.typeSelectorRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setType('BUY')}
            style={[
              styles.typeButton,
              type === 'BUY'
                ? styles.typeButtonBuyActive
                : (isLight ? styles.typeButtonInactiveLight : styles.typeButtonInactive),
            ]}
          >
            <MaterialIcons
              name="north-east"
              size={18}
              color={type === 'BUY' ? colors.voidFloor : (isLight ? '#6E6A63' : colors.parchmentPale)}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'BUY'
                  ? styles.typeButtonTextBuyActive
                  : (isLight ? styles.typeButtonTextInactiveLight : styles.typeButtonTextInactive),
              ]}
            >
              COMPRA (APORTE)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setType('SELL')}
            style={[
              styles.typeButton,
              type === 'SELL'
                ? styles.typeButtonSellActive
                : (isLight ? styles.typeButtonInactiveLight : styles.typeButtonInactive),
            ]}
          >
            <MaterialIcons
              name="south-west"
              size={18}
              color={type === 'SELL' ? colors.voidFloor : (isLight ? '#6E6A63' : colors.parchmentPale)}
            />
            <Text
              style={[
                styles.typeButtonText,
                type === 'SELL'
                  ? styles.typeButtonTextSellActive
                  : (isLight ? styles.typeButtonTextInactiveLight : styles.typeButtonTextInactive),
              ]}
            >
              VENDA (RESGATE)
            </Text>
          </TouchableOpacity>
        </View>

        {/* Seleção de Carteira */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>CARTEIRA</Text>
          {portfolios.length === 0 ? (
            <View style={[styles.emptyAssetsNotice, isLight && styles.emptyAssetsNoticeLight]}>
              <Text style={[styles.emptyAssetsText, isLight && styles.emptyAssetsTextLight]}>
                Nenhuma carteira cadastrada. Cadastre uma carteira na aba Carteiras primeiro.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {portfolios.map((p) => {
                const isSelected = p.id === selectedPortfolioId;
                return (
                  <TouchableOpacity
                    key={p.id}
                    onPress={() => setSelectedPortfolioId(p.id)}
                    style={[styles.chip, isLight && styles.chipLight, isSelected && styles.chipActive]}
                  >
                    <MaterialIcons
                      name="account-balance-wallet"
                      size={16}
                      color={isSelected ? colors.voidFloor : (isLight ? '#6E6A63' : colors.tertiary)}
                    />
                    <Text style={[styles.chipText, isLight && styles.chipTextLight, isSelected && styles.chipTextActive]}>
                      {p.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Filtro por Categoria */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>CATEGORIA DO ATIVO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
            {[
              { key: 'ALL', label: 'TODOS' },
              { key: 'FIXED_INCOME', label: 'RENDA FIXA' },
              { key: 'FII', label: 'FIIs' },
              { key: 'STOCK', label: 'AÇÕES' },
              { key: 'CRYPTO', label: 'CRIPTO' },
            ].map((cat) => {
              const isSelected = selectedCategory === cat.key;
              return (
                <TouchableOpacity
                  key={cat.key}
                  testID={`category-filter-${cat.key}`}
                  onPress={() => handleCategorySelect(cat.key)}
                  style={[styles.chip, isLight && styles.chipLight, isSelected && styles.chipActive]}
                >
                  <Text style={[styles.chipText, isLight && styles.chipTextLight, isSelected && styles.chipTextActive]}>
                    {cat.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Busca e Entrada Livre de Ticker */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>BUSCAR OU DIGITAR TICKER</Text>
          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <MaterialIcons name="search" size={18} color={isLight ? '#8A857B' : '#8A8A8E'} />
            <TextInput
              testID="transaction-ticker-search-input"
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={tickerQuery}
              onChangeText={handleTickerSearch}
              placeholder="Buscar ou digitar ticker (Ex: WEGE3, PETR4)..."
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
              autoCapitalize="characters"
            />
          </View>
          {tickerSuggestions.length > 0 && (
            <View style={[styles.suggestionsBox, isLight && styles.suggestionsBoxLight]}>
              {tickerSuggestions.map((item) => (
                <TouchableOpacity
                  key={item.ticker}
                  testID={`ticker-autocomplete-suggestion-${item.ticker}`}
                  style={[styles.suggestionItem, isLight && styles.suggestionItemLight]}
                  onPress={() => handleSelectSuggestion(item)}
                >
                  <Text style={[styles.suggestionTicker, isLight && styles.suggestionTickerLight]}>
                    {item.ticker}
                  </Text>
                  <Text style={[styles.suggestionName, isLight && styles.suggestionNameLight]}>
                    {item.name || item.ticker}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {/* Seleção do Ativo */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>ATIVO EM CARTEIRA</Text>
          {assets.length === 0 ? (
            <View style={[styles.emptyAssetsNotice, isLight && styles.emptyAssetsNoticeLight]}>
              <Text style={[styles.emptyAssetsText, isLight && styles.emptyAssetsTextLight]}>
                Nenhum ativo cadastrado nesta carteira. Cadastre um ativo na aba Carteiras primeiro.
              </Text>
            </View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
              {assets.map((a) => {
                const isSelected = a.id === selectedAssetId;
                return (
                  <TouchableOpacity
                    key={a.id}
                    testID={`asset-chip-${a.id}`}
                    onPress={() => setSelectedAssetId(a.id)}
                    style={[styles.chip, isLight && styles.chipLight, isSelected && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, isLight && styles.chipTextLight, isSelected && styles.chipTextActive]}>
                      {a.ticker}
                    </Text>
                    <Text
                      style={[
                        styles.chipSubText,
                        isLight && styles.chipSubTextLight,
                        isSelected && { color: colors.voidFloor },
                      ]}
                    >
                      ({a.quantity} un)
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        {/* Data da Operação */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>DATA DA OPERAÇÃO (DD/MM/AAAA)</Text>
          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <TouchableOpacity onPress={() => setIsDatePickerVisible(true)} style={{ marginRight: 6 }}>
              <MaterialIcons name="calendar-today" size={18} color={isLight ? '#8A531B' : colors.tertiary} />
            </TouchableOpacity>
            <TextInput
              testID="transaction-trade-date-input"
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={displayDate}
              onChangeText={handleDateChangeText}
              placeholder="Ex: 2024-03-15"
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
            />
            <TouchableOpacity
              onPress={() => setIsDatePickerVisible(true)}
              style={[styles.calendarTriggerBtn, isLight && styles.calendarTriggerBtnLight]}
            >
              <Text style={[styles.calendarTriggerText, isLight && styles.calendarTriggerTextLight]}>CALENDÁRIO</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Preço Unitário + Botão Auto-Fill COTAHIST */}
        <View style={styles.inputGroup}>
          <View style={styles.labelWithActionRow}>
            <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>PREÇO UNITÁRIO (R$)</Text>
            <TouchableOpacity
              onPress={handleAutoFillPrice}
              style={[styles.autoFillBtn, isLight && styles.autoFillBtnLight]}
              disabled={isLoadingAutoFill}
            >
              {isLoadingAutoFill ? (
                <ActivityIndicator size="small" color={isLight ? '#8A531B' : colors.tertiary} />
              ) : (
                <>
                  <MaterialIcons name="sync" size={14} color={isLight ? '#8A531B' : colors.tertiary} />
                  <Text style={[styles.autoFillBtnText, isLight && styles.autoFillBtnTextLight]}>COTAHIST AUTO</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <Text style={[styles.currencyPrefix, isLight && styles.currencyPrefixLight]}>R$</Text>
            <TextInput
              testID="transaction-unit-price-input"
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={unitPrice}
              onChangeText={setUnitPrice}
              placeholder="0.00"
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
              keyboardType="decimal-pad"
            />
          </View>

          {autoFillMessage ? (
            <Text style={[styles.autoFillFeedback, isLight && styles.autoFillFeedbackLight]}>{autoFillMessage}</Text>
          ) : null}
        </View>

        {/* Quantidade */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>QUANTIDADE</Text>
          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <TextInput
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={quantity}
              onChangeText={setQuantity}
              placeholder={selectedAsset?.asset_class === 'CRYPTO' ? '0.00000000' : '100'}
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Taxas / Corretagem */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>TAXAS / CORRETAGEM (R$)</Text>
          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <Text style={[styles.currencyPrefix, isLight && styles.currencyPrefixLight]}>R$</Text>
            <TextInput
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={fees}
              onChangeText={setFees}
              placeholder="0.00 (opcional)"
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
              keyboardType="decimal-pad"
            />
          </View>
        </View>

        {/* Notas / Observação */}
        <View style={styles.inputGroup}>
          <Text style={[styles.inputLabel, isLight && styles.inputLabelLight]}>NOTAS / MOTIVO DA OPERAÇÃO (OPCIONAL)</Text>
          <View style={[styles.textInputBox, isLight && styles.textInputBoxLight]}>
            <TextInput
              style={[styles.textInput, isLight && styles.textInputLight]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Ex: Aporte mensal de rebalanceamento"
              placeholderTextColor={isLight ? '#9E9A90' : '#55585C'}
            />
          </View>
        </View>

        {/* Resumo Financeiro da Operação */}
        <View style={[styles.summaryCard, isLight && styles.summaryCardLight]}>
          <View style={styles.summaryRow}>
            <Text style={[styles.summaryLabel, isLight && styles.summaryLabelLight]}>TOTAL DA OPERAÇÃO:</Text>
            <Text style={styles.summaryValue}>R$ {calculateTotal()}</Text>
          </View>
          {selectedAsset && (
            <Text style={[styles.summarySub, isLight && styles.summarySubLight]}>
              Posição atual: {selectedAsset.quantity} un @ PM R$ {selectedAsset.average_price}
            </Text>
          )}
        </View>

        {/* Botão de Registro */}
        <DirectiveButton
          testID="transaction-save-submit-btn"
          label={isSubmitting ? 'REGISTRANDO...' : 'REGISTRAR NO LIVRO-RAZÃO'}
          variant={type === 'BUY' ? 'primary' : 'secondary'}
          disabled={isSubmitting || isSaveBlocked || !selectedAssetId}
          onPress={handleSubmit}
          themeMode={themeMode}
          style={{ marginTop: spacing.md }}
        />

        <View style={{ height: 40 }} />
      </ScrollView>

      {renderDatePickerModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.voidFloor,
  },
  topActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  closeBtn: {
    padding: spacing.xs,
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusSm,
  },
  closeBtnLight: {
    backgroundColor: '#F0EDE6',
  },
  scrollContent: {
    padding: spacing.lg,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: spacing.lg,
  },
  typeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: spacing.md - 2,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
  },
  typeButtonBuyActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  typeButtonSellActive: {
    backgroundColor: colors.secondary,
    borderColor: colors.secondary,
  },
  typeButtonInactive: {
    backgroundColor: colors.neutral,
    borderColor: '#26292C',
  },
  typeButtonText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    fontWeight: '700',
  },
  typeButtonTextBuyActive: {
    color: colors.voidFloor,
  },
  typeButtonTextSellActive: {
    color: colors.voidFloor,
  },
  typeButtonTextInactive: {
    color: colors.parchmentPale,
  },
  inputGroup: {
    marginBottom: spacing.md + 2,
  },
  inputLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
    marginBottom: spacing.xs,
  },
  labelWithActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  autoFillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.oxidizedSlag,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: borders.radiusSm,
  },
  autoFillBtnText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    color: colors.tertiary,
    fontWeight: '700',
  },
  autoFillFeedback: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: colors.tertiary,
    marginTop: 4,
  },
  chipsScroll: {
    flexDirection: 'row',
    marginTop: 2,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.neutral,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: borders.radiusPill,
    marginRight: 8,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  chipActive: {
    backgroundColor: colors.tertiary,
    borderColor: colors.tertiary,
  },
  chipText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  chipTextActive: {
    color: colors.voidFloor,
  },
  chipSubText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize - 1,
    color: '#8A8A8E',
  },
  emptyAssetsNotice: {
    backgroundColor: colors.neutral,
    padding: spacing.md,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
  },
  emptyAssetsText: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodySm.fontSize,
    color: '#8A8A8E',
    lineHeight: 18,
  },
  textInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.neutral,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#26292C',
    paddingHorizontal: spacing.md,
    height: 48,
    gap: 8,
  },
  currencyPrefix: {
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    color: colors.tertiary,
    fontWeight: '700',
  },
  textInput: {
    flex: 1,
    fontFamily: typography.fontFamily,
    fontSize: typography.bodyMd.fontSize,
    color: colors.parchmentPale,
  },
  summaryCard: {
    backgroundColor: '#1E2124',
    padding: spacing.md,
    borderRadius: borders.radiusMd,
    borderWidth: borders.hairline,
    borderColor: '#2A2D31',
    marginTop: spacing.sm,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelMd.fontSize,
    color: colors.parchmentPale,
    fontWeight: '700',
  },
  summaryValue: {
    fontFamily: typography.fontFamily,
    fontSize: typography.headlineSm.fontSize,
    color: colors.primary,
    fontWeight: '700',
  },
  summarySub: {
    fontFamily: typography.fontFamily,
    fontSize: typography.labelSm.fontSize,
    color: '#8A8A8E',
    marginTop: 6,
  },
  inputLabelLight: {
    color: '#6E6A63',
  },
  chipLight: {
    backgroundColor: '#EDE8DF',
    borderColor: '#E5DFD3',
  },
  chipTextLight: {
    color: '#111315',
  },
  chipSubTextLight: {
    color: '#8A857B',
  },
  emptyAssetsNoticeLight: {
    backgroundColor: '#EDE8DF',
    borderColor: '#E5DFD3',
  },
  emptyAssetsTextLight: {
    color: '#6E6A63',
  },
  textInputBoxLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  textInputLight: {
    color: '#111315',
  },
  currencyPrefixLight: {
    color: '#A0522D',
  },
  autoFillBtnLight: {
    backgroundColor: '#EADFC7',
  },
  autoFillBtnTextLight: {
    color: '#8A531B',
  },
  autoFillFeedbackLight: {
    color: '#8A531B',
  },
  summaryCardLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#EAE4D7',
  },
  summaryLabelLight: {
    color: '#111315',
  },
  summarySubLight: {
    color: '#6E6A63',
  },
  containerLight: {
    backgroundColor: '#F4F1EA',
  },
  envNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#2A1F11',
    borderWidth: 1,
    borderColor: '#543D1A',
    borderRadius: borders.radiusSm,
    padding: spacing.sm,
    marginBottom: spacing.md,
  },
  envNoticeLight: {
    backgroundColor: '#FEF3E2',
    borderColor: '#F3D29E',
  },
  envNoticeText: {
    flex: 1,
    fontFamily: typography.fontFamilyMono,
    fontSize: typography.fontSizeXs,
    color: '#E5A93C',
  },
  envNoticeTextLight: {
    color: '#8A531B',
  },
  suggestionsBox: {
    backgroundColor: colors.ebonyCard,
    borderWidth: 1,
    borderColor: colors.neutral,
    borderRadius: borders.radiusSm,
    marginTop: spacing.xs,
    overflow: 'hidden',
  },
  suggestionsBoxLight: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8E5DD',
  },
  suggestionItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.neutral,
  },
  suggestionItemLight: {
    borderBottomColor: '#E8E5DD',
  },
  suggestionTicker: {
    fontFamily: typography.fontFamilyMono,
    fontWeight: '700',
    fontSize: typography.fontSizeSm,
    color: colors.parchmentPale,
  },
  suggestionTickerLight: {
    color: '#111315',
  },
  suggestionName: {
    fontFamily: typography.fontFamily,
    fontSize: typography.fontSizeXs,
    color: colors.parchmentMuted,
  },
  suggestionNameLight: {
    color: '#6E6A63',
  },
  calendarTriggerBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: colors.surfaceCard,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: colors.outline,
    marginLeft: 6,
  },
  calendarTriggerBtnLight: {
    backgroundColor: '#EAE5D9',
    borderColor: '#D4CEBF',
  },
  calendarTriggerText: {
    color: colors.tertiary,
    fontSize: 10,
    fontFamily: typography.fontFamilyMono,
    fontWeight: '700',
  },
  calendarTriggerTextLight: {
    color: '#8A531B',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#1E2229',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A303C',
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 10,
  },
  calendarCardLight: {
    backgroundColor: '#FDFBF7',
    borderColor: '#D8D2C4',
    shadowOpacity: 0.1,
  },
  calendarHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  calendarNavBtn: {
    padding: 6,
  },
  calendarMonthTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.parchmentPale,
    fontFamily: typography.fontFamilyDisplay,
  },
  calendarMonthTitleLight: {
    color: '#111315',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  calendarWeekText: {
    width: 36,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    fontFamily: typography.fontFamilyMono,
  },
  calendarWeekTextLight: {
    color: '#8A857B',
  },
  calendarDaysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  calendarDayBlank: {
    width: '14.28%',
    height: 40,
  },
  calendarDayCell: {
    width: '14.28%',
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    marginVertical: 2,
  },
  calendarDayCellSelected: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    fontSize: 14,
    color: colors.parchmentPale,
    fontFamily: typography.fontFamilyMono,
    fontWeight: '600',
  },
  calendarDayTextLight: {
    color: '#111315',
  },
  calendarDayTextSelected: {
    color: '#000',
    fontWeight: '800',
  },
  calendarFooterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: '#2A303C',
  },
  calendarTodayBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: colors.primary,
    borderRadius: 8,
  },
  calendarTodayBtnLight: {
    backgroundColor: '#B57C1E',
  },
  calendarTodayBtnText: {
    color: '#000',
    fontWeight: '700',
    fontSize: 13,
  },
  calendarCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#2A303C',
    borderRadius: 8,
  },
  calendarCloseBtnLight: {
    backgroundColor: '#EAE5D9',
  },
  calendarCloseBtnText: {
    color: colors.parchmentPale,
    fontWeight: '600',
    fontSize: 13,
  },
  calendarCloseBtnTextLight: {
    color: '#111315',
  },
});

export default TransactionScreen;
