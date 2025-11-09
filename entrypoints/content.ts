import type {
  BackgroundToContentMessage,
  ContentToBackgroundMessage,
  VoiceboxState,
} from "../lib/types";

// State management
let currentState: VoiceboxState = "idle";
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let audioContext: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let animationFrameId: number | null = null;

// UI element IDs
const generateId = (() => {
  let id = 0;
  const generator = (prefix: string) =>
    `_voicebox_${Date.now()}-${prefix}-${id++}`;
  return <T extends string>(...ids: T[]) =>
    Object.fromEntries(ids.map((id) => [id, generator(id)] as const)) as Record<
      T,
      string
    >;
})();

const ids = generateId("root", "popup", "canvas", "statusText", "micButton");

const rootStyle = /*css*/ `
  #${ids.root} {
    position: fixed;
    z-index: 2147483647;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    pointer-events: none;
    display: none;
  }

  #${ids.root}.active {
    display: block;
  }
`;

const shadowStyle = /*css*/ `
  #${ids.popup} {
    width: 400px;
    min-height: 200px;
    background: rgba(255, 255, 255, 0.1);
    backdrop-filter: blur(20px);
    -webkit-backdrop-filter: blur(20px);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 20px;
    padding: 30px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    pointer-events: auto;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 20px;
  }

  #${ids.canvas} {
    width: 100%;
    height: 80px;
    border-radius: 10px;
  }

  #${ids.statusText} {
    color: white;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    font-size: 16px;
    text-align: center;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.5);
    min-height: 24px;
  }

  #${ids.micButton} {
    width: 60px;
    height: 60px;
    border-radius: 50%;
    border: none;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    font-size: 24px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s;
    box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
  }

  #${ids.micButton}:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.6);
  }

  #${ids.micButton}:active {
    transform: scale(0.95);
  }

  #${ids.micButton}.recording {
    background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
    animation: pulse 1.5s ease-in-out infinite;
  }

  #${ids.micButton}.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  @keyframes pulse {
    0%, 100% {
      box-shadow: 0 4px 15px rgba(245, 87, 108, 0.4);
    }
    50% {
      box-shadow: 0 4px 25px rgba(245, 87, 108, 0.8);
    }
  }
`;

const template = /*html*/ `
  <div id="${ids.popup}">
    <canvas id="${ids.canvas}"></canvas>
    <div id="${ids.statusText}">Press Alt+X or click the mic to start</div>
    <button id="${ids.micButton}">🎤</button>
  </div>
`;

// Create and inject UI
function createUI() {
  // Add root styles
  document.head.insertAdjacentHTML("beforeend", `<style>${rootStyle}</style>`);

  // Create container
  const container = document.createElement("div");
  container.id = ids.root;
  document.body.appendChild(container);

  // Attach shadow DOM
  const shadow = container.attachShadow({ mode: "open" });
  shadow.innerHTML = `<style>${shadowStyle}</style>${template}`;

  return {
    container,
    shadow,
    popup: shadow.getElementById(ids.popup)!,
    canvas: shadow.getElementById(ids.canvas) as HTMLCanvasElement,
    statusText: shadow.getElementById(ids.statusText)!,
    micButton: shadow.getElementById(ids.micButton) as HTMLButtonElement,
  };
}

let ui: ReturnType<typeof createUI>;

// Waveform visualization
function drawWaveform(
  analyserNode: AnalyserNode,
  canvas: HTMLCanvasElement,
  isProcessing: boolean = false
) {
  const ctx = canvas.getContext("2d")!;
  const width = canvas.width;
  const height = canvas.height;

  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  const draw = () => {
    if (
      currentState !== "listening" &&
      currentState !== "speaking" &&
      !isProcessing
    )
      return;

    animationFrameId = requestAnimationFrame(draw);

    analyserNode.getByteTimeDomainData(dataArray);

    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, width, height);

    ctx.lineWidth = 2;
    ctx.strokeStyle = isProcessing ? "#667eea" : "#764ba2";
    ctx.beginPath();

    const sliceWidth = width / bufferLength;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      const v = dataArray[i] / 128.0;
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }

      x += sliceWidth;
    }

    ctx.lineTo(width, height / 2);
    ctx.stroke();
  };

  draw();
}

function drawProcessingAnimation(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const width = canvas.width;
  const height = canvas.height;
  let phase = 0;

  const draw = () => {
    if (currentState !== "processing") return;

    animationFrameId = requestAnimationFrame(draw);

    ctx.fillStyle = "rgba(0, 0, 0, 0.1)";
    ctx.fillRect(0, 0, width, height);

    ctx.strokeStyle = "#667eea";
    ctx.lineWidth = 2;
    ctx.beginPath();

    for (let x = 0; x < width; x++) {
      const y = height / 2 + Math.sin(x * 0.02 + phase) * 20;
      if (x === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    phase += 0.1;
  };

  draw();
}

// Audio recording
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Create audio context for visualization
    audioContext = new AudioContext();
    const source = audioContext.createMediaStreamSource(stream);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);

    // Start recording
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: "audio/webm;codecs=opus", // Best for modern Chrome
    });

    audioChunks = [];

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

      // Convert to base64
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64Audio = (reader.result as string).split(",")[1];

        // Send to background
        sendMessageToBackground({
          type: "AUDIO_RECORDED",
          audioData: base64Audio,
          tabId: 0, // Will be set by background
        });
      };
      reader.readAsDataURL(audioBlob);

      // Cleanup
      stream.getTracks().forEach((track) => track.stop());
    };

    mediaRecorder.start();
    updateState("listening");

    // Start visualization
    if (analyser) {
      drawWaveform(analyser, ui.canvas);
    }

    sendMessageToBackground({
      type: "RECORDING_STARTED",
      tabId: 0,
    });
  } catch (error) {
    console.error("Failed to start recording:", error);
    updateState("error");
    ui.statusText.textContent = "Failed to access microphone";
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }

    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }

    updateState("processing");
    ui.statusText.textContent = "Processing...";

    sendMessageToBackground({
      type: "RECORDING_STOPPED",
      tabId: 0,
    });
  }
}

