import React from 'react';
import { ScrollView, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { XpMinimalHeader } from '../../components/ui';
import { FinListCard, FinListRow } from '../../components/ui/FinListCard';
import type { ThemeMode } from '../../theme/palettes';
import { getFinUiColors, sharedStyles } from './finTheme';

export interface FinanceMoreScreenProps {
  onBack: () => void;
  onOpen: (route: 'subscriptions' | 'recurrences' | 'categories') => void;
  isPrivacyMode?: boolean;
  onTogglePrivacy?: () => void;
  themeMode?: ThemeMode;
  testID?: string;
}

export const FinanceMoreScreen: React.FC<FinanceMoreScreenProps> = ({
  onBack,
  onOpen,
  isPrivacyMode = false,
  onTogglePrivacy,
  themeMode = 'dark',
  testID = 'finance-more-screen',
}) => {
  const c = getFinUiColors(themeMode);
  const chevron = <MaterialIcons name="chevron-right" size={20} color={c.muted} />;
  return (
    <View testID={testID} style={[sharedStyles.screen, { backgroundColor: c.background }]}>
      <XpMinimalHeader
        title="Mais"
        subtitle="Recorrências e organização"
        isGlobeActive={true}
        onBack={onBack}
        isPrivacyModeEnabled={isPrivacyMode}
        onTogglePrivacy={onTogglePrivacy}
        themeMode={themeMode}
      />
      <ScrollView contentContainerStyle={[sharedStyles.scrollContent, { paddingBottom: 130 }]}>
        <FinListCard themeMode={themeMode}>
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
            isLast
            themeMode={themeMode}
            rightAccessory={chevron}
            onPress={() => onOpen('categories')}
          />
        </FinListCard>
      </ScrollView>
    </View>
  );
};
