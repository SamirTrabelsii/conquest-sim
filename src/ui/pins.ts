import { config } from '../config';
import { theme } from '../theme';
import { h, px, sticker, text } from './dom';
import { duration, wait } from './clock';

type Point = [number, number];

export interface Pin {
  label: string;
  color: string;
  textColor: string;
  at: Point; // stage pixel the stem points to
}

const SVG_NS = 'http://www.w3.org/2000/svg';

// Name stickers on the map, each with a stem down to its country, so viewers
// who can't place Kuwait or Palau still know who is who.
export class Pins {
  private layer: HTMLElement;
  private stems: SVGSVGElement;

  constructor(stage: HTMLElement) {
    const { width, height } = config.stage;
    this.stems = document.createElementNS(SVG_NS, 'svg');
    this.stems.setAttribute('width', String(width));
    this.stems.setAttribute('height', String(height));
    Object.assign(this.stems.style, { position: 'absolute', left: '0', top: '0' });
    this.layer = h('div', { position: 'absolute', inset: '0', pointerEvents: 'none' }, [this.stems]);
    stage.appendChild(this.layer);
  }

  show(pins: Pin[]): void {
    this.clearNow();
    const { stem, dot } = theme.size.pin;
    const { left, right } = theme.layout.safe;
    const minTop = config.camera.box.top;

    const nodes = pins.map((p) => {
      const node = sticker(p.color, [text(p.label, 'display', theme.size.name, p.textColor)], {
        position: 'absolute',
        padding: `${px(theme.size.gap / 3)} ${px(theme.size.gap)}`,
      });
      this.layer.appendChild(node);
      return node;
    });

    // Centre each pin over its point, then push overlapping pins apart.
    const boxes = pins.map((p, i) => ({ x: p.at[0], w: nodes[i].offsetWidth, hgt: nodes[i].offsetHeight }));
    if (boxes.length === 2) {
      const [a, b] = boxes[0].x <= boxes[1].x ? [boxes[0], boxes[1]] : [boxes[1], boxes[0]];
      const need = (a.w + b.w) / 2 + theme.size.gap;
      if (b.x - a.x < need) {
        const mid = (a.x + b.x) / 2;
        a.x = mid - need / 2;
        b.x = mid + need / 2;
      }
    }

    pins.forEach((p, i) => {
      const { w, hgt } = boxes[i];
      const x = Math.min(Math.max(boxes[i].x - w / 2, left), right - w);
      const y = Math.max(p.at[1] - stem - hgt, minTop);
      Object.assign(nodes[i].style, { left: px(x), top: px(y) });
      nodes[i].animate([{ transform: 'scale(0)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], {
        duration: duration(config.timing.pinIn),
        easing: theme.motion.pop,
      });

      const line = document.createElementNS(SVG_NS, 'line');
      const attrs = { x1: x + w / 2, y1: y + hgt, x2: p.at[0], y2: p.at[1], stroke: theme.color.sticker, 'stroke-width': theme.shape.stickerWidth };
      for (const [k, v] of Object.entries(attrs)) line.setAttribute(k, String(v));
      const end = document.createElementNS(SVG_NS, 'circle');
      const endAttrs = { cx: p.at[0], cy: p.at[1], r: dot, fill: p.color, stroke: theme.color.sticker, 'stroke-width': theme.shape.stickerWidth };
      for (const [k, v] of Object.entries(endAttrs)) end.setAttribute(k, String(v));
      this.stems.append(line, end);
    });
  }

  async clear(): Promise<void> {
    const nodes = [...this.layer.children].filter((n) => n !== this.stems) as HTMLElement[];
    for (const n of [...nodes, this.stems as unknown as HTMLElement])
      n.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration(config.timing.pinIn), fill: 'forwards' });
    await wait(config.timing.pinIn);
    this.clearNow();
  }

  private clearNow(): void {
    for (const n of [...this.layer.children]) if (n !== this.stems) n.remove();
    this.stems.replaceChildren();
    this.stems.getAnimations().forEach((a) => a.cancel());
  }
}
