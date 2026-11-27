import React, { useCallback, useEffect, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui/XpMinimalHeader';
import { sandboxRepository, type SandboxScenarioRecord } from '../../repositories/sandboxRepository';
import { colors, borders, typography, bento, space } from '../../theme/tokens';
import { LIGHT_THEME_TOKENS } from '../../theme/palettes';

export interface SandboxHubScreenProps {
  onBack?: () => void;
  onOpenTimeMachine?: (scenario?: SandboxScenarioRecord) => void;
  onOpenPaperPortfolio?: () => void;
  onOpenDividendGoal?: (scenario?: SandboxScenarioRecord) => void;
  onOpenFire?: () => void;
  onOpenOpportunityCost?: () => void;
  onOpenContributionSimulator?: () => void;
  onProfilePress?: () => void;
  onSwitchModule?: () => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: 'dark' | 'light';
  testID?: string;
}

interface HubTileItem {
  id: string;
  testID: string;
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  comingSoon: boolean;
}

const COMING_SOON_TILES: HubTileItem[] = [
  {
    id: 'independencia',
    testID: 'sandbox-tile-independencia',
    title: 'Independência',
    subtitle: 'Seu número e prazo pelos gastos reais',
    icon: 'flag',
    comingSoon: true,
  },
  {
    id: 'custo-oportunidade',
    testID: 'sandbox-tile-custo-oportunidade',
    title: 'Custo de oportunidade',
    subtitle: 'Assinatura ou gasto investido no tempo',
    icon: 'hourglass-bottom',
    comingSoon: true,
  },
  {
    id: 'teste-estresse',
    testID: 'sandbox-tile-teste-estresse',
    title: 'Teste de estresse',
    subtitle: 'Sua carteira em crises do passado',
    icon: 'bolt',
    comingSoon: true,
  },
  {
    id: 'comparar',
    testID: 'sandbox-tile-comparar',
    title: 'Comparar',
    subtitle: 'Ativo × ativo × CDI no mesmo gráfico',
    icon: 'compare-arrows',
    comingSoon: true,
  },
];

export const SandboxHubScreen: React.FC<SandboxHubScreenProps> = ({
  onBack,
  onOpenTimeMachine,
  onOpenPaperPortfolio,
  onOpenDividendGoal,
  onOpenContributionSimulator,
  onSwitchModule,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'sandbox-hub-screen',
}) => {
  const isLight = themeMode === 'light';
  const [scenarios, setScenarios] = useState<SandboxScenarioRecord[]>([]);

  const loadScenarios = useCallback(async () => {
    try {
      const list = await sandboxRepository.listScenarios();
      setScenarios(list);
    } catch {
      setScenarios([]);
    }
  }, []);

  useEffect(() => {
    loadScenarios();
  }, [loadScenarios]);

  const bg = isLight ? LIGHT_THEME_TOKENS.backgroundPrimary : colors.voidFloor;
  const surface = isLight ? bento.variants.light.background : bento.variants.dark.background;
  const textColor = isLight ? bento.variants.light.foreground : bento.variants.dark.foreground;
  const mutedColor = isLight ? bento.variants.light.muted : bento.variants.dark.muted;
  const borderColor = isLight ? '#E6E0D4' : '#25282C';

  return (
    <View testID={testID} style={[styles.container, { backgroundColor: bg }]}>
      <XpMinimalHeader
        module="investments"
        onBack={onBack}
        title="Simulador"
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
        rightAccessory={
          <View style={styles.sandboxBadge}>
            <Text style={styles.sandboxBadgeText}>SANDBOX</Text>
          </View>
        }
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.noticeBanner, { backgroundColor: surface, borderColor }]}>
          <MaterialIcons name="science" size={16} color={colors.primary} />
          <Text style={[styles.noticeText, { color: mutedColor }]}>
            Nada aqui mexe nas suas carteiras.
          </Text>
        </View>

        {/* Tile principal: Máquina do tempo */}
        <TouchableOpacity
          testID="sandbox-tile-time-machine"
          activeOpacity={0.85}
          onPress={() => onOpenTimeMachine?.()}
          style={[styles.heroTile, { backgroundColor: colors.primary }]}
        >
          <View style={styles.heroHeader}>
            <View style={styles.heroIconWrap}>
              <MaterialIcons name="history" size={24} color="#FFFFFF" />
            </View>
            <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
          </View>
          <Text style={styles.heroTitle}>Máquina do tempo</Text>
          <Text style={styles.heroSubtitle}>
            Simule compras e vendas no passado com B3, FII, cripto, EUA e câmbio × CDI e IPCA.
          </Text>
        </TouchableOpacity>

        {/* Tile Carteira fictícia (Sprint 110) */}
        <TouchableOpacity
          testID="sandbox-tile-carteira-ficticia"
          activeOpacity={0.8}
          onPress={() => onOpenPaperPortfolio?.()}
          style={[styles.tileCard, { backgroundColor: surface, borderColor }]}
        >
          <View style={styles.tileRow}>
            <View style={[styles.tileIconBox, { backgroundColor: isLight ? '#EAE4D7' : '#22252A' }]}>
              <MaterialIcons name="pie-chart" size={20} color={colors.primary} />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={[styles.tileTitle, { color: textColor }]}>Carteira fictícia</Text>
              <Text style={[styles.tileSubtitle, { color: mutedColor }]}>
                Simule uma composição com aporte mensal
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
          </View>
        </TouchableOpacity>

        {/* Tile Meta de dividendos (Sprint 111) */}
        <TouchableOpacity
          testID="sandbox-tile-meta-dividendos"
          activeOpacity={0.8}
          onPress={() => onOpenDividendGoal?.()}
          style={[styles.tileCard, { backgroundColor: surface, borderColor }]}
        >
          <View style={styles.tileRow}>
            <View style={[styles.tileIconBox, { backgroundColor: isLight ? '#EAE4D7' : '#22252A' }]}>
              <MaterialIcons name="payments" size={20} color={colors.primary} />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={[styles.tileTitle, { color: textColor }]}>Meta de dividendos</Text>
              <Text style={[styles.tileSubtitle, { color: mutedColor }]}>
                Quanto ter para receber R$ X/mês
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
          </View>
        </TouchableOpacity>

        {/* Tile Aporte (SimulatorScreen atual) */}
        <TouchableOpacity
          testID="sandbox-tile-aporte"
          activeOpacity={0.8}
          onPress={() => onOpenContributionSimulator?.()}
          style={[styles.tileCard, { backgroundColor: surface, borderColor }]}
        >
          <View style={styles.tileRow}>
            <View style={[styles.tileIconBox, { backgroundColor: isLight ? '#EAE4D7' : '#22252A' }]}>
              <MaterialIcons name="tune" size={20} color={colors.tertiary} />
            </View>
            <View style={styles.tileTextCol}>
              <Text style={[styles.tileTitle, { color: textColor }]}>Aporte</Text>
              <Text style={[styles.tileSubtitle, { color: mutedColor }]}>
                Rebalanceamento de novo aporte nas suas carteiras
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
          </View>
        </TouchableOpacity>

        {/* Demais tiles (Em breve — não navegam) */}
        <View style={styles.grid}>
          {COMING_SOON_TILES.map((item) => (
            <TouchableOpacity
              key={item.id}
              testID={item.testID}
              activeOpacity={0.9}
              accessibilityState={{ disabled: true }}
              onPress={() => {
                // Não navega enquanto estiver em "Em breve"
              }}
              style={[styles.gridTile, { backgroundColor: surface, borderColor }]}
            >
              <View style={styles.gridTileTop}>
                <MaterialIcons name={item.icon} size={20} color={mutedColor} />
                <View style={styles.soonBadge}>
                  <Text style={styles.soonBadgeText}>Em breve</Text>
                </View>
              </View>
              <Text style={[styles.gridTileTitle, { color: textColor }]}>{item.title}</Text>
              <Text style={[styles.gridTileSub, { color: mutedColor }]} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Cenários salvos */}
        <View style={styles.savedSection}>
          <Text style={[styles.sectionTitle, { color: textColor }]}>Cenários salvos</Text>
          {scenarios.length === 0 ? (
            <View style={[styles.emptySaved, { backgroundColor: surface, borderColor }]}>
              <Text style={[styles.emptySavedText, { color: mutedColor }]}>
                Nenhum cenário salvo ainda. Simule na Máquina do tempo e toque em "Salvar cenário".
              </Text>
            </View>
          ) : (
            scenarios.map((sc) => (
              <TouchableOpacity
                key={sc.id}
                testID={`sandbox-saved-${sc.id}`}
                activeOpacity={0.8}
                onPress={() => {
                  if (sc.kind === 'dividend_goal') {
                    onOpenDividendGoal?.(sc);
                  } else {
                    onOpenTimeMachine?.(sc);
                  }
                }}
                style={[styles.savedRow, { backgroundColor: surface, borderColor }]}
              >
                <View style={styles.savedInfo}>
                  <Text style={[styles.savedName, { color: textColor }]}>{sc.name}</Text>
                  <Text style={[styles.savedMeta, { color: mutedColor }]}>
                    {isPrivacyMode
                      ? '••••'
                      : `Atualizado em ${sc.updated_at.slice(0, 10)}`}
                  </Text>
                </View>
                <MaterialIcons name="chevron-right" size={20} color={mutedColor} />
              </TouchableOpacity>
            ))
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  sandboxBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: borders.radiusFull,
    backgroundColor: 'rgba(217, 102, 40, 0.16)',
    borderWidth: 1,
    borderColor: colors.primary,
  },
  sandboxBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: colors.primary,
  },
  scrollContent: {
    paddingHorizontal: space.md,
    paddingBottom: 120,
    gap: 12,
  },
  noticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: borders.radiusMd,
    borderWidth: 1,
  },
  noticeText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '500',
  },
  heroTile: {
    borderRadius: borders.radiusLg,
    padding: 18,
    gap: 8,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 13,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.88)',
  },
  tileCard: {
    borderRadius: borders.radiusLg,
    padding: 14,
    borderWidth: 1,
  },
  tileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tileIconBox: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTextCol: {
    flex: 1,
    gap: 2,
  },
  tileTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  tileSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  gridTile: {
    width: '48%',
    flexGrow: 1,
    borderRadius: borders.radiusLg,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  gridTileTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  soonBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: borders.radiusFull,
    backgroundColor: 'rgba(138, 138, 142, 0.16)',
  },
  soonBadgeText: {
    fontFamily: typography.fontFamily,
    fontSize: 10,
    fontWeight: '600',
    color: '#8A8A8E',
  },
  gridTileTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '700',
  },
  gridTileSub: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
    lineHeight: 15,
  },
  savedSection: {
    marginTop: 8,
    gap: 8,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 15,
    fontWeight: '700',
  },
  emptySaved: {
    borderRadius: borders.radiusMd,
    padding: 14,
    borderWidth: 1,
  },
  emptySavedText: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
  },
  savedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: borders.radiusMd,
    padding: 14,
    borderWidth: 1,
  },
  savedInfo: {
    flex: 1,
    gap: 2,
  },
  savedName: {
    fontFamily: typography.fontFamily,
    fontSize: 14,
    fontWeight: '600',
  },
  savedMeta: {
    fontFamily: typography.fontFamily,
    fontSize: 11,
  },
});

export default SandboxHubScreen;
