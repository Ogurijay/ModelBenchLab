// 键盘 / 鼠标 → 意图。UE 侧对应 AProtoMotionCharacter 的 Enhanced Input 绑定
// (IMC_ProtoMotion:WASD→IA_Move、Mouse2D→IA_Look、Space/Shift/Ctrl)。
//
// 这一层只产出**意图**,不碰仿真:main.js 每帧把这里的字段搬给 ProtoMovement。
// 分成两层是原作的结构(输入 → 意图 → 条件图),也让自检能不经过键盘直接施加同样的意图。
//
// 一个约束值得注意:本文件虽然住在 src/sim/ 下(PORT_SPEC §10 的划分),
// 但它是唯一碰 DOM 的那个 —— 所以 window / document 只在 attach() 之后、
// 在事件回调里访问,模块顶层与构造函数一个都不碰。这样 node 里 `import` 它不会炸,
// 仿真层的「可无头运行」不受影响。
//
// 单位:度(yaw/pitch)。moveInput 是无量纲的推杆量。

/** 俯仰钳制,与 gfx/camera.js 的 PITCH_LIMIT 一致。 */
const PITCH_LIMIT = 80;

/**
 * 鼠标灵敏度(度/像素)。**不是**手感常量表里的数 —— UE 那边是
 * PlayerController 的 InputYawScale 乘引擎的鼠标标度,没有可照抄的等价值。
 * 属于表现层参数,允许调,不作为对齐项。
 */
const DEFAULT_SENSITIVITY = 0.15;

/**
 * 「轻推」幅度。键盘只有 0/1,而 TUNING.WalkInputThreshold = 0.55 要求能区分走和跑,
 * 所以按住 Alt 时把幅度降到 0.35(< 0.55 ⇒ 走)。这就是自检第 2 项用的那个数;
 * 顺带保证斜向轻推(0.35, 0.35)的模长 0.495 也仍在阈值之内。
 */
const WALK_MODIFIER_SCALE = 0.35;

/** code → 意图。用 `code` 而不是 `key`:Alt 组合键与非 QWERTY 布局下 `key` 会变。 */
const KEY_FORWARD = new Set(['KeyW', 'ArrowUp']);
const KEY_BACK = new Set(['KeyS', 'ArrowDown']);
const KEY_LEFT = new Set(['KeyA', 'ArrowLeft']);
const KEY_RIGHT = new Set(['KeyD', 'ArrowRight']);
const KEY_SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const KEY_ROLL = new Set(['ControlLeft', 'ControlRight']);
const KEY_WALK_MOD = new Set(['AltLeft', 'AltRight']);
const KEY_JUMP = new Set(['Space']);

/** 需要吞掉浏览器默认行为的键:空格会滚页面,方向键会滚页面,Alt 会点亮菜单栏。 */
const HANDLED = new Set([
  ...KEY_FORWARD, ...KEY_BACK, ...KEY_LEFT, ...KEY_RIGHT,
  ...KEY_SPRINT, ...KEY_ROLL, ...KEY_WALK_MOD, ...KEY_JUMP,
]);

export class InputState {
  constructor({ sensitivity = DEFAULT_SENSITIVITY, autoPointerLock = true } = {}) {
    /** x = 前后,y = 左右 —— 与 ProtoMovement.setMoveInput 的约定一致(不是屏幕坐标)。 */
    this.moveInput = { x: 0, y: 0 };
    this.sprintHeld = false;
    /** 空格按住 = 滑翔意图(与跳同一个键,原作如此)。 */
    this.glideHeld = false;

    /** 控制器朝向。相机与「相机相对的输入方向」共用它。 */
    this.yawDeg = 0;
    this.pitchDeg = 0;

    this.sensitivity = sensitivity;
    this.autoPointerLock = autoPointerLock;
    /** 指针是否已锁定。没锁定时不吃鼠标位移 —— 否则光标一进窗口视角就乱转。 */
    this.pointerLocked = false;

    this._held = new Set();
    this._jumpPressed = false;
    this._rollPressed = false;

    this._element = null;
    this._doc = null;
    this._win = null;
    this._handlers = null;
  }

  // -------------------------------------------------------------------------
  // 装卸
  // -------------------------------------------------------------------------

