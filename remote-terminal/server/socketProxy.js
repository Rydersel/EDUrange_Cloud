const WebSocket = require("ws");
const url = require("url");
const { connect, stdin } = require("./kubernetesWebSocket");
const { RateLimiterMemory } = require('rate-limiter-flexible');

// Rate limiter for connection attempts (20 connections per minute per IP)
const connectLimiter = new RateLimiterMemory({
  points: 20,     
  duration: 60,   
});

// Rate limiter for messages (200 messages per minute per connection)
const messageLimiter = new RateLimiterMemory({
  points: 200,    
  duration: 60,   
});

const wssServer = new WebSocket.Server({
  noServer: true,
});

exports.setupSocket = (server) => {
  server.on("upgrade", async (request, socket, head) => {
    try {
      // Get client IP
      const ip = request.headers['x-forwarded-for'] ||
                 request.connection.remoteAddress;

      // Check connection rate limit
      try {
        await connectLimiter.consume(ip);
      } catch (error) {
        console.error(`Rate limit exceeded for IP ${ip}`);
        socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
        socket.destroy();
        return;
      }

      const { pod, container } = url.parse(request.url, true).query;

      if (!pod || !container) {
        socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
        socket.destroy();
        return;
      }

      console.log(`Upgrade request for pod: ${pod}, container: ${container}`);

      let podSocket;
      try {
        podSocket = await connect(pod, container);
      } catch (error) {
        console.error(`Failed to connect to pod: ${error.message}`);
        socket.write('HTTP/1.1 502 Bad Gateway\r\n\r\n');
        socket.destroy();
        return;
      }

      wssServer.handleUpgrade(request, socket, head, (ws) => {
        setupWebSocketHandlers(ws, podSocket, ip);
      });
    } catch (error) {
      console.error(`Error handling upgrade request: ${error.message}`);
      socket.write('HTTP/1.1 500 Internal Server Error\r\n\r\n');
      socket.destroy();
    }
  });
};

function setupWebSocketHandlers(ws, podSocket, ip) {
  console.log(`WebSocket connection established between client and pod.`);

  let isClosing = false;
  let messageCount = 0;
  const maxMessagesBeforeWarning = 90; // Warn when approaching limit

  const cleanup = () => {
    if (isClosing) return;
    isClosing = true;

    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    if (podSocket && podSocket.readyState === WebSocket.OPEN) {
      podSocket.send(stdin("exit\n"));
      podSocket.close();
    }
  };

  if (podSocket) {
    podSocket.on("error", (error) => {
      console.error(`Pod socket error: ${error.message}`);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(`Error: ${error.message}`);
      }
      cleanup();
    });

    podSocket.on("close", (code, reason) => {
      console.log(`[!] k8s socket closed (${code})${reason ? ': ' + reason : ''}`);
      cleanup();
    });

    podSocket.on("message", (data) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data.toString());
        } catch (error) {
          console.error(`Error sending message to client: ${error.message}`);
          cleanup();
        }
      }
    });
  }

  ws.on("close", (code, reason) => {
    console.log(`[!] client connection closed (${code})${reason ? ': ' + reason : ''}`);
    cleanup();
  });

  ws.on("error", (error) => {
    console.error(`Client socket error: ${error.message}`);
    cleanup();
  });

  ws.on("message", async (message) => {
    try {
      // Check message rate limit
      await messageLimiter.consume(ip);

      messageCount++;
      if (messageCount === maxMessagesBeforeWarning) {
        ws.send("\r\nWarning: Approaching message rate limit. Please slow down.\r\n");
      }

      if (podSocket && podSocket.readyState === WebSocket.OPEN) {
        try {
          podSocket.send(stdin(message));
        } catch (error) {
          console.error(`Error sending message to pod: ${error.message}`);
          cleanup();
        }
      }
    } catch (error) {
      console.error(`Rate limit exceeded for messages from IP ${ip}`);
      ws.send("\r\nRate limit exceeded. Please wait before sending more messages.\r\n");
    }
  });
}
