import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexUrl = new URL('../index.html', import.meta.url);
const mainUrl = new URL('../src/main.js', import.meta.url);

describe('ocean page markup', () => {
  it('exposes the canvas, three preset buttons, fallback, and entry module', () => {
    const html = readFileSync(indexUrl, 'utf8');

    expect(html.match(/id="ocean-canvas"/g)).toHaveLength(1);
    expect(html.match(/class="preset-button/g)).toHaveLength(3);
    expect(html).toContain('data-preset="noon"');
    expect(html).toContain('data-preset="dawn"');
    expect(html).toContain('data-preset="overcast"');
    expect(html.match(/id="error-panel"/g)).toHaveLength(1);
    expect(html).toContain('type="module" src="/src/main.js"');
  });

  it('exposes an independent storm toggle with accessible state and shortcut hint', () => {
    const html = readFileSync(indexUrl, 'utf8');

    expect(html.match(/id="storm-toggle"/g)).toHaveLength(1);
    expect(html).toContain('id="storm-toggle" class="storm-button"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('<b>风暴</b>');
    expect(html).toMatch(/S\s*键切换风暴/);
  });

  it('uses the current Three.js Timer API without deprecated Clock', () => {
    const source = readFileSync(mainUrl, 'utf8');

    expect(source).not.toContain('new THREE.Clock');
    expect(source).toContain('new THREE.Timer');
    expect(source).toContain('timer.update(timestamp)');
    expect(source).toContain('timer.dispose()');
  });
});
