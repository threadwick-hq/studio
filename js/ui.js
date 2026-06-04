// ui.js — minimal DOM helpers + a modal, so the panel code stays declarative.

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v === true) node.setAttribute(k, '');
    else if (v !== false && v != null) node.setAttribute(k, v);
  }
  for (const c of [].concat(children)) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export function openModal(title, bodyNode, { actions = [], onClose } = {}) {
  const root = document.getElementById('modal-root');
  const close = () => {
    backdrop.remove();
    onClose && onClose();
  };
  const footer = el('div', { class: 'modal-footer' },
    actions.map((a) =>
      el('button', { class: 'btn ' + (a.primary ? 'btn-primary' : ''), onclick: () => a.onClick(close) }, a.label)
    )
  );
  const panel = el('div', { class: 'modal' }, [
    el('div', { class: 'modal-head' }, [
      el('h2', { text: title }),
      el('button', { class: 'icon-btn', title: 'Close', onclick: close, html: '&times;' }),
    ]),
    el('div', { class: 'modal-body' }, bodyNode),
    footer,
  ]);
  const backdrop = el('div', { class: 'modal-backdrop', onclick: (e) => { if (e.target === backdrop) close(); } }, panel);
  root.appendChild(backdrop);
  return { close, panel };
}
