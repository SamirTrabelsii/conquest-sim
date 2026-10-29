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
