// Real canvas-only WebRTC streaming; the guest controls the host's P2 slot.
// No camera, microphone, account, hosted signaling service, or executable payload.
const PREFIX = 'KATE-RTC1.';
const P2_KEYS = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Digit1', 'Digit2', 'Digit3']);
const MAX_CODE = 32000;
const MAX_DESCRIPTION = 65536;

function bytesToBase64(bytes) {
  let value = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) value += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  return btoa(value).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
async function readBounded(stream, limit) {
  const reader = stream.getReader(); const pieces = []; let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      total += value.length;
      if (total > limit) throw new Error('连接码超过允许大小。');
      pieces.push(value);
    }
  } catch (error) { await reader.cancel().catch(() => {}); throw error; }
  const bytes = new Uint8Array(total); let offset = 0;
  for (const piece of pieces) { bytes.set(piece, offset); offset += piece.length; }
  return bytes;
}
function validateDescription(packet, expectedType) {
  if (!packet || packet.v !== 1 || typeof packet.id !== 'string' || !/^[a-z0-9-]{16,64}$/i.test(packet.id)) throw new Error('这不是有效的 Kate 同屏连接码。');
  const description = packet.description;
  if (!description || !['offer', 'answer'].includes(description.type) || (expectedType && description.type !== expectedType)) throw new Error(`需要${expectedType === 'answer' ? '加入方回复' : '宿主邀请'}连接码。`);
  if (typeof description.sdp !== 'string' || description.sdp.length > MAX_DESCRIPTION || !description.sdp.startsWith('v=0')) throw new Error('连接描述无效或过大。');
  return { v: 1, id: packet.id, description: { type: description.type, sdp: description.sdp } };
}
export async function encodeConnectionCode(packet) {
  validateDescription(packet);
  if (typeof CompressionStream === 'undefined') throw new Error('浏览器不支持压缩连接码，请使用新版 Chrome 或 Edge。');
  const bytes = new TextEncoder().encode(JSON.stringify(packet));
  if (bytes.length > MAX_DESCRIPTION) throw new Error('连接描述过大。');
  const packed = await readBounded(new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip')), 24000);
  return PREFIX + bytesToBase64(packed);
}
export async function decodeConnectionCode(code, expectedType) {
  const text = String(code).trim();
  if (text.length > MAX_CODE || !text.startsWith(PREFIX) || !/^[a-zA-Z0-9_-]+$/.test(text.slice(PREFIX.length))) throw new Error('连接码格式或大小无效。');
  if (typeof DecompressionStream === 'undefined') throw new Error('浏览器不支持压缩连接码，请使用新版 Chrome 或 Edge。');
  try {
    let payload = text.slice(PREFIX.length).replaceAll('-', '+').replaceAll('_', '/');
    payload += '='.repeat((4 - payload.length % 4) % 4);
    const packed = Uint8Array.from(atob(payload), character => character.charCodeAt(0));
    const bytes = await readBounded(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip')), MAX_DESCRIPTION);
    return validateDescription(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)), expectedType);
  } catch (error) { throw new Error(`无法读取连接码：${error.message}`); }
}
export function validateControlMessage(data, previousSequence = -1) {
  if (typeof data !== 'string' || data.length > 256) return null;
  let packet; try { packet = JSON.parse(data); } catch { return null; }
  if (!packet || !Number.isSafeInteger(packet.s) || packet.s < 0 || packet.s <= previousSequence) return null;
  if (packet.t === 'key' && P2_KEYS.has(packet.k) && (packet.d === 0 || packet.d === 1) && Object.keys(packet).length === 4) return packet;
  if (['release', 'ping'].includes(packet.t) && Object.keys(packet).length === 2) return packet;
  return null;
}
function waitForIce(pc) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = error => { clearTimeout(timer); pc.removeEventListener('icegatheringstatechange', changed); error ? reject(error) : resolve(); };
    const changed = () => { if (pc.iceGatheringState === 'complete') finish(); };
    const timer = setTimeout(() => finish(new Error('网络候选收集超时，请重试或使用局域网。')), 20000);
    pc.addEventListener('icegatheringstatechange', changed);
  });
}

