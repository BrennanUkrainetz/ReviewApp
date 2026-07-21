/**
 * A very small element builder. Not a framework — just enough sugar to write
 * declarative DOM without a wall of `createElement` boilerplate.
 */

export type Child = Node | string | number | null | undefined | false;

export interface ElementProps {
  class?: string | (string | false | null | undefined)[];
  text?: string | number;
  /** Trusted markup only — never pass user input. Used for inline SVG. */
  html?: string;
  attrs?: Record<string, string | number | boolean | null | undefined>;
  dataset?: Record<string, string | number | undefined>;
  style?: Partial<Record<string, string>>;
  on?: Partial<{
    [K in keyof HTMLElementEventMap]: (event: HTMLElementEventMap[K]) => void;
  }>;
}

function applyProps(node: HTMLElement, props: ElementProps): void {
  if (props.class) {
    const classes = Array.isArray(props.class) ? props.class : [props.class];
    node.className = classes.filter(Boolean).join(' ');
  }
  if (props.text !== undefined) node.textContent = String(props.text);
  if (props.html !== undefined) node.innerHTML = props.html;

  for (const [key, value] of Object.entries(props.attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const [key, value] of Object.entries(props.dataset ?? {})) {
    if (value === undefined) continue;
    node.dataset[key] = String(value);
  }
  for (const [key, value] of Object.entries(props.style ?? {})) {
    if (value === undefined) continue;
    node.style.setProperty(key, value);
  }
  for (const [event, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(event, handler as EventListener);
  }
}

export function append(parent: Node, children: Child[]): void {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    parent.appendChild(
      typeof child === 'string' || typeof child === 'number'
        ? document.createTextNode(String(child))
        : child,
    );
  }
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElementProps = {},
  ...children: Child[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  applyProps(node, props);
  append(node, children);
  return node;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG counterpart of `el` — attributes only, since SVG has no `className`. */
export function svg<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number | undefined> = {},
  ...children: (SVGElement | string | null | false)[]
): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  for (const child of children) {
    if (!child) continue;
    node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return node;
}

export function clear(node: Node): void {
  while (node.firstChild) node.removeChild(node.firstChild);
}

/** Replaces a node's children in one shot. */
export function replaceChildren(node: HTMLElement, ...children: Child[]): void {
  clear(node);
  append(node, children);
}

/** Formats a count with thousands separators and tabular digits in mind. */
export function formatNumber(value: number): string {
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

/** `1 day` / `2 days` — small helper so copy stays grammatical. */
export function plural(count: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : pluralForm}`;
}