// State management
function updateState(newState: VoiceboxState) {
  currentState = newState;

  switch (newState) {
    case "idle":
      ui.statusText.textContent = "Press Alt+X or click the mic to start";
      ui.micButton.textContent = "🎤";
      ui.micButton.classList.remove("recording", "disabled");
      break;
    case "listening":
      ui.statusText.textContent =
        "Listening... (Click mic or press Alt+X to stop)";
      ui.micButton.textContent = "⏹️";
      ui.micButton.classList.add("recording");
      ui.micButton.classList.remove("disabled");
      break;
    case "processing":
      ui.statusText.textContent = "Processing your request...";
      ui.micButton.classList.add("disabled");
      ui.micButton.classList.remove("recording");
      drawProcessingAnimation(ui.canvas);
      break;
    case "speaking":
      ui.statusText.textContent = "Agent is working...";
      ui.micButton.classList.add("disabled");
      break;
    case "error":
      ui.micButton.classList.remove("recording", "disabled");
      break;
  }
}

// Show/hide UI
function showUI() {
  ui.container.classList.add("active");
  // Set canvas size
  const dpr = window.devicePixelRatio || 1;
  ui.canvas.width = ui.canvas.offsetWidth * dpr;
  ui.canvas.height = ui.canvas.offsetHeight * dpr;
  ui.canvas.getContext("2d")!.scale(dpr, dpr);
}

function hideUI() {
  ui.container.classList.remove("active");
  if (animationFrameId) {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
  updateState("idle");
}

// Messaging
function sendMessageToBackground(message: ContentToBackgroundMessage) {
  browser.runtime.sendMessage(message);
}

// Handle messages from background
browser.runtime.onMessage.addListener((message: BackgroundToContentMessage) => {
  switch (message.type) {
    case "STATE_UPDATE":
      updateState(message.state);
      if (message.message) {
        ui.statusText.textContent = message.message;
      }
      break;
    case "TRANSCRIPTION_COMPLETE":
      ui.statusText.textContent = `You said: "${message.text}"`;
      break;
    case "AGENT_THINKING":
      ui.statusText.textContent = message.message;
      break;
    case "AGENT_ACTION":
      ui.statusText.textContent = `${message.reasoning}\n→ ${message.action}`;
      break;
    case "PLAY_AUDIO":
      playAudio(message.audioData, message.isBase64);
      break;
    case "TASK_COMPLETE":
      ui.statusText.textContent = `Complete: ${message.summary}`;
      setTimeout(() => hideUI(), 3000);
      break;
    case "ERROR":
      updateState("error");
      ui.statusText.textContent = `Error: ${message.error}`;
      break;
  }
});

// Audio playback
async function playAudio(audioData: string, isBase64: boolean = true) {
  try {
    const audioBlob = isBase64
      ? await fetch(`data:audio/mpeg;base64,${audioData}`).then((r) => r.blob())
      : await fetch(audioData).then((r) => r.blob());

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    // Setup visualization for audio playback
    if (!audioContext) {
      audioContext = new AudioContext();
    }

    const source = audioContext.createMediaElementSource(audio);
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(audioContext.destination);

    updateState("speaking");
    drawWaveform(analyser, ui.canvas, true);

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl);
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
        animationFrameId = null;
      }
    };

    await audio.play();
  } catch (error) {
    console.error("Failed to play audio:", error);
  }
}

// Handle scroll document internal messages
browser.runtime.onMessage.addListener((message: any) => {
  if (message.type === "SCROLL_DOCUMENT_INTERNAL") {
    window.scrollBy({
      left: message.deltaX,
      top: message.deltaY,
      behavior: "smooth",
    });
  }
});

// Initialize
function main() {
  console.log("Voicebox content script initialized");

  // Create UI
  ui = createUI();

  // Mic button click handler
  ui.micButton.addEventListener("click", () => {
    if (ui.micButton.classList.contains("disabled")) return;

    if (currentState === "idle") {
      showUI();
      startRecording();
    } else if (currentState === "listening") {
      stopRecording();
    }
  });

  // Keyboard shortcut handler (Alt+X)
  document.addEventListener("keydown", (e) => {
    if (e.altKey && e.key.toLowerCase() === "x") {
      e.preventDefault();

      if (!ui.container.classList.contains("active")) {
        showUI();
        startRecording();
      } else if (currentState === "listening") {
        stopRecording();
      } else {
        hideUI();
      }
    }

    // ESC to cancel/close
    if (e.key === "Escape" && ui.container.classList.contains("active")) {
      e.preventDefault();
      hideUI();
      if (currentState === "listening") {
        stopRecording();
      }
      sendMessageToBackground({ type: "USER_CANCELLED", tabId: 0 });
    }
  });
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", main);
    } else {
      main();
    }
  },
});
