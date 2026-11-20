/**
 * The bookmarklet's UI: a small card on top of last.fm, isolated in a Shadow DOM so neither page's
 * styles leak into the other.
 */

export type OverlayState =
  | { kind: 'form'; username: string; year: number; debug: boolean; error?: string }
  | { kind: 'progress'; title: string; detail: string; fraction: number | null; tone?: 'wait' }
  | { kind: 'error'; message: string; canDownload: boolean }
  | { kind: 'done'; count: number; warnings: string[]; continueUrl: string; debug: boolean };

export interface OverlayHandlers {
  onStart: (username: string, year: number, debug: boolean) => void;
  onRetry: () => void;
  onDownload: () => void;
  onClose: () => void;
}

const CSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.card {
  position: fixed; top: 16px; right: 16px; z-index: 2147483647;
  width: min(360px, calc(100vw - 32px));
  font: 15px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  color: #1a1a1a; background: #fff; border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0,0,0,.25), 0 0 0 1px rgba(0,0,0,.06);
  padding: 16px 18px 18px;
}
@media (prefers-color-scheme: dark) {
  .card { color: #f2f2f2; background: #1e1e1e; box-shadow: 0 12px 40px rgba(0,0,0,.6), 0 0 0 1px rgba(255,255,255,.08); }
  input { background: #2a2a2a; color: inherit; border-color: #444; }
  .muted { color: #aaa !important; }
  .bar { background: #333 !important; }
}
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; }
.brand { font-weight: 700; letter-spacing: .02em; }
.x { all: unset; cursor: pointer; font-size: 22px; line-height: 1; padding: 2px 6px; opacity: .6; }
.x:hover { opacity: 1; }
h2 { font-size: 17px; margin: 0 0 4px; }
p { margin: 0 0 10px; }
.muted { color: #666; font-size: 13px; }
label { display: block; font-size: 13px; margin: 8px 0 4px; }
.row { display: flex; gap: 8px; }
.row > :first-child { flex: 1; }
input[type=text], input[type=number] {
  width: 100%; font: inherit; padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px;
}
input[type=number] { width: 90px; }
.check { display: flex; gap: 6px; align-items: center; font-size: 13px; margin-top: 10px; }
.btns { display: flex; gap: 8px; margin-top: 14px; flex-wrap: wrap; }
button.primary, button.secondary, a.primary {
  all: unset; cursor: pointer; text-align: center; padding: 9px 14px; border-radius: 8px; font-weight: 600;
}
button.primary, a.primary { background: #d51007; color: #fff; }
button.primary:hover, a.primary:hover { background: #b30d05; }
button.secondary { box-shadow: inset 0 0 0 1px currentColor; opacity: .8; }
.bar { height: 6px; background: #eee; border-radius: 3px; overflow: hidden; margin-top: 10px; }
.fill { height: 100%; background: #d51007; transition: width .2s; }
.fill.indeterminate { width: 30% !important; animation: slide 1.2s infinite ease-in-out; }
.wait .fill { background: #e8a33d; }
@keyframes slide { from { margin-left: -30%; } to { margin-left: 100%; } }
.error { color: #d51007; font-size: 13px; margin-top: 8px; }
ul { margin: 6px 0 0; padding-left: 18px; font-size: 13px; }
`;

export class Overlay {
  private host = document.createElement('div');
  private root = this.host.attachShadow({ mode: 'open' });
  private body: HTMLElement;

  constructor(private handlers: OverlayHandlers) {
    this.host.id = 'lastfmyear-overlay';
    const style = document.createElement('style');
    style.textContent = CSS;
    const card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = `<div class="head"><span class="brand" title="lastfmyear: independent, not part of Last.fm">lastfmyear</span><button class="x" aria-label="Close">×</button></div><div class="body"></div>`;
    card.querySelector('.x')!.addEventListener('click', () => handlers.onClose());
    this.body = card.querySelector('.body')!;
    this.root.append(style, card);
    document.body.append(this.host);
  }

  remove() {
    this.host.remove();
  }

  render(state: OverlayState) {
    const b = this.body;
    b.replaceChildren();
    switch (state.kind) {
      case 'form': {
        b.append(
          el('h2', {}, 'Your concerts of the year'),
          el('p', { class: 'muted' }, 'Reads your public events page on last.fm, then opens lastfmyear.'),
          el('label', { for: 'u' }, 'last.fm username'),
        );
        const u = el('input', {
          id: 'u',
          type: 'text',
          value: state.username,
          autocapitalize: 'off',
          spellcheck: 'false',
        });
        const y = el('input', {
          id: 'y',
          type: 'number',
          value: String(state.year),
          min: '2002',
          max: '2100',
        });
        const row = el('div', { class: 'row' });
        row.append(u, y);
        const dbg = el('input', { type: 'checkbox', id: 'd' });
        dbg.checked = state.debug;
        const check = el('label', { class: 'check', for: 'd' });
        check.append(dbg, document.createTextNode('Keep raw pages for a bug report'));
        const go = el('button', { class: 'primary' }, 'Collect concerts');
        const submit = () => this.handlers.onStart(u.value.trim(), Number(y.value), dbg.checked);
        go.addEventListener('click', submit);
        for (const input of [u, y]) input.addEventListener('keydown', (e) => e.key === 'Enter' && submit());
        b.append(row, check);
        if (state.error) b.append(el('div', { class: 'error' }, state.error));
        b.append(btns(go));
        setTimeout(() => (state.username ? y : u).focus(), 0);
        break;
      }
      case 'progress': {
        const bar = el('div', { class: 'bar' + (state.tone === 'wait' ? ' wait' : '') });
        const fill = el('div', { class: 'fill' + (state.fraction === null ? ' indeterminate' : '') });
        fill.style.width = `${Math.round((state.fraction ?? 0) * 100)}%`;
        bar.append(fill);
        b.append(el('h2', {}, state.title), el('p', { class: 'muted' }, state.detail), bar);
        break;
      }
      case 'error': {
        const retry = el('button', { class: 'primary' }, 'Retry');
        retry.addEventListener('click', () => this.handlers.onRetry());
        const parts: HTMLElement[] = [retry];
        if (state.canDownload) parts.push(downloadButton(() => this.handlers.onDownload()));
        b.append(el('h2', {}, 'Something went wrong'), el('p', {}, state.message), btns(...parts));
        break;
      }
      case 'done': {
        b.append(el('h2', {}, `Found ${state.count} concert${state.count === 1 ? '' : 's'}`));
        if (state.warnings.length) {
          const ul = el('ul');
          for (const w of state.warnings) ul.append(el('li', {}, w));
          b.append(ul);
        }
        b.append(el('p', { class: 'muted' }, state.debug ? '' : 'Opening lastfmyear…'));
        const open = el('a', { class: 'primary', href: state.continueUrl }, 'Open lastfmyear');
        b.append(btns(open, ...(state.debug ? [downloadButton(() => this.handlers.onDownload())] : [])));
        break;
      }
    }
  }
}

function downloadButton(onClick: () => void) {
  const d = el('button', { class: 'secondary' }, 'Download debug data');
  d.addEventListener('click', onClick);
  return d;
}

function btns(...children: HTMLElement[]) {
  const div = el('div', { class: 'btns' });
  div.append(...children);
  return div;
}

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Record<string, string> = {},
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}
