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

const ids = generateId("toggle", "root");

const template = /*html*/ `
<button id=${ids.toggle}>🎤</button>
`;

const rootStyle = /*css*/ `
  #${ids.root} {
    position: fixed;
    z-index: 100000;
    background: none;
    top: 10px;
    right: 10px;
    opacity: 0.25;
    transition: opacity 0.3s;
  }

  #${ids.root}:hover {
    opacity: 1;
  }
`;

const shadowStyle = /*css*/ `
#${ids.toggle} {
    background-color: #007bff;
    border: none;
    border-radius: 20px;
    text-align: center;
    aspect-ratio: 1;
  }
`;

function main() {
  console.log("Voicebox content script main function");
  // add css
  document.head.insertAdjacentHTML("beforeend", `<style>${rootStyle}</style>`);

  // add content
  const container = document.createElement("voicebox-root");
  container.id = ids.root;
  document.body.appendChild(container);
  container.attachShadow({
    mode: "open",
  }).innerHTML = `<style>${shadowStyle}</style>${template}`;
}

export default defineContentScript({
  matches: ["<all_urls>"],
  main() {
    console.log("Voicebox content script loaded");

    if (document.readyState === "interactive") {
      main();
    } else {
      document.addEventListener("DOMContentLoaded", main);
    }
  },
});
