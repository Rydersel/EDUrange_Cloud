const { Terminal } = require("xterm");
const { AttachAddon } = require("xterm-addon-attach");
const { FitAddon } = require("xterm-addon-fit");
const copyToClipboard = require("copy-to-clipboard");
const { macosMinimalTheme, solarizedDarkTheme, draculaTheme, oneDarkTheme } = require("./themes");

const terminalComponent = document.getElementById("terminal");

const HOST = window.location.host;

let socket = null;


const podExec = (pod, container) => {
  // If active socket in use, close connection
  if (socket !== null) {
    terminalComponent.innerHTML = "";
    socket.close();
    socket = null;
    setTimeout(() => {
      podExec(pod, container);
    }, 1200);
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const wsUrl = `${protocol}://${HOST}/ws?pod=${pod}&container=${container}`;
  socket = new WebSocket(wsUrl);

  socket.addEventListener("open", () => {
    setTimeout(() => {
      socket.send("hostname\n");
    }, 500);
  });

  const attachAddon = new AttachAddon(socket);
  const fitAddon = new FitAddon();
  const term = new Terminal({
    cursorBlink: "block",
    cols: 150,
    allowProposedApi: true,
  });
  term.loadAddon(fitAddon);
  term.open(terminalComponent);
  fitAddon.fit();
  term.loadAddon(attachAddon);

  socket.addEventListener("close", (event) => {
    term.writeln("");
    term.writeln("  \u001b[31m[!] Lost connection");
  });

  document.addEventListener("keydown", (zEvent) => {
    if (zEvent.ctrlKey && zEvent.shiftKey && zEvent.key === "C") {
      zEvent.preventDefault();
      copyToClipboard(term.getSelection());
    }
  });

  window.onresize = () => {
    fitAddon.fit();
  };
};

// Automatically execute pod terminal on load
window.onload = async () => {
  try {
    const response = await fetch('/env');
    const envData = await response.json();
    const { POD_NAME, CONTAINER_NAME } = envData;
    podExec(POD_NAME, CONTAINER_NAME);
  } catch (error) {
    console.error('Error fetching environment variables:', error);
  }
};
