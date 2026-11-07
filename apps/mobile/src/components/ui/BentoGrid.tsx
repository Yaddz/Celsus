import React from 'react';
import { StyleProp, Text, TextStyle, View, ViewStyle } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { JellyPressable } from './JellyPressable';
import { bento, BentoVariant, colors, typography } from '../../theme/tokens';

export interface BentoGridProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Contêiner vertical do bento: tiles/linhas separados por `bento.gap`. */
export const BentoGrid: React.FC<BentoGridProps> = ({ children, style, testID }) => (
  <View testID={testID} style={[{ gap: bento.gap }, style]}>
    {children}
  </View>
);

export interface BentoRowProps {
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Linha horizontal: cada tile usa `span` (flex, padrão 1) para dividir a largura. */
export const BentoRow: React.FC<BentoRowProps> = ({ children, style, testID }) => (
  <View testID={testID} style={[{ flexDirection: 'row', gap: bento.gap }, style]}>
    {React.Children.map(children, (child) =>
      React.isValidElement<BentoTileProps>(child) && child.type === BentoTile && child.props.span === undefined
        ? React.cloneElement(child, { span: 1 })
        : child
    )}
  </View>
);

export interface BentoTileProps {
  variant?: BentoVariant;
  /** Fração da linha (flex). Só tem efeito dentro de `BentoRow`, onde o padrão é 1. */
  span?: number;
  /** Altura fixa opcional (para tiles altos 1x2 / 2x2). */
  height?: number;
  title?: string;
  /** Texto à direita do título (ex.: "Ver tudo →"). */
  action?: string;
  onActionPress?: () => void;
  onPress?: () => void;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}

/** Tile do bento: cantos 28, paleta por variante, título em caixa alta. */
export const BentoTile: React.FC<BentoTileProps> = ({
  variant = 'dark',
  span,
  height,
  title,
  action,
  onActionPress,
  onPress,
  children,
  style,
  testID,
  accessibilityLabel,
}) => {
  const v = bento.variants[variant];
  const tileStyle: ViewStyle = {
    ...(span === undefined ? null : { flex: span }),
    minHeight: height ?? bento.tileMinHeight,
    ...(height ? { height } : null),
    backgroundColor: v.background,
    borderRadius: bento.tileRadius,
    padding: bento.tilePadding,
    overflow: 'hidden',
  };
  const titleStyle: TextStyle = {
    fontFamily: typography.fontFamilyMono,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: v.muted,
  };
  const body = (
    <>
      {title || action ? (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
          {title ? <Text style={titleStyle}>{title}</Text> : <View />}
          {action ? (
            <Text
              accessibilityRole="button"
              onPress={onActionPress}
              style={[titleStyle, { color: colors.primary }]}
              testID={testID ? `${testID}-action` : undefined}
            >
              {action}
            </Text>
          ) : null}
        </View>
      ) : null}
      {children}
    </>
  );
  if (onPress) {
    return (
      <JellyPressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel ?? title}
        onPress={onPress}
        containerStyle={span === undefined ? undefined : { flex: span }}
        style={[tileStyle, { flex: undefined, flexGrow: 1 }, style]}
      >
        {body}
      </JellyPressable>
    );
  }
  return (
    <View testID={testID} style={[tileStyle, style]}>
      {body}
    </View>
  );
};

export interface BentoSectionProps {
  title?: string;
  themeMode?: 'dark' | 'light';
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Seção de formulário/lista dentro de um sheet ou tela: um BentoTile com a variante do tema. */
export const BentoSection: React.FC<BentoSectionProps> = ({ title, themeMode = 'dark', children, style, testID }) => (
  <BentoTile variant={themeMode === 'light' ? 'light' : 'dark'} title={title} style={style} testID={testID}>
    {children}
  </BentoTile>
);

export interface BentoSheetHeaderProps {
  title: string;
  subtitle?: string;
  onClose: () => void;
  themeMode?: 'dark' | 'light';
  closeTestID?: string;
}

/** Cabeçalho padrão dos sheets: título em caixa alta, subtítulo opcional e botão de fechar. */
export const BentoSheetHeader: React.FC<BentoSheetHeaderProps> = ({ title, subtitle, onClose, themeMode = 'dark', closeTestID }) => {
  const fg = bento.variants[themeMode === 'light' ? 'light' : 'dark'].foreground;
  const muted = bento.variants[themeMode === 'light' ? 'light' : 'dark'].muted;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: bento.gap }}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ fontFamily: typography.fontFamily, fontSize: 15, fontWeight: '700', letterSpacing: 0.6, color: fg }}>{title}</Text>
        {subtitle ? <Text style={{ fontFamily: typography.fontFamily, fontSize: 12, color: muted, marginTop: 2 }}>{subtitle}</Text> : null}
      </View>
      <JellyPressable
        testID={closeTestID}
        accessibilityRole="button"
        accessibilityLabel="Fechar"
        onPress={onClose}
        style={{ width: 36, height: 36, borderRadius: bento.innerRadius, alignItems: 'center', justifyContent: 'center', backgroundColor: themeMode === 'light' ? '#EAE4D7' : '#2A2D30' }}
      >
        <MaterialIcons name="close" size={20} color={fg} />
      </JellyPressable>
    </View>
  );
};

export const bentoTextColors = (variant: BentoVariant) => bento.variants[variant];
