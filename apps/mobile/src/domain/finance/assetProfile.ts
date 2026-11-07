import { AssetClass } from '../../components/ui/AttributeStatBar';

export interface PricePoint {
  date: string;
  close: number;
}

export interface Dividend {
  date: string; // YYYY-MM-DD
  type: string; // 'DIVIDEND' | 'JCP' | 'RENDIMENTO'
  amount: number; // R$ per share
  notes?: string;
}

export interface AssetAbout {
  companyName?: string;
  sector?: string;
  listingSegment?: string;
  sharesOutstanding?: number | string;
  website?: string;
}

export interface AssetProfile {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  change24h: number;
  change12m?: number;
  indicators: Record<string, string | number | null | undefined>;
  about?: AssetAbout;
  source?: string;
  isStale?: boolean;
  updatedAt?: string;
}

export interface DividendSummary {
  total12m: number;
  frequency: string;
  last6: Array<Dividend & { isHighest?: boolean }>;
  recent: Dividend[];
}

export interface RankingItem {
  ticker: string;
  name: string;
  assetClass: AssetClass;
  price: number;
  dy12m: number | null;
  pvp: number | null;
  change24h: number;
}

export interface IndicatorDefinition {
  key: string;
  label: string;
  tooltip: string;
  format: (value: any) => string;
}

/** Calcula retorno percentual entre o primeiro e o último ponto de uma série temporal. */
export function periodReturn(points: PricePoint[]): number {
  if (!points || points.length < 2) return 0;
  const first = points[0].close;
  const last = points[points.length - 1].close;
  if (first <= 0) return 0;
  return ((last - first) / first) * 100;
}

function parseDateMs(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, (m || 1) - 1, d || 1);
}

/** Calcula o Dividend Yield dos últimos 12 meses relativo à cotação atual. */
export function dividendYield12m(dividends: Dividend[], currentPrice: number, nowDate?: string): number {
  if (!dividends || dividends.length === 0 || currentPrice <= 0) return 0;

  const nowMs = nowDate ? parseDateMs(nowDate) : Date.now();
  const twelveMonthsAgoMs = nowMs - 365 * 24 * 60 * 60 * 1000;

  let total12m = 0;
  for (const div of dividends) {
    const dMs = parseDateMs(div.date);
    if (dMs >= twelveMonthsAgoMs && dMs <= nowMs) {
      total12m += Number(div.amount) || 0;
    }
  }

  return (total12m / currentPrice) * 100;
}

/** Resume proventos dos últimos 12 meses, frequência, mini-barras e últimos proventos. */
export function summarizeDividends(dividends: Dividend[], currentPrice: number, nowDate?: string): DividendSummary {
  if (!dividends || dividends.length === 0) {
    return {
      total12m: 0,
      frequency: '—',
      last6: [],
      recent: [],
    };
  }

  const sortedRecent = [...dividends].sort((a, b) => b.date.localeCompare(a.date));

  const nowMs = nowDate ? parseDateMs(nowDate) : Date.now();
  const twelveMonthsAgoMs = nowMs - 365 * 24 * 60 * 60 * 1000;

  let total12m = 0;
  let count12m = 0;
  for (const div of sortedRecent) {
    const dMs = parseDateMs(div.date);
    if (dMs >= twelveMonthsAgoMs && dMs <= nowMs) {
      total12m += Number(div.amount) || 0;
      count12m++;
    }
  }

  let frequency = 'Irregular';
  if (count12m === 0) {
    frequency = '—';
  } else if (count12m >= 10) {
    frequency = 'Mensal';
  } else if (count12m >= 3 && count12m <= 5) {
    frequency = 'Trimestral';
  } else if (count12m === 2) {
    frequency = 'Semestral';
  } else if (count12m === 1) {
    frequency = 'Anual';
  }

  const last6Raw = sortedRecent.slice(0, 6);
  let maxAmount = 0;
  for (const d of last6Raw) {
    if (d.amount > maxAmount) maxAmount = d.amount;
  }

  const last6 = last6Raw.map((d) => ({
    ...d,
    isHighest: maxAmount > 0 && d.amount === maxAmount,
  }));

  return {
    total12m,
    frequency,
    last6,
    recent: sortedRecent,
  };
}

