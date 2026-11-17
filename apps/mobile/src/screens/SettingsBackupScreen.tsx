import React from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { BentoGrid, BentoTile } from '../components/ui';
import { bento, colors, layout } from '../theme/tokens';
import { ThemeMode } from '../theme/palettes';
import { useProfileSettings } from './profile/useProfileSettings';
import { useProfile } from '../stores/profileStore';
import {
  AppearanceTile,
  BackupTile,
  GroupLabel,
  IdentityTile,
  ModuleSectionHeader,
  PrivacyRow,
  ProfileActionRow,
  ProfileNameRow,
  profileGroupCardStyle,
  RemindersTile,
  WipeDataRow,
  SecurityTile,
  StatusBannerTile,
  WalletsTile,
} from './profile/ProfileTiles';

import type { AppModule } from '../navigation/appModule';
import type { FinanceRoute } from './finance/FinanceHomeScreen';

export interface SettingsBackupScreenProps {
  isPrivacyMode: boolean;
  onTogglePrivacyMode: (enabled: boolean) => void;
  onClose?: () => void;
  onDataRestored?: () => void;
  onOpenB3Import?: () => void;
  onOpenOpenFinance?: () => void;
  onOpenWallets?: () => void;
  onOpenIncomeHistory?: () => void;
  onOpenFinanceRoute?: (route: FinanceRoute) => void;
  onOpenFinanceStatementImport?: () => void;
  originModule?: AppModule;
  themeMode?: ThemeMode;
  onThemeModeChange?: (mode: ThemeMode) => void;
  /** Dados do usuário só aparecem quando informados; não há valores de exemplo. */
  userName?: string;
  userInitials?: string;
  testID?: string;
}

/** Largura a partir da qual o Perfil usa duas colunas. */
const TWO_COLUMN_MIN_WIDTH = 720;
const MAX_CONTENT_WIDTH = 960;

