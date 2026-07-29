import { formatYear, getCityNameAtYear } from '../data/cities.js';
import { architectureForEra, biomeLabel } from '../world/cities.js';

const CHINESE_NUMERALS = ['壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖', '拾', '拾壹', '拾贰'];
const CONTROL_LABELS = {
  core: '核心区',
  administered: '行政区',
  military: '军政区',
  influence: '影响区',
  tributary: '朝贡 / 册封',
  contested: '争夺区',
  unknown: '史料不足',
};

const REGION_POSITIONS = {
  西亚: [188, 53],
  地中海: [151, 43],
  南亚: [211, 75],
  中亚: [198, 37],
  欧洲: [152, 33],
  西欧: [141, 33],
  东地中海: [168, 44],
  东南亚: [242, 85],
  日本列岛: [270, 50],
  太平洋: [285, 64],
  北美: [48, 42],
  欧亚: [193, 34],
  欧亚北部: [200, 28],
  全球: [115, 25],
  全球海洋: [83, 88],
  埃及: [170, 68],
  中美洲: [45, 63],
};

function element(selector) {
  const node = document.querySelector(selector);
  if (!node) throw new Error(`界面元素不存在: ${selector}`);
  return node;
}

function closestRegionPosition(region, index) {
  const key = Object.keys(REGION_POSITIONS).find((candidate) => region.includes(candidate));
  if (key) return REGION_POSITIONS[key];
  return [135 + (index * 37) % 135, 28 + (index * 23) % 67];
}

function clear(node) {
  node.replaceChildren();
}

