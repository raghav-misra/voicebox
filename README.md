# Voicebox 🎤

An AI-powered browser extension that enables voice-controlled browser automation using Gemini Computer Use and ElevenLabs.

## Features

- 🎙️ **Voice Commands**: Activate with Alt+X and speak your intent
- 🤖 **AI Agent**: Powered by Google Gemini Computer Use model
- 🌐 **Browser Automation**: Full CDP integration for clicks, typing, navigation, and more
- 🔊 **Text-to-Speech**: Agent speaks back using ElevenLabs
- ✨ **Glass UI**: Beautiful translucent popup with waveform visualization
- 📊 **Real-time Feedback**: See what the agent is thinking and doing

## Setup

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Configure API Keys

Copy `.env.example` to `.env` and fill in your API keys:

```bash
GEMINI_API_KEY=your_gemini_api_key_here
ELEVENLABS_API_KEY=your_elevenlabs_api_key_here
ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM  # Optional: Use your preferred voice
```

**Getting API Keys:**
- **Gemini**: https://aistudio.google.com/apikey
- **ElevenLabs**: https://elevenlabs.io/app/settings/api-keys

### 3. Build the Extension

For development with hot reload:
```bash
pnpm dev
```

For production build:
```bash
pnpm build
```

### 4. Load Extension in Chrome

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode" (toggle in top right)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` directory

## Usage

1. **Activate**: Press `Alt+X` or click the microphone button
2. **Speak**: Say what you want the browser to do
   - Example: "Search for the best coffee maker on Amazon"
   - Example: "Fill out this form with my name and email"
   - Example: "Find the price of the newest MacBook"
3. **Watch**: The agent will work through your task step-by-step
4. **Listen**: The agent speaks its final result

### Keyboard Shortcuts

- `Alt+X` - Activate/deactivate voice interface
- `ESC` - Cancel current operation

## Architecture

```
┌─────────────────┐         ┌──────────────────┐
│  Content Script │ ◄─────► │ Background Script│
│  (UI + Audio)   │         │  (Agent Logic)   │
└─────────────────┘         └──────────────────┘
                                      │
                    ┌─────────────────┼─────────────────┐
                    ▼                 ▼                 ▼
              ┌──────────┐      ┌─────────┐     ┌──────────┐
              │ ElevenLabs│      │ Gemini  │     │   CDP    │
              │ STT + TTS │      │ AI Agent│     │ (Browser)│
              └──────────┘      └─────────┘     └──────────┘
```

## Tech Stack

- **Framework**: WXT (Web Extension Tools)
- **AI Model**: Google Gemini 2.5 Computer Use
- **Speech**: ElevenLabs STT + TTS
- **Automation**: Chrome DevTools Protocol (CDP)
- **UI**: Vanilla JavaScript with Canvas for waveforms

## Development

### Project Structure

```
voicebox/
├── entrypoints/
│   ├── background.ts    # Agent orchestration, API calls
│   ├── content.ts       # UI, audio recording, playback
│   ├── cdp.ts          # Chrome DevTools Protocol utilities
│   └── types.ts        # TypeScript type definitions
├── wxt.config.ts       # Extension configuration
└── .env                # API keys (not in git)
```

### Commands

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm zip` - Create distributable ZIP
- `pnpm compile` - Type check without building

## Permissions

The extension requires these permissions:
- `debugger` - For Chrome DevTools Protocol access
- `activeTab` - To interact with current tab
- `tabs` - To manage browser tabs
- `storage` - To store configuration
- `<all_urls>` - To inject content script everywhere

## Troubleshooting

### Microphone not working
- Check browser permissions: `chrome://settings/content/microphone`
- Allow microphone access for the extension

### Agent not responding
- Check console for errors: Right-click extension → Inspect
- Verify API keys are correct in `.env`
- Ensure you have Gemini API quota remaining

### Debugger issues
- Only one debugger can be attached at a time
- Close DevTools if open on the same tab
- Restart browser if debugger won't detach

## License

MIT

## Credits

Built with:
- [WXT](https://wxt.dev/) - Web extension framework
- [Google Gemini](https://ai.google.dev/) - AI model
- [ElevenLabs](https://elevenlabs.io/) - Voice synthesis
