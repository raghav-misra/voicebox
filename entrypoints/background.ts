import { GoogleGenAI, Environment, type Content, type FunctionCall, type Part, type GenerateContentResponse } from '@google/genai';
import { ElevenLabsClient } from '@elevenlabs/elevenlabs-js';
import type {
  ContentToBackgroundMessage,
  BackgroundToContentMessage,
  BrowserAgentAction,
} from '../lib/types';
import { attachDebugger, detachDebugger, executeAction, browserAgentActions } from '../lib/cdp';

// Configuration (in production, load from storage or env)
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || 'your-gemini-key';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || 'your-elevenlabs-key';
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM'; // Default voice

// Active sessions
const activeSessions = new Map<number, {
  tabId: number;
  isProcessing: boolean;
  history: Content[];
  currentStep: number;
}>();

function log(...args: any[]) {
  console.log('[Voicebox Background]', ...args);
}

// Send message to content script
async function sendToContent(tabId: number, message: BackgroundToContentMessage) {
  try {
    await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    log('Error sending message to content:', error);
  }
}

// ElevenLabs Speech-to-Text
async function transcribeAudio(audioBase64: string): Promise<string> {
  try {
    const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
    
    // Convert base64 to blob
    const audioBlob = await fetch(`data:audio/webm;base64,${audioBase64}`).then(r => r.blob());
    
    // Create File from Blob (ElevenLabs SDK expects File)
    const audioFile = new File([audioBlob], 'audio.webm', { type: 'audio/webm' });
    
    log('Sending audio to ElevenLabs STT...');
    const response = await client.speechToText.convert({
      file: audioFile,
      modelId: 'eleven_turbo_v2',
    });
    
    // Handle response (it's a union type)
    const text = 'text' in response ? response.text : 
                 ('transcripts' in response && response.transcripts[0]?.text) || '';
    
    log('Transcription:', text);
    return text;
  } catch (error) {
    log('ElevenLabs STT error:', error);
    throw new Error(`Failed to transcribe audio: ${error}`);
  }
}

