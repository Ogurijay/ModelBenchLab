import type { GameSnapshot } from "../game/simulation/types";

interface HudElements {
  level: HTMLElement;
  lives: HTMLElement;
  base: HTMLElement;
  score: HTMLElement;
  enemyPips: HTMLElement;
  toast: HTMLElement;
  message: HTMLElement;
  messageTitle: HTMLElement;
  messageBody: HTMLElement;
  messageAction: HTMLElement;
}

export interface HudController {
  update: (snapshot: GameSnapshot) => void;
}

export function createHud(documentRef: Document): HudController {
  const elements: HudElements = {
    level: mustGet(documentRef, "level-value"),
    lives: mustGet(documentRef, "lives-value"),
    base: mustGet(documentRef, "base-value"),
    score: mustGet(documentRef, "score-value"),
    enemyPips: mustGet(documentRef, "enemy-pips"),
    toast: mustGet(documentRef, "toast"),
    message: mustGet(documentRef, "message"),
    messageTitle: mustGet(documentRef, "message-title"),
    messageBody: mustGet(documentRef, "message-body"),
    messageAction: mustGet(documentRef, "message-action"),
  };

  let previousPipKey = "";
  let movedOnce = false;

  return {
    update(snapshot) {
      elements.level.textContent = `${snapshot.levelNumber} / ${snapshot.totalLevels}`;
      elements.lives.textContent = String(snapshot.lives);
      elements.base.textContent = snapshot.baseAlive ? "安全" : "失守";
      elements.base.style.color = snapshot.baseAlive ? "var(--ally)" : "var(--danger)";
      elements.score.textContent = snapshot.score.toLocaleString("zh-CN");

      const pipKey = `${snapshot.enemiesTotal}-${snapshot.enemiesDefeated}`;
      if (pipKey !== previousPipKey) {
        elements.enemyPips.replaceChildren(
          ...Array.from({ length: snapshot.enemiesTotal }, (_, index) => {
            const pip = documentRef.createElement("span");
            pip.className = `enemy-pip${index < snapshot.enemiesDefeated ? " defeated" : ""}`;
            return pip;
          }),
        );
        previousPipKey = pipKey;
      }

      if (!movedOnce && snapshot.phase === "playing" && snapshot.tanks.some((tank) => tank.side === "player" && tank.moving)) {
        movedOnce = true;
      }
      elements.toast.classList.toggle("is-dim", movedOnce || snapshot.phase !== "playing");

      const message = messageForPhase(snapshot);
      if (message) {
        elements.message.hidden = false;
        elements.messageTitle.textContent = message.title;
        elements.messageBody.textContent = message.body;
        elements.messageAction.textContent = message.action;
      } else {
        elements.message.hidden = true;
      }
    },
  };
}

function messageForPhase(snapshot: GameSnapshot): { title: string; body: string; action: string } | null {
  if (snapshot.phase === "ready") {
    return {
      title: "GPT Tank 3D",
      body: "经典坦克大战规则：保护底部基地，击破全部敌军。砖墙可被子弹打穿，钢墙不可破坏，水域会挡住坦克。",
      action: "开始作战",
    };
  }
  if (snapshot.phase === "paused") {
    return {
      title: "已暂停",
      body: "P 或 Esc 继续。R 可以重开当前关卡。",
      action: "继续",
    };
  }
  if (snapshot.phase === "won") {
    return {
      title: `第 ${snapshot.levelNumber} 关完成`,
      body: "敌方坦克已全部清除，准备进入下一关。",
      action: "下一关",
    };
  }
  if (snapshot.phase === "lost") {
    return {
      title: snapshot.baseAlive ? "坦克耗尽" : "基地失守",
      body: "按 Enter 或点击按钮重试当前关卡。建议先清出基地前方射界，再向上推进。",
      action: "重试",
    };
  }
  if (snapshot.phase === "complete") {
    return {
      title: "10 关全清",
      body: "前 10 关已经全部通过。按 Enter 可以从第 1 关重新开始。",
      action: "重新开始",
    };
  }
  return null;
}

function mustGet(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);
  if (!element) throw new Error(`Missing HUD element: #${id}`);
  return element;
}
