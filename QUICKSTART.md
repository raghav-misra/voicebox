# Voicebox - Quick Start Guide

## 🚀 Get Started in 5 Minutes

### Step 1: Configure API Keys

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your API keys:
   ```
   GEMINI_API_KEY=your_actual_gemini_key
   ELEVENLABS_API_KEY=your_actual_elevenlabs_key
   ELEVENLABS_VOICE_ID=21m00Tcm4TlvDq8ikWAM
   ```

   **Get your API keys:**
   - Gemini: https://aistudio.google.com/apikey
   - ElevenLabs: https://elevenlabs.io/app/settings/api-keys

### Step 2: Build the Extension

```bash
pnpm install
pnpm run build
```

### Step 3: Load in Chrome

1. Open Chrome → `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked"
4. Select the `.output/chrome-mv3` folder

### Step 4: Try It Out!

1. Navigate to any website (e.g., Google)
2. Press `Alt+X` to activate Voicebox
3. Say something like:
   - "Search for the best coffee maker"
   - "What's on this page?"
   - "Click the first link"
4. Watch the AI agent work!

## 🎯 Example Use Cases

### Shopping
- "Find the cheapest iPhone 15 on Amazon"
- "Add this item to my cart"
- "Compare prices with the competition"

### Research
- "Summarize this article"
- "Find statistics about climate change"
- "Navigate to the citations section"

### Form Filling
- "Fill out this form with test data"
- "Sign me up for the newsletter"
- "Submit this application"

### Social Media
- "Like the top 5 posts"
- "Find posts about [topic]"
- "Share this to my timeline"

## 💡 Tips

1. **Be Specific**: The more detailed your command, the better
   - ❌ "Find something"
   - ✅ "Search for wireless headphones under $100"

2. **Wait for Completion**: Let the agent finish before giving another command

3. **Use ESC to Cancel**: Press ESC anytime to stop the agent

4. **Check Console**: Open DevTools to see detailed logs
   - Right-click extension icon → "Inspect"
   - Or use F12 on any page

## 🐛 Common Issues

### "Microphone not working"
**Solution**: Allow microphone access
- Chrome settings → Privacy → Microphone
- Grant permission to the extension

### "Invalid API key"
**Solution**: Check your `.env` file
- Make sure keys are correct
- Rebuild: `pnpm run build`
- Reload extension in Chrome

### "Debugger won't attach"
**Solution**: 
- Close Chrome DevTools if open on that tab
- Only one debugger can attach at a time
- Restart Chrome if stuck

### "Agent gets stuck in a loop"
**Solution**:
- Press ESC to cancel
- Try rephrasing your command
- Some tasks are too complex for the current model

## 🔧 Development Mode

For faster iteration during development:

```bash
pnpm run dev
```

This enables hot reload - changes are reflected instantly!

## 📝 Voice Commands Best Practices

### Good Commands
- "Click the blue button that says Sign Up"
- "Type 'hello world' in the search box"
- "Scroll down to the pricing section"
- "Navigate to the About Us page"

### Commands to Avoid
- Vague instructions: "Do something interesting"
- Multi-step without context: "Buy me a laptop and a mouse"
- Impossible tasks: "Hack this website"

## 🎨 Customization

### Change Keyboard Shortcut
Edit `wxt.config.ts`:
```typescript
commands: {
  "activate-voicebox": {
    suggested_key: {
      default: "Alt+V",  // Your preferred key
      mac: "Alt+V"
    }
  }
}
```

### Change Voice
Browse ElevenLabs voices and update `ELEVENLABS_VOICE_ID` in `.env`

### Adjust Agent Behavior
Edit the system prompt in `background.ts` (around line 280)

## 📊 Performance

- **Average response time**: 3-8 seconds
- **Max steps per task**: 100 (configurable)
- **Memory usage**: ~50MB
- **CPU usage**: Low when idle, moderate during execution

## 🔒 Security & Privacy

- ⚠️ **API keys are hardcoded**: Only use for development
- 🎤 **Audio is sent to ElevenLabs**: For transcription
- 📸 **Screenshots sent to Gemini**: For visual understanding
- 🌐 **Full page access**: Required for automation

**Production deployment**: Implement proper API key storage using Chrome Storage API

## 🆘 Need Help?

1. Check the logs in DevTools console
2. Review the README.md for full documentation
3. Make sure all dependencies are installed
4. Verify API keys have sufficient quota

## 🎉 You're Ready!

Press `Alt+X` and start automating! 🚀
