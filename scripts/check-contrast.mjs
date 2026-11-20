// Checks the Lintora design tokens (docs/DESIGN.md, app/globals.css) against WCAG AA:
// 4.5:1 for text pairs. Run: node scripts/check-contrast.mjs
const L = (hex) => {
  const c = hex.replace('#', '').match(/../g).map((x) => parseInt(x, 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
};
const ratio = (a, b) => { const [x, y] = [L(a), L(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
const themes = {
  light: { canvas: '#F4F6FB', surface: '#FFFFFF', 'surface-2': '#EBEFF8', ink: '#0E1733', 'ink-2': '#46506B', muted: '#5F6987', cobalt: '#1F3FBF',
    'cobalt-soft': '#E4E9FB', 'highlight-ink': '#7A5600', 'highlight-soft': '#FFF3C4', fail: '#B42318', 'fail-soft': '#FDECEA', pass: '#0E7A4F', 'pass-soft': '#E3F4EC',
    wait: '#8A5300', 'wait-soft': '#FBF0DD', ai: '#0F6E8C', 'ai-soft': '#E2F3F8' },
  dark: { canvas: '#0A1226', surface: '#101B36', 'surface-2': '#16244A', ink: '#E7ECF8', 'ink-2': '#AEB8D3', muted: '#8C97B6', cobalt: '#7D9BFF',
    'cobalt-soft': '#1B2A5C', 'highlight-ink': '#FFE27A', 'highlight-soft': '#3A3415', fail: '#FF8A80', 'fail-soft': '#3A1A22', pass: '#5BD7A0', 'pass-soft': '#0F3330',
    wait: '#F5B85C', 'wait-soft': '#3A2C16', ai: '#5CD0F0', 'ai-soft': '#0E3040' },
};
const pairs = [['ink', 'canvas'], ['ink', 'surface'], ['ink-2', 'surface'], ['muted', 'canvas'], ['muted', 'surface'], ['muted', 'surface-2'], ['cobalt', 'surface'],
  ['cobalt', 'cobalt-soft'], ['highlight-ink', 'highlight-soft'], ['fail', 'fail-soft'], ['pass', 'pass-soft'], ['wait', 'wait-soft'], ['ai', 'ai-soft'], ['ai', 'surface'], ['fail', 'surface']];
let bad = 0;
for (const [name, t] of Object.entries(themes)) for (const [fg, bg] of pairs) {
  const r = ratio(t[fg], t[bg]); if (r < 4.5) bad++;
  console.log(`${r >= 4.5 ? 'pass' : 'FAIL'} ${name.padEnd(5)} ${fg} on ${bg}: ${r.toFixed(2)}`);
}
// Fixed pairs: ink text on the highlighter, white on cobalt buttons, rail labels.
for (const [fg, bg, label] of [['#0E1733', '#FFD43B', 'ink on highlighter'], ['#FFFFFF', '#1F3FBF', 'white on cobalt button'], ['#0A1226', '#7D9BFF', 'night on dark cobalt button'],
  ['#C9D3F5', '#0F1F66', 'rail label (light)'], ['#C9D3F5', '#060C1C', 'rail label (dark)'], ['#0F1F66', '#FFFFFF', 'active rail item']]) {
  const r = ratio(fg, bg); if (r < 4.5) bad++; console.log(`${r >= 4.5 ? 'pass' : 'FAIL'} fixed ${label}: ${r.toFixed(2)}`);
}
process.exit(bad ? 1 : 0);
