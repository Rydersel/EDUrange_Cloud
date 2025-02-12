const express = require("express");
const app = express();
const env = require("./env");
const { setupSocket } = require("./socketProxy");

console.log(`Starting server with the following configuration:`);
console.log(`PORT: ${env.PORT}`);
console.log(`POD_NAME: ${env.POD_NAME}`);
console.log(`CONTAINER_NAME: ${env.CONTAINER_NAME}`);
console.log(`KUBERNETES_HOST: ${env.KUBERNETES_HOST}`);
console.log(`KUBERNETES_NAMESPACE: ${env.KUBERNETES_NAMESPACE}`);

app.get("/", express.static("public"));
app.use("/static", express.static("public/static"));

app.get("/env", (req, res) => {
  res.json({
    POD_NAME: env.POD_NAME,
    CONTAINER_NAME: env.CONTAINER_NAME,
  });
});

// Start server
const server = app.listen(env.PORT, () => {
  console.log(`Server is running on port ${env.PORT}`);
});

setupSocket(server);