  /**
   * 绑定监听。键盘挂在 document 上(不要求画布先获得焦点),
   * 鼠标位移也挂 document —— 指针锁定后事件的 target 是文档而不是画布。
   */
  attach(element) {
    if (this._element) this.detach();
    if (!element) return this;

    const doc = element.ownerDocument || element.document || element;
    const win = doc.defaultView || null;

    const handlers = {
      keydown: (e) => this._onKeyDown(e),
      keyup: (e) => this._onKeyUp(e),
      mousemove: (e) => this._onMouseMove(e),
      pointerlockchange: () => {
        this.pointerLocked = doc.pointerLockElement === element;
      },
      click: () => {
        if (this.autoPointerLock && !this.pointerLocked && element.requestPointerLock) {
          // 返回的是 Promise(新版浏览器),被用户手势策略拒绝时不要炸掉主循环
          const r = element.requestPointerLock();
          if (r && typeof r.catch === 'function') r.catch(() => {});
        }
      },
      // 切走窗口时键会「卡住」:焦点一丢就全部松开。
      blur: () => this.releaseAll(),
    };

    doc.addEventListener('keydown', handlers.keydown);
    doc.addEventListener('keyup', handlers.keyup);
    doc.addEventListener('mousemove', handlers.mousemove);
    doc.addEventListener('pointerlockchange', handlers.pointerlockchange);
    element.addEventListener('click', handlers.click);
    if (win) win.addEventListener('blur', handlers.blur);

    this._element = element;
    this._doc = doc;
    this._win = win;
    this._handlers = handlers;
    return this;
  }

  detach() {
    if (!this._element) return this;
    const { _doc: doc, _element: element, _win: win, _handlers: h } = this;

    doc.removeEventListener('keydown', h.keydown);
    doc.removeEventListener('keyup', h.keyup);
    doc.removeEventListener('mousemove', h.mousemove);
    doc.removeEventListener('pointerlockchange', h.pointerlockchange);
    element.removeEventListener('click', h.click);
    if (win) win.removeEventListener('blur', h.blur);

    this._element = null;
    this._doc = null;
    this._win = null;
    this._handlers = null;
    this.releaseAll();
    return this;
  }

  /** 松开一切。切窗口、开自检、暂停时用,防止「按着 W 去干别的」回来还在跑。 */
  releaseAll() {
    this._held.clear();
    this.sprintHeld = false;
    this.glideHeld = false;
    this.moveInput.x = 0;
    this.moveInput.y = 0;
    this._jumpPressed = false;
    this._rollPressed = false;
    return this;
  }

  // -------------------------------------------------------------------------
  // 一次性意图
  // -------------------------------------------------------------------------

  consumeJumpPressed() {
    const b = this._jumpPressed;
    this._jumpPressed = false;
    return b;
  }

  consumeRollPressed() {
    const b = this._rollPressed;
    this._rollPressed = false;
    return b;
  }

  // -------------------------------------------------------------------------
  // PORT_SPEC §10 约定的读法
  // -------------------------------------------------------------------------
  //
  // §10 把 InputState 写成 `{ moveInput, sprintHeld, glideHeld, jumpPressed, rollPressed, yaw }`,
  // 而本文件把两个一次性意图做成了 `consume*()` 方法 —— 一次性意图必须有明确的**消费点**,
  // 否则「按一下跳」会被连着好几帧读到(main.js 里就为此栽过一次:0 仿真步的那一帧
  // 把跳跃吃掉了)。所以 consume* 才是推荐用法。
  //
  // 但 §10 是各模块之间的契约,按它写的第二个消费者必须也能用:`input.yaw` 拿到
  // undefined 会变成 NaN 传给 setControlYaw、`input.jumpPressed` 恒 undefined 会导致永远跳不起来,
  // 而且两处都不报错。所以补三个**只读别名**和 §10 伪代码里的 `apply(movement)`。

  /** §10 的 `yaw`。本文件内部叫 yawDeg(明确单位是度),这里是同一个数。 */
  get yaw() {
    return this.yawDeg;
  }

  /** §10 的 `jumpPressed`:**只看不消费**。真要驱动仿真请用 consumeJumpPressed()。 */
  get jumpPressed() {
    return this._jumpPressed;
  }

  /** §10 的 `rollPressed`:同上,只看不消费。 */
  get rollPressed() {
    return this._rollPressed;
  }

