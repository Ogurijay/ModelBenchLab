// ============================================================
// 通用工具:防抖 / rAF 合帧节流 / HTML 转义与高亮 / 格式化
// ============================================================

/**
 * 防抖(闭包实现):连续调用期间不执行,停止 wait 毫秒后恰好执行一次。
 * 附带 cancel() 取消挂起调用。
 */
export function debounce(fn, wait = 300) {
  let timer = null;
  const debounced = (...args) => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, wait);
  };
  debounced.cancel = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

/**
 * rAF 合帧节流:同一帧内多次调用只在下一帧执行一次(取最后一次参数)。
 */
export function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

export function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

const ESC_RE = /[&<>"']/g;
const ESC_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapeHtml(s) {
  return String(s).replace(ESC_RE, (c) => ESC_MAP[c]);
}

/**
 * 大小写不敏感地把 text 中所有 query 命中片段包裹 <mark>,其余部分转义。
 */
export function highlightHtml(text, query) {
  if (!query) return escapeHtml(text);
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  if (!q.length) return escapeHtml(text);
  let out = '';
  let pos = 0;
  let idx;
  while ((idx = lower.indexOf(q, pos)) !== -1) {
    out += escapeHtml(text.slice(pos, idx)) +
      '<mark>' + escapeHtml(text.slice(idx, idx + q.length)) + '</mark>';
    pos = idx + q.length;
  }
  return out + escapeHtml(text.slice(pos));
}

/** 千分位:28400 -> "28,400" */
export function formatThousands(n) {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** 毫秒展示:-1 -> "—",8.234 -> "8.2ms",123.4 -> "123ms" */
export function formatMs(ms) {
  if (ms < 0) return '—';
  return ms >= 100 ? `${Math.round(ms)}ms` : `${ms.toFixed(1)}ms`;
}
