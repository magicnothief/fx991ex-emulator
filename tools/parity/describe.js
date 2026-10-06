// Evaluated inside the emulator page by the parity harness: reads the LCD as plain text.
// Natural Display layouts become linear text: fractions a/b, powers ^(…), roots √(…).
(() => {
  const simple = (s) => /^[-−]?[\w.πθ√∠]+$/.test(s);
  const wrap = (s) => (simple(s) ? s : `(${s})`);
  const text = (n) => {
    if (n.nodeType === 3) return n.textContent;
    if (n.nodeType !== 1) return '';
    const c = n.classList;
    if ((c.contains('cursor') && !c.contains('under')) || c.contains('scrollbar') || c.contains('br')) return ''; // the overwrite cursor wraps a character
    const kids = () => [...n.childNodes].map(text).join('');
    if (c.contains('m-mixed')) return [...n.childNodes].map(text).join(' ').replace(/\s+/g, ' ').trim();
    if (c.contains('m-frac')) return `${wrap(text(n.children[0]).trim())}/${wrap(text(n.children[1]).trim())}`;
    if (c.contains('m-sup')) return `^${wrap(kids().trim())}`;
    if (c.contains('m-sub')) return `_${wrap(kids().trim())}`;
    if (c.contains('m-root')) {
      const idx = n.querySelector(':scope > .m-index');
      const rad = n.querySelector(':scope > .m-radicand');
      return `${idx ? text(idx) : ''}√${wrap(text(rad).trim())}`;
    }
    if (c.contains('m-abs')) return `|${kids()}|`;
    if (c.contains('m-limits')) return `_${wrap(text(n.children[1]).trim())}^${wrap(text(n.children[0]).trim())}`;
    if (c.contains('m-stack')) return `Σ_(${text(n.children[2]).trim()})^${wrap(text(n.children[0]).trim())}`;
    if (c.contains('row') && n.tagName === 'DIV') return `${[...n.childNodes].map(text).map((x) => x.trim()).filter(Boolean).join('   ')}
`;
    if (c.contains('m-slot-empty')) return '□';
    if (n.tagName === 'TD' || n.tagName === 'TH') return kids().trim();
    if (n.tagName === 'TR') return `${[...n.children].map(text).filter(Boolean).join(' | ')}\n`;
    if (n.tagName === 'BR') return '\n';
    if (n.tagName === 'DIV') return `${kids()}\n`;
    return kids();
  };
  return text(document.getElementById('screen'))
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n');
})()
