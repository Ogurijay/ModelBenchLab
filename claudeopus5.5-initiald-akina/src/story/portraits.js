// 2D 立绘（SVG，扁平漫画风）：常态 normal / 笑 smile / 沉默 silent / 震惊 shock（梗）。
// 角色用演员小名，形象为原创扁平造型，不追求真人相似。
const SKIN = '#f3d3b8', SKIN_S = '#ddb397', INK = '#16161c';

export const CAST = {
  takumi: { name: '周董', hair: '#2b211c', hairStyle: 'messy', outfit: '#f2f2ee', outfit2: '#2c3e66', sleepy: true },
  bunta: { name: '秋生叔', hair: '#3a3a3a', hairStyle: 'short', outfit: '#6b5a48', outfit2: '#3e3328', sleepy: true, stubble: true, cig: true, blush: true, age: true },
  nakazato: { name: '六叔', hair: '#101012', hairStyle: 'slick', outfit: '#16171c', outfit2: '#3a3c44', brows: 'sharp' },
  ryosuke: { name: '陈老师', hair: '#1c1a22', hairStyle: 'part', outfit: '#dfe8f2', outfit2: '#7f95b5', brows: 'calm' },
  seiji: { name: '刘教练', hair: '#1a1a1a', hairStyle: 'buzz', outfit: '#7b2cbf', outfit2: '#f4f4f4', band: '#e63946', grin: true },
  kyoichi: { name: '山鸡哥', hair: '#121212', hairStyle: 'short', outfit: '#0e0e10', outfit2: '#2a2a2e', band: '#ffffff', brows: 'sharp' },
  itsuki: { name: '阿木', hair: '#3a2a1e', hairStyle: 'spiky', outfit: '#f28c38', outfit2: '#ffd08a', round: true, grin: true },
  yuichi: { name: '阿B', hair: '#444', hairStyle: 'cap', outfit: '#2f6db3', outfit2: '#ffffff', stache: true, age: true },
  natsuki: { name: '夏树', hair: '#2a1d1a', hairStyle: 'long', outfit: '#ffffff', outfit2: '#d7263d', gentle: true },
  money: { name: '钞能力大叔', hair: '#0f0f0f', hairStyle: 'slick', outfit: '#1b1b20', outfit2: '#c8a24a', shades: true, chain: true, age: true }
};

function hairBack(c) {
  if (c.hairStyle === 'long') return `<path d="M88,140 Q80,70 150,62 Q222,70 212,140 L222,330 Q190,350 150,345 Q110,350 78,330 Z" fill="${c.hair}"/>`;
  return '';
}
function hairFront(c) {
  const h = c.hair;
  switch (c.hairStyle) {
    case 'messy': return `<path d="M96,140 Q92,70 152,66 Q214,70 206,142 L196,118 L188,138 L176,112 L166,134 L154,108 L140,134 L130,110 L118,136 L110,116 Z" fill="${h}"/>`;
    case 'short': return `<path d="M100,132 Q98,76 152,72 Q206,76 202,132 Q196,104 176,98 Q150,92 124,100 Q106,108 100,132 Z" fill="${h}"/>`;
    case 'slick': return `<path d="M100,130 Q96,72 150,68 Q208,70 204,128 Q200,96 150,92 Q112,96 100,130 Z" fill="${h}"/><path d="M118,96 Q150,80 186,94" stroke="#444" stroke-width="3" fill="none"/>`;
    case 'part': return `<path d="M98,142 Q94,70 152,68 Q210,72 204,138 Q196,100 168,96 L150,120 Q140,100 118,104 Q102,114 98,142 Z" fill="${h}"/>`;
    case 'buzz': return `<path d="M102,124 Q100,78 150,74 Q202,78 200,124 Q180,100 150,98 Q122,100 102,124 Z" fill="${h}"/>`;
    case 'spiky': return `<path d="M100,128 L96,96 L112,104 L114,76 L130,92 L140,66 L152,88 L166,66 L174,92 L190,76 L190,104 L206,96 L200,128 Q150,104 100,128 Z" fill="${h}"/>`;
    case 'cap': return `<path d="M96,122 Q98,70 152,68 Q206,70 206,122 Z" fill="${c.outfit}"/><path d="M96,122 L232,122 Q236,132 214,134 L96,132 Z" fill="#1d3f8f"/><circle cx="152" cy="98" r="11" fill="#fff"/><text x="152" y="103" font-size="12" font-weight="900" text-anchor="middle" fill="#d7263d">B</text>`;
    case 'long': return `<path d="M96,150 Q92,68 152,64 Q212,68 206,150 Q200,110 178,102 L168,126 L158,100 L140,128 L132,102 Q106,110 96,150 Z" fill="${h}"/>`;
    default: return '';
  }
}

