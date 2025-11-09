// Chrome DevTools Protocol utilities for browser automation
// Adapted from reference implementation

import type { BrowserAgentAction } from "./types";

// Minimal Protocol types we need
export namespace Protocol {
  export namespace Page {
    export interface GetFrameTreeResponse {
      frameTree: { frame: { id: string } };
    }
    export interface GetLayoutMetricsResponse {
      cssLayoutViewport: { clientWidth: number; clientHeight: number };
    }
    export interface CaptureScreenshotResponse {
      data: string;
    }
    export interface GetNavigationHistoryResponse {
      entries: Array<{ id: number }>;
      currentIndex: number;
    }
  }
  export namespace Input {
    export interface DispatchMouseEventRequest {
      type: "mousePressed" | "mouseReleased" | "mouseMoved" | "mouseWheel";
      x: number;
      y: number;
      button?: "none" | "left" | "right" | "middle";
      buttons?: number;
      clickCount?: number;
      deltaX?: number;
      deltaY?: number;
    }
    export interface DispatchKeyEventRequest {
      type: "keyDown" | "keyUp" | "rawKeyDown";
      modifiers?: number;
      key?: string;
      code?: string;
      windowsVirtualKeyCode?: number;
      text?: string;
      unmodifiedText?: string;
    }
  }
}

/**
 * Attaches the debugger to a specific tab.
 * You MUST call this before any other CDP command.
 */
export async function attachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.debugger.attach({ tabId }, "1.3", () => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError.message);
      } else {
        resolve();
      }
    });
  });
}

/**
 * Detaches the debugger from a specific tab.
 */
export async function detachDebugger(tabId: number): Promise<void> {
  return new Promise((resolve, reject) => {
    browser.debugger.detach({ tabId }, () => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError.message);
      } else {
        resolve();
      }
    });
  });
}

/**
 * A promisified wrapper for browser.debugger.sendCommand.
 */
async function sendCommand<T extends object>(
  tabId: number,
  method: string,
  params?: Record<string, any>
): Promise<T> {
  return new Promise((resolve, reject) => {
    browser.debugger.sendCommand({ tabId }, method, params, (result: any) => {
      if (browser.runtime.lastError) {
        reject(browser.runtime.lastError.message);
      } else if ((result as any)?.error) {
        reject(new Error((result as any).error.message));
      } else {
        resolve(result as T);
      }
    });
  });
}

/**
 * Gets the main frame ID for a given tab.
 */
export async function getMainFrameId(tabId: number): Promise<string> {
  const { frameTree } = await sendCommand<Protocol.Page.GetFrameTreeResponse>(
    tabId,
    "Page.getFrameTree"
  );
  return frameTree.frame.id;
}

type Pair = { x: number; y: number };
async function normalizeCoordinates(
  tabId: number,
  { x, y }: Pair
): Promise<Pair> {
  const { cssLayoutViewport } =
    await sendCommand<Protocol.Page.GetLayoutMetricsResponse>(
      tabId,
      "Page.getLayoutMetrics"
    );

  x = Math.min(999, Math.max(0, x));
  y = Math.min(999, Math.max(0, y));
  return {
    x: Math.floor((x / 1000) * cssLayoutViewport.clientWidth),
    y: Math.floor((y / 1000) * cssLayoutViewport.clientHeight),
  };
}

// Key definitions for keyboard input
const keyDefinitions: Record<
  string,
  { key: string; code: string; vk: number }
