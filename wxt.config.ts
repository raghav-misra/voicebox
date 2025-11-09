import { defineConfig } from "wxt";

// See https://wxt.dev/api/config.html
export default defineConfig({
  manifest: {
    permissions: [
      "debugger",
      "activeTab",
      "tabs",
      "storage",
      "scripting"
    ],
    host_permissions: ["<all_urls>"],
    name: "Voicebox",
    description: "AI-powered browser automation through voice commands",
    commands: {
      "activate-voicebox": {
        suggested_key: {
          default: "Alt+X",
          mac: "Alt+X"
        },
        description: "Activate Voicebox voice interface"
      }
    }
  }
});
