import React from 'react';
import { ScrollView, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui';
import { FinListCard, FinListRow } from '../../components/ui/FinListCard';
import { formatCentsBRL } from '../../domain/financeFlow';
import type { ThemeMode } from '../../theme/palettes';
import { getFinUiColors, sharedStyles } from './finTheme';

export type FinanceMoreRoute =
  | 'netWorth'
  | 'goals'
  | 'budgets'
  | 'subscriptions'
  | 'recurrences'
  | 'categories'
  | 'categoryRules'
  | 'statementImport';

export interface FinanceMoreScreenProps {
  onBack: () => void;
  onSwitchModule?: () => void;
  onAvatarPress?: () => void;
  userName?: string;
  userInitials?: string;
  onOpen: (route: FinanceMoreRoute) => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  netWorthTotalCents?: number | null;
  testID?: string;
}

export const FinanceMoreScreen: React.FC<FinanceMoreScreenProps> = ({
  onBack,
  onSwitchModule,
  onAvatarPress,
  userName,
  userInitials,
  onOpen,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  netWorthTotalCents = null,
  testID = 'finance-more-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const chevron = <MaterialIcons name="chevron-right" size={20} color={c.muted} />;
  const netWorthLabel =
    netWorthTotalCents === null || netWorthTotalCents === undefined
      ? 'Contas + investimentos − cartão'
      : isPrivacyMode
      ? 'R$ ••••••'
      : formatCentsBRL(netWorthTotalCents);
  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        module="finance"
        title="Mais"
        subtitle="Recorrências e organização"
        isGlobeActive={true}
        onBack={onAvatarPress ? undefined : onBack}
        onAvatarPress={onAvatarPress}
        userName={userName}
        userInitials={userInitials}
        onSwitchModule={onSwitchModule}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: 130 }]}>
        <FinListCard themeMode={themeMode} style={{ marginBottom: 12 }}>
          <FinListRow
            testID="finance-more-net-worth"
            icon="account-balance"
            avatarColor="#4F9A65"
            title="Patrimônio"
            subtitle={netWorthLabel}
            isLast
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('netWorth')}
          />
        </FinListCard>
        <FinListCard themeMode={themeMode}>
          <FinListRow
            testID="finance-more-goals"
            icon="flag"
            avatarColor="#5E9C76"
            title="Metas"
            subtitle="Metas financeiras e projeções"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('goals')}
          />
          <FinListRow
            testID="finance-more-budgets"
            icon="pie-chart"
            avatarColor="#D4A83B"
            title="Orçamento"
            subtitle="Limites mensais por categoria"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('budgets')}
          />
          <FinListRow
            testID="finance-more-subscriptions"
            icon="autorenew"
            avatarColor="#E6DECA"
            title="Assinaturas"
            subtitle="Cobranças recorrentes"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('subscriptions')}
          />
          <FinListRow
            testID="finance-more-recurrences"
            icon="event-repeat"
            avatarColor="#C49A45"
            title="Recorrências"
            subtitle="Contas e recebimentos fixos"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('recurrences')}
          />
          <FinListRow
            testID="finance-more-categories"
            icon="category"
            avatarColor="#AECDC5"
            title="Categorias"
            subtitle="Organize seus lançamentos"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('categories')}
          />
          <FinListRow
            testID="finance-more-category-rules"
            icon="rule"
            avatarColor="#D4A83B"
            title="Regras de categoria"
            subtitle="Categorização automática"
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('categoryRules')}
          />
          <FinListRow
            testID="finance-more-statement-import"
            icon="upload-file"
            avatarColor="#D96628"
            title="Importar fatura ou extrato"
            subtitle="Arquivos OFX e CSV"
            isLast
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('statementImport')}
          />
        </FinListCard>
      </ScrollView>
    </View>
  );
};
