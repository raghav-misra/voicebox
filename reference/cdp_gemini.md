# Gemini Computer Use + Chrome DevTools Protocol

This example uses very opinionated types and classes. You will not need most of it - it has been stripped out of a past codebase. Instead, use it to understand meaning and extract key components such as the action handler CDP implementations, the agent loop for the computer use model, etc.

## Gemini Computer Use (stripped from a BrowserAgent implementation)

```typescript
import {
  BaseAgent,
  generateId,
  logger,
  ts,
  type BrowserAgentAction,
} from "@meow/common";
import type { MessageContext } from "@meow/session";
import {
  Environment,
  GenerateContentResponse,
  GoogleGenAI,
  type Content,
  type FunctionCall,
  type Part,
} from "@google/genai";

const log = logger("BrowserAgent");

type BrowserAgentConfig = {
  messageContext: MessageContext<BrowserAgent>;
  goalDescription: string;
};

export class BrowserAgent extends BaseAgent {
  goalDescription: string;

  constructor({ messageContext, goalDescription }: BrowserAgentConfig) {
    super(messageContext);
    this.goalDescription = goalDescription;
  }

  private async processResponse(response: GenerateContentResponse): Promise<{
    actions: [FunctionCall, BrowserAgentAction[]][];
    message: string;
    completed: boolean;
  }> {
    const actions = [] as [FunctionCall, BrowserAgentAction[]][];

    let message = "";

    if (!response.candidates || response.candidates.length === 0) {
      return {
        actions: [],
        message: "",
        completed: true,
      };
    }
    const candidate = response.candidates[0];

    // Log the raw response for debugging
    log(`Raw response from Google:`, candidate.content);

    // Process all parts - Google can send multiple function calls
    for (const part of candidate.content?.parts ?? []) {
      if (part.text) {
        message += part.text + "\n";
        log(`Reasoning: ${part.text}`);
      }
      if (part.functionCall) {
        const functionCall = part.functionCall;
        const actionsForCall: BrowserAgentAction[] = [];

        log(
          `Found function call: ${part.functionCall.name}:`,
          part.functionCall.args
        );

        // Convert function call to action(s)
        const action = this.convertFunctionCallToAction(part.functionCall);
        if (action) {
          // Special handling for type_text_at - we need to click first
          if (
            part.functionCall.name === "type_text_at" &&
            action.type === "TYPE_TEXT"
          ) {
            log(`Adding action: ${JSON.stringify(action)}`);
            // First add a click action at the same coordinates
            actionsForCall.push({
              type: "CLICK",
              x: action.x,
              y: action.y,
              options: { button: "left" },
            });

            // If clear_before_typing is true (default), add a select all
            // if (action.clearBeforeTyping) {
            //   // Select all text in the field
            //   actionsForCall.push({
            //     type: "KEY_PRESS",
            //     key: "ControlOrMeta+A",
            //   });
            //   actionsForCall.push({
            //     type: "KEY_PRESS",
            //     key: "Backspace",
            //   });
            // }

            // Then add the type action
            actionsForCall.push(action);
            if (action.pressEnter) {
              actionsForCall.push({
                type: "KEY_PRESS",
                key: "Enter",
              });
            }
          } else {
            actionsForCall.push(action);
          }
        } else {
          log(
            `Could not convert function call to action: ${part.functionCall.name}`
          );
        }

        actions.push([functionCall, actionsForCall]);
      }
    }

    // Log summary of what we found
    log(`Processed response: ${actions.length} function calls`);

    // Check if task is completed
    const completed =
      actions.length === 0 ||
      (candidate.finishReason && candidate.finishReason !== "STOP");

    return {
      actions,
      message: message.trim(),
      completed: completed ?? false,
    };
  }

  /**
   * Convert Google function call to Stagehand action
   */
  private convertFunctionCallToAction(
    functionCall: FunctionCall
  ): (BrowserAgentAction & Record<string, any>) | null {
    const { name, args } = functionCall;

    if (!name || !args) {
      return null;
    }

    switch (name) {
      case "open_web_browser":
        return null; // No action needed, browser is already open

      case "click_at": {
        // const { x, y } = this.normalizeCoordinates(
        //   args.x as number,
        //   args.y as number
        // );
        return {
          type: "CLICK",
          x: args.x as number,
          y: args.y as number,
          button: args.button || "left",
        };
      }

      case "type_text_at": {
        // const { x, y } = this.normalizeCoordinates(
        //   args.x as number,
        //   args.y as number
        // );
        // Google's type_text_at includes press_enter and clear_before_typing parameters
        const pressEnter = (args.press_enter as boolean) ?? false;
        const clearBeforeTyping = (args.clear_before_typing as boolean) ?? true;

        // For type_text_at, we need to click first then type
        // This matches the behavior expected by Google's CUA
        // We'll handle this in the executeStep method by converting to two actions
        return {
          type: "TYPE_TEXT",
          text: args.text as string,
          x: args.x,
          y: args.y,
          pressEnter,
          clearBeforeTyping,
        };
      }

      case "key_combination": {
        const keys = (args.keys as string)
          .split("+")
          .map((key: string) => key.trim());
        return {
          type: "KEY_PRESS",
          key: keys.join("+"),
        };
      }

      case "scroll_document": {
        const direction = (args.direction as string).toLowerCase() as
          | "up"
          | "down"
          | "left"
          | "right";
        const magnitude = (args.magnitude as number) ?? 999;
        return {
          type: "SCROLL_DOCUMENT",
          direction,
          magnitude,
        };
      }

      case "scroll_at": {
        // const { x, y } = this.normalizeCoordinates(
        //   args.x as number,
        //   args.y as number
        // );
        const direction = ((args.direction as string) || "down").toLowerCase();
        const magnitude =
          typeof args.magnitude === "number" ? (args.magnitude as number) : 800;

        let scroll_x = 0;
        let scroll_y = 0;
        if (direction === "up") {
          scroll_y = -magnitude;
        } else if (direction === "down") {
          scroll_y = magnitude;
        } else if (direction === "left") {
          scroll_x = -magnitude;
        } else if (direction === "right") {
          scroll_x = magnitude;
        } else {
          // Default to down if unknown direction
          scroll_y = magnitude;
        }

        return {
          type: "SCROLL",
          x: args.x as number,
          y: args.y as number,
          deltaX: scroll_x,
          deltaY: scroll_y,
        };
      }

      case "navigate":
        return {
          type: "GOTO_URL",
          url: args.url as string,
        };

      case "go_back":
        return {
          type: "GO_BACK",
        };

      case "go_forward":
        return {
          type: "GO_FORWARD",
        };

      case "wait_5_seconds":
        return {
          type: "WAIT",
          timeMs: 5000, // Google CUA waits for 5 seconds
        };

      case "hover_at": {
        // const { x, y } = this.normalizeCoordinates(
        //   args.x as number,
        //   args.y as number
        // );
        // return {
        //   type: "HOVER",
        //   x: args.x,
        //   y: args.y,
        // };
        return null; // Hover not implemented yet
      }

      case "search":
        return {
          type: "GOTO_URL",
          url: "https://www.google.com",
        };

      case "drag_and_drop": {
        // const startPoint = this.normalizeCoordinates(
        //   args.x as number,
        //   args.y as number
        // );
        // const endPoint = this.normalizeCoordinates(
        //   args.destination_x as number,
        //   args.destination_y as number
        // );
        return {
          type: "DRAG_AND_DROP",
          fromX: args.x as number,
          fromY: args.y as number,
          toX: args.destination_x as number,
          toY: args.destination_y as number,
        };
      }

      default:
        log(`Unsupported Google CUA function: ${name}`);
        return null;
    }
  }

  async onInitialize() {
    log(`Initializing BrowserAgent with goal: ${this.goalDescription}`);

    // Refactored to use Google GenAI Computer Use
    const maxSteps = 100;
    let currentStep = 0;
    let completed = false;
    let finalMessage = "";

    // Initialize Google GenAI client
    const apiKey = process.env.GEMINI_API_KEY!;
    const client = new GoogleGenAI({ apiKey });

    // General-purpose browser agent system prompt
    const systemPrompt = `You are a general-purpose browser agent whose job is to accomplish the user's goal.
Today's date is ${new Date().toISOString().split("T")[0]}.

You will be given a high-level goal and will be operating on a live browser page. You must reason step-by-step and decide on the best course of action to achieve the goal.

### Core Mandate: Accomplish the Goal and Return

Your primary objective is to **accomplish the user's goal and return a final answer.**

* **To take action:** Your special model knows how to operate the browser. Simply state your reasoning and the action you are taking.
* **To finish the task:** When you return no functions to call, the system assumes that your task has either succeeded or failed. If you have accomplished the goal, you must explicitly state your final answer in your reasoning before returning no functions. This final answer will be sent back to the user. If not, you should continue acting until you can provide a final answer or truly fail the task irrecoverably.
* When you need to scroll the page, first try using \`scroll_document\`. This tools is ideal, but inconsistent. If it does not work, you can use \`scroll_at\` with specific coordinates.

### Example Workflow

**Goal:** "Find the price of the 'Model 5' on this page."

**Your Process (Internal):**
1.  *Thought:* I see the "Model 5" but not the price. I see a link that says "View Details." I will click it.
    *Action: click("View Details")*
2.  *(System reloads page, gives you new content)*
3.  *Thought:* I am on the details page. I see the price listed as "$199.99". I have accomplished the goal. I will now finish and return this answer.
    *Action: finish(answer: "The price of the Model 5 is $199.99.")*`;

    // Initial conversation history
    const history: Content[] = [
      {
        role: "user",
        parts: [{ text: "System prompt: " + systemPrompt }],
      },
      {
        role: "user",
        parts: [
          {
            text:
              "I would like you to accomplish the following goal:\n\n" +
              this.goalDescription,
          },
        ],
      },
    ];

    // Main agent loop
    try {
      while (!completed && currentStep < maxSteps) {
        log(`Executing step ${currentStep + 1}/${maxSteps}`);

        // Generate content using Gemini Computer Use
        const response = await client.models.generateContent({
          model: "gemini-2.5-computer-use-preview-10-2025",
          contents: history,
          config: {
            temperature: 1,
            topP: 0.95,
            topK: 40,
            maxOutputTokens: 8192,
            tools: [
              {
                computerUse: {
                  environment: Environment.ENVIRONMENT_BROWSER,
                },
                // functionDeclarations: [
                //   {
                //     name: "system__ask_question",
                //     description:
                //       "Ask the user a question to clarify the goal or get more information, or to continue through a task which you cannot complete. Use this function only if absolutely necessary, as the agent should try to complete the goal autonomously as much as possible.",
                //   },
                // ],
              },
            ],
          },
        });

        // Add model response to history
        if (response.candidates && response.candidates[0]) {
          // Sanitize any out-of-range coordinates in function calls before adding to history
          const sanitizedContent = response.candidates[0].content;

          if (sanitizedContent?.parts) {
            for (const part of sanitizedContent.parts) {
              if (part.functionCall?.args) {
                if (
                  typeof part.functionCall.args.x === "number" &&
                  part.functionCall.args.x > 999
                ) {
                  part.functionCall.args.x = 999;
                }
                if (
                  typeof part.functionCall.args.y === "number" &&
                  part.functionCall.args.y > 999
                ) {
                  part.functionCall.args.y = 999;
                }
              }
            }
          }

          history.push(sanitizedContent!);
        }

        const processedResponse = await this.processResponse(response);

        if (processedResponse.message !== "") {
          this.sendChat(processedResponse.message);
        }

        const functionResponses: Part[] = [];

        for (const [functionCall, actions] of processedResponse.actions) {
          log(`Function call to execute:`, functionCall, actions);

          if (actions.length > 0) {
            for (const action of actions) {
              log(`Executing action:`, action);
              const actionRequestId = generateId("REQUEST");

              const waitForActionResponse =
                this.messageContext.generalExpectResponse(actionRequestId);

              this.messageContext.generalSendMessage(
                ts({
                  type: "REQUEST_BROWSER_AGENT_ACTION",
                  requestId: actionRequestId,
                  contextId: this.messageContext.contextId,
                  action,
                })
              );

              const actionResponse = await waitForActionResponse;
              log(`Action response:`, actionResponse);
            }
          } else {
            log(
              `No actions to execute for function call: ${functionCall.name}`
            );
          }

          const screenshotRequestId = generateId("REQUEST");

          const waitForScreenshotResponse =
            this.messageContext.generalExpectResponse(screenshotRequestId);

          this.messageContext.generalSendMessage(
            ts({
              type: "REQUEST_BROWSER_AGENT_ACTION",
              requestId: screenshotRequestId,
              contextId: this.messageContext.contextId,
              action: { type: "CAPTURE_SCREENSHOT" },
            })
          );

          log("Awaiting screenshot response");
          const screenshotResponse = await waitForScreenshotResponse;

          if (
            screenshotResponse.type === "PROVIDE_BROWSER_AGENT_ACTION" &&
            "base64" in screenshotResponse.response &&
            "pageUrl" in screenshotResponse.response
          ) {
            log("Received screenshot response", functionCall);

            const functionResponsePart: Part = {
              functionResponse: {
                name: functionCall.name,
                response: {
                  url: screenshotResponse.response.pageUrl || "",
                  // TODO: LMAO IMPLEMENT SAFETY DECISION HANDLING T_T
                  // Acknowledge safety decision for evals
                  ...(functionCall.args?.safety_decision
                    ? {
                        safety_acknowledgement: "true",
                      }
                    : {}),
                },
                parts: [
                  {
                    inlineData: {
                      mimeType: "image/png",
                      data: screenshotResponse.response.base64 as string,
                    },
                  },
                ],
              },
            };

            log("Response to", functionCall.name, functionResponsePart);

            functionResponses.push(functionResponsePart);
          }
        }

        history.push({
          role: "user",
          parts: functionResponses,
        });

        completed = processedResponse.completed;
        currentStep++;
      }

      // Return result in the same format as _onInitialize
      return {
        success: completed,
        data: finalMessage,
      };
    } catch (error) {
      log("Error in goal completion:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  // stub not used
  async onUserMessage() {}
}
```

## CDP action handling

References to sending and receiving messages are to communicate with a content script in the active browser tab.

```typescript
import { logger, type BrowserAgentAction } from "@meow/common";
import { registerGlobalForDevMode } from "./devModeGlobals";
import { type Protocol } from "./devToolsProtocol";
import { waitMs } from "./waitMs";
import { sendWebMessage, type AgentActionWebMessage } from "./webMessages";

const log = logger("browserAgentActions");

/**
 * Attaches the debugger to a specific tab.
 * You MUST call this before any other CDP command.
 * @param tabId The ID of the tab to attach to.
 */
export async function attachDebugger(tabId: number): Promise<void> {
  log("Attaching debugger to tab " + tabId);
  return new Promise((resolve, reject) => {
    // We must use "1.3" as the protocol version
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
 * @param tabId The ID of the tab to detach from.
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

// --- Helpers for keyPress ---
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

function describeKey(key: string): {
  key: string;
  code?: string;
  vk?: number;
} {
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
  // Fallback
  return { key };
}
// --- End helpers for keyPress ---

/**
 * A promisified wrapper for browser.debugger.sendCommand.
 * This is the core function all other utilities will use.
 */
async function sendCommand<T extends object>(
  tabId: number,
  method: string,
  params?: Partial<Record<string, any>>
): Promise<T> {
  return new Promise((resolve, reject) => {
    browser.debugger.sendCommand({ tabId }, method, params, (result) => {
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
 * This is necessary for commands that are frame-specific, like `evaluate`.
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

export const browserAgentActions = {
  async GOTO_URL(tabId, { url }) {
    try {
      await sendCommand(tabId, "Page.navigate", { url });
      return { success: true, info: "Sent navigation command" };
    } catch (error) {
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async RELOAD_TAB(tabId: number, { options }) {
    try {
      await sendCommand(tabId, "Page.reload", {
        ignoreCache: options?.ignoreCache,
      });
      return { success: true, info: "Sent reload command" };
    } catch (error) {
      return {
        success: false,
        error: `${error}`,
      };
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
      return {
        success: false,
        error: `${error}`,
      };
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
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async CLICK(tabId: number, { x, y, options }) {
    const coords = await normalizeCoordinates(tabId, { x, y });

    const button = options?.button ?? "left";
    const clickCount = options?.clickCount ?? 1;

    try {
      // Move mouse to position
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...coords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      // Press
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...coords,
        button,
        clickCount,
      } as Protocol.Input.DispatchMouseEventRequest);

      // Release
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...coords,
        button,
        clickCount,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched click event" };
    } catch (error) {
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  DOUBLE_CLICK(tabId: number, { x, y }) {
    // coordinates are normalized in CLICK
    return this.CLICK(tabId, {
      x,
      y,
      options: { clickCount: 2, button: "left" },
    });
  },
  async SCROLL(tabId: number, { x, y, deltaX, deltaY }) {
    const coords = await normalizeCoordinates(tabId, { x, y });
    const deltaCoords = await normalizeCoordinates(tabId, {
      x: deltaX,
      y: deltaY,
    });
    try {
      // Move mouse to position
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...coords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      // Dispatch wheel event
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseWheel",
        ...coords,
        button: "none",
        deltaX: deltaCoords.x,
        deltaY: deltaCoords.y,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched scroll event" };
    } catch (error) {
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async DRAG_AND_DROP(tabId: number, { fromX, fromY, toX, toY, options }) {
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
      // 1. Move to start
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseMoved",
        ...fromCoords,
        button: "none",
      } as Protocol.Input.DispatchMouseEventRequest);

      // 2. Press
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mousePressed",
        ...fromCoords,
        button,
        buttons: buttonMask(button),
        clickCount: 1,
      } as Protocol.Input.DispatchMouseEventRequest);
      if (delay) await waitMs(delay);

      // 3. Intermediate moves
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

      // 4. Release at end
      await sendCommand(tabId, "Input.dispatchMouseEvent", {
        type: "mouseReleased",
        ...toCoords,
        button,
        buttons: buttonMask(button),
        clickCount: 1,
      } as Protocol.Input.DispatchMouseEventRequest);
      return { success: true, info: "Dispatched drag and drop event" };
    } catch (error) {
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async TYPE_TEXT(tabId: number, { text, options }) {
    const delay = Math.max(0, options?.delay ?? 0);

    try {
      // Helper to send one keystroke (down and up)
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

        // Printable character
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
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async KEY_PRESS(tabId: number, { key, options }) {
    const delay = Math.max(0, options?.delay ?? 0);

    // Special case: if the entire string is just "+", treat it as the key
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
      // Describe the main key
      const desc = describeKey(mainKey);
      const hasNonShiftModifier = (modifiers & ~modifierMap.Shift) > 0;

      // For accelerators (Cmd+C), use "rawKeyDown".
      // For typing ('A', 'Shift+A'), use "keyDown" with text.
      const type =
        hasNonShiftModifier || mainKey.length > 1 ? "rawKeyDown" : "keyDown";

      const keyDownParams: Protocol.Input.DispatchKeyEventRequest = {
        type,
        modifiers,
        key: desc.key,
        code: desc.code,
        windowsVirtualKeyCode: desc.vk,
      } as Protocol.Input.DispatchKeyEventRequest;

      // Only add 'text' if it's the typing path
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
      return {
        success: false,
        error: `${error}`,
      };
    }
  },
  async CAPTURE_SCREENSHOT(tabId: number) {
    await waitMs(500); // wait a bit for rendering
    // Capture screenshot of the visible viewport
    const { data } = await sendCommand<Protocol.Page.CaptureScreenshotResponse>(
      tabId,
      "Page.captureScreenshot",
      { format: "png" }
    );

    const { title, url } = (await browser.tabs.get(tabId))!;

    return {
      base64: data,
      pageTitle: title,
      pageUrl: url,
    };
  },
  async WAIT() {
    // Simply wait for 1 second
    await waitMs(500);
    return { success: true, info: "Waited" };
  },
  async SCROLL_DOCUMENT(tabId: number, { direction, magnitude }) {
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

    await sendWebMessage(
      ["tabs", tabId],
      {
        __isWebMessage: true,
        __webMessageType: "AgentActionWebMessage",
        action: "scrollDocument",
        deltaX,
        deltaY,
      } satisfies AgentActionWebMessage,
      false
    );

    return { message: "Attempted to scroll document" };
  },
} as const satisfies {
  [K in BrowserAgentAction["type"]]: (
    tabId: number,
    props: Omit<Extract<BrowserAgentAction, { type: K }>, "type">
  ) => Promise<object>;
};

registerGlobalForDevMode("debuggerUtils", {
  attachDebugger,
  getActiveTabId: async () => {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tabs[0]?.id!;
  },
});

registerGlobalForDevMode("browserAgentActions", browserAgentActions);
```
