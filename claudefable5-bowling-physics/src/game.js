/**
 * 对局状态机:瞄准 → 蓄力 → 滚球 → 静定 → 扫瓶 → 下一投 / 结束。
 * 计分完全交给 scoring.js 纯函数;本模块只维护 rolls 数组与摆瓶。
 */
import { score, isGameOver } from './scoring.js';
import { predictPath } from './physics.js';

export const Phase = {
  AIMING: 'aiming',
  POWER: 'power',
  ROLLING: 'rolling',
  SETTLING: 'settling',
  SWEEP: 'sweep',
  GAME_OVER: 'gameover',
};

const AIM_LIMIT = 9; // 瞄准角度 ±9°
const POWER_SPEED = 1.7; // 蓄力条往返速度(次/秒)

export class Game {
  constructor({ physics, sceneMgr, ui, audio }) {
    this.physics = physics;
    this.sceneMgr = sceneMgr;
    this.ui = ui;
    this.audio = audio;
    this.reset();
  }

  reset() {
    this.phase = Phase.AIMING;
    this.rolls = [];
    this.frameIndex = 0;
    this.rollInFrame = 0;
    this.standing = Array(10).fill(true);
    this.aim = { angleDeg: 0, spin: 0, power: 0.75 };
    this.powerT = 0;
    this.settleTimer = 0;
    this.rollTimer = 0;
    this.sweepT = -1;
    this.gutterThisRoll = false;
    this.physics.rackAll();
    this.physics.resetBall();
    this.sceneMgr.setBallVisible(true);
    this.sceneMgr.setAimVisible(true);
    this.sceneMgr.sweeper.position.set(0, 1.6, -16.15); // 扫瓶机归位
    this.ui.hideGameOver();
    this._refreshAimPreview();
    this._refreshUI();
  }

  // ---------- 输入 ----------
  adjustAim(deltaDeg) {
    if (this.phase !== Phase.AIMING && this.phase !== Phase.POWER) return;
    this.aim.angleDeg = Math.max(-AIM_LIMIT, Math.min(AIM_LIMIT, this.aim.angleDeg + deltaDeg));
    this.ui.setAimReadout(this.aim.angleDeg);
    this._refreshAimPreview();
  }

  setSpin(v) {
    // v: -1 ~ 1
    this.aim.spin = Math.max(-1, Math.min(1, v));
    this.ui.setSpinReadout(this.aim.spin);
    if (this.phase === Phase.AIMING || this.phase === Phase.POWER) this._refreshAimPreview();
  }

  /** 空格 / 出手按钮:瞄准态 → 开始蓄力;蓄力态 → 定格出手 */
  primaryAction() {
    if (this.phase === Phase.AIMING) {
      this.phase = Phase.POWER;
      this.powerT = 0;
      this.audio.click();
      this._refreshUI();
    } else if (this.phase === Phase.POWER) {
      this._throw();
    }
  }

  _throw() {
    this.phase = Phase.ROLLING;
    this.rollTimer = 0;
    this.gutterThisRoll = false;
    this.sceneMgr.setAimVisible(false);
    this.physics.throwBall({
      power: this.aim.power,
      angleDeg: this.aim.angleDeg,
      spin: this.aim.spin,
    });
    this.audio.throwWhoosh();
    this._refreshUI();
  }

  // ---------- 主循环 ----------
  update(dt) {
    // 蓄力条往返振荡
    if (this.phase === Phase.POWER) {
      this.powerT += dt * POWER_SPEED;
      const tri = 1 - Math.abs((this.powerT % 2) - 1); // 0→1→0 三角波
      this.aim.power = tri;
      this.ui.setPower(tri);
      this._refreshAimPreview();
    }

    this.physics.step(dt);
    this.sceneMgr.syncFromPhysics(this.physics);

    // 滚球音效
    const rolling = this.phase === Phase.ROLLING && !this.physics.ballDone();
    this.audio.updateRolling(rolling ? this.physics.ballSpeed() : 0);

    if (this.phase === Phase.ROLLING) {
      this.rollTimer += dt;
      if (this.physics.isGutter && !this.gutterThisRoll) {
        this.gutterThisRoll = true;
      }
      if (this.physics.ball.position.z < -18.0) this.sceneMgr.setBallVisible(false);
      if (this.physics.ballDone() || this.rollTimer > 12) {
        this.phase = Phase.SETTLING;
        this.settleTimer = 0;
      }
    } else if (this.phase === Phase.SETTLING) {
      this.settleTimer += dt;
      if ((this.settleTimer > 1.0 && this.physics.pinsSettled()) || this.settleTimer > 6) {
        this._resolveRoll();
      }
    } else if (this.phase === Phase.SWEEP) {
      this._updateSweep(dt);
    }

    // 相机
    const camMode =
      this.phase === Phase.ROLLING
        ? 'follow'
        : this.phase === Phase.SETTLING || this.phase === Phase.SWEEP
          ? 'deck'
          : 'aim';
    this.sceneMgr.updateCamera(camMode, this.physics.ball.position, dt);
  }

