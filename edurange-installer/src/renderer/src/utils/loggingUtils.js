/**
 * Logging Utilities for EDURange Cloud Components
 * 
 * This module provides functions for generating logging client configurations
 * for different EDURange Cloud components to connect with Loki.
 */

/**
 * Generate Winston Loki configuration for JavaScript/TypeScript applications
 * @param {string} serviceName - Name of the service (e.g., 'dashboard', 'webos')
 * @returns {string} - Winston Loki configuration code
 */
export function generateWinstonLokiConfig(serviceName) {
  return `// Logger configuration with Winston and Loki transport
import { LokiTransport } from 'winston-loki';
import winston from 'winston';

// Add loki transport to the package.json:
// "winston-loki": "^6.0.6",

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: '${serviceName}' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return \`[${serviceName}] \${timestamp} \${level}: \${message} \${Object.keys(meta).length ? JSON.stringify(meta) : ''}\`;
        })
      )
    }),
    new LokiTransport({
      host: process.env.LOKI_URL || 'http://loki.monitoring.svc.cluster.local:3100',
      labels: { job: '${serviceName}' },
      json: true,
      batching: true,
      interval: 5,
      clearOnError: false,
      replaceTimestamp: true,
      onConnectionError: (err) => console.error('Loki connection error:', err)
    })
  ]
});

// Add a middleware for HTTP requests (for Next.js/Express apps)
export const loggerMiddleware = (req, res, next) => {
  req.logger = logger.child({
    requestId: req.id || req.headers['x-request-id'],
    userId: req.user?.id,
    path: req.path || req.url,
    method: req.method
  });
  
  // Log the request
  req.logger.info(\`\${req.method} \${req.path || req.url}\`);
  
  // Log the response
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    req.logger.info(\`\${req.method} \${req.path || req.url} \${res.statusCode} - \${duration}ms\`);
  });
  
  next();
};

export default logger;`;
}

/**
 * Generate Python Loki configuration for Python applications
 * @param {string} serviceName - Name of the service (e.g., 'instance-manager', 'database-controller')
 * @returns {string} - Python Loki configuration code
 */
export function generatePythonLokiConfig(serviceName) {
  return `# Logger configuration with Python and Loki
import logging
import os
import sys
import socket
import json
import time
from logging.handlers import SocketHandler

# Add loki-logger to requirements.txt:
# python-logging-loki==0.3.1

try:
    import logging_loki
except ImportError:
    print("WARNING: logging_loki package not found. Install with: pip install python-logging-loki")
    
class LokiHandler(SocketHandler):
    def __init__(self, host='loki.monitoring.svc.cluster.local', port=3100):
        super(LokiHandler, self).__init__(host, port)
        self.service_name = '${serviceName}'
        
    def makePickle(self, record):
        ts = int(record.created * 1000000000)
        log_entry = {
            "streams": [
                {
                    "stream": {
                        "job": self.service_name,
                        "level": record.levelname,
                        "logger": record.name,
                    },
                    "values": [
                        [str(ts), self.format(record)]
                    ]
                }
            ]
        }
        return json.dumps(log_entry).encode('utf-8')

def setup_logger(name, loki_host='loki.monitoring.svc.cluster.local', 
                 log_level=logging.INFO):
    logger = logging.getLogger(name)
    logger.setLevel(log_level)
    
    # Clear existing handlers
    logger.handlers = []
    
    # Console handler
    console = logging.StreamHandler(sys.stdout)
    console.setLevel(log_level)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    console.setFormatter(formatter)
    logger.addHandler(console)
    
    # Loki handler
    try:
        # Try to use the logging_loki package if available
        if 'logging_loki' in sys.modules:
            loki_handler = logging_loki.LokiHandler(
                url=f"http://{loki_host}:3100/loki/api/v1/push",
                tags={"job": "${serviceName}"},
                version="1",
            )
            loki_handler.setLevel(log_level)
            loki_handler.setFormatter(formatter)
            logger.addHandler(loki_handler)
        else:
            # Fall back to custom LokiHandler
            loki = LokiHandler(loki_host)
            loki.setLevel(log_level)
            loki.setFormatter(formatter)
            logger.addHandler(loki)
            
        logger.info(f"Connected to Loki at {loki_host}")
    except (socket.error, Exception) as e:
        logger.warning(f"Could not connect to Loki: {str(e)}. Logging to console only.")
    
    return logger

# Usage example:
# logger = setup_logger('${serviceName}')
# logger.info('Application started')`;
}

/**
 * Generate Fluent Bit configuration for container logging
 * @returns {string} - Fluent Bit configuration
 */