> = {
  Enter: { key: "Enter", code: "Enter", vk: 13 },
  Tab: { key: "Tab", code: "Tab", vk: 9 },
  Backspace: { key: "Backspace", code: "Backspace", vk: 8 },
  Escape: { key: "Escape", code: "Escape", vk: 27 },
  Delete: { key: "Delete", code: "Delete", vk: 46 },
  ArrowLeft: { key: "ArrowLeft", code: "ArrowLeft", vk: 37 },
  ArrowUp: { key: "ArrowUp", code: "ArrowUp", vk: 38 },
  ArrowRight: { key: "ArrowRight", code: "ArrowRight", vk: 39 },
  ArrowDown: { key: "ArrowDown", code: "ArrowDown", vk: 40 },
  Home: { key: "Home", code: "Home", vk: 36 },
  End: { key: "End", code: "End", vk: 35 },
  PageUp: { key: "PageUp", code: "PageUp", vk: 33 },
  PageDown: { key: "PageDown", code: "PageDown", vk: 34 },
  Alt: { key: "Alt", code: "AltLeft", vk: 18 },
  Control: { key: "Control", code: "ControlLeft", vk: 17 },
  Meta: { key: "Meta", code: "MetaLeft", vk: 91 },
  Shift: { key: "Shift", code: "ShiftLeft", vk: 16 },
};

const modifierMap: Record<string, number> = {
  Alt: 1,
  Control: 2,
  Meta: 4,
  Shift: 8,
};

function normalizeModifierKey(key: string): string {
  const normalized = key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  switch (normalized) {
    case "Cmd":
    case "Command":
    case "Win":
    case "Windows":
      return "Meta";
    case "Ctrl":
      return "Control";
    case "Option":
      return "Alt";
    default:
      return normalized;
  }
}

function describeKey(key: string): { key: string; code?: string; vk?: number } {
  const isLetter = /^[a-zA-Z]$/.test(key);
  const isDigit = /^[0-9]$/.test(key);

  if (keyDefinitions[key]) {
    const def = keyDefinitions[key];
    return { key: def.key, code: def.code, vk: def.vk };
  }
  if (isLetter) {
    const upper = key.toUpperCase();
    return { key, code: `Key${upper}`, vk: upper.charCodeAt(0) };
  }
  if (isDigit) {
    return { key, code: `Digit${key}`, vk: key.charCodeAt(0) };
  }
  if (key === " ") {
    return { key: " ", code: "Space", vk: 32 };
  }
  return { key };
}

function waitMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Browser agent action handlers
 */
