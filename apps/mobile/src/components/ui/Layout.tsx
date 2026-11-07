import React from 'react';
import { View, Text, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { colors, typography, borders, layout, space } from '../../theme/tokens';

type Theme = 'dark' | 'light';

/** Título de seção padronizado: caixa alta, pequeno, com ação opcional à direita. */
export const SectionHeader: React.FC<{
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  themeMode?: Theme;
  testID?: string;
}> = ({ title, subtitle, action, themeMode = 'dark', testID }) => {
  const isLight = themeMode === 'light';
  return (
    <View style={styles.headerRow} testID={testID}>
      <View style={styles.headerTextCol}>
        <Text style={[styles.sectionTitle, isLight && styles.sectionTitleLight]}>{title}</Text>
        {subtitle ? (
          <Text style={[styles.sectionSubtitle, isLight && styles.sectionSubtitleLight]}>{subtitle}</Text>
        ) : null}
      </View>
      {action ? <View>{action}</View> : null}
    </View>
  );
};

/**
 * Seção: espaço padrão acima, linha fina de topo (exceto a primeira) e título
 * consistente. Usa os tokens de `layout` para o respiro entre seções.
 */
export const Section: React.FC<{
  title?: string;
  subtitle?: string;
  action?: React.ReactNode;
  first?: boolean;
  divider?: boolean;
  themeMode?: Theme;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}> = ({ title, subtitle, action, first = false, divider = true, themeMode = 'dark', style, testID, children }) => {
  const isLight = themeMode === 'light';
  return (
    <View
      testID={testID}
      style={[
        !first && { marginTop: layout.sectionGap },
        !first && divider && styles.divider,
        !first && divider && { borderTopColor: isLight ? '#EAE4D7' : '#26292C', paddingTop: layout.sectionGap - space.sm },
        style,
      ]}
    >
      {title ? (
        <SectionHeader title={title} subtitle={subtitle} action={action} themeMode={themeMode} />
      ) : null}
      {children}
    </View>
  );
};

/** Campo de formulário: rótulo + conteúdo + ajuda/erro, com o espaço padrão abaixo. */
export const FormField: React.FC<{
  label?: string;
  helper?: string;
  error?: string;
  last?: boolean;
  themeMode?: Theme;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}> = ({ label, helper, error, last = false, themeMode = 'dark', style, testID, children }) => {
  const isLight = themeMode === 'light';
  return (
    <View testID={testID} style={[!last && { marginBottom: layout.fieldGap }, style]}>
      {label ? (
        <Text style={[styles.fieldLabel, isLight && styles.fieldLabelLight]}>{label}</Text>
      ) : null}
      {children}
      {error ? (
        <Text style={styles.fieldError}>{error}</Text>
      ) : helper ? (
        <Text style={[styles.fieldHelper, isLight && styles.fieldHelperLight]}>{helper}</Text>
      ) : null}
    </View>
  );
};

/** Grupo de campos: o espaço entre campos vem do `gap`; o espaço abaixo é o de grupo. */
export const FormGroup: React.FC<{
  last?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  children?: React.ReactNode;
}> = ({ last = false, style, testID, children }) => (
  <View testID={testID} style={[{ gap: layout.fieldGap }, !last && { marginBottom: layout.groupGap }, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: layout.sectionTitleGap,
  },
  headerTextCol: {
    flex: 1,
  },
  sectionTitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    color: '#8A8A8E',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  sectionTitleLight: {
    color: '#6E6A63',
  },
  sectionSubtitle: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: space.xs,
  },
  sectionSubtitleLight: {
    color: '#6E6A63',
  },
  divider: {
    borderTopWidth: borders.hairline,
  },
  fieldLabel: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.8,
    color: '#A8A296',
    marginBottom: layout.labelGap,
  },
  fieldLabelLight: {
    color: '#6E6A63',
  },
  fieldHelper: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: '#8A8A8E',
    marginTop: space.sm,
  },
  fieldHelperLight: {
    color: '#6E6A63',
  },
  fieldError: {
    fontFamily: typography.fontFamily,
    fontSize: 12,
    color: colors.deficit,
    marginTop: space.sm,
  },
});