  // ---------- 结算 ----------
  _resolveRoll() {
    const nowMask = this.physics.standingMaskNow();
    // 锁存:本投之前站着、现在倒了才算击倒
    const newStanding = this.standing.map((s, i) => s && nowMask[i]);
    const before = this.standing.filter(Boolean).length;
    const after = newStanding.filter(Boolean).length;
    const knocked = before - after;
    this.standing = newStanding;
    this.rolls.push(knocked);

    // 提示横幅
    const rackWasFull = before === 10;
    if (knocked === 10 && rackWasFull) {
      this.ui.showCallout('全中 STRIKE!', 'pink');
      this.audio.strikeFanfare();
    } else if (after === 0 && !rackWasFull) {
      this.ui.showCallout('补中 SPARE!', 'cyan');
      this.audio.spareJingle();
    } else if (this.gutterThisRoll && knocked === 0) {
      this.ui.showCallout('洗沟…', 'dim');
    } else if (knocked === 0) {
      this.ui.showCallout('颗粒无收…', 'dim');
    }

    this.phase = Phase.SWEEP;
    this.sweepT = 0;
    this._sweptMid = false;
    this._refreshUI();
  }

  /** 扫瓶机动画时间轴:下压 0.4s → 前扫 0.8s(途中移走倒瓶)→ 抬起 → 归位 */
  _updateSweep(dt) {
    this.sweepT += dt;
    const t = this.sweepT;
    const sw = this.sceneMgr.sweeper;
    const zFront = -16.15;
    const zBack = -18.35;
    if (t < 0.4) {
      sw.position.set(0, 1.6 - (t / 0.4) * 1.28, zFront);
    } else if (t < 1.2) {
      const k = (t - 0.4) / 0.8;
      sw.position.set(0, 0.32, zFront + (zBack - zFront) * k);
      if (!this._sweptMid && k > 0.45) {
        this._sweptMid = true;
        this.physics.sweepFallen(this.standing);
        this.physics.resetBall();
        this.sceneMgr.setBallVisible(false);
      }
    } else if (t < 1.6) {
      sw.position.set(0, 0.32 + ((t - 1.2) / 0.4) * 1.28, zBack);
    } else if (t < 2.0) {
      const k = (t - 1.6) / 0.4;
      sw.position.set(0, 1.6, zBack + (zFront - zBack) * k);
    } else {
      sw.position.set(0, 1.6, zFront);
      this._nextRoll();
    }
  }

  _nextRoll() {
    if (isGameOver(this.rolls)) {
      this._gameOver();
      return;
    }

    if (this.frameIndex < 9) {
      const standingCount = this.standing.filter(Boolean).length;
      const frameDone = this.rollInFrame === 1 || standingCount === 0;
      if (frameDone) {
        this.frameIndex += 1;
        this.rollInFrame = 0;
        this.standing = Array(10).fill(true);
        this.physics.rackAll();
      } else {
        this.rollInFrame = 1;
        this.physics.rackMask(this.standing); // 保留站立瓶原地
      }
    } else {
      // 第 10 轮:任一投后无瓶站立 → 满架重摆(strike / spare 补投规则)
      this.rollInFrame += 1;
      if (this.standing.filter(Boolean).length === 0) {
        this.standing = Array(10).fill(true);
        this.physics.rackAll();
      } else {
        this.physics.rackMask(this.standing);
      }
    }

    this.physics.resetBall();
    this.sceneMgr.setBallVisible(true);
    this.phase = Phase.AIMING;
    this.aim.power = 0.75;
    this.sceneMgr.setAimVisible(true);
    this._refreshAimPreview();
    this._refreshUI();
  }

  _gameOver() {
    this.phase = Phase.GAME_OVER;
    this.sceneMgr.setAimVisible(false);
    const result = score(this.rolls);
    const strikes = this.rolls.filter((r) => r === 10).length;
    let comment;
    if (result.total === 300) comment = '完美一局!300 分传奇!';
    else if (result.total >= 200) comment = '职业级发挥!';
    else if (result.total >= 150) comment = '相当不错的一局!';
    else if (result.total >= 100) comment = '稳定发挥,再接再厉!';
    else if (result.total > 0) comment = '熟能生巧,再来一局?';
    else comment = '沟里的鱼都被你喂饱了…';
    this.ui.showGameOver(result.total, comment, `全中 ${strikes} 次 · 共 ${this.rolls.length} 投`);
    this.audio.gameOverTune();
    this._refreshUI();
  }

  // ---------- UI 同步 ----------
  _refreshAimPreview() {
    const path = predictPath({
      power: this.aim.power,
      angleDeg: this.aim.angleDeg,
      spin: this.aim.spin,
    });
    this.sceneMgr.setAimPath(path.points, path.gutter);
  }

  _refreshUI() {
    const result = score(this.rolls);
    this.ui.renderScoreboard(result, this.phase === Phase.GAME_OVER ? -1 : this.frameIndex);
    if (this.phase === Phase.GAME_OVER) {
      this.ui.setStatus(`一局结束 · 总分 ${result.total}`);
    } else {
      this.ui.setStatus(`第 ${this.frameIndex + 1} 轮 · 第 ${this.rollInFrame + 1} 投`);
    }
    this.ui.setPhase(this.phase);
    this.ui.setAimReadout(this.aim.angleDeg);
    this.ui.setSpinReadout(this.aim.spin);
  }

  getState() {
    const result = score(this.rolls);
    const b = this.physics.ball;
    return {
      phase: this.phase,
      frame: this.frameIndex + 1,
      rollInFrame: this.rollInFrame + 1,
      rolls: [...this.rolls],
      total: result.total,
      standing: this.standing.filter(Boolean).length,
      gutter: this.physics.isGutter,
      ball: {
        x: +b.position.x.toFixed(3),
        y: +b.position.y.toFixed(3),
        z: +b.position.z.toFixed(3),
        speed: +b.velocity.length().toFixed(3),
      },
      aim: { ...this.aim },
    };
  }
}
