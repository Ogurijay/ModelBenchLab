import type { Direction, GameCommand } from "../simulation/types";

const keyToDirection = new Map<string, Direction>([
  ["ArrowUp", "up"],
  ["KeyW", "up"],
  ["ArrowRight", "right"],
  ["KeyD", "right"],
  ["ArrowDown", "down"],
  ["KeyS", "down"],
  ["ArrowLeft", "left"],
  ["KeyA", "left"],
]);

const preventedKeys = new Set(["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft", "Space"]);

export class InputController {
  private heldDirections: Direction[] = [];
  private fireHeld = false;
  private confirmQueued = false;
  private restartQueued = false;
  private pauseQueued = false;
  private cleanup: Array<() => void> = [];

  constructor(private readonly root: Document) {
    this.bindKeyboard();
    this.bindPointerButtons();
  }

  readFrame(): GameCommand {
    const command: GameCommand = {
      move: this.heldDirections.at(-1) ?? null,
      fire: this.fireHeld,
      confirm: this.confirmQueued,
      restart: this.restartQueued,
      togglePause: this.pauseQueued,
    };

    this.confirmQueued = false;
    this.restartQueued = false;
    this.pauseQueued = false;
    return command;
  }

  dispose(): void {
    for (const remove of this.cleanup) remove();
    this.cleanup = [];
  }

  private bindKeyboard(): void {
    const keydown = (event: KeyboardEvent) => {
      if (preventedKeys.has(event.code)) event.preventDefault();

      const direction = keyToDirection.get(event.code);
      if (direction && !this.heldDirections.includes(direction)) {
        this.heldDirections.push(direction);
      }

      if (event.code === "Space") this.fireHeld = true;
      if (event.code === "Enter") this.confirmQueued = true;
      if (event.code === "KeyR") this.restartQueued = true;
      if (event.code === "KeyP" || event.code === "Escape") this.pauseQueued = true;
    };

    const keyup = (event: KeyboardEvent) => {
      const direction = keyToDirection.get(event.code);
      if (direction) this.heldDirections = this.heldDirections.filter((held) => held !== direction);
      if (event.code === "Space") this.fireHeld = false;
    };

    window.addEventListener("keydown", keydown);
    window.addEventListener("keyup", keyup);
    this.cleanup.push(() => window.removeEventListener("keydown", keydown));
    this.cleanup.push(() => window.removeEventListener("keyup", keyup));
  }

  private bindPointerButtons(): void {
    const buttons = [...this.root.querySelectorAll<HTMLButtonElement>("[data-action]")];
    for (const button of buttons) {
      const action = button.dataset.action;
      const pointerDown = (event: PointerEvent) => {
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        if (action === "fire") {
          this.fireHeld = true;
          return;
        }
        if (action === "pause") {
          this.pauseQueued = true;
          return;
        }
        if (action === "up" || action === "right" || action === "down" || action === "left") {
          this.heldDirections = this.heldDirections.filter((held) => held !== action);
          this.heldDirections.push(action);
        }
      };

      const pointerUp = (event: PointerEvent) => {
        event.preventDefault();
        if (action === "fire") this.fireHeld = false;
        if (action === "up" || action === "right" || action === "down" || action === "left") {
          this.heldDirections = this.heldDirections.filter((held) => held !== action);
        }
      };

      button.addEventListener("pointerdown", pointerDown);
      button.addEventListener("pointerup", pointerUp);
      button.addEventListener("pointercancel", pointerUp);
      button.addEventListener("lostpointercapture", pointerUp);
      this.cleanup.push(() => button.removeEventListener("pointerdown", pointerDown));
      this.cleanup.push(() => button.removeEventListener("pointerup", pointerUp));
      this.cleanup.push(() => button.removeEventListener("pointercancel", pointerUp));
      this.cleanup.push(() => button.removeEventListener("lostpointercapture", pointerUp));
    }

    const messageAction = this.root.querySelector<HTMLButtonElement>("#message-action");
    if (messageAction) {
      const click = () => {
        this.confirmQueued = true;
      };
      messageAction.addEventListener("click", click);
      this.cleanup.push(() => messageAction.removeEventListener("click", click));
    }
  }
}