  /**
   * §10 伪代码里的 `input.apply(world.movement)` —— 把本帧意图整体搬给 ProtoMovement。
   * 一次性意图在这里**消费掉**,所以每个仿真步只许调一次(和 main.js 的 applyIntent 同义)。
   */
  apply(movement) {
    if (!movement) return this;
    const jump = this.consumeJumpPressed();
    const roll = this.consumeRollPressed();

    movement.setMoveInput(this.moveInput.x, this.moveInput.y);
    movement.setSprintHeld(this.sprintHeld);
    movement.setGlideHeld(this.glideHeld);
    movement.setControlYaw(this.yawDeg);

    // 空中的 tryJump 会被正确拒绝;拒绝也算这次按键用掉了(UE 的 Jump 同样是按帧消费)。
    if (jump) movement.tryJump();
    if (roll) movement.tryRoll();
    return this;
  }

  // -------------------------------------------------------------------------
  // 事件
  // -------------------------------------------------------------------------

  _onKeyDown(e) {
    const code = e.code;
    if (!HANDLED.has(code)) return;
    if (e.preventDefault) e.preventDefault();

    // 自动重复不该重新触发一次性意图(否则按住空格会连跳)
    const fresh = !this._held.has(code) && !e.repeat;
    this._held.add(code);

    if (KEY_JUMP.has(code)) {
      if (fresh) this._jumpPressed = true;
      // 按下的同一刻就置滑翔意图:UE 的 Started(跳) 与 Triggered(滑翔) 是同一帧的两个事件
      this.glideHeld = true;
    }
    if (KEY_ROLL.has(code) && fresh) this._rollPressed = true;
    if (KEY_SPRINT.has(code)) this.sprintHeld = true;

    this._recomputeMove();
  }

  _onKeyUp(e) {
    const code = e.code;
    if (!HANDLED.has(code)) return;
    if (e.preventDefault) e.preventDefault();

    this._held.delete(code);
    if (KEY_JUMP.has(code)) this.glideHeld = false;
    if (KEY_SPRINT.has(code)) this.sprintHeld = this._anyHeld(KEY_SPRINT);

    this._recomputeMove();
  }

  _onMouseMove(e) {
    if (!this.pointerLocked) return;
    const dx = e.movementX || 0;
    const dy = e.movementY || 0;
    // UE:AddControllerYawInput(+X)、AddControllerPitchInput(−Y)。
    // 屏幕 Y 向下为正,所以往上推鼠标 ⇒ pitch 变大 ⇒ 抬头(与 gfx/camera.js 的 pitch 约定一致)。
    this.yawDeg += dx * this.sensitivity;
    this.pitchDeg -= dy * this.sensitivity;
    if (this.yawDeg > 180 || this.yawDeg <= -180) {
      this.yawDeg -= Math.floor((this.yawDeg + 180) / 360) * 360;
    }
    if (this.pitchDeg > PITCH_LIMIT) this.pitchDeg = PITCH_LIMIT;
    else if (this.pitchDeg < -PITCH_LIMIT) this.pitchDeg = -PITCH_LIMIT;
  }

  // -------------------------------------------------------------------------
  // 内部
  // -------------------------------------------------------------------------

  /**
   * 键盘 → 推杆。斜向**不归一化**:UE 里 WASD 是加到同一个 Axis2D 上的,
   * W+D 得到 (1,1)、模长 1.414,于是 |input| >= 0.55 判为跑、加速度再被
   * ScaleInputAcceleration 钳回长度 1。照抄这个行为,别顺手归一化。
   */
  _recomputeMove() {
    const x = (this._anyHeld(KEY_FORWARD) ? 1 : 0) - (this._anyHeld(KEY_BACK) ? 1 : 0);
    const y = (this._anyHeld(KEY_RIGHT) ? 1 : 0) - (this._anyHeld(KEY_LEFT) ? 1 : 0);
    const scale = this._anyHeld(KEY_WALK_MOD) ? WALK_MODIFIER_SCALE : 1;
    this.moveInput.x = x * scale;
    this.moveInput.y = y * scale;
  }

  _anyHeld(codes) {
    for (const c of codes) if (this._held.has(c)) return true;
    return false;
  }
}

export default InputState;
