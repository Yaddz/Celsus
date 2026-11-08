# Celsus — Design system (Bento)

Fonte da verdade no código: `apps/mobile/src/theme/tokens.ts` (cores, tipografia, espaçamento, `layout`, `bento`),
`theme/palettes.ts` (paletas por carteira e temas claro/escuro) e `src/components/ui`.
Inspirações visuais: pasta local `imgsinsp/` (fora do git) com referências de XP, BTG, Pierre, Investidor10 e as paletas de *Disco Elysium*.

## Princípios
- **Bento:** a tela é uma grade de tiles de cantos grandes, fundo escuro `#111315`, tiles `#1C1E20`, sem bordas nem brilhos.
- **Uma ideia por tile**, número grande e rótulo pequeno em caixa-alta; ação principal em laranja.
- **Sem dado inventado:** valor ausente = "—". Nunca 0, nunca valor padrão disfarçado de real.
- **Mesma estrutura em todas as abas:** header idêntico e margens iguais (`layout.tabScreenPaddingX = 16`, `tabScreenPaddingTop = 4`).
- Estados de carregamento com **skeleton** nas mesmas dimensões do conteúdo (sem saltos); troca de carteira sem travar a interface.

## Cores

| Uso | Token | Valor |
| :--- | :--- | :--- |
| Fundo | `colors.voidFloor` | `#111315` |
| Tile padrão | `bento.variants.dark` | `#1C1E20` |
| Primário (ações, CTA) | `colors.primary` | `#D96628` |
| Secundário (verde-floresta) | `colors.secondary` | `#2E4A44` |
| Creme / texto | `colors.parchmentPale` | `#E6DECA` |
| Ouro | `bento.variants.gold` | `#D4A83B` |
| Déficit / negativo | `colors.deficit` | `#B84A1C` |
| Texto secundário | `colors.subtleText` | `#8A8A8E` |

Classes de ativo: Renda fixa `#2E4A44`, FII `#D5CAA8`, Ação `#D96628`, Cripto `#C49A45`.
Tema claro: fundo `#F4F1EA`, tiles `#FFFFFF`, texto `#111315`.
Cada carteira tem uma **paleta** própria (cartão, acento, texto sobre o cartão) em `PORTFOLIO_PALETTES` (Celsus Terracotta, Porto & Containers, Luzes das Docas, Pátio & Ouro…).

## Tipografia
`Space Mono` em todo o app. Números de destaque 26–36 px, títulos de tile 11–12 px em caixa-alta com espaçamento de letras,
corpo 13 px, legendas 10–11 px.

## Bento
`bento.gap = 10`, `tileRadius = 28`, `innerRadius = 18`, `tilePadding = 18`, `tileMinHeight = 96`.
Variantes de tile: `primary` (laranja), `forest`, `cream`, `gold`, `dark`, `light`. Componentes: `BentoGrid`, `BentoRow`, `BentoTile`,
`BentoSection`, `BentoSheetHeader` (`components/ui/BentoGrid.tsx`).

## Componentes-chave
| Componente | Papel |
| :--- | :--- |
| `XpMinimalHeader` | Header padrão (avatar com iniciais e cor da carteira, olho de privacidade, globo; variante voltar + título) |
| `FloatingBottomDock` | Navegação flutuante (Início, Análises, Busca, Carteiras) com pílula animada e botão "+" |
| `StackedWalletDeck` | Cartão da carteira com cartões atrás deslocados 8 px, "notch" com o nome e troca por toque |
| `DotMatrixAllocationCard` | Alocação por classe (preenchimento proporcional à meta); o donut por ativo fica em `ClassDetailScreen` (`domain/donut.ts`) |
| `GoalProgressTile` | Meta de patrimônio |
| `TextField` (`LedgerInput`) | Campo único para todo o app (foco, erro, prefixo/sufixo, adornos) |
| `Skeleton` / `SkeletonSwap` | Carregamento com pulso compartilhado e troca suave |
| `AnimatedModalSheet`, `ConfirmDialog` | Folhas e confirmações |
| `AssetSearchRow`, `RankingTable`, `IndicatorGrid`, `PriceAreaChart`, `DividendsCard`, `StickyAddBar` | Busca e ficha do ativo |

## Movimento
Animações de interface usam o driver nativo (transform/opacity). Respeitam "reduzir movimento" (`useReducedMotion`).
O texto da aba ativa do dock aparece imediatamente ao toque; a troca de tela roda em transição.

## Camadas (Android)
Elevação vem antes de `zIndex` e `Animated.View` cria contexto de empilhamento: elementos que precisam ficar acima das
demais seções (cartão da carteira) definem `zIndex` e `elevation` no próprio wrapper animado.
