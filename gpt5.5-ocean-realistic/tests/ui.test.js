import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('Chinese interface copy', () => {
  it('uses Chinese labels for the visible HUD and browser title', () => {
    const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

    for (const copy of ['GPT 真实海面模拟', '版本', '海况', '帧率', '顶点数']) {
      expect(html).toContain(copy);
    }

    expect(html).not.toContain('Realistic Ocean');
    expect(html).not.toContain('realistic ocean simulation');
  });

  it('uses Chinese labels in the control panel', () => {
    const panel = readFileSync(new URL('../src/ui/panel.js', import.meta.url), 'utf8');

    for (const copy of [
      '风暴海面控制',
      '风暴版本',
      '物理风暴',
      '电影风暴',
      '极端灾害',
      '天气强度',
      '海面物理',
      '重置风暴'
    ]) {
      expect(panel).toContain(copy);
    }
  });

  it('exposes weather, rain, and tornado controls instead of only ocean controls', () => {
    const panel = readFileSync(new URL('../src/ui/panel.js', import.meta.url), 'utf8');

    for (const setting of [
      'rainDensity',
      'rainVisibility',
      'waterSpoutScale',
      'waterSpoutIntensity',
      'cloudDarkness',
      'fogDensity',
      'lightningFrequency',
      'lightningEnergy'
    ]) {
      expect(panel).toContain(setting);
    }
  });
});
