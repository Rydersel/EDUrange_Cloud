const WebSocket = require("ws");
const url = require("url");
const { connect, stdin } = require("./kubernetesWebSocket");

const wssServer = new WebSocket.Server({
  noServer: true,
});

exports.setupSocket = (server) => {
  server.on("upgrade", (request, socket, head) => {
    const { pod, container } = url.parse(request.url, true).query;
    console.log(`Upgrade request for pod: ${pod}, container: ${container}`);
    const podSocket = connect(pod, container);
    wssServer.handleUpgrade(request, socket, head, (ws) => {
      wssServer.emit("connection", ws, podSocket);
    });
  });

  wssServer.on("connection", (ws, podSocket) => {
    console.log(`WebSocket connection established between client and pod.`);

    podSocket.on("error", (error) => {
      console.error(`Pod socket error: ${error.message}`);
      ws.send(error.toString());
    });

    podSocket.on("close", () => {
      console.log("[!] k8s socket closed");
      ws.close();
    });

    ws.on("close", () => {
      console.log("[!] client connection closed");
      if (podSocket.readyState === WebSocket.OPEN) {
        podSocket.send(stdin("exit\n"));
      }
      podSocket.close();
    });

    podSocket.on("open", () => {
      console.log(`Pod socket opened.`);
      podSocket.on("message", (data) => {
        ws.send(data.toString());
      });
      ws.on("message", (message) => {
        podSocket.send(stdin(message));
      });
    });
  });
};
