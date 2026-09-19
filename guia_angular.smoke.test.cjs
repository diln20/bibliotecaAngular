const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync(`${__dirname}/guia_angular_previsualizaciones_formularios_v27.html`, 'utf8');
assert.ok(!html.includes('\uFFFD'), 'Damaged Unicode characters in the guide');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)]
  .filter(match => !/\bsrc\s*=/.test(match[1])).map(match => match[2]);
scripts.forEach((code, i) => new vm.Script(code, { filename: `inline-${i + 1}.js` }));
// Live Server injects reload scripts before literal closing body/html tags,
// even inside JavaScript strings. Preview templates must escape those tags.
scripts.forEach(code => assert.doesNotMatch(code, /<\/(?:body|html)>/i));
assert.match(html, /<\/script>\s*<\/body>\s*<\/html>\s*$/);

const lab = scripts.find(code => code.includes('function createPreviewDocument'));
const previewCode = lab.slice(lab.indexOf('  function createPreviewDocument'), lab.indexOf('  function runCurrent'));
const createPreview = vm.runInNewContext(`${previewCode}; createPreviewDocument`);
for (const [language, code] of [['html', '<p>Hola</p>'], ['css', 'button {color: red}'], ['javascript', 'console.log("Hola")']]) {
  const doc = createPreview(code, language);
  assert.match(doc, /<\/body><\/html>\s*$/);
  assert.ok(doc.includes(code));
}

// Angular source must remain text, even when it contains a closing script tag.
const angular = '{{ nombre }} </script><img src=x onerror=alert(1)>';
const doc = createPreview(angular, 'html');
assert.equal([...doc.matchAll(/<\/script>/g)].length, 1);
const embedded = doc.match(/<script>([\s\S]*?)<\/script>/)[1];
const pre = {};
vm.runInNewContext(embedded, { document: { querySelector: () => pre } });
assert.equal(pre.textContent, angular);
assert.match(html, /<iframe sandbox="allow-scripts" class="lab-preview"/);

// One click must open the mobile menu; competing handlers used to close it again.
assert.equal(scripts.join('\n').match(/menuBtn\??\.addEventListener\('click'/g).length, 1);
assert.ok(scripts.some(code => code.includes("getElementById('themeBtn')")));
assert.ok(!lab.includes("getElementById('themeBtn')"));
// Icon markup needs both its stylesheet and the helper used by live controls.
assert.match(html, /<style id="guide-icons">[\s\S]*?svg\.guide-icon\{[\s\S]*?fill:none;stroke:currentColor/);
const iconScript = scripts.find(code => code.includes('function guideIcon(name)'));
assert.ok(iconScript, 'Missing dynamic icon helper');
const helper = iconScript.slice(iconScript.indexOf('  function guideIcon'), iconScript.indexOf('  const sidebar'));
const guideIcon = vm.runInNewContext(`${helper}; guideIcon`);
for (const name of ['moon', 'sun', 'star', 'focus', 'exit']) {
  assert.ok(html.includes(`id="guide-icon-${name}"`));
  assert.ok(guideIcon(name).includes(`href="#guide-icon-${name}"`));
}
const demoScript = scripts.find(code => code.includes('const demos ='));
const workbenches = [...html.matchAll(/data-css-demo="([^"]+)"/g)].map(([, key]) => {
  const node = dataset => ({
    dataset, hidden: false, attributes: {}, listeners: {},
    classList: { active: false, toggle(name, value) { this[name] = value; }, contains(name) { return !!this[name]; } },
    setAttribute(name, value) { this.attributes[name] = value; },
    addEventListener(name, callback) { this.listeners[name] = callback; }
  });
  const tabs = ['html', 'css', 'result'].map(value => node({ cssDemoTab: value }));
  const panels = ['html', 'css', 'result'].map(value => node({ cssDemoPanel: value }));
  const frame = node({});
  return {
    dataset: { cssDemo: key }, tabs, panels, frame,
    querySelectorAll: selector => selector.includes('-tab]') ? tabs : panels,
    querySelector: selector => selector.includes('-frame]') ? frame : null
  };
});
// Initialize with no DOMContentLoaded event or external library available.
vm.runInNewContext(demoScript, { document: { querySelectorAll: () => workbenches } });
assert.equal(workbenches.length, 74);
assert.ok(html.indexOf('function initializeCssDemos') < html.indexOf('<script src='));
for (const workbench of workbenches) {
  assert.equal(workbench.panels[2].hidden, false);
  assert.match(workbench.frame.srcdoc, /<strong>Antes<\/strong>/);
  assert.match(workbench.frame.srcdoc, /<strong>Después<\/strong>/);
  for (const [index, tab] of workbench.tabs.entries()) {
    tab.listeners.click();
    assert.equal(tab.attributes['aria-selected'], 'true');
    workbench.panels.forEach((panel, i) => assert.equal(panel.hidden, i !== index));
  }
}
console.log(`OK: ${scripts.length} scripts, ${workbenches.length} interactive CSS demos, previews, mobile menu and icons.`);