function make(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function cityRank(city, era) {
  const founded = Number(city.founded);
  const importance = Number(city.importance) || 2;
  if (Number.isFinite(founded) && era.year < founded) return '推演聚落';
  if (importance >= 5) return '都城 / 核心';
  if (importance === 4) return '区域重镇';
  if (importance === 3) return '交通节点';
  return '地方聚落';
}

function cityDescription(city, era, historicalName) {
  if (!historicalName) {
    return `${city.name}在此年代尚未形成今天可辨识的城市形态；沙盘依据水源、交通与防御地势生成逻辑聚落，不作为考古复原。`;
  }
  return `${city.signature}。当前建筑群采用“${architectureForEra(era).label}”风格包，以固定种子生成街区、道路和地标体量。`;
}

export function createInterface({
  eras,
  cities,
  onEra,
  onPlay,
  onOverview,
  onEvent,
  onCity,
  onFocusCity,
  onLayer,
  onQuality,
  onSegment,
} = {}) {
  const dom = {
    eraKicker: element('#era-kicker'),
    eraHeading: element('#era-heading'),
    eraNumber: element('#era-number'),
    eraPeriod: element('#era-period'),
    eraSummary: element('#era-summary'),
    factionList: element('#faction-list'),
    eventList: element('#event-list'),
    terrainNote: element('#terrain-note p'),
    foreignMarkers: element('#foreign-markers'),
    foreignList: element('#foreign-list'),
    timelineTrack: element('#timeline-track'),
    eraSlider: element('#era-slider'),
    playButton: element('#play-button'),
    playState: element('#play-state'),
    playRangeLabel: element('#play-range-label'),
    segmentStart: element('#segment-start'),
    segmentEnd: element('#segment-end'),
    segmentReset: element('#segment-reset'),
    overviewButton: element('#overview-button'),
    qualityButton: element('#quality-button'),
    qualityLabel: element('#quality-label'),
    atlasPanel: element('.atlas-panel'),
    atlasCollapse: element('#atlas-collapse'),
    cityCard: element('#city-card'),
    cityClose: element('#city-close'),
    cityMonogram: element('#city-monogram'),
    citySource: element('#city-source'),
    cityName: element('#city-name'),
    cityHistoricalName: element('#city-historical-name'),
    cityBiome: element('#city-biome'),
    cityStyle: element('#city-style'),
    cityRank: element('#city-rank'),
    cityDescription: element('#city-description'),
    cityFocus: element('#city-focus'),
    hoverLabel: element('#hover-label'),
    hudMode: element('#hud-mode'),
    hudCities: element('#hud-cities'),
    hudFps: element('#hud-fps'),
    hudDraws: element('#hud-draws'),
    loading: element('#loading'),
    loadingStatus: element('#loading-status'),
  };

  const optionalCitySelect = document.querySelector('#city-select');
  const layerInputs = {
    territory: element('#layer-territory'),
    cities: element('#layer-cities'),
    events: element('#layer-events'),
    labels: element('#layer-labels'),
  };

  let currentEraIndex = 0;
  let selectedCity = null;
  let isPlaying = false;
  let segment = { start: 0, end: eras.length - 1 };

  eras.forEach((era, index) => {
    const tick = make('button', 'timeline-tick');
    tick.type = 'button';
    tick.dataset.index = String(index);
    tick.setAttribute('aria-label', `${formatYear(era.year)} ${era.label}`);
    tick.append(make('strong', '', formatYear(era.year).replace('公元', '').replace('年', '')));
    tick.append(make('small', '', era.label.split('·')[0]));
    tick.addEventListener('click', () => {
      setPlaying(false);
      onEra?.(index);
    });
    dom.timelineTrack.append(tick);

    dom.segmentStart.add(new Option(formatYear(era.year), String(index)));
    dom.segmentEnd.add(new Option(formatYear(era.year), String(index)));
  });
  dom.segmentStart.value = '0';
  dom.segmentEnd.value = String(eras.length - 1);

  if (optionalCitySelect) {
    const byRegion = new Map();
    for (const city of cities) {
      if (!byRegion.has(city.region)) byRegion.set(city.region, []);
      byRegion.get(city.region).push(city);
    }
    for (const [region, regionCities] of byRegion) {
      const group = document.createElement('optgroup');
      group.label = region;
      regionCities.forEach((city) => group.append(new Option(city.name, city.id)));
      optionalCitySelect.append(group);
    }
    optionalCitySelect.addEventListener('change', () => {
      const city = cities.find((candidate) => candidate.id === optionalCitySelect.value);
      if (city) onCity?.(city, true);
    });
  }

  function renderFactions(era) {
    clear(dom.factionList);
    era.factions.forEach((faction) => {
      const chip = make('button', 'faction-chip');
      chip.type = 'button';
      chip.style.setProperty('--faction-color', faction.color);
      chip.title = `${faction.name} · ${CONTROL_LABELS[faction.controlType] ?? faction.controlType}`;
      chip.append(make('i'));
      const copy = make('span');
      copy.append(make('strong', '', faction.name));
      copy.append(make('small', '', CONTROL_LABELS[faction.controlType] ?? faction.controlType));
      chip.append(copy);
      const centerCity = cities.find((city) => city.id === faction.centerCityId);
      if (centerCity) chip.addEventListener('click', () => onCity?.(centerCity, false));
      dom.factionList.append(chip);
    });
  }

  function renderEvents(era) {
    clear(dom.eventList);
    era.events.forEach((event) => {
      const item = make('button', 'event-item');
      item.type = 'button';
      item.append(make('span', 'event-year', formatYear(event.year).replace('公元', '').replace('年', '')));
      const copy = make('span', 'event-copy');
      copy.append(make('strong', '', event.name));
      copy.append(make('small', '', event.summary));
      item.append(copy);
      item.addEventListener('click', () => onEvent?.(event));
      dom.eventList.append(item);
    });
  }

  function renderExternal(era) {
    clear(dom.foreignMarkers);
    clear(dom.foreignList);
    era.external.forEach((power, index) => {
      const [x, y] = closestRegionPosition(power.region, index);
      const marker = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      marker.setAttribute('class', 'atlas-marker');
      marker.style.setProperty('--marker-color', power.color);
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', x);
      circle.setAttribute('cy', y);
      circle.setAttribute('r', index === 0 ? '3.6' : '2.8');
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', x + 5);
      label.setAttribute('y', y + 2);
      label.textContent = power.name;
      marker.append(circle, label);
      dom.foreignMarkers.append(marker);

      if (index < 4) {
        const chip = make('div', 'foreign-chip');
        chip.style.setProperty('--foreign-color', power.color);
        chip.title = power.event;
        chip.append(make('strong', '', power.name));
        chip.append(make('small', '', power.region));
        dom.foreignList.append(chip);
      }
    });
  }

  function refreshSegmentClasses() {
    [...dom.timelineTrack.children].forEach((tick, index) => {
      tick.classList.toggle('is-active', index === currentEraIndex);
      tick.classList.toggle('is-in-segment', index >= segment.start && index <= segment.end);
    });
    const startLabel = formatYear(eras[segment.start].year).replace(/公元|年/g, '');
    const endLabel = formatYear(eras[segment.end].year).replace(/公元|年/g, '');
    dom.playRangeLabel.textContent = `${startLabel} → ${endLabel}`;
  }

  function setEra(index) {
    currentEraIndex = Math.max(0, Math.min(eras.length - 1, Number(index) || 0));
    const era = eras[currentEraIndex];
    dom.eraKicker.textContent = `关键历史截面 ${String(currentEraIndex + 1).padStart(2, '0')} / ${String(eras.length).padStart(2, '0')}`;
    dom.eraHeading.textContent = `${formatYear(era.year)} · ${era.label}`;
    dom.eraNumber.textContent = CHINESE_NUMERALS[currentEraIndex] ?? String(currentEraIndex + 1);
    dom.eraPeriod.textContent = era.period;
    dom.eraSummary.textContent = era.summary;
    dom.terrainNote.textContent = era.terrainNotes;
    dom.eraSlider.value = String(currentEraIndex);
    renderFactions(era);
    renderEvents(era);
    renderExternal(era);
    refreshSegmentClasses();
    if (selectedCity) selectCity(selectedCity, era);
  }

  function selectCity(city, era = eras[currentEraIndex]) {
    selectedCity = city;
    const historicalName = getCityNameAtYear(city, era.year);
    const style = architectureForEra(era);
    dom.cityCard.hidden = false;
    dom.cityMonogram.textContent = (historicalName || city.name).replace(/[／、].*$/, '').charAt(0);
    dom.citySource.textContent = historicalName ? '史实锚点 · 程序化复原' : '推定聚落 · 程序化生成';
    dom.cityName.textContent = city.name;
    dom.cityHistoricalName.textContent = `${historicalName ?? '未形成可辨识城市'} · ${city.region}`;
    dom.cityBiome.textContent = biomeLabel(city.biome);
    dom.cityStyle.textContent = style.label;
    dom.cityRank.textContent = cityRank(city, era);
    dom.cityDescription.textContent = cityDescription(city, era, historicalName);
    if (optionalCitySelect) optionalCitySelect.value = city.id;
  }

  function hideCity() {
    selectedCity = null;
    dom.cityCard.hidden = true;
    if (optionalCitySelect) optionalCitySelect.value = '';
  }

  function setPlaying(playing) {
    isPlaying = Boolean(playing);
    dom.playButton.classList.toggle('is-playing', isPlaying);
    dom.playButton.setAttribute('aria-label', isPlaying ? '暂停历史演变' : '播放历史演变');
    const fullRange = segment.start === 0 && segment.end === eras.length - 1;
    dom.playState.textContent = isPlaying ? '正在推演' : fullRange ? '全程演变' : '片段演变';
  }

  function readSegment() {
    let start = Number(dom.segmentStart.value);
    let end = Number(dom.segmentEnd.value);
    if (start > end) [start, end] = [end, start];
    segment = { start, end };
    dom.segmentStart.value = String(start);
    dom.segmentEnd.value = String(end);
    refreshSegmentClasses();
    onSegment?.({ ...segment });
  }

  function showHover(item, clientX, clientY) {
    const strong = dom.hoverLabel.querySelector('strong');
    const small = dom.hoverLabel.querySelector('small');
    if (item.type === 'city') {
      strong.textContent = item.city.name;
      small.textContent = `${getCityNameAtYear(item.city, eras[currentEraIndex].year) ?? '推演聚落'} · 点击查看`;
    } else {
      strong.textContent = item.event.name;
      small.textContent = `${formatYear(item.event.year)} · 点击定位`;
    }
    dom.hoverLabel.style.left = `${clientX}px`;
    dom.hoverLabel.style.top = `${clientY}px`;
    dom.hoverLabel.hidden = false;
  }

  function hideHover() {
    dom.hoverLabel.hidden = true;
  }

  function setStats({ fps, draws, cityCount, detailCities }) {
    dom.hudFps.textContent = `${Math.round(fps || 0)} FPS`;
    dom.hudDraws.textContent = `${draws ?? 0} DRAW`;
    dom.hudCities.textContent = `城市 ${cityCount ?? 0} · 近景 ${detailCities ?? 0}`;
  }

  function setMode(mode) {
    dom.hudMode.textContent = {
      overview: '全国视角',
      city: '城市近景',
      event: '事件定位',
      detail: '区域近景',
      free: '自由观察',
    }[mode] ?? mode;
  }

  function setQuality(label) {
    dom.qualityLabel.textContent = label;
  }

  function setLoading(status, ready = false) {
    if (status) dom.loadingStatus.textContent = status;
    if (ready) dom.loading.classList.add('is-ready');
  }

  dom.eraSlider.max = String(eras.length - 1);
  dom.eraSlider.addEventListener('input', () => {
    setPlaying(false);
    onEra?.(Number(dom.eraSlider.value));
  });
  dom.playButton.addEventListener('click', () => {
    const next = !isPlaying;
    setPlaying(next);
    onPlay?.(next);
  });
  dom.overviewButton.addEventListener('click', () => onOverview?.());
  dom.qualityButton.addEventListener('click', () => onQuality?.());
  dom.cityClose.addEventListener('click', () => hideCity());
  dom.cityFocus.addEventListener('click', () => {
    if (selectedCity) onFocusCity?.(selectedCity);
  });
  dom.atlasCollapse.addEventListener('click', () => {
    const collapsed = dom.atlasPanel.classList.toggle('collapsed');
    dom.atlasCollapse.textContent = collapsed ? '展开' : '收起';
    dom.atlasCollapse.setAttribute('aria-expanded', String(!collapsed));
  });
  dom.segmentStart.addEventListener('change', readSegment);
  dom.segmentEnd.addEventListener('change', readSegment);
  dom.segmentReset.addEventListener('click', () => {
    dom.segmentStart.value = '0';
    dom.segmentEnd.value = String(eras.length - 1);
    readSegment();
  });
  Object.entries(layerInputs).forEach(([name, input]) => {
    input.addEventListener('change', () => onLayer?.(name, input.checked));
  });

  setEra(0);

  return {
    setEra,
    selectCity,
    hideCity,
    setPlaying,
    setStats,
    setMode,
    setQuality,
    setLoading,
    showHover,
    hideHover,
    getSegment: () => ({ ...segment }),
    get selectedCity() {
      return selectedCity;
    },
  };
}