export function generateFluentBitConfig() {
  return `[SERVICE]
    Flush        1
    Log_Level    info
    Daemon       off
    HTTP_Server  on
    HTTP_Listen  0.0.0.0
    HTTP_Port    2020

[INPUT]
    Name              tail
    Tag               kube.*
    Path              /var/log/containers/*.log
    Parser            docker
    Refresh_Interval  5
    Mem_Buf_Limit     5MB
    Skip_Long_Lines   on
    DB                /var/log/flb_kube.db

[FILTER]
    Name                kubernetes
    Match               kube.*
    Kube_URL            https://kubernetes.default.svc:443
    Kube_CA_File        /var/run/secrets/kubernetes.io/serviceaccount/ca.crt
    Kube_Token_File     /var/run/secrets/kubernetes.io/serviceaccount/token
    Merge_Log           on
    K8S-Logging.Parser  on
    K8S-Logging.Exclude off
    Labels              off
    Annotations         off

[OUTPUT]
    Name        loki
    Match       *
    Host        loki.monitoring.svc.cluster.local
    Port        3100
    Labels      job=fluent-bit
    Label_Keys  $kubernetes['namespace_name'],$kubernetes['pod_name'],$kubernetes['container_name']
    Remove_Keys kubernetes,stream`;
}

/**
 * Generate Node.js Express Middleware for Loki logging
 * @param {string} serviceName - Name of the service (e.g., 'remote-terminal')
 * @returns {string} - Express middleware configuration code
 */
export function generateExpressLokiMiddleware(serviceName) {
  return `// Express middleware for Loki logging
const winston = require('winston');
const { LokiTransport } = require('winston-loki');

// Create a winston logger with Loki transport
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  defaultMeta: { service: '${serviceName}' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.timestamp(),
        winston.format.printf(({ timestamp, level, message, ...meta }) => {
          return \`[${serviceName}] \${timestamp} \${level}: \${message} \${Object.keys(meta).length ? JSON.stringify(meta) : ''}\`;
        })
      )
    }),
    new LokiTransport({
      host: process.env.LOKI_URL || 'http://loki.monitoring.svc.cluster.local:3100',
      labels: { job: '${serviceName}' },
      json: true,
      batching: true,
      interval: 5,
      clearOnError: false,
      replaceTimestamp: true,
      onConnectionError: (err) => console.error('Loki connection error:', err)
    })
  ]
});

// Express middleware for logging
const lokiLoggingMiddleware = (req, res, next) => {
  // Add a unique request ID if not already present
  req.id = req.headers['x-request-id'] || require('crypto').randomUUID();
  
  // Add the logger to the request object
  req.logger = logger.child({
    requestId: req.id,
    userId: req.user?.id,
    path: req.path || req.url,
    method: req.method,
    ip: req.ip || req.connection.remoteAddress
  });
  
  // Log the request
  req.logger.info(\`Request received: \${req.method} \${req.path || req.url}\`);
  
  // Track response time
  const start = Date.now();
  
  // Log the response
  res.on('finish', () => {
    const duration = Date.now() - start;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    req.logger[level]({
      message: \`Request completed: \${req.method} \${req.path || req.url}\`,
      statusCode: res.statusCode,
      duration: \`\${duration}ms\`
    });
  });
  
  // Log any errors
  res.on('error', (error) => {
    req.logger.error({
      message: \`Request error: \${req.method} \${req.path || req.url}\`,
      error: error.message,
      stack: error.stack
    });
  });
  
  next();
};

module.exports = {
  logger,
  lokiLoggingMiddleware
};`;
}

/**
 * Generate Promtail configuration for Kubernetes
 * @returns {string} - Promtail configuration YAML
 */
