const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src', 'components', 'location', 'FamilyMapView.tsx'), 'utf8');
const start = source.indexOf('const mapHtmlSource = `') + 'const mapHtmlSource = `'.length;
const end = source.indexOf('`;\n\nexport function FamilyMapView', start);
if (start < 22 || end < 0) throw new Error('Map HTML template not found');

const leafletDist = path.join(root, 'node_modules', 'leaflet', 'dist');
const assets = fs.readFileSync(path.join(root, 'src', 'lib', 'leafletAssets.generated.ts'), 'utf8');
const js = fs.readFileSync(path.join(leafletDist, 'leaflet.js'), 'utf8');
let css = fs.readFileSync(path.join(leafletDist, 'leaflet.css'), 'utf8');
css = css.replace(/url\(["']?(images\/[^)'" ]+)["']?\)/g, (_match, imagePath) => {
  return `url(data:image/png;base64,${fs.readFileSync(path.join(leafletDist, imagePath)).toString('base64')})`;
});
if (![js, css].every(asset => assets.includes(JSON.stringify(asset)))) throw new Error('Generated map assets are out of date');

let html = source.slice(start, end)
  .replace('${leafletCss}', css).replace('${leafletJs}', js);
html = html.replace('<script>\n    function startMap()', `<script>
    window.ReactNativeWebView = { postMessage: function(value) {
      var data = JSON.parse(value);
      document.getElementById('qa-status').textContent = data.type;
      if (data.type === 'ready') document.dispatchEvent(new MessageEvent('message', { data: JSON.stringify({
        type: 'update', locations: [{ user_id: 'test', latitude: -23.5505, longitude: -46.6333, name: 'Teste', color: '#4f46e5', device_type: 'mobile' }],
        zones: [], userPosition: null, currentUserId: '', selectedUserId: null, isDrawingMode: false, draftZone: null, autoFit: true
      }) }));
    } };
  </script><div id="qa-status" style="position:absolute;top:12px;left:12px;z-index:9999;background:#fff;padding:8px">Loading</div><script>
    function startMap()`);
if (/\$\{leaflet/.test(html)) throw new Error('Unexpanded map HTML template value');
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
if (scripts.length !== 3) throw new Error(`Expected 3 local scripts, found ${scripts.length}`);
scripts.forEach(([_, body], index) => new vm.Script(body, { filename: `map-script-${index}.js` }));
const output = path.join(root, '..', 'audit-output', 'mapa-1.0.5.html');
fs.writeFileSync(output, html);
console.log(`${output} (${scripts.length} valid local scripts)`);