export const browserAgentActions = {
  async GOTO_URL(tabId: number, { url }: { url: string }) {
    try {
      await sendCommand(tabId, "Page.navigate", { url });
      return { success: true, info: "Sent navigation command" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async RELOAD_TAB(
    tabId: number,
    { options }: { options?: { ignoreCache?: boolean } }
  ) {
    try {
      await sendCommand(tabId, "Page.reload", {
        ignoreCache: options?.ignoreCache,
      });
      return { success: true, info: "Sent reload command" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async GO_BACK(tabId: number) {
    try {
      const { entries, currentIndex } =
        await sendCommand<Protocol.Page.GetNavigationHistoryResponse>(
          tabId,
          "Page.getNavigationHistory"
        );
      const prev = entries[currentIndex - 1];
      if (prev) {
        await sendCommand(tabId, "Page.navigateToHistoryEntry", {
          entryId: prev.id,
        });
      }
      return { success: true, info: "Sent go back command" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async GO_FORWARD(tabId: number) {
    try {
      const { entries, currentIndex } =
        await sendCommand<Protocol.Page.GetNavigationHistoryResponse>(
          tabId,
          "Page.getNavigationHistory"
        );
      const next = entries[currentIndex + 1];
      if (next) {
        await sendCommand(tabId, "Page.navigateToHistoryEntry", {
          entryId: next.id,
        });
      }
      return { success: true, info: "Sent go forward command" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async CLICK(
    tabId: number,
    {
      x,
      y,
      options,
    }: {
      x: number;
      y: number;
      options?: { button?: "left" | "right" | "middle"; clickCount?: number };
    }
  ) {
    const coords = await normalizeCoordinates(tabId, { x, y });
    const button = options?.button ?? "left";
    const clickCount = options?.clickCount ?? 1;

    try {
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...coords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...coords,
        button,
        clickCount,
      } as Protocol.Input.DispatchMouseEventRequest);

      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...coords,
        button,
        clickCount,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched click event" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async DOUBLE_CLICK(tabId: number, { x, y }: { x: number; y: number }) {
    return browserAgentActions.CLICK(tabId, {
      x,
      y,
      options: { clickCount: 2, button: "left" },
    });
  },

  async SCROLL(
    tabId: number,
    {
      x,
      y,
      deltaX,
      deltaY,
    }: { x: number; y: number; deltaX: number; deltaY: number }
  ) {
    const coords = await normalizeCoordinates(tabId, { x, y });
    const deltaCoords = await normalizeCoordinates(tabId, {
      x: deltaX,
      y: deltaY,
    });

    try {
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...coords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        ...coords,
        button: "none",
        deltaX: deltaCoords.x,
        deltaY: deltaCoords.y,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched scroll event" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async SCROLL_DOCUMENT(
    tabId: number,
    {
      direction,
      magnitude,
    }: { direction: "up" | "down" | "left" | "right"; magnitude: number }
  ) {
    let deltaX = 0;
    let deltaY = 0;

    if (direction === "up" || direction === "down") {
      deltaY = magnitude;
    } else {
      deltaX = magnitude;
    }

    const normalized = await normalizeCoordinates(tabId, {
      x: deltaX,
      y: deltaY,
    });
    deltaY = direction === "up" ? -normalized.y : normalized.y;
    deltaX = direction === "left" ? -normalized.x : normalized.x;

    try {
      // Send to content script to execute scrolling
      await browser.tabs.sendMessage(tabId, {
        type: "SCROLL_DOCUMENT_INTERNAL",
        deltaX,
        deltaY,
      });
      return { success: true, info: "Attempted to scroll document" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async DRAG_AND_DROP(
    tabId: number,
    {
      fromX,
      fromY,
      toX,
      toY,
      options,
    }: {
      fromX: number;
      fromY: number;
      toX: number;
      toY: number;
      options?: {
        button?: "left" | "right" | "middle";
        steps?: number;
        delay?: number;
      };
    }
  ) {
    const button = options?.button ?? "left";
    const steps = Math.max(1, Math.floor(options?.steps ?? 5));
    const delay = Math.max(0, options?.delay ?? 0);

    const fromCoords = await normalizeCoordinates(tabId, {
      x: fromX,
      y: fromY,
    });
    const toCoords = await normalizeCoordinates(tabId, { x: toX, y: toY });

    const buttonMask = (b: typeof button): number => {
      switch (b) {
        case "left":
          return 1;
        case "right":
          return 2;
        case "middle":
          return 4;
        default:
          return 1;
      }
    };

    try {
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...fromCoords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...fromCoords,
        button,
        buttons: buttonMask(button),
        clickCount: 1,
      } as Protocol.Input.DispatchMouseEventRequest);
      if (delay) await waitMs(delay);

      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = fromX + (toX - fromX) * t;
        const y = fromY + (toY - fromY) * t;
        const intermCoords = await normalizeCoordinates(tabId, { x, y });
        await sendCommand(tabId, "Input.dispatchMouseEvent", {
          type: "mouseMoved",
          ...intermCoords,
          button,
          buttons: buttonMask(button),
        } as Protocol.Input.DispatchMouseEventRequest);
        if (delay) await waitMs(delay);
      }

      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...toCoords,
        button,
        buttons: buttonMask(button),
        clickCount: 1,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched drag and drop event" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async TYPE_TEXT(
    tabId: number,
    { text, options }: { text: string; options?: { delay?: number } }
  ) {
    const delay = Math.max(0, options?.delay ?? 0);

    try {
      const keyStroke = async (
        ch: string,
        override?: {
          key?: string;
          code?: string;
          windowsVirtualKeyCode?: number;
        }
      ) => {
        if (override) {
          const base: Protocol.Input.DispatchKeyEventRequest = {
            type: "keyDown",
            key: override.key,
            code: override.code,
            windowsVirtualKeyCode: override.windowsVirtualKeyCode,
          } as Protocol.Input.DispatchKeyEventRequest;
          await sendCommand(tabId, "Input.dispatchKeyEvent", base);
          await sendCommand(tabId, "Input.dispatchKeyEvent", {
            ...base,
            type: "keyUp",
          } as Protocol.Input.DispatchKeyEventRequest);
          return;
        }

        const down: Protocol.Input.DispatchKeyEventRequest = {
          type: "keyDown",
          text: ch,
          unmodifiedText: ch,
        };
        await sendCommand(tabId, "Input.dispatchKeyEvent", down);
        await sendCommand(tabId, "Input.dispatchKeyEvent", {
          type: "keyUp",
        } as Protocol.Input.DispatchKeyEventRequest);
      };

      for (const ch of text) {
        if (ch === "\n" || ch === "\r") {
          await keyStroke(ch, {
            key: "Enter",
            code: "Enter",
            windowsVirtualKeyCode: 13,
          });
        } else if (ch === "\t") {
          await keyStroke(ch, {
            key: "Tab",
            code: "Tab",
            windowsVirtualKeyCode: 9,
          });
        } else {
          await keyStroke(ch);
        }
        if (delay) await waitMs(delay);
      }
      return { success: true, info: "Dispatched type text events" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async KEY_PRESS(
    tabId: number,
    { key, options }: { key: string; options?: { delay?: number } }
  ) {
    const delay = Math.max(0, options?.delay ?? 0);
    const tokens = key === "+" ? ["+"] : key.split("+");

    let modifiers = 0;
    let mainKey = "";

    for (const token of tokens) {
      const normalized = normalizeModifierKey(token);
      if (modifierMap[normalized]) {
        modifiers |= modifierMap[normalized];
      } else {
        mainKey = normalized;
      }
    }

    try {
      const desc = describeKey(mainKey);
      const hasNonShiftModifier = (modifiers & ~modifierMap.Shift) > 0;
      const type =
        hasNonShiftModifier || mainKey.length > 1 ? "rawKeyDown" : "keyDown";

      const keyDownParams: Protocol.Input.DispatchKeyEventRequest = {
        type,
        modifiers,
        key: desc.key,
        code: desc.code,
        windowsVirtualKeyCode: desc.vk,
      } as Protocol.Input.DispatchKeyEventRequest;

      if (type === "keyDown") {
        keyDownParams.text =
          modifiers & modifierMap.Shift
            ? mainKey.toUpperCase()
            : mainKey.toLowerCase();
        keyDownParams.unmodifiedText = mainKey.toLowerCase();
      }

      const keyUpParams: Protocol.Input.DispatchKeyEventRequest = {
        type: "keyUp",
        modifiers,
        key: desc.key,
        code: desc.code,
        windowsVirtualKeyCode: desc.vk,
      } as Protocol.Input.DispatchKeyEventRequest;

      await sendCommand(tabId, "Input.dispatchKeyEvent", keyDownParams);
      if (delay) await waitMs(delay);
      await sendCommand(tabId, "Input.dispatchKeyEvent", keyUpParams);
      return { success: true, info: "Dispatched key press events" };
    } catch (error) {
      return { success: false, error: `${error}` };
    }
  },

  async CAPTURE_SCREENSHOT(tabId: number) {
    await waitMs(500);
    const { data } = await sendCommand<Protocol.Page.CaptureScreenshotResponse>(
      tabId,
      "Page.captureScreenshot",
      {
        format: "png",
      }
    );

    const tab = await browser.tabs.get(tabId);
    return {
      base64: data,
      pageTitle: tab.title,
      pageUrl: tab.url,
    };
  },

  async WAIT(_tabId: number, { timeMs }: { timeMs?: number }) {
    await waitMs(timeMs ?? 500);
    return { success: true, info: "Waited" };
  },
} as const;

/**
 * Execute a browser agent action
 */
export async function executeAction(
  tabId: number,
  action: BrowserAgentAction
): Promise<any> {
  const handler =
    browserAgentActions[action.type as keyof typeof browserAgentActions];
  if (!handler) {
    throw new Error(`Unknown action type: ${action.type}`);
  }
  // @ts-ignore - we know the action matches the handler
  return handler(tabId, action);
}