function eyes(c, face) {
  const L = 126, R = 176, Y = 168;
  if (face === 'shock') {
    return `<ellipse cx="${L}" cy="${Y}" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="3"/><ellipse cx="${R}" cy="${Y}" rx="12" ry="14" fill="#fff" stroke="${INK}" stroke-width="3"/>
      <circle cx="${L}" cy="${Y}" r="2.5" fill="${INK}"/><circle cx="${R}" cy="${Y}" r="2.5" fill="${INK}"/>
      <g stroke="#4a6cff" stroke-width="3">${[118, 130, 142, 154, 166, 178].map((x) => `<line x1="${x}" y1="112" x2="${x}" y2="142"/>`).join('')}</g>
      <path d="M210,140 Q218,156 210,164 Q202,156 210,140 Z" fill="#9fd7ff" stroke="${INK}" stroke-width="2"/>`;
  }
  if (c.shades) return `<path d="M106,158 L146,158 L142,180 L112,180 Z M156,158 L196,158 L192,180 L160,180 Z" fill="#0b0b0b"/><line x1="146" y1="162" x2="156" y2="162" stroke="#0b0b0b" stroke-width="4"/><path d="M114,164 L126,164" stroke="#fff" stroke-width="2" opacity=".6"/>`;
  if (face === 'smile') {
    if (c.gentle) return `<path d="M${L - 11},${Y + 2} Q${L},${Y - 9} ${L + 11},${Y + 2}" stroke="${INK}" stroke-width="3.5" fill="none"/><path d="M${R - 11},${Y + 2} Q${R},${Y - 9} ${R + 11},${Y + 2}" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
    return `<path d="M${L - 11},${Y + 3} Q${L},${Y - 10} ${L + 11},${Y + 3}" stroke="${INK}" stroke-width="4.5" fill="none"/><path d="M${R - 11},${Y + 3} Q${R},${Y - 10} ${R + 11},${Y + 3}" stroke="${INK}" stroke-width="4.5" fill="none"/>`;
  }
  const iris = c.gentle ? '#4a2c22' : INK;
  let out = `<ellipse cx="${L}" cy="${Y}" rx="8" ry="${c.gentle ? 11 : 9}" fill="${iris}"/><ellipse cx="${R}" cy="${Y}" rx="8" ry="${c.gentle ? 11 : 9}" fill="${iris}"/>
    <circle cx="${L + 3}" cy="${Y - 4}" r="2.6" fill="#fff"/><circle cx="${R + 3}" cy="${Y - 4}" r="2.6" fill="#fff"/>`;
  if (c.gentle) out += `<path d="M${L - 12},${Y - 9} Q${L},${Y - 16} ${L + 11},${Y - 9}" stroke="${INK}" stroke-width="3" fill="none"/><path d="M${R - 11},${Y - 9} Q${R},${Y - 16} ${R + 12},${Y - 9}" stroke="${INK}" stroke-width="3" fill="none"/>`;
  // 没睡醒：上眼睑压到一半
  const lid = face === 'silent' ? 3 : c.sleepy ? 0 : -9;
  if (lid > -9) out += `<rect x="${L - 12}" y="${Y - 14}" width="24" height="${14 + lid}" fill="${SKIN}"/><rect x="${R - 12}" y="${Y - 14}" width="24" height="${14 + lid}" fill="${SKIN}"/>
    <line x1="${L - 11}" y1="${Y + lid}" x2="${L + 10}" y2="${Y + lid}" stroke="${INK}" stroke-width="3.5"/><line x1="${R - 10}" y1="${Y + lid}" x2="${R + 11}" y2="${Y + lid}" stroke="${INK}" stroke-width="3.5"/>`;
  else out += `<path d="M${L - 11},${Y - 7} L${L + 10},${Y - 9}" stroke="${INK}" stroke-width="3.5"/><path d="M${R - 10},${Y - 9} L${R + 11},${Y - 7}" stroke="${INK}" stroke-width="3.5"/>`;
  return out;
}

function brows(c, face) {
  if (c.shades || face === 'shock') return `<path d="M112,138 L138,132 M164,132 L190,138" stroke="${INK}" stroke-width="4"/>`;
  const sharp = c.brows === 'sharp';
  const dy = face === 'silent' ? 4 : 0;
  if (sharp) return `<path d="M110,${146 + dy} L140,${152 + dy}" stroke="${INK}" stroke-width="5"/><path d="M192,${146 + dy} L162,${152 + dy}" stroke="${INK}" stroke-width="5"/>`;
  if (face === 'silent') return `<path d="M112,148 Q126,152 140,150" stroke="${INK}" stroke-width="3.5" fill="none"/><path d="M162,150 Q176,152 190,148" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
  return `<path d="M112,148 Q126,140 140,146" stroke="${INK}" stroke-width="3.5" fill="none"/><path d="M162,146 Q176,140 190,148" stroke="${INK}" stroke-width="3.5" fill="none"/>`;
}

function mouth(c, face) {
  if (face === 'shock') return `<ellipse cx="151" cy="214" rx="13" ry="16" fill="#5a1414" stroke="${INK}" stroke-width="3"/>`;
  if (c.cig) return `<line x1="146" y1="210" x2="160" y2="210" stroke="${INK}" stroke-width="3"/><line x1="158" y1="210" x2="186" y2="216" stroke="#f4f4f4" stroke-width="5"/><line x1="183" y1="215" x2="187" y2="216" stroke="#ff7a3a" stroke-width="5"/><path d="M190,206 Q198,196 192,186 Q186,176 196,166" stroke="#bbb" stroke-width="2" fill="none" opacity=".7"/>`;
  if (face === 'smile' || (c.grin && face !== 'silent')) return `<path d="M136,206 Q151,${c.grin ? 226 : 218} 166,206 Z" fill="${c.grin ? '#7a2020' : '#fff'}" stroke="${INK}" stroke-width="3"/>`;
  if (face === 'silent') return `<line x1="143" y1="212" x2="159" y2="212" stroke="${INK}" stroke-width="3"/>`;
  return `<path d="M141,210 Q151,214 161,210" stroke="${INK}" stroke-width="3" fill="none"/>`;
}

export function portraitSVG(id, face = 'normal') {
  const c = CAST[id];
  if (!c) return '';
  if (c.gentle && face === 'shock') face = 'silent'; // 夏树不玩梗
  const jaw = c.round ? 'M98,130 Q98,74 150,74 Q204,74 204,130 L204,182 Q196,238 150,244 Q106,238 98,182 Z' : 'M102,130 Q102,78 150,76 Q200,78 200,130 L198,178 Q190,226 150,240 Q112,226 104,178 Z';
  const torso = `<path d="M40,450 L52,320 Q70,276 120,266 L180,266 Q232,276 250,320 L262,450 Z" fill="${c.outfit}" stroke="${INK}" stroke-width="4"/>`;
  const collar = c.hairStyle === 'long'
    ? `<path d="M120,266 L150,300 L180,266" fill="none" stroke="${INK}" stroke-width="3"/><path d="M136,292 L150,306 L164,292 L158,320 L150,312 L142,320 Z" fill="${c.outfit2}" stroke="${INK}" stroke-width="2"/>`
    : `<path d="M118,268 L150,312 L182,268" fill="${c.outfit2}" stroke="${INK}" stroke-width="3"/>`;
  const extra = [
    c.band ? `<path d="M100,128 Q150,112 202,128 L202,142 Q150,126 100,142 Z" fill="${c.band}" stroke="${INK}" stroke-width="2.5"/>` : '',
    c.stubble ? `<g fill="#7a6a5a" opacity=".55">${Array.from({ length: 26 }, (_, i) => `<circle cx="${118 + (i * 37) % 66}" cy="${206 + (i * 13) % 26}" r="1.6"/>`).join('')}</g>` : '',
    c.stache ? `<path d="M134,202 Q151,194 168,202 Q151,206 134,202 Z" fill="#444"/>` : '',
    c.blush ? `<ellipse cx="116" cy="192" rx="12" ry="6" fill="#ff8a8a" opacity=".55"/><ellipse cx="186" cy="192" rx="12" ry="6" fill="#ff8a8a" opacity=".55"/>` : '',
    c.chain ? `<path d="M110,300 Q150,340 190,300" stroke="#e5c35a" stroke-width="6" fill="none" stroke-dasharray="6 3"/>` : '',
    c.age ? `<path d="M116,186 Q122,190 128,186 M174,186 Q180,190 186,186" stroke="${SKIN_S}" stroke-width="2" fill="none"/>` : ''
  ].join('');
  const shadow = face === 'silent' && !c.gentle ? `<path d="M100,132 Q150,124 202,132 L202,176 Q150,166 100,176 Z" fill="#1a1a30" opacity=".22"/>` : '';
  return `<svg viewBox="0 0 300 450" xmlns="http://www.w3.org/2000/svg">
    ${hairBack(c)}${torso}${collar}
    <rect x="132" y="226" width="38" height="48" fill="${SKIN_S}"/>
    <ellipse cx="98" cy="172" rx="9" ry="15" fill="${SKIN}" stroke="${INK}" stroke-width="3"/><ellipse cx="204" cy="172" rx="9" ry="15" fill="${SKIN}" stroke="${INK}" stroke-width="3"/>
    <path d="${jaw}" fill="${SKIN}" stroke="${INK}" stroke-width="4"/>
    ${extra}${eyes(c, face)}${brows(c, face)}
    <path d="M150,180 L146,196 L153,197" stroke="${SKIN_S}" stroke-width="3" fill="none"/>
    ${mouth(c, face)}${shadow}${hairFront(c)}
  </svg>`;
}

/** 只画眼睛的特写（漫画分格用）：内容集中在中部，方形/宽幅分格都不会裁掉眼睛 */
export function eyesCloseup(id = 'takumi') {
  const c = CAST[id];
  return `<svg viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="xMidYMid slice">
    <rect width="400" height="300" fill="${SKIN}"/>
    <path d="M0,0 L400,0 L400,96 Q330,80 280,104 L262,70 L240,100 Q200,84 160,100 L138,70 L120,104 Q70,80 0,96 Z" fill="${c.hair}"/>
    <path d="M86,122 L176,114" stroke="${INK}" stroke-width="9"/><path d="M224,114 L314,122" stroke="${INK}" stroke-width="9"/>
    <path d="M96,160 Q136,138 176,158 Q136,178 96,160 Z" fill="#fff" stroke="${INK}" stroke-width="5"/>
    <path d="M224,158 Q264,138 304,160 Q264,178 224,158 Z" fill="#fff" stroke="${INK}" stroke-width="5"/>
    <circle cx="138" cy="158" r="15" fill="${INK}"/><circle cx="262" cy="158" r="15" fill="${INK}"/>
    <circle cx="144" cy="152" r="5" fill="#fff"/><circle cx="268" cy="152" r="5" fill="#fff"/>
    <path d="M92,154 L180,150" stroke="${INK}" stroke-width="6"/><path d="M220,150 L308,154" stroke="${INK}" stroke-width="6"/>
    <path d="M200,176 L196,204 L204,206" stroke="${SKIN_S}" stroke-width="4" fill="none"/>
    <g stroke="${INK}" stroke-width="1.5" opacity=".22">${Array.from({ length: 34 }, (_, i) => `<line x1="${i * 13 - 40}" y1="232" x2="${i * 13}" y2="300"/>`).join('')}</g>
  </svg>`;
}