export function generatePromtailConfig() {
  return `apiVersion: v1
kind: ConfigMap
metadata:
  name: promtail-config
  namespace: monitoring
data:
  promtail.yaml: |
    server:
      http_listen_port: 9080
      grpc_listen_port: 0

    positions:
      filename: /tmp/positions.yaml

    clients:
      - url: http://loki:3100/loki/api/v1/push

    scrape_configs:
      - job_name: kubernetes-pods
        kubernetes_sd_configs:
          - role: pod
        relabel_configs:
          - source_labels: [__meta_kubernetes_pod_node_name]
            target_label: __host__
          - action: labelmap
            regex: __meta_kubernetes_pod_label_(.+)
          - action: replace
            replacement: $1
            separator: /
            source_labels:
              - __meta_kubernetes_namespace
              - __meta_kubernetes_pod_name
            target_label: job
          - action: replace
            source_labels:
              - __meta_kubernetes_namespace
            target_label: namespace
          - action: replace
            source_labels:
              - __meta_kubernetes_pod_name
            target_label: pod
          - action: replace
            source_labels:
              - __meta_kubernetes_pod_container_name
            target_label: container
          - replacement: /var/log/pods/*$1/*.log
            separator: /
            source_labels:
              - __meta_kubernetes_pod_uid
              - __meta_kubernetes_pod_container_name
            target_label: __path__
---
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: promtail
  namespace: monitoring
spec:
  selector:
    matchLabels:
      app: promtail
  template:
    metadata:
      labels:
        app: promtail
    spec:
      serviceAccount: promtail
      containers:
        - name: promtail
          image: grafana/promtail:2.8.0
          args:
            - -config.file=/etc/promtail/promtail.yaml
          volumeMounts:
            - name: config
              mountPath: /etc/promtail
            - name: var-log
              mountPath: /var/log
            - name: var-lib-docker-containers
              mountPath: /var/lib/docker/containers
              readOnly: true
          ports:
            - containerPort: 9080
              name: http-metrics
          securityContext:
            privileged: true
            runAsUser: 0
      volumes:
        - name: config
          configMap:
            name: promtail-config
        - name: var-log
          hostPath:
            path: /var/log
        - name: var-lib-docker-containers
          hostPath:
            path: /var/lib/docker/containers
---
apiVersion: v1
kind: ServiceAccount
metadata:
  name: promtail
  namespace: monitoring
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRole
metadata:
  name: promtail
rules:
  - apiGroups: [""]
    resources:
      - nodes
      - nodes/proxy
      - services
      - endpoints
      - pods
    verbs: ["get", "watch", "list"]
---
apiVersion: rbac.authorization.k8s.io/v1
kind: ClusterRoleBinding
metadata:
  name: promtail
roleRef:
  apiGroup: rbac.authorization.k8s.io
  kind: ClusterRole
  name: promtail
subjects:
  - kind: ServiceAccount
    name: promtail
    namespace: monitoring`;
}

/**
 * Generate Loki Ingress manifest
 * @param {string} domain - The domain name
 * @returns {string} - Loki Ingress YAML
 */
export function generateLokiIngress(domain) {
  return `apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: loki-ingress
  namespace: monitoring
  annotations:
    kubernetes.io/ingress.class: nginx
    nginx.ingress.kubernetes.io/ssl-redirect: "true"
    nginx.ingress.kubernetes.io/proxy-body-size: "0"
    nginx.ingress.kubernetes.io/proxy-read-timeout: "600"
    nginx.ingress.kubernetes.io/proxy-send-timeout: "600"
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  rules:
  - host: loki.${domain}
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: loki
            port:
              number: 3100
  tls:
  - hosts:
    - loki.${domain}
    secretName: loki-tls`;
}

/**
 * Generate configuration instructions for different components
 * @returns {object} - Configuration instructions for each component
 */
export function getLoggingIntegrationInstructions() {
  return {
    dashboard: {
      files: [
        {
          path: 'dashboard/lib/logger.ts',
          description: 'Winston logger with Loki transport for the dashboard'
        },
        {
          path: 'dashboard/middleware.ts',
          description: 'Middleware to add logging to API routes'
        }
      ],
      dependencies: [
        'winston',
        'winston-loki'
      ],
      notes: 'Add logger to API routes and server components'
    },
    webos: {
      files: [
        {
          path: 'webos/lib/logger.ts',
          description: 'Winston logger with Loki transport for WebOS'
        },
        {
          path: 'webos/middleware.ts',
          description: 'Middleware to add logging to API routes'
        }
      ],
      dependencies: [
        'winston',
        'winston-loki'
      ],
      notes: 'Add logger to UI events and API calls'
    },
    instanceManager: {
      files: [
        {
          path: 'instance-manager/logger.py',
          description: 'Python logger with Loki integration'
        }
      ],
      dependencies: [
        'python-logging-loki'
      ],
      notes: 'Replace current logging implementation with Loki-enabled one'
    },
    databaseController: {
      files: [
        {
          path: 'database-controller/logger.py',
          description: 'Python logger with Loki integration'
        }
      ],
      dependencies: [
        'python-logging-loki'
      ],
      notes: 'Replace current logging implementation with Loki-enabled one'
    },
    remoteTerminal: {
      files: [
        {
          path: 'remote-terminal/logger.js',
          description: 'Winston logger with Loki transport for Remote Terminal'
        }
      ],
      dependencies: [
        'winston',
        'winston-loki'
      ],
      notes: 'Add logging to terminal connections and commands'
    }
  };
} 