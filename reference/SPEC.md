# Voicebox

A browser applet which sits in every browser tab which can be activate to enable agentic browser use.

## Concept

Every tab gets an injected content script which listens for a keyboard shortcut (maybe Alt+X or something). When this shortcut is activated, a translucent glass-like popup starts listening for instructions.

The user speaks what it wants to be executed: "add an iced brown sugar oatmilk shaken espresso to my cart" or "search for the best deals on the lego fortnite llama set."

When the user hits [Enter], the popup changes to a waveform which signals that the task is being executed. The waveform moves as the agent speaks back to the user.

This iteration continues until the goal is completed

## Technologies
- Chrome extension (WXT) - use message passing between content script and background script for everything (Chrome Devtools Protocol for browser automation, primarily)
- Content script should spin up the UI. This should be super lightweight (obviously polished but very low overhead), so like no react or frameworks or anything
- Speech can be parsed using elevenlabs speech to text api
- The task itself would be sent to the Google Gemini xcomputer use model
- Responses are streamed to elevenlabs text-to-speech API