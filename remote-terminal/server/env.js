require("dotenv").config();
const { env } = process;

exports.POD_NAME = env.POD_NAME;
exports.CONTAINER_NAME = env.CONTAINER_NAME;
exports.PORT = parseInt(env.PORT || "3001", 10);
exports.KUBERNETES_HOST = env.KUBERNETES_HOST;
exports.KUBERNETES_NAMESPACE = env.KUBERNETES_NAMESPACE;
exports.KUBERNETES_SERVICE_ACCOUNT_TOKEN = env.KUBERNETES_SERVICE_ACCOUNT_TOKEN;