/** Ordena lista de ativos para a tabela de ranking tratando valores nulos no final. */
/**
 * Reduz a série a no máximo `max` pontos para desenhar (média por faixa, preservando o último ponto).
 * Séries longas (6M = ~128, 1A = ~250, 5A = ~1250 pregões) não cabem uma barra por ponto na tela.
 */
export function downsamplePoints(points: PricePoint[], max: number): PricePoint[] {
  if (max <= 0 || points.length <= max) return points;
  const out: PricePoint[] = [];
  const size = points.length / max;
  for (let i = 0; i < max; i++) {
    const start = Math.floor(i * size);
    const end = i === max - 1 ? points.length : Math.floor((i + 1) * size);
    const slice = points.slice(start, Math.max(end, start + 1));
    const avg = slice.reduce((s, p) => s + p.close, 0) / slice.length;
    out.push({ date: slice[slice.length - 1].date, close: avg });
  }
  out[out.length - 1] = points[points.length - 1];
  return out;
}

export function rankAssets(
  items: RankingItem[],
  by: 'dy' | 'pvp' | 'change' | 'price' | 'ticker',
  dir: 'asc' | 'desc'
): RankingItem[] {
  return [...items].sort((a, b) => {
    let valA: any;
    let valB: any;

    if (by === 'dy') {
      valA = a.dy12m;
      valB = b.dy12m;
    } else if (by === 'pvp') {
      valA = a.pvp;
      valB = b.pvp;
    } else if (by === 'change') {
      valA = a.change24h;
      valB = b.change24h;
    } else if (by === 'price') {
      valA = a.price;
      valB = b.price;
    } else {
      valA = a.ticker;
      valB = b.ticker;
    }

    const aEmpty = valA === null || valA === undefined || Number.isNaN(valA);
    const bEmpty = valB === null || valB === undefined || Number.isNaN(valB);

    if (aEmpty && bEmpty) return 0;
    if (aEmpty) return 1;
    if (bEmpty) return -1;

    if (typeof valA === 'string' && typeof valB === 'string') {
      return dir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    }

    const diff = Number(valA) - Number(valB);
    return dir === 'asc' ? diff : -diff;
  });
}

