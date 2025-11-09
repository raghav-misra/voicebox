// Message types for communication between content script and background script

export type VoiceboxState = 'idle' | 'listening' | 'processing' | 'speaking' | 'error';

// Messages from Content Script to Background
export type ContentToBackgroundMessage =
  | { type: 'AUDIO_RECORDED'; audioData: string; tabId: number } // base64 encoded audio
  | { type: 'RECORDING_STARTED'; tabId: number }
  | { type: 'RECORDING_STOPPED'; tabId: number }
  | { type: 'USER_CANCELLED'; tabId: number }
  | { type: 'REQUEST_STATE'; tabId: number };

// Messages from Background to Content Script
export type BackgroundToContentMessage =
  | { type: 'STATE_UPDATE'; state: VoiceboxState; message?: string }
  | { type: 'TRANSCRIPTION_COMPLETE'; text: string }
  | { type: 'AGENT_THINKING'; message: string }
  | { type: 'AGENT_ACTION'; action: string; reasoning: string }
  | { type: 'PLAY_AUDIO'; audioData: string; isBase64?: boolean } // base64 encoded audio or data URL
  | { type: 'TASK_COMPLETE'; summary: string }
  | { type: 'ERROR'; error: string };

// Browser Agent Action Types (adapted from reference)
export type BrowserAgentAction =
  | { type: 'GOTO_URL'; url: string }
  | { type: 'RELOAD_TAB'; options?: { ignoreCache?: boolean } }
  | { type: 'GO_BACK' }
  | { type: 'GO_FORWARD' }
  | { type: 'CLICK'; x: number; y: number; options?: { button?: 'left' | 'right' | 'middle'; clickCount?: number } }
  | { type: 'DOUBLE_CLICK'; x: number; y: number }
  | { type: 'TYPE_TEXT'; text: string; x?: number; y?: number; pressEnter?: boolean; clearBeforeTyping?: boolean; options?: { delay?: number } }
  | { type: 'KEY_PRESS'; key: string; options?: { delay?: number } }
  | { type: 'SCROLL'; x: number; y: number; deltaX: number; deltaY: number }
  | { type: 'SCROLL_DOCUMENT'; direction: 'up' | 'down' | 'left' | 'right'; magnitude: number }
  | { type: 'DRAG_AND_DROP'; fromX: number; fromY: number; toX: number; toY: number; options?: { button?: 'left' | 'right' | 'middle'; steps?: number; delay?: number } }
  | { type: 'CAPTURE_SCREENSHOT' }
  | { type: 'WAIT'; timeMs?: number };

// Internal message types for agent coordination
export type AgentMessage = {
  requestId: string;
  action: BrowserAgentAction;
  response?: {
    success: boolean;
    info?: string;
    error?: string;
    base64?: string;
    pageUrl?: string;
    pageTitle?: string;
  };
};

// Helper type guards
export function isContentToBackgroundMessage(msg: any): msg is ContentToBackgroundMessage {
  return msg && typeof msg === 'object' && 'type' in msg;
}

export function isBackgroundToContentMessage(msg: any): msg is BackgroundToContentMessage {
  return msg && typeof msg === 'object' && 'type' in msg;
}
