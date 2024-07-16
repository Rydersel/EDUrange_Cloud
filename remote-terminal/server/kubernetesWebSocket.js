const env = require("./env");
const WebSocket = require("ws");

exports.connect = (pod, container) => {
  const podUrl = `wss://${env.KUBERNETES_HOST}/api/v1/namespaces/${env.KUBERNETES_NAMESPACE}/pods/${pod}/exec?command=sh&stdin=true&stdout=true&tty=true&container=${container}`;

  console.log(`Connecting to K8s pod at URL: ${podUrl}`);

  const ws = new WebSocket(podUrl, {
    headers: {
      Authorization: `Bearer ${env.KUBERNETES_SERVICE_ACCOUNT_TOKEN}`,
    },
    rejectUnauthorized: false,
  });

  ws.on('open', () => {
    console.log(`WebSocket connection to pod ${pod} opened.`);
  });

  ws.on('close', () => {
    console.log(`WebSocket connection to pod ${pod} closed.`);
  });

  ws.on('error', (error) => {
    console.error(`WebSocket error: ${error.message}`);
  });

  ws.on('unexpected-response', (req, res) => {
    console.error(`Unexpected response: ${res.statusCode} ${res.statusMessage}`);
  });

  return ws;
};

exports.stdin = (characters) => {
  return Buffer.from(`\x00${characters}`, "utf8");
};
