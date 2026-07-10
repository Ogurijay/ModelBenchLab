/**
 * 保龄球十轮计分 — 独立纯函数模块(无任何 DOM / 物理依赖)。
 *
 * score(rolls) : rolls 为逐球击倒数数组(0~10)
 *   返回 { frames: [{ rolls, score, cumulative }], total }
 *   - frames 固定 10 项;未投到的轮 rolls 为空数组
 *   - strike / spare 的顺延加分未凑齐时,该轮 score / cumulative 为 null(记分板显示留空)
 *   - 第 10 轮特判:strike 补 2 球、spare 补 1 球,最多 3 投,得分为三球直加
 *   - total 为最后一个可确定轮的累计分(无可确定轮时为 0)
 */

export function score(rolls) {
  const frames = [];
  let i = 0;
  let cumulative = 0;
  let total = 0;

  for (let f = 0; f < 10; f++) {
    if (f < 9) {
      const a = rolls[i];
      if (a === undefined) {
        frames.push({ rolls: [], score: null, cumulative: null });
        continue;
      }
      let frameRolls;
      let frameScore = null;
      if (a === 10) {
        // strike:补后两球
        frameRolls = [10];
        const b1 = rolls[i + 1];
        const b2 = rolls[i + 2];
        if (b1 !== undefined && b2 !== undefined) frameScore = 10 + b1 + b2;
        i += 1;
      } else {
        const b = rolls[i + 1];
        frameRolls = b === undefined ? [a] : [a, b];
        if (b !== undefined) {
          if (a + b === 10) {
            // spare:补后一球
            const b1 = rolls[i + 2];
            if (b1 !== undefined) frameScore = 10 + b1;
          } else {
            frameScore = a + b;
          }
        }
        i += 2;
      }
      if (frameScore !== null && cumulative !== null) {
        cumulative += frameScore;
        frames.push({ rolls: frameRolls, score: frameScore, cumulative });
        total = cumulative;
      } else {
        cumulative = null;
        frames.push({ rolls: frameRolls, score: frameScore, cumulative: null });
      }
    } else {
      // 第 10 轮:最多 3 球,直加
      const fr = rolls.slice(i, i + 3).filter((r) => r !== undefined);
      const bonusEarned = fr.length >= 2 && (fr[0] === 10 || fr[0] + fr[1] === 10);
      const complete = bonusEarned ? fr.length === 3 : fr.length === 2;
      const frameScore = complete ? fr.reduce((s, r) => s + r, 0) : null;
      if (frameScore !== null && cumulative !== null) {
        cumulative += frameScore;
        frames.push({ rolls: fr, score: frameScore, cumulative });
        total = cumulative;
      } else {
        frames.push({ rolls: fr, score: frameScore, cumulative: null });
      }
    }
  }

  return { frames, total };
}

/** 第 10 轮允许的最大投数:strike 或 spare → 3 投,否则 2 投 */
export function tenthFrameMaxRolls(tenthRolls) {
  if (tenthRolls.length < 2) return 3; // 尚未确定
  if (tenthRolls[0] === 10 || tenthRolls[0] + tenthRolls[1] === 10) return 3;
  return 2;
}

/** 整局是否结束(rolls 为完整逐球数组) */
export function isGameOver(rolls) {
  let i = 0;
  for (let f = 0; f < 9; f++) {
    const a = rolls[i];
    if (a === undefined) return false;
    if (a === 10) {
      i += 1;
    } else {
      if (rolls[i + 1] === undefined) return false;
      i += 2;
    }
  }
  const tenth = rolls.slice(i);
  if (tenth.length < 2) return false;
  return tenth.length >= tenthFrameMaxRolls(tenth);
}