/** Indicadores específicos por classe de ativo. */
export function indicatorsFor(assetClass: AssetClass): IndicatorDefinition[] {
  switch (assetClass) {
    case 'STOCK':
      return [
        {
          key: 'dy',
          label: 'Dividend Yield',
          tooltip: 'Dividend Yield: proventos pagos nos últimos 12 meses divididos pela cotação atual.',
          format: (v) => formatIndicatorValue('dy', v),
        },
        {
          key: 'pl',
          label: 'P/L',
          tooltip: 'Preço sobre Lucro: relação entre o preço da ação e o lucro líquido por ação.',
          format: (v) => formatIndicatorValue('pl', v),
        },
        {
          key: 'pvp',
          label: 'P/VP',
          tooltip: 'Preço sobre Valor Patrimonial: relação entre a cotação e o valor patrimonial da ação.',
          format: (v) => formatIndicatorValue('pvp', v),
        },
        {
          key: 'roe',
          label: 'ROE',
          tooltip: 'Retorno sobre Patrimônio Líquido: mede a capacidade da empresa de gerar lucro com seus recursos.',
          format: (v) => formatIndicatorValue('roe', v),
        },
        {
          key: 'marketCap',
          label: 'Valor de mercado',
          tooltip: 'Valor de mercado: cotação atual multiplicada pelo total de ações emitidas.',
          format: (v) => formatIndicatorValue('marketCap', v),
        },
        {
          key: 'dailyLiquidity',
          label: 'Liquidez diária',
          tooltip: 'Liquidez diária: volume financeiro médio negociado diariamente.',
          format: (v) => formatIndicatorValue('dailyLiquidity', v),
        },
        {
          key: 'netMargin',
          label: 'Margem líquida',
          tooltip: 'Margem líquida: porcentagem de lucro líquido em relação à receita total.',
          format: (v) => formatIndicatorValue('netMargin', v),
        },
        {
          key: 'netDebtEbitda',
          label: 'Dív. líq./EBITDA',
          tooltip: 'Dívida Líquida sobre EBITDA: indicador de endividamento da empresa.',
          format: (v) => formatIndicatorValue('netDebtEbitda', v),
        },
      ];

    case 'FII':
      return [
        {
          key: 'dy',
          label: 'DY 12M',
          tooltip: 'Dividend Yield 12M: rendimentos distribuídos nos últimos 12 meses divididos pelo preço da cota.',
          format: (v) => formatIndicatorValue('dy', v),
        },
        {
          key: 'pvp',
          label: 'P/VP',
          tooltip: 'Preço sobre Valor Patrimonial: relação entre o valor da cota e o valor patrimonial do fundo.',
          format: (v) => formatIndicatorValue('pvp', v),
        },
        {
          key: 'dailyLiquidity',
          label: 'Liquidez diária',
          tooltip: 'Liquidez diária: média diária de negociações do fundo na bolsa.',
          format: (v) => formatIndicatorValue('dailyLiquidity', v),
        },
        {
          key: 'shareholdersCount',
          label: 'Nº de cotistas',
          tooltip: 'Número de cotistas: total de investidores pessoa física e jurídica que detêm cotas do fundo.',
          format: (v) => formatIndicatorValue('shareholdersCount', v),
        },
        {
          key: 'netWorth',
          label: 'Patrimônio líquido',
          tooltip: 'Patrimônio líquido total avaliado dos imóveis e títulos do fundo.',
          format: (v) => formatIndicatorValue('netWorth', v),
        },
        {
          key: 'lastYield',
          label: 'Último rendimento',
          tooltip: 'Último rendimento: valor em R$ por cota pago no provento mais recente.',
          format: (v) => formatIndicatorValue('lastYield', v),
        },
        {
          key: 'vacancy',
          label: 'Vacância/Segmento',
          tooltip: 'Taxa de vacância física/financeira e segmento de atuação do fundo imobiliário.',
          format: (v) => formatIndicatorValue('vacancy', v),
        },
      ];

    case 'CRYPTO':
      return [
        {
          key: 'marketCap',
          label: 'Valor de mercado',
          tooltip: 'Valor de mercado: fornecimento circulante multiplicado pelo preço atual.',
          format: (v) => formatIndicatorValue('marketCap', v),
        },
        {
          key: 'volume24h',
          label: 'Volume 24h',
          tooltip: 'Volume total negociado nas últimas 24 horas nas exchanges.',
          format: (v) => formatIndicatorValue('volume24h', v),
        },
        {
          key: 'range52w',
          label: 'Máx/Mín 52 sem.',
          tooltip: 'Menor e maior preço atingido nas últimas 52 semanas.',
          format: (v) => formatIndicatorValue('range52w', v),
        },
        {
          key: 'change7d',
          label: 'Variação 7D',
          tooltip: 'Variação percentual do preço nos últimos 7 dias.',
          format: (v) => formatIndicatorValue('change7d', v),
        },
        {
          key: 'change30d',
          label: 'Variação 30D',
          tooltip: 'Variação percentual do preço nos últimos 30 dias.',
          format: (v) => formatIndicatorValue('change30d', v),
        },
      ];

    default:
      return [];
  }
}

/** Formata valores numéricos para exibição visual pt-BR nos indicadores. */
export function formatIndicatorValue(key: string, value: any): string {
  if (value === null || value === undefined || value === '') return '—';

  const num = typeof value === 'number' ? value : parseFloat(String(value));

  if (Number.isNaN(num)) {
    return String(value);
  }

  // Grandes ordens de grandeza (Valor de mercado, Liquidez, Volume, PL)
  if (key === 'marketCap' || key === 'dailyLiquidity' || key === 'volume24h' || key === 'netWorth') {
    if (num >= 1e9) {
      const bVal = (num / 1e9).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      return `R$ ${bVal} B`;
    }
    if (num >= 1e6) {
      const mVal = (num / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
      return `R$ ${mVal} M`;
    }
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  // Porcentagens
  if (key === 'dy' || key === 'roe' || key === 'netMargin' || key === 'change7d' || key === 'change30d' || key === 'vacancy') {
    return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
  }

  // Múltiplos P/L, P/VP, Dívida Líq./EBITDA
  if (key === 'pl' || key === 'pvp' || key === 'netDebtEbitda') {
    return num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
  }

  if (key === 'lastYield') {
    return `R$ ${num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  return num.toLocaleString('pt-BR');
}
