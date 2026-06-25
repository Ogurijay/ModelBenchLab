import { describe, expect, it } from 'vitest';
import { inlineBuiltAssets } from '../scripts/build-standalone.mjs';

describe('standalone build helper', () => {
  it('inlines built CSS and JS assets into a single HTML document', () => {
    const html = [
      '<!doctype html>',
      '<html>',
      '<head>',
      '  <link rel="stylesheet" crossorigin href="/assets/app.css">',
      '  <script type="module" crossorigin src="/assets/app.js"></script>',
      '</head>',
      '<body><canvas id="ocean-canvas"></canvas></body>',
      '</html>'
    ].join('\n');

    const output = inlineBuiltAssets(html, {
      readAsset(assetPath) {
        if (assetPath === 'assets/app.css') return 'body { margin: 0; }';
        if (assetPath === 'assets/app.js') return 'console.log("ocean");';
        throw new Error(`Unexpected asset: ${assetPath}`);
      }
    });

    expect(output).toContain('<style data-standalone-asset="assets/app.css">');
    expect(output).toContain('body { margin: 0; }');
    expect(output).toContain('<script type="module" data-standalone-asset="assets/app.js">');
    expect(output).toContain('console.log("ocean");');
    expect(output).not.toContain('href="/assets/app.css"');
    expect(output).not.toContain('src="/assets/app.js"');
  });
});
