import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const indexUrl = new URL('../index.html', import.meta.url);

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
});