// ElevenLabs Text-to-Speech (WebSocket streaming)
async function synthesizeSpeech(text: string, tabId: number): Promise<void> {
  try {
    log('Synthesizing speech:', text);
    
    // For simplicity, using the synchronous HTTP API instead of WebSocket
    // In production, you'd want to use WebSocket for streaming
    const client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
    
    const audioStream = await client.textToSpeech.convert(ELEVENLABS_VOICE_ID, {
      text,
      modelId: 'eleven_turbo_v2',
    });
    
    // Convert stream to base64
    const chunks: Uint8Array[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    
    // Cast to BlobPart[] to fix type issue
    const audioBlob = new Blob(chunks as BlobPart[], { type: 'audio/mpeg' });
    const reader = new FileReader();
    
    reader.onloadend = () => {
      const base64Audio = (reader.result as string).split(',')[1];
      sendToContent(tabId, {
        type: 'PLAY_AUDIO',
        audioData: base64Audio,
        isBase64: true,
      });
    };
    
    reader.readAsDataURL(audioBlob);
  } catch (error) {
    log('ElevenLabs TTS error:', error);
    throw new Error(`Failed to synthesize speech: ${error}`);
  }
}

// Convert Gemini function calls to actions
function convertFunctionCallToAction(functionCall: FunctionCall): BrowserAgentAction | null {
  const { name, args } = functionCall;
  if (!name || !args) return null;

  switch (name) {
    case 'open_web_browser':
      return null; // No action needed

    case 'click_at':
      return {
        type: 'CLICK',
        x: args.x as number,
        y: args.y as number,
        options: { button: (args.button as any) || 'left' },
      };

    case 'type_text_at': {
      const pressEnter = (args.press_enter as boolean) ?? false;
      const clearBeforeTyping = (args.clear_before_typing as boolean) ?? true;
      return {
        type: 'TYPE_TEXT',
        text: args.text as string,
        x: args.x as number,
        y: args.y as number,
        pressEnter,
        clearBeforeTyping,
      };
    }

    case 'key_combination': {
      const keys = (args.keys as string).split('+').map((key: string) => key.trim());
      return {
        type: 'KEY_PRESS',
        key: keys.join('+'),
      };
    }

    case 'scroll_document':
      return {
        type: 'SCROLL_DOCUMENT',
        direction: (args.direction as string).toLowerCase() as any,
        magnitude: (args.magnitude as number) ?? 999,
      };

    case 'scroll_at': {
      const direction = ((args.direction as string) || 'down').toLowerCase();
      const magnitude = typeof args.magnitude === 'number' ? (args.magnitude as number) : 800;

      let scroll_x = 0;
      let scroll_y = 0;
      if (direction === 'up') scroll_y = -magnitude;
      else if (direction === 'down') scroll_y = magnitude;
      else if (direction === 'left') scroll_x = -magnitude;
      else if (direction === 'right') scroll_x = magnitude;
      else scroll_y = magnitude;

      return {
        type: 'SCROLL',
        x: args.x as number,
        y: args.y as number,
        deltaX: scroll_x,
        deltaY: scroll_y,
      };
    }

    case 'navigate':
      return {
        type: 'GOTO_URL',
        url: args.url as string,
      };

    case 'go_back':
      return { type: 'GO_BACK' };

    case 'go_forward':
      return { type: 'GO_FORWARD' };

    case 'wait_5_seconds':
      return { type: 'WAIT', timeMs: 5000 };

    case 'drag_and_drop':
      return {
        type: 'DRAG_AND_DROP',
        fromX: args.x as number,
        fromY: args.y as number,
        toX: args.destination_x as number,
        toY: args.destination_y as number,
      };

    default:
      log(`Unsupported function: ${name}`);
      return null;
  }
}

// Process Gemini response
async function processGeminiResponse(
  response: GenerateContentResponse,
  tabId: number
): Promise<{
  actions: Array<[FunctionCall, BrowserAgentAction[]]>;
  message: string;
  completed: boolean;
}> {
  const actions: Array<[FunctionCall, BrowserAgentAction[]]> = [];
  let message = '';

  if (!response.candidates || response.candidates.length === 0) {
    return { actions: [], message: '', completed: true };
  }

  const candidate = response.candidates[0];

  // Process all parts
  for (const part of candidate.content?.parts ?? []) {
    if (part.text) {
      message += part.text + '\n';
      log('Reasoning:', part.text);
      
      // Send reasoning to UI
      await sendToContent(tabId, {
        type: 'AGENT_THINKING',
        message: part.text,
      });
    }

    if (part.functionCall) {
      const functionCall = part.functionCall;
      const actionsForCall: BrowserAgentAction[] = [];

      log('Function call:', functionCall.name, functionCall.args);

      const action = convertFunctionCallToAction(functionCall);
      if (action) {
        // Special handling for type_text_at
        if (functionCall.name === 'type_text_at' && action.type === 'TYPE_TEXT') {
          // Click first
          actionsForCall.push({
            type: 'CLICK',
            x: action.x!,
            y: action.y!,
            options: { button: 'left' },
          });
          
          // Then type
          actionsForCall.push(action);
          
          if (action.pressEnter) {
            actionsForCall.push({ type: 'KEY_PRESS', key: 'Enter' });
          }
        } else {
          actionsForCall.push(action);
        }
      }

      actions.push([functionCall, actionsForCall]);
    }
  }

  const completed =
    actions.length === 0 || (candidate.finishReason && candidate.finishReason !== 'STOP');

  return { actions, message: message.trim(), completed: completed ?? false };
}

// Run browser agent with Gemini
async function runBrowserAgent(tabId: number, goalDescription: string) {
  log(`Starting browser agent for tab ${tabId}:`, goalDescription);

  const maxSteps = 100;
  let currentStep = 0;
  
  // Initialize session
  const session = {
    tabId,
    isProcessing: true,
    history: [] as Content[],
    currentStep: 0,
  };
  activeSessions.set(tabId, session);

  try {
    // Attach debugger
    await attachDebugger(tabId);
    log('Debugger attached');

    // Initialize Gemini client
    const client = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

    // System prompt
    const systemPrompt = `You are a general-purpose browser agent whose job is to accomplish the user's goal.
Today's date is ${new Date().toISOString().split('T')[0]}.

You will be given a high-level goal and will be operating on a live browser page. You must reason step-by-step and decide on the best course of action to achieve the goal.

### Core Mandate: Accomplish the Goal and Return

Your primary objective is to **accomplish the user's goal and return a final answer.**

* **To take action:** Your special model knows how to operate the browser. Simply state your reasoning and the action you are taking.
* **To finish the task:** When you return no functions to call, the system assumes that your task has either succeeded or failed. If you have accomplished the goal, you must explicitly state your final answer in your reasoning before returning no functions. This final answer will be sent back to the user. If not, you should continue acting until you can provide a final answer or truly fail the task irrecoverably.
* When you need to scroll the page, first try using \`scroll_document\`. This tool is ideal, but inconsistent. If it does not work, you can use \`scroll_at\` with specific coordinates.`;

    // Initial history
    const history: Content[] = [
      {
        role: 'user',
        parts: [{ text: 'System prompt: ' + systemPrompt }],
      },
      {
        role: 'user',
        parts: [{ text: `I would like you to accomplish the following goal:\n\n${goalDescription}` }],
      },
    ];

    // Agent loop
    let completed = false;
    while (!completed && currentStep < maxSteps) {
      log(`Step ${currentStep + 1}/${maxSteps}`);
      
      await sendToContent(tabId, {
        type: 'STATE_UPDATE',
        state: 'processing',
        message: `Processing step ${currentStep + 1}...`,
      });

      // Generate content
      const response = await client.models.generateContent({
        model: 'gemini-2.5-computer-use-preview-10-2025',
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
            },
          ],
        },
      });

      // Add response to history
      if (response.candidates && response.candidates[0]) {
        const sanitizedContent = response.candidates[0].content;
        
        // Sanitize coordinates
        if (sanitizedContent?.parts) {
          for (const part of sanitizedContent.parts) {
            if (part.functionCall?.args) {
              if (typeof part.functionCall.args.x === 'number' && part.functionCall.args.x > 999) {
                part.functionCall.args.x = 999;
              }
              if (typeof part.functionCall.args.y === 'number' && part.functionCall.args.y > 999) {
                part.functionCall.args.y = 999;
              }
            }
          }
        }
        
        history.push(sanitizedContent!);
      }

      // Process response
      const processedResponse = await processGeminiResponse(response, tabId);

      // Execute actions
      const functionResponses: Part[] = [];

      for (const [functionCall, actions] of processedResponse.actions) {
        log('Executing actions for:', functionCall.name);

        // Execute each action
        for (const action of actions) {
          log('Executing action:', action);
          
          await sendToContent(tabId, {
            type: 'AGENT_ACTION',
            action: action.type,
            reasoning: processedResponse.message,
          });

          const actionResponse = await executeAction(tabId, action);
          log('Action response:', actionResponse);
        }

        // Capture screenshot after actions
        log('Capturing screenshot...');
        const screenshotResponse = await browserAgentActions.CAPTURE_SCREENSHOT(tabId);

        const functionResponsePart: Part = {
          functionResponse: {
            name: functionCall.name,
            response: {
              url: screenshotResponse.pageUrl || '',
            },
            parts: [
              {
                inlineData: {
                  mimeType: 'image/png',
                  data: screenshotResponse.base64 as string,
                },
              },
            ],
          },
        };

        functionResponses.push(functionResponsePart);
      }

      // Add function responses to history
      if (functionResponses.length > 0) {
        history.push({
          role: 'user',
          parts: functionResponses,
        });
      }

      completed = processedResponse.completed;
      currentStep++;

      // Small delay between steps
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Task complete
    log('Task completed');
    const finalMessage = completed 
      ? 'Task completed successfully!'
      : 'Reached maximum steps without completion';

    // Speak the final result
    const lastMessage = history[history.length - 2]?.parts
      ?.filter(p => p.text)
      .map(p => p.text)
      .join(' ') || finalMessage;
    
    await synthesizeSpeech(lastMessage, tabId);
    
    await sendToContent(tabId, {
      type: 'TASK_COMPLETE',
      summary: finalMessage,
    });

    // Cleanup
    await detachDebugger(tabId);
    activeSessions.delete(tabId);

  } catch (error) {
    log('Error in browser agent:', error);
    
    await sendToContent(tabId, {
      type: 'ERROR',
      error: error instanceof Error ? error.message : String(error),
    });

    // Cleanup
    try {
      await detachDebugger(tabId);
    } catch (e) {
      // Ignore
    }
    activeSessions.delete(tabId);
  }
}

// Handle messages from content script
browser.runtime.onMessage.addListener(async (message: ContentToBackgroundMessage, sender) => {
  const tabId = sender.tab?.id;
  if (!tabId) return;

  log('Received message:', message.type);

  switch (message.type) {
    case 'RECORDING_STARTED':
      log('Recording started in tab', tabId);
      break;

    case 'RECORDING_STOPPED':
      log('Recording stopped in tab', tabId);
      break;

    case 'AUDIO_RECORDED': {
      log('Audio recorded, transcribing...');
      
      await sendToContent(tabId, {
        type: 'STATE_UPDATE',
        state: 'processing',
        message: 'Transcribing audio...',
      });

      try {
        const transcription = await transcribeAudio(message.audioData);
        
        await sendToContent(tabId, {
          type: 'TRANSCRIPTION_COMPLETE',
          text: transcription,
        });

        // Start browser agent
        await runBrowserAgent(tabId, transcription);
      } catch (error) {
        log('Error processing audio:', error);
        await sendToContent(tabId, {
          type: 'ERROR',
          error: error instanceof Error ? error.message : String(error),
        });
      }
      break;
    }

    case 'USER_CANCELLED':
      log('User cancelled');
      
      // Stop any active session
      if (activeSessions.has(tabId)) {
        try {
          await detachDebugger(tabId);
        } catch (e) {
          // Ignore
        }
        activeSessions.delete(tabId);
      }
      break;
  }
});

export default defineBackground(() => {
  log('Voicebox background script initialized');
});