/** Perfil & Configurações em bento grid: uma coluna no celular, duas em telas largas. */
export const SettingsBackupScreen: React.FC<SettingsBackupScreenProps> = ({
  isPrivacyMode,
  onTogglePrivacyMode,
  onClose,
  onDataRestored,
  onOpenB3Import,
  onOpenOpenFinance,
  onOpenWallets,
  onOpenIncomeHistory,
  onOpenFinanceRoute,
  onOpenFinanceStatementImport,
  originModule = 'investments',
  themeMode,
  onThemeModeChange,
  userName,
  userInitials,
  testID = 'settings-backup-screen',
}) => {
  const { width } = useWindowDimensions();
  const p = useProfileSettings({ themeMode, onTogglePrivacyMode, onThemeModeChange, onDataRestored });
  const twoColumns = width >= TWO_COLUMN_MIN_WIDTH;
  const [sec, setSec] = React.useState<{ hasPin: boolean; biometricEnabled: boolean } | null>(null);
  const [otherExpanded, setOtherExpanded] = React.useState(false);
  const mode = p.isLight ? 'light' : 'dark';
  const profile = useProfile();

  const identity = (
    <IdentityTile
      isLight={p.isLight}
      userName={userName ?? (profile.name || undefined)}
      userInitials={userInitials ?? (profile.initials || undefined)}
      walletCount={p.wallets.length}
      assetCount={p.wallets.reduce((n, w) => n + w.assetCount, 0)}
      onClose={onClose}
      hasPin={sec ? sec.hasPin : undefined}
      biometricEnabled={sec ? sec.biometricEnabled : undefined}
    />
  );
  const nameRow = <ProfileNameRow isLight={p.isLight} first />;
  const wallets = (
    <WalletsTile
      isLight={p.isLight}
      isPrivacyMode={isPrivacyMode}
      wallets={p.wallets}
      first
      onOpenWallets={onOpenWallets}
    />
  );
  const appearance = <AppearanceTile isLight={p.isLight} mode={mode} onSelect={p.selectTheme} />;
  const security = (
    <SecurityTile
      isLight={p.isLight}
      isBiometricEnabled={p.isBiometricEnabled}
      isAppLocked={p.isAppLocked}
      onToggleBiometrics={p.toggleBiometrics}
      onTestBiometrics={p.testBiometricLock}
      onStatusChange={setSec}
      showWipe={false}
      showName={false}
    />
  );
  const groupGeneral = <GroupLabel label="GERAL" isLight={p.isLight} testID="profile-group-account" />;
  const groupProtection = <GroupLabel label="PROTEÇÃO" isLight={p.isLight} testID="profile-group-protection" />;
  const groupData = <GroupLabel label="CONEXÕES E DADOS" isLight={p.isLight} testID="profile-group-data" />;
  const privacy = <PrivacyRow isLight={p.isLight} enabled={isPrivacyMode} onToggle={p.togglePrivacy} />;
  const reminders = <RemindersTile isLight={p.isLight} />;
  const variant = p.isLight ? 'light' : 'dark';
  const card = (id: string, ...rows: React.ReactNode[]) => (
    <BentoTile variant={variant} testID={id} style={profileGroupCardStyle}>
      {rows.map((r, i) => (
        <React.Fragment key={i}>{r}</React.Fragment>
      ))}
    </BentoTile>
  );
  const banner = p.banner ? <StatusBannerTile banner={p.banner} isLight={p.isLight} /> : null;
  const backup = (
    <BackupTile
      isLight={p.isLight}
      importMode={p.importMode}
      onChangeImportMode={p.setImportMode}
      lastExport={p.lastExport}
      onExport={p.exportDossier}
      onImport={p.importDossier}
      onImportSpreadsheet={p.importSpreadsheet}
      onOpenOpenFinance={onOpenOpenFinance}
      footer={<WipeDataRow isLight={p.isLight} />}
    />
  );

  const investmentsExpanded = twoColumns || originModule === 'investments' || otherExpanded;
  const financeExpanded = twoColumns || originModule === 'finance' || otherExpanded;

  const investmentsSection = (
    <React.Fragment key="section-investments">
      <ModuleSectionHeader
        module="investments"
        subtitle="Carteiras, B3, planilhas e proventos"
        isLight={p.isLight}
        collapsible={!twoColumns && originModule !== 'investments'}
        expanded={investmentsExpanded}
        onToggle={() => setOtherExpanded((v) => !v)}
      />
      {investmentsExpanded
        ? card(
            'profile-card-investments',
            wallets,
            <ProfileActionRow
              icon="account-balance"
              title="Importar extrato B3"
              subtitle="Planilha da Área do Investidor"
              isLight={p.isLight}
              testID="import-b3-btn"
              onPress={onOpenB3Import}
            />,
            <ProfileActionRow
              icon="table-chart"
              title="Importar dados da planilha"
              subtitle="CSV de ativos e operações"
              isLight={p.isLight}
              testID="import-spreadsheet-btn"
              onPress={p.importSpreadsheet}
            />,
            <ProfileActionRow
              icon="payments"
              title="Histórico de proventos"
              subtitle="Dividendos, JCP e rendimentos"
              isLight={p.isLight}
              testID="profile-investments-income-history-btn"
              onPress={onOpenIncomeHistory}
            />
          )
        : null}
    </React.Fragment>
  );

  const financeSection = (
    <React.Fragment key="section-finance">
      <ModuleSectionHeader
        module="finance"
        subtitle="Lembretes, categorias, regras e contas"
        isLight={p.isLight}
        collapsible={!twoColumns && originModule !== 'finance'}
        expanded={financeExpanded}
        onToggle={() => setOtherExpanded((v) => !v)}
      />
      {financeExpanded
        ? card(
            'profile-card-finance',
            reminders,
            <ProfileActionRow
              icon="label"
              title="Categorias"
              subtitle="Organizar receitas e despesas"
              isLight={p.isLight}
              testID="profile-finance-categories-btn"
              onPress={() => onOpenFinanceRoute?.('categories')}
            />,
            <ProfileActionRow
              icon="auto-fix-high"
              title="Regras de categorização"
              subtitle="Classificação automática de lançamentos"
              isLight={p.isLight}
              testID="profile-finance-rules-btn"
              onPress={() => onOpenFinanceRoute?.('categoryRules')}
            />,
            <ProfileActionRow
              icon="upload-file"
              title="Importar extrato ou fatura"
              subtitle="OFX ou CSV bancário e cartão"
              isLight={p.isLight}
              testID="profile-finance-import-btn"
              onPress={onOpenFinanceStatementImport}
            />,
            <ProfileActionRow
              icon="account-balance-wallet"
              title="Contas e cartões"
              subtitle="Saldos, faturas e vencimentos"
              isLight={p.isLight}
              testID="profile-finance-accounts-btn"
              onPress={() => onOpenFinanceRoute?.('accounts')}
            />
          )
        : null}
    </React.Fragment>
  );

  const orderedModuleSections =
    originModule === 'finance'
      ? [financeSection, investmentsSection]
      : [investmentsSection, financeSection];

  return (
    <View testID={testID} style={[styles.container, p.isLight && styles.containerLight]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.content}>
          {twoColumns ? (
            <View style={styles.columns}>
              <BentoGrid style={styles.column} testID="profile-column-left">
                {identity}
                {banner}
                {groupGeneral}
                {card('profile-card-account', nameRow, appearance, privacy)}
                {groupProtection}
                {card('profile-card-protection', security)}
                {groupData}
                {card('profile-card-data', backup)}
              </BentoGrid>
              <BentoGrid style={styles.column} testID="profile-column-right">
                {orderedModuleSections}
              </BentoGrid>
            </View>
          ) : (
            <BentoGrid>
              {identity}
              {banner}
              {groupGeneral}
              {card('profile-card-account', nameRow, appearance, privacy)}
              {orderedModuleSections}
              {groupProtection}
              {card('profile-card-protection', security)}
              {groupData}
              {card('profile-card-data', backup)}
            </BentoGrid>
          )}
        </View>
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.voidFloor },
  containerLight: { backgroundColor: '#F4F1EA' },
  scrollContent: { padding: layout.screenPadding, paddingTop: 4, paddingBottom: 40, alignItems: 'center' },
  content: { width: '100%', maxWidth: MAX_CONTENT_WIDTH, gap: bento.gap },
  columns: { flexDirection: 'row', gap: bento.gap, alignItems: 'flex-start' },
  column: { flex: 1 },
});

export default SettingsBackupScreen;
