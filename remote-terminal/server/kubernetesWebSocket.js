const env = require("./env");
const WebSocket = require("ws");

const MAX_RETRIES = 5;
const RETRY_DELAY = 2000; // 2 seconds

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.connect = async (pod, container) => {
  let retries = 0;
  let lastError = null;

  while (retries < MAX_RETRIES) {
    try {
      const podUrl = `wss://${env.KUBERNETES_HOST}/api/v1/namespaces/${env.KUBERNETES_NAMESPACE}/pods/${pod}/exec?command=sh&stdin=true&stdout=true&tty=true&container=${container}`;

      console.log(`Connecting to K8s pod at URL: ${podUrl} (Attempt ${retries + 1}/${MAX_RETRIES})`);

      const ws = new WebSocket(podUrl, ['v4.channel.k8s.io'], {
        headers: {
          Authorization: `Bearer ${env.KUBERNETES_SERVICE_ACCOUNT_TOKEN}`,
        },
        rejectUnauthorized: false,
      });

      // Promise to handle connection success/failure
      const connectionPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          ws.close();
          reject(new Error('Connection timeout'));
        }, 10000); // 10 second timeout

        ws.on('open', () => {
          clearTimeout(timeout);
          console.log(`WebSocket connection to pod ${pod} opened successfully.`);
          resolve(ws);
        });

        ws.on('error', (error) => {
          clearTimeout(timeout);
          console.error(`WebSocket error (Attempt ${retries + 1}/${MAX_RETRIES}):`, error.message);
          reject(error);
        });
      });

      // Wait for connection to be established
      const connectedWs = await connectionPromise;

      // Set up event handlers for the successful connection
      connectedWs.on('close', (code, reason) => {
        console.log(`WebSocket connection to pod ${pod} closed with code ${code}${reason ? ': ' + reason : ''}`);
      });

      connectedWs.on('error', (error) => {
        console.error(`WebSocket error after connection:`, error.message);
      });

      connectedWs.on('unexpected-response', (req, res) => {
        console.error(`Unexpected response: ${res.statusCode} ${res.statusMessage}`);
        if (res.statusCode === 401) {
          console.error('Authentication failed. Please check service account token.');
        } else if (res.statusCode === 404) {
          console.error('Pod or container not found. Please check pod and container names.');
        } else if (res.statusCode === 500) {
          console.error('Internal server error. The Kubernetes API server might be experiencing issues.');
        }
      });

      return connectedWs;

    } catch (error) {
      lastError = error;
      retries++;

      if (retries < MAX_RETRIES) {
        console.log(`Connection failed. Retrying in ${RETRY_DELAY/1000} seconds...`);
        await sleep(RETRY_DELAY);
      }
    }
  }

  // If we've exhausted all retries, throw the last error
  console.error(`Failed to connect after ${MAX_RETRIES} attempts.`);
  throw lastError;
};

exports.stdin = (characters) => {
  return Buffer.from(`\x00${characters}`, "utf8");
};
