import { theme } from '../theme';
import { config } from '../config';

type Style = Partial<CSSStyleDeclaration>;

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  style: Style = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  Object.assign(node.style, style);
  node.append(...children);
  return node;
}

export const px = (n: number) => `${n}px`;

// Text in one of the theme's type presets. Sizes below the readability
// floor are raised to it, so nothing unreadable reaches the video.
export function text(
  content: string,
  preset: keyof typeof theme.type,
  size: number,
  color: string,
  extra: Style = {},
): HTMLDivElement {
  return h('div', { ...theme.type[preset], fontSize: px(Math.max(size, theme.size.min)), color, ...extra }, [content]);
}

// The theme's sticker look: white cut-out edge and a hard drop shadow.
export function stickerEdge(radius: number = theme.size.radius): Style {
  const { stickerWidth, shadowOffset } = theme.shape;
  return {
    border: `${px(stickerWidth)} solid ${theme.color.sticker}`,
    borderRadius: px(radius),
    boxShadow: `0 ${px(shadowOffset)} 0 ${theme.color.shadow}`,
  };
}

// A bar of content styled as a sticker (slanted too if the theme has a skew;
// the content is counter-skewed so text stays upright).
export function sticker(background: string, children: (Node | string)[], style: Style = {}): HTMLDivElement {
  const { skew } = theme.shape;
  const inner = h('div', { transform: skew ? `skewX(${-skew}deg)` : '', display: 'flex', alignItems: 'center', whiteSpace: 'nowrap' }, children);
  return h('div', {
    background,
    transform: skew ? `skewX(${skew}deg)` : '',
    display: 'flex',
    alignItems: 'center',
    ...stickerEdge(),
    ...style,
  }, [inner]);
}

export function flagImg(url: string, width: number, style: Style = {}): HTMLImageElement {
  const img = h('img', {
    width: px(width),
    height: px(width / config.map.flagAspect),
    objectFit: 'cover',
    display: 'block',
    boxSizing: 'border-box',
    ...style,
  });
  img.src = url;
  return img;
}

// A share of world land (0..1) as a percentage that never reads "0.0%":
// tiny countries get more decimals.
const SHARE_FLOOR = 0.01; // percent
export function formatShare(share: number): string {
  const pct = share * 100;
  if (pct > 0 && pct < SHARE_FLOOR) return `<${SHARE_FLOOR}%`;
  return `${pct.toFixed(pct < 0.1 ? 2 : 1)}%`;
}
