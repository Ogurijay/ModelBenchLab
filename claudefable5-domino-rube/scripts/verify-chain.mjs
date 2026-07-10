// ============================================================
// verify-chain.mjs — headless 链条验证(node scripts/verify-chain.mjs)
// machine.js 纯 cannon-es、不依赖 three/DOM,可直接在 Node 驱动:
//   1) 连跑 RUNS 次「新建 Machine(=复位语义)→ 触发 → 固定步进」
//   2) 断言:铃铛必响、5 阶段单调走通
//   3) 断言:各次 bellRungAt / stageTimes 逐比特一致(确定性)
// 退出码:0 = 全部通过;1 = 断链或不一致
// ============================================================
import { Machine } from '../src/machine.js';
import { FIXED_DT } from '../src/config.js';

const RUNS = 5;                       // 对齐验收陷阱:连续触发→复位 5 次
const MAX_SIM_SECONDS = 25;
const MAX_STEPS = Math.round(MAX_SIM_SECONDS / FIXED_DT);

function runOnce(label) {
  const impacts = [];
  const machine = new Machine({
    onImpact: (info) => impacts.push(info.kind),
    onBell: () => {},
    onStage: () => {},
  });
  machine.trigger();
  let stepsAfterBell = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    machine.step();
    if (machine.bellRung && ++stepsAfterBell >= 240) break;  // 响铃后再跑 2s 观察稳定性
  }
  const s = machine.getState();
  // 卫生检查:动态刚体不得跌出桌面(y < -1 视为穿模掉落)
  const fell = Object.entries(machine.dyn).flatMap(([k, v]) =>
    (Array.isArray(v) ? v : [v]).filter((b) => b.position.y < -1).map(() => k));
  console.log(`[${label}] bellRung=${s.bellRung} bellRungAt=${s.bellRungAt} ` +
    `stageTimes=${JSON.stringify(s.stageTimes)} ticks=${s.tick} impacts=${impacts.length} fell=${JSON.stringify(fell)}`);
  return { ...s, fell };
}

let ok = true;
const results = [];
for (let r = 1; r <= RUNS; r++) results.push(runOnce(`run ${r}/${RUNS}`));

for (const [i, s] of results.entries()) {
  if (!s.bellRung) { ok = false; console.error(`FAIL run ${i + 1}: 铃铛未响`); }
  if (s.currentStage !== 5) { ok = false; console.error(`FAIL run ${i + 1}: 只到阶段 ${s.currentStage}`); }
  for (let n = 1; n <= 5; n++) {
    if (!(s.stageTimes[n] >= 0) || (n > 1 && s.stageTimes[n] < s.stageTimes[n - 1])) {
      ok = false; console.error(`FAIL run ${i + 1}: 阶段 ${n} 时刻异常 ${s.stageTimes[n]}`);
    }
  }
  if (s.fell.length) { ok = false; console.error(`FAIL run ${i + 1}: 刚体掉出桌面 ${s.fell}`); }
}
const sig0 = JSON.stringify({ bellRungAt: results[0].bellRungAt, stageTimes: results[0].stageTimes });
for (const [i, s] of results.entries()) {
  const sig = JSON.stringify({ bellRungAt: s.bellRungAt, stageTimes: s.stageTimes });
  if (sig !== sig0) { ok = false; console.error(`FAIL run ${i + 1}: 与 run 1 不一致\n  ${sig}\n  ${sig0}`); }
}

console.log(ok ? `PASS: ${RUNS} 次运行铃铛必响且逐比特一致 (bellRungAt=${results[0].bellRungAt}s)` : 'FAIL');
process.exit(ok ? 0 : 1);