export function createRemotePlay({ host, canvas, video, onState = () => {}, publicStun = false }) {
  let pc, channel, stream, role = null, sessionId, lastSequence = -1, sequence = 0;
  let timer, invalidMessages = 0, lastInputAt = 0;
  const hostHeld = new Set(), guestHeld = new Set();
  let state = { phase: 'idle', role: null, connected: false, videoReceiving: false, publicStun };
  const update = (phase, detail = '') => {
    state = { ...state, phase, detail, role, connected: channel?.readyState === 'open' && pc?.connectionState === 'connected' };
    onState({ ...state });
  };
  const releaseHost = () => {
    for (const key of hostHeld) { try { host.sendKey(key, false); } catch { /* Engine may already be stopped. */ } }
    hostHeld.clear();
  };
  function send(packet) {
    if (channel?.readyState !== 'open') return false;
    if (channel.bufferedAmount > 65536) { disconnect('控制数据拥堵，已断开并释放按键。'); return false; }
    channel.send(JSON.stringify({ ...packet, s: sequence++ })); return true;
  }
  function release() {
    if (role === 'guest') { send({ t: 'release' }); guestHeld.clear(); }
    else releaseHost();
  }
  function configureChannel(dc) {
    if (dc.label !== 'kate-p2' || !dc.ordered || dc.maxRetransmits != null || dc.maxPacketLifeTime != null) { dc.close(); throw new Error('只允许可靠、有序的 P2 控制通道。'); }
    channel = dc;
    channel.onopen = () => {
      lastInputAt = Date.now();
      update('connected', role === 'host' ? 'P2 控制通道已连接；宿主运行游戏。' : 'P2 控制通道已连接，等待宿主画面。');
      timer = setInterval(() => {
        if (role === 'guest') send({ t: 'ping' });
        else if (hostHeld.size && Date.now() - lastInputAt > 5000) releaseHost();
      }, 1000);
    };
    channel.onclose = () => { releaseHost(); guestHeld.clear(); clearInterval(timer); update('disconnected', '控制通道已断开，P2 按键已释放。'); };
    channel.onerror = () => { releaseHost(); update('error', '控制通道发生错误。'); };
    channel.onmessage = event => {
      if (role !== 'host') return;
      const packet = validateControlMessage(event.data, lastSequence);
      if (!packet) { if (++invalidMessages >= 3) disconnect('收到了无效控制数据，已断开。'); return; }
      lastSequence = packet.s; lastInputAt = Date.now();
      if (packet.t === 'release') { releaseHost(); return; }
      if (packet.t === 'ping') return;
      try {
        host.sendKey(packet.k, packet.d === 1);
        packet.d ? hostHeld.add(packet.k) : hostHeld.delete(packet.k);
      } catch (error) { disconnect(`宿主无法接收按键：${error.message}`); }
    };
  }
  function begin(nextRole) {
    if (!globalThis.RTCPeerConnection) throw new Error('浏览器不支持 WebRTC。请使用新版 Chrome 或 Edge。');
    if (pc) disconnect();
    role = nextRole; lastSequence = -1; sequence = 0; invalidMessages = 0;
    state.videoReceiving = false;
    pc = new RTCPeerConnection({ iceServers: publicStun ? [{ urls: 'stun:stun.l.google.com:19302' }] : [] });
    pc.onconnectionstatechange = () => {
      const status = pc?.connectionState;
      if (status === 'connected') update('connected', role === 'host' ? '宿主与 P2 已连接。' : state.videoReceiving ? '正在接收宿主真实画面。' : '已连接，等待画面。');
      else if (['disconnected', 'failed', 'closed'].includes(status)) {
        releaseHost(); guestHeld.clear();
        update(status === 'failed' ? 'error' : 'disconnected', status === 'failed' ? '连接失败。部分跨网 NAT 无法直接互通；请尝试同一局域网。' : '连接已中断，按键已释放。');
      } else update('connecting', '正在建立直接连接；尚未连接。');
    };
    pc.ondatachannel = event => {
      if (role !== 'guest' || channel) { event.channel.close(); return; }
      try { configureChannel(event.channel); } catch (error) { disconnect(error.message); }
    };
    pc.ontrack = event => {
      if (role !== 'guest' || event.track.kind !== 'video') return;
      if (!video) { disconnect('加入界面没有视频接收元素。'); return; }
      video.srcObject = event.streams[0] || new MediaStream([event.track]);
      video.muted = true; video.playsInline = true;
      video.onplaying = () => { state.videoReceiving = true; update('connected', '正在接收宿主真实画面；点击画面后可操作 P2。'); };
      video.play().catch(() => update('connecting', '浏览器暂停了自动播放，请点击“播放画面”。'));
    };
  }
  async function createOffer() {
    if (!host?.getState?.()?.loaded) throw new Error('宿主需要先启动 LF2，再创建同屏邀请。');
    if (!canvas?.captureStream) throw new Error('浏览器不支持游戏 canvas 视频捕获。');
    begin('host'); sessionId = crypto.randomUUID();
    try {
      stream = canvas.captureStream(30);
      if (!stream.getVideoTracks().length) throw new Error('未能捕获游戏画面。');
      for (const track of stream.getVideoTracks()) pc.addTrack(track, stream);
      configureChannel(pc.createDataChannel('kate-p2', { ordered: true }));
      update('gathering', '正在生成邀请连接码。');
      await pc.setLocalDescription(await pc.createOffer()); await waitForIce(pc);
      const code = await encodeConnectionCode({ v: 1, id: sessionId, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      update('waiting-answer', '邀请已生成。对方加入后，将其回复码粘贴回来。'); return code;
    } catch (error) { disconnect(error.message); throw error; }
  }
  async function joinOffer(code) {
    const packet = await decodeConnectionCode(code, 'offer'); begin('guest'); sessionId = packet.id;
    try {
      update('gathering', '正在生成加入回复码。');
      await pc.setRemoteDescription(packet.description);
      await pc.setLocalDescription(await pc.createAnswer()); await waitForIce(pc);
      const answer = await encodeConnectionCode({ v: 1, id: sessionId, description: { type: pc.localDescription.type, sdp: pc.localDescription.sdp } });
      update('waiting-host', '回复码已生成。发给宿主，等待宿主应用回复。'); return answer;
    } catch (error) { disconnect(error.message); throw error; }
  }
  async function acceptAnswer(code) {
    if (role !== 'host' || !pc || pc.signalingState !== 'have-local-offer') throw new Error('请先创建一个尚未完成的邀请。');
    const packet = await decodeConnectionCode(code, 'answer');
    if (packet.id !== sessionId) throw new Error('回复码属于另一个邀请。');
    await pc.setRemoteDescription(packet.description); update('connecting', '回复已应用，正在尝试建立真实连接。');
  }
  function key(code, pressed) {
    if (role !== 'guest' || !P2_KEYS.has(code)) return false;
    if (pressed && guestHeld.has(code)) return true;
    if (send({ t: 'key', k: code, d: pressed ? 1 : 0 })) {
      pressed ? guestHeld.add(code) : guestHeld.delete(code); return true;
    }
    return false;
  }
  function disconnect(detail = '同屏已断开。') {
    release(); clearInterval(timer);
    if (channel) { channel.onclose = null; channel.close(); }
    if (pc) { pc.onconnectionstatechange = null; pc.close(); }
    for (const track of stream?.getTracks() || []) track.stop();
    if (video) { video.onplaying = null; video.srcObject = null; }
    pc = channel = stream = undefined; state.videoReceiving = false;
    update('disconnected', detail);
  }
  return { createOffer, joinOffer, acceptAnswer, key, release, disconnect, getState: () => ({ ...state }) };
}

export function renderRemotePanel(container, { host, canvas }) {
  container.innerHTML = `<section class="kate-remote" aria-label="双人远程同屏">
    <style>
      .kate-remote{color:#e9edf1;background:#111923;padding:22px;border:1px solid #354653;font-family:inherit;max-width:850px;margin:auto}
      .kate-remote h2{margin:0 0 8px;font-size:24px;color:#f5cb6f}.kate-remote p{line-height:1.65;font-size:13px;color:#afc0cc}
      .kate-remote .remote-actions{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}.kate-remote button{padding:10px 15px;border:1px solid #526776;background:#263a46;color:#edf5f8;cursor:pointer;font:inherit}
      .kate-remote button:disabled{opacity:.4;cursor:wait}.kate-remote textarea{display:block;width:100%;box-sizing:border-box;background:#080f16;color:#d1e6ed;border:1px solid #465964;padding:10px;font:12px monospace;resize:vertical;margin:8px 0 14px}
      .kate-remote .remote-status{border-left:3px solid #d8b45c;padding:10px 14px;background:#19242d;color:#efdbaa;white-space:pre-wrap}.kate-remote video{width:100%;max-height:550px;background:#05080c;display:none;outline:2px solid #526776}
      .kate-remote video:focus{outline-color:#f5cb6f}.kate-remote .remote-pad{display:none;gap:8px;flex-wrap:wrap;margin-top:12px}.kate-remote .remote-pad button{touch-action:none;min-width:52px}.kate-remote label{font-size:13px}
    </style>
    <h2>双人远程同屏</h2>
    <p>宿主运行实际游戏并操作 P1；加入方接收宿主画面，用方向键 + 1 / 2 / 3 操作 P2。只分享游戏 canvas，不读取摄像头或麦克风，当前不传声音。在选人界面让加入方按攻击键，加入第二位人类玩家。</p>
    <label><input data-stun type="checkbox"> 使用 Google 公共 STUN 尝试跨网连接</label>
    <p>默认仅尝试局域网直连，不访问 STUN 服务。勾选后会向 Google STUN 发送网络地址信息；没有 TURN 中继，部分跨网 NAT 无法连接。连接码包含网络候选地址，只交给要一起玩的朋友。</p>
    <div class="remote-actions"><button data-create>创建邀请 · 我是宿主</button><button data-join>加入邀请 · 我是 P2</button><button data-disconnect>断开</button></div>
    <label>收到的邀请码 / 回复码<textarea data-in rows="4" maxlength="32000" spellcheck="false" placeholder="加入方粘贴邀请码；宿主粘贴加入方的回复码"></textarea></label>
    <div class="remote-actions"><button data-answer>宿主应用回复码</button></div>
    <label>本机产生的连接码<textarea data-out rows="4" readonly spellcheck="false" placeholder="创建或加入之后会产生连接码，请手动发送给对方"></textarea></label>
    <div class="remote-actions"><button data-copy>复制连接码</button><button data-play>播放画面 / 聚焦 P2 操作</button></div>
    <p class="remote-status" data-status role="status">尚未连接。选择创建或加入才会启动 WebRTC。</p>
    <video data-video autoplay muted playsinline tabindex="0" aria-label="宿主实时游戏画面"></video>
    <div class="remote-pad" data-pad aria-label="P2 按键"><button data-key="ArrowUp">↑</button><button data-key="ArrowLeft">←</button><button data-key="ArrowDown">↓</button><button data-key="ArrowRight">→</button><button data-key="Digit1">攻击 1</button><button data-key="Digit2">跳跃 2</button><button data-key="Digit3">防御 3</button></div>
  </section>`;
  const find = selector => container.querySelector(selector);
  const incoming = find('[data-in]'), outgoing = find('[data-out]'), status = find('[data-status]'), video = find('[data-video]');
  const stun = find('[data-stun]'); let session, busy = false;
  const onState = state => {
    status.textContent = state.detail;
    video.style.display = state.role === 'guest' ? 'block' : 'none';
    find('[data-pad]').style.display = state.role === 'guest' ? 'flex' : 'none';
  };
  const newSession = () => {
    session?.disconnect();
    session = createRemotePlay({ host, canvas, video, publicStun: stun.checked, onState }); return session;
  };
  async function action(callback) {
    if (busy) return; busy = true;
    for (const button of container.querySelectorAll('.remote-actions button')) button.disabled = true;
    try { await callback(); } catch (error) { status.textContent = error.message; }
    finally { busy = false; for (const button of container.querySelectorAll('.remote-actions button')) button.disabled = false; }
  }
  find('[data-create]').onclick = () => action(async () => { outgoing.value = await newSession().createOffer(); });
  find('[data-join]').onclick = () => action(async () => { outgoing.value = await newSession().joinOffer(incoming.value); });
  find('[data-answer]').onclick = () => action(async () => { if (!session) throw new Error('先创建邀请。'); await session.acceptAnswer(incoming.value); });
  find('[data-disconnect]').onclick = () => session?.disconnect();
  find('[data-copy]').onclick = () => action(async () => {
    if (!outgoing.value) throw new Error('当前没有可复制的连接码。');
    try { await navigator.clipboard.writeText(outgoing.value); } catch { outgoing.focus(); outgoing.select(); throw new Error('自动复制不可用，连接码已选中，请手动复制。'); }
  });
  find('[data-play]').onclick = () => { video.play().catch(error => { status.textContent = error.message; }); video.focus(); };
  const keyDown = event => {
    if (!P2_KEYS.has(event.code) || ['TEXTAREA', 'INPUT'].includes(event.target.tagName) || session?.getState().role !== 'guest') return;
    event.preventDefault(); session.key(event.code, true);
  };
  const keyUp = event => {
    if (!P2_KEYS.has(event.code) || session?.getState().role !== 'guest') return;
    event.preventDefault(); session.key(event.code, false);
  };
  container.addEventListener('keydown', keyDown); window.addEventListener('keyup', keyUp);
  for (const button of container.querySelectorAll('[data-key]')) {
    button.onpointerdown = event => { event.preventDefault(); button.setPointerCapture(event.pointerId); session?.key(button.dataset.key, true); };
    button.onpointerup = button.onpointercancel = button.onlostpointercapture = () => session?.key(button.dataset.key, false);
  }
  const release = () => session?.release();
  const visibility = () => { if (document.hidden) release(); };
  window.addEventListener('blur', release); document.addEventListener('visibilitychange', visibility);
  return {
    getSession: () => session,
    dispose() {
      session?.disconnect(); container.removeEventListener('keydown', keyDown); window.removeEventListener('keyup', keyUp);
      window.removeEventListener('blur', release); document.removeEventListener('visibilitychange', visibility); container.replaceChildren();
    },
  };
}
