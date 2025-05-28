/**
 * Grafana Installation and Configuration Utilities
 * 
 * This module provides functions for installing and configuring Grafana
 * in the EDURange Cloud monitoring stack.
 */

/**
 * Generate Grafana values.yaml content for Helm installation
 * @param {object} params - Parameters for the Grafana configuration
 * @returns {string} - The Grafana values.yaml content
 */
export function generateGrafanaValues({ 
  adminPassword, 
  storageClassName, 
  domain 
}) {
  return `
adminUser: admin
adminPassword: ${adminPassword}

persistence:
  enabled: true
  ${storageClassName ? `storageClassName: ${storageClassName}` : ''}
  size: 5Gi

datasources:
  datasources.yaml:
    apiVersion: 1
    datasources:
    - name: Prometheus
      type: prometheus
      url: http://prometheus-kube-prometheus-prometheus.monitoring.svc.cluster.local:9090
      access: proxy
      isDefault: true
    - name: Loki
      type: loki
      url: http://loki.monitoring.svc.cluster.local:3100
      access: proxy

dashboardProviders:
  dashboardproviders.yaml:
    apiVersion: 1
    providers:
    - name: 'default'
      orgId: 1
      folder: ''
      type: file
      disableDeletion: false
      editable: true
      options:
        path: /var/lib/grafana/dashboards/default

dashboards:
  default:
    system-overview:
      file: dashboards/system-overview.json
    component-health:
      file: dashboards/component-health.json
    challenge-activity:
      file: dashboards/challenge-activity.json
    logs-overview:
      file: dashboards/logs-overview.json

dashboardsConfigMaps:
  system-overview: grafana-system-overview-dashboard
  component-health: grafana-component-health-dashboard
  challenge-activity: grafana-challenge-activity-dashboard
  logs-overview: grafana-logs-overview-dashboard

ingress:
  enabled: true
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - grafana.${domain}
  tls:
    - secretName: grafana-tls
      hosts:
        - grafana.${domain}

service:
  type: ClusterIP
  port: 80

resources:
  limits:
    cpu: 300m
    memory: 512Mi
  requests:
    cpu: 100m
    memory: 128Mi

securityContext:
  runAsUser: 472
  runAsGroup: 472
  fsGroup: 472
`;
}

/**
 * Create dashboard ConfigMaps for Grafana
 * @param {object} params - Parameters for creating the ConfigMaps
 * @returns {Promise<object>} - Result of the operation
 */
export async function createDashboardConfigMaps({
  addComponentLog
}) {
  try {
    addComponentLog('Creating dashboard ConfigMaps for Grafana...');

    // System Overview Dashboard
    const systemOverviewDashboard = {
      annotations: {
        list: [
          {
            builtIn: 1,
            datasource: "-- Grafana --",
            enable: true,
            hide: true,
            iconColor: "rgba(0, 211, 255, 1)",
            name: "Annotations & Alerts",
            type: "dashboard"
          }
        ]
      },
      editable: true,
      gnetId: null,
      graphTooltip: 0,
      id: null,
      links: [],
      panels: [
        {
          aliasColors: {},
          bars: false,
          dashLength: 10,
          dashes: false,
          datasource: "Prometheus",
          fill: 1,
          fillGradient: 0,
          gridPos: {
            h: 8,
            w: 12,
            x: 0,
            y: 0
          },
          hiddenSeries: false,
          id: 2,
          legend: {
            avg: false,
            current: false,
            max: false,
            min: false,
            show: true,
            total: false,
            values: false
          },
          lines: true,
          linewidth: 1,
          nullPointMode: "null",
          options: {
            dataLinks: []
          },
          percentage: false,
          pointradius: 2,
          points: false,
          renderer: "flot",
          seriesOverrides: [],
          spaceLength: 10,
          stack: false,
          steppedLine: false,
          targets: [
            {
              expr: "edurange_cpu_usage_total",
              refId: "A"
            },
            {
              expr: "edurange_cpu_usage_challenges",
              refId: "B"
            },
            {
              expr: "edurange_cpu_usage_system",
              refId: "C"
            }
          ],
          thresholds: [],
          timeFrom: null,
          timeRegions: [],
          timeShift: null,
          title: "CPU Usage",
          tooltip: {
            shared: true,
            sort: 0,
            value_type: "individual"
          },
          type: "graph",
          xaxis: {
            buckets: null,
            mode: "time",
            name: null,
            show: true,
            values: []
          },
          yaxes: [
            {
              format: "percent",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            },
            {
              format: "short",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            }
          ],
          yaxis: {
            align: false,
            alignLevel: null
          }
        },
        {
          aliasColors: {},
          bars: false,
          dashLength: 10,
          dashes: false,
          datasource: "Prometheus",
          fill: 1,
          fillGradient: 0,
          gridPos: {
            h: 8,
            w: 12,
            x: 12,
            y: 0
          },
          hiddenSeries: false,
          id: 4,
          legend: {
            avg: false,
            current: false,
            max: false,
            min: false,
            show: true,
            total: false,
            values: false
          },
          lines: true,
          linewidth: 1,
          nullPointMode: "null",
          options: {
            dataLinks: []
          },
          percentage: false,
          pointradius: 2,
          points: false,
          renderer: "flot",
          seriesOverrides: [],
          spaceLength: 10,
          stack: false,
          steppedLine: false,
          targets: [
            {
              expr: "edurange_memory_used",
              refId: "A"
            },
            {
              expr: "edurange_memory_available",
              refId: "B"
            }
          ],
          thresholds: [],
          timeFrom: null,
          timeRegions: [],
          timeShift: null,
          title: "Memory Usage",
          tooltip: {
            shared: true,
            sort: 0,
            value_type: "individual"
          },
          type: "graph",
          xaxis: {
            buckets: null,
            mode: "time",
            name: null,
            show: true,
            values: []
          },
          yaxes: [
            {
              format: "percent",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            },
            {
              format: "short",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            }
          ],
          yaxis: {
            align: false,
            alignLevel: null
          }
        }
      ],
      schemaVersion: 22,
      style: "dark",
      tags: [],
      templating: {
        list: []
      },
      time: {
        from: "now-6h",
        to: "now"
      },
      timepicker: {
        refresh_intervals: [
          "5s",
          "10s",
          "30s",
          "1m",
          "5m",
          "15m",
          "30m",
          "1h",
          "2h",
          "1d"
        ]
      },
      timezone: "",
      title: "System Overview",
      uid: "system-overview",
      version: 1
    };

    // Create ConfigMap for System Overview Dashboard
    const systemOverviewCm = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "grafana-system-overview-dashboard",
        namespace: "monitoring",
        labels: {
          grafana_dashboard: "true"
        }
      },
      data: {
        "system-overview.json": JSON.stringify(systemOverviewDashboard)
      }
    };

    // Create logs overview dashboard
    const logsOverviewDashboard = {
      annotations: {
        list: [
          {
            builtIn: 1,
            datasource: "-- Grafana --",
            enable: true,
            hide: true,
            iconColor: "rgba(0, 211, 255, 1)",
            name: "Annotations & Alerts",
            type: "dashboard"
          }
        ]
      },
      editable: true,
      gnetId: null,
      graphTooltip: 0,
      id: null,
      links: [],
      panels: [
        {
          datasource: "Loki",
          gridPos: {
            h: 8,
            w: 24,
            x: 0,
            y: 0
          },
          id: 2,
          options: {
            showLabels: false,
            showTime: true,
            sortOrder: "Descending",
            wrapLogMessage: true
          },
          targets: [
            {
              expr: "{namespace=\"monitoring\"}",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Monitoring Namespace Logs",
          type: "logs"
        },
        {
          datasource: "Loki",
          gridPos: {
            h: 8,
            w: 24,
            x: 0,
            y: 8
          },
          id: 3,
          options: {
            showLabels: false,
            showTime: true,
            sortOrder: "Descending",
            wrapLogMessage: true
          },
          targets: [
            {
              expr: "{namespace=\"default\", app=\"challenge\"}",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Challenge Logs",
          type: "logs"
        }
      ],
      refresh: "10s",
      schemaVersion: 22,
      style: "dark",
      tags: [],
      templating: {
        list: []
      },
      time: {
        from: "now-1h",
        to: "now"
      },
      timepicker: {
        refresh_intervals: [
          "5s",
          "10s",
          "30s",
          "1m",
          "5m",
          "15m",
          "30m",
          "1h",
          "2h",
          "1d"
        ]
      },
      timezone: "",
      title: "Logs Overview",
      uid: "logs-overview",
      version: 1
    };

    // Create ConfigMap for Logs Overview Dashboard
    const logsOverviewCm = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "grafana-logs-overview-dashboard",
        namespace: "monitoring",
        labels: {
          grafana_dashboard: "true"
        }
      },
      data: {
        "logs-overview.json": JSON.stringify(logsOverviewDashboard)
      }
    };

    // Component Health Dashboard
    const componentHealthDashboard = {
      annotations: {
        list: [
          {
            builtIn: 1,
            datasource: "-- Grafana --",
            enable: true,
            hide: true,
            iconColor: "rgba(0, 211, 255, 1)",
            name: "Annotations & Alerts",
            type: "dashboard"
          }
        ]
      },
      editable: true,
      gnetId: null,
      graphTooltip: 0,
      id: null,
      links: [],
      panels: [
        {
          cacheTimeout: null,
          datasource: "Prometheus",
          gridPos: {
            h: 8,
            w: 8,
            x: 0,
            y: 0
          },
          id: 2,
          links: [],
          options: {
            fieldOptions: {
              calcs: [
                "mean"
              ],
              defaults: {
                mappings: [],
                max: 100,
                min: 0,
                thresholds: {
                  mode: "absolute",
                  steps: [
                    {
                      color: "red",
                      value: null
                    },
                    {
                      color: "orange",
                      value: 50
                    },
                    {
                      color: "green",
                      value: 80
                    }
                  ]
                },
                unit: "percent"
              },
              override: {},
              values: false
            },
            orientation: "auto",
            showThresholdLabels: false,
            showThresholdMarkers: true
          },
          pluginVersion: "6.6.2",
          targets: [
            {
              expr: "100 * (sum(kube_pod_status_phase{namespace=\"monitoring\", phase=\"Running\"}) / sum(kube_pod_status_phase{namespace=\"monitoring\"}))",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Monitoring Pods Health",
          type: "gauge"
        },
        {
          cacheTimeout: null,
          datasource: "Prometheus",
          gridPos: {
            h: 8,
            w: 8,
            x: 8,
            y: 0
          },
          id: 4,
          links: [],
          options: {
            fieldOptions: {
              calcs: [
                "mean"
              ],
              defaults: {
                mappings: [],
                max: 100,
                min: 0,
                thresholds: {
                  mode: "absolute",
                  steps: [
                    {
                      color: "red",
                      value: null
                    },
                    {
                      color: "orange",
                      value: 50
                    },
                    {
                      color: "green",
                      value: 80
                    }
                  ]
                },
                unit: "percent"
              },
              override: {},
              values: false
            },
            orientation: "auto",
            showThresholdLabels: false,
            showThresholdMarkers: true
          },
          pluginVersion: "6.6.2",
          targets: [
            {
              expr: "100 * (sum(kube_pod_status_phase{namespace=\"default\", phase=\"Running\"}) / sum(kube_pod_status_phase{namespace=\"default\"}))",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Default Namespace Pods Health",
          type: "gauge"
        },
        {
          datasource: "Loki",
          gridPos: {
            h: 9,
            w: 24,
            x: 0,
            y: 8
          },
          id: 6,
          options: {
            showLabels: false,
            showTime: true,
            sortOrder: "Descending",
            wrapLogMessage: false
          },
          targets: [
            {
              expr: "{namespace=\"monitoring\"} |= \"error\"",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Error Logs",
          type: "logs"
        }
      ],
      refresh: "10s",
      schemaVersion: 22,
      style: "dark",
      tags: [],
      templating: {
        list: []
      },
      time: {
        from: "now-6h",
        to: "now"
      },
      timepicker: {
        refresh_intervals: [
          "5s",
          "10s",
          "30s",
          "1m",
          "5m",
          "15m",
          "30m",
          "1h",
          "2h",
          "1d"
        ]
      },
      timezone: "",
      title: "Component Health",
      uid: "component-health",
      version: 1
    };

    // Create ConfigMap for Component Health Dashboard
    const componentHealthCm = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "grafana-component-health-dashboard",
        namespace: "monitoring",
        labels: {
          grafana_dashboard: "true"
        }
      },
      data: {
        "component-health.json": JSON.stringify(componentHealthDashboard)
      }
    };

    // Challenge Activity Dashboard
    const challengeActivityDashboard = {
      annotations: {
        list: [
          {
            builtIn: 1,
            datasource: "-- Grafana --",
            enable: true,
            hide: true,
            iconColor: "rgba(0, 211, 255, 1)",
            name: "Annotations & Alerts",
            type: "dashboard"
          }
        ]
      },
      editable: true,
      gnetId: null,
      graphTooltip: 0,
      id: null,
      links: [],
      panels: [
        {
          aliasColors: {},
          bars: false,
          dashLength: 10,
          dashes: false,
          datasource: "Prometheus",
          fill: 1,
          fillGradient: 0,
          gridPos: {
            h: 8,
            w: 12,
            x: 0,
            y: 0
          },
          hiddenSeries: false,
          id: 2,
          legend: {
            avg: false,
            current: false,
            max: false,
            min: false,
            show: true,
            total: false,
            values: false
          },
          lines: true,
          linewidth: 1,
          nullPointMode: "null",
          options: {
            dataLinks: []
          },
          percentage: false,
          pointradius: 2,
          points: false,
          renderer: "flot",
          seriesOverrides: [],
          spaceLength: 10,
          stack: false,
          steppedLine: false,
          targets: [
            {
              expr: "edurange_challenge_count_total",
              refId: "A"
            },
            {
              expr: "edurange_challenge_count_running",
              refId: "B"
            },
            {
              expr: "edurange_challenge_count_pending",
              refId: "C"
            },
            {
              expr: "edurange_challenge_count_failed",
              refId: "D"
            }
          ],
          thresholds: [],
          timeFrom: null,
          timeRegions: [],
          timeShift: null,
          title: "Challenge Instances",
          tooltip: {
            shared: true,
            sort: 0,
            value_type: "individual"
          },
          type: "graph",
          xaxis: {
            buckets: null,
            mode: "time",
            name: null,
            show: true,
            values: []
          },
          yaxes: [
            {
              format: "short",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            },
            {
              format: "short",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            }
          ],
          yaxis: {
            align: false,
            alignLevel: null
          }
        },
        {
          aliasColors: {},
          bars: false,
          dashLength: 10,
          dashes: false,
          datasource: "Prometheus",
          fill: 1,
          fillGradient: 0,
          gridPos: {
            h: 8,
            w: 12,
            x: 12,
            y: 0
          },
          hiddenSeries: false,
          id: 4,
          legend: {
            avg: false,
            current: false,
            max: false,
            min: false,
            show: true,
            total: false,
            values: false
          },
          lines: true,
          linewidth: 1,
          nullPointMode: "null",
          options: {
            dataLinks: []
          },
          percentage: false,
          pointradius: 2,
          points: false,
          renderer: "flot",
          seriesOverrides: [],
          spaceLength: 10,
          stack: false,
          steppedLine: false,
          targets: [
            {
              expr: "edurange_network_inbound",
              refId: "A"
            },
            {
              expr: "edurange_network_outbound",
              refId: "B"
            },
            {
              expr: "edurange_network_total",
              refId: "C"
            }
          ],
          thresholds: [],
          timeFrom: null,
          timeRegions: [],
          timeShift: null,
          title: "Network Traffic",
          tooltip: {
            shared: true,
            sort: 0,
            value_type: "individual"
          },
          type: "graph",
          xaxis: {
            buckets: null,
            mode: "time",
            name: null,
            show: true,
            values: []
          },
          yaxes: [
            {
              format: "MBs",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            },
            {
              format: "short",
              label: null,
              logBase: 1,
              max: null,
              min: null,
              show: true
            }
          ],
          yaxis: {
            align: false,
            alignLevel: null
          }
        },
        {
          datasource: "Loki",
          gridPos: {
            h: 9,
            w: 24,
            x: 0,
            y: 8
          },
          id: 6,
          options: {
            showLabels: false,
            showTime: true,
            sortOrder: "Descending",
            wrapLogMessage: false
          },
          targets: [
            {
              expr: "{namespace=\"default\", app=\"challenge\"}",
              refId: "A"
            }
          ],
          timeFrom: null,
          timeShift: null,
          title: "Challenge Logs",
          type: "logs"
        }
      ],
      refresh: "10s",
      schemaVersion: 22,
      style: "dark",
      tags: [],
      templating: {
        list: []
      },
      time: {
        from: "now-6h",
        to: "now"
      },
      timepicker: {
        refresh_intervals: [
          "5s",
          "10s",
          "30s",
          "1m",
          "5m",
          "15m",
          "30m",
          "1h",
          "2h",
          "1d"
        ]
      },
      timezone: "",
      title: "Challenge Activity",
      uid: "challenge-activity",
      version: 1
    };

    // Create ConfigMap for Challenge Activity Dashboard
    const challengeActivityCm = {
      apiVersion: "v1",
      kind: "ConfigMap",
      metadata: {
        name: "grafana-challenge-activity-dashboard",
        namespace: "monitoring",
        labels: {
          grafana_dashboard: "true"
        }
      },
      data: {
        "challenge-activity.json": JSON.stringify(challengeActivityDashboard)
      }
    };

    // Apply ConfigMaps
    addComponentLog('Applying System Overview Dashboard ConfigMap...');
    await window.api.applyManifestFromString(JSON.stringify(systemOverviewCm));

    addComponentLog('Applying Logs Overview Dashboard ConfigMap...');
    await window.api.applyManifestFromString(JSON.stringify(logsOverviewCm));

    addComponentLog('Applying Component Health Dashboard ConfigMap...');
    await window.api.applyManifestFromString(JSON.stringify(componentHealthCm));

    addComponentLog('Applying Challenge Activity Dashboard ConfigMap...');
    await window.api.applyManifestFromString(JSON.stringify(challengeActivityCm));

    addComponentLog('All dashboard ConfigMaps created successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error creating dashboard ConfigMaps: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install Grafana using Helm
 * @param {object} params - Parameters for the installation
 * @returns {Promise<object>} - Result of the installation
 */
export async function installGrafana({
  addComponentLog,
  storageClassName,
  waitForPod,
  domain,
  grafanaPassword = 'edurange'
}) {
  try {
    addComponentLog('Starting Grafana installation...');

    // Add Grafana Helm repository
    addComponentLog('Adding Grafana Helm repository...');
    const helmAddRepoResult = await window.api.executeCommand('helm', [
      'repo',
      'add',
      'grafana',
      'https://grafana.github.io/helm-charts'
    ]);

    if (helmAddRepoResult.code !== 0) {
      throw new Error(`Failed to add Grafana Helm repository: ${helmAddRepoResult.stderr}`);
    }

    // Update repositories
    addComponentLog('Updating Helm repositories...');
    const helmUpdateResult = await window.api.executeCommand('helm', [
      'repo',
      'update'
    ]);

    if (helmUpdateResult.code !== 0) {
      throw new Error(`Failed to update Helm repositories: ${helmUpdateResult.stderr}`);
    }

    // Create dashboard ConfigMaps
    await createDashboardConfigMaps({ addComponentLog });

    // Generate Grafana values
    const grafanaValues = generateGrafanaValues({
      adminPassword: grafanaPassword,
      storageClassName,
      domain: domain.name
    });

    // Create a temporary file with the values
    addComponentLog('Creating Grafana configuration...');
    const tempValuesFile = await window.api.executeCommand('mktemp', ['-t', 'grafana-values-XXXXXX.yaml']);
    if (tempValuesFile.code !== 0) {
      throw new Error(`Failed to create temporary file: ${tempValuesFile.stderr}`);
    }

    const tempFilePath = tempValuesFile.stdout.trim();

    // Write the values to the temporary file
    const writeResult = await window.api.executeCommand('bash', [
      '-c',
      `cat > "${tempFilePath}" << 'EOF'
${grafanaValues}
EOF`
    ]);

    if (writeResult.code !== 0) {
      throw new Error(`Failed to write Grafana values to temporary file: ${writeResult.stderr}`);
    }

    // Install Grafana using Helm
    addComponentLog('Installing Grafana using Helm...');
    const helmInstallResult = await window.api.executeCommand('helm', [
      'upgrade',
      '--install',
      'grafana',
      'grafana/grafana',
      '--namespace',
      'monitoring',
      '-f',
      tempFilePath,
      '--timeout',
      '10m',
      '--atomic',
      '--wait'
    ]);

    // Clean up the temporary file
    await window.api.executeCommand('rm', [tempFilePath]);

    if (helmInstallResult.code !== 0) {
      throw new Error(`Failed to install Grafana: ${helmInstallResult.stderr}`);
    }

    addComponentLog('Grafana installation completed successfully.');

    // Wait for Grafana pod to be ready
    addComponentLog('Waiting for Grafana pod to be ready...');
    const waitResult = await waitForPod({
      selector: 'app.kubernetes.io/name=grafana',
      namespace: 'monitoring',
      timeout: 300
    });

    if (!waitResult.success) {
      addComponentLog(`Warning: Grafana pod readiness check timed out: ${waitResult.error}`);
      addComponentLog('Will continue with the installation process as Grafana may still be starting...');
    } else {
      addComponentLog('Grafana pod is ready.');
    }

    // Get the Grafana URL
    const grafanaUrl = `https://grafana.${domain.name}`;
    addComponentLog(`Grafana is available at: ${grafanaUrl}`);
    addComponentLog(`You can log in with username: admin and password: ${grafanaPassword}`);

    return { 
      success: true, 
      url: grafanaUrl, 
      credentials: {
        username: 'admin',
        password: grafanaPassword
      }
    };
  } catch (error) {
    addComponentLog(`Error installing Grafana: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check if Grafana is already installed
 * @param {function} addComponentLog - Function to log messages
 * @returns {Promise<boolean>} - Whether Grafana is already installed
 */
export async function isGrafanaInstalled(addComponentLog) {
  try {
    addComponentLog('Checking if Grafana is already installed...');
    
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'grafana',
      '--output',
      'json'
    ]);

    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(helmListResult.stdout);
      const grafanaReleases = releases.filter(release => 
        release.name === 'grafana' && release.status === 'deployed'
      );
      
      if (grafanaReleases.length > 0) {
        addComponentLog('Grafana is already installed.');
        return true;
      }
    }
    
    addComponentLog('Grafana is not installed.');
    return false;
  } catch (error) {
    addComponentLog(`Error checking Grafana installation: ${error.message}`);
    return false;
  }
}

/**
 * Uninstall Grafana if it exists
 * @param {function} addComponentLog - Function to log messages
 * @returns {Promise<boolean>} - Whether the uninstallation was successful
 */
export async function uninstallGrafana(addComponentLog) {
  try {
    addComponentLog('Checking for existing Grafana installation...');
    
    const helmListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'grafana',
      '--output',
      'json'
    ]);

    if (helmListResult.stdout && helmListResult.stdout.trim() !== '[]') {
      addComponentLog('Found existing Grafana installation. Uninstalling...');
      
      const uninstallResult = await window.api.executeCommand('helm', [
        'uninstall',
        'grafana',
        '--namespace',
        'monitoring'
      ]);
      
      if (uninstallResult.code !== 0) {
        addComponentLog(`Warning: Failed to uninstall Grafana: ${uninstallResult.stderr}`);
        return false;
      }
      
      addComponentLog('Grafana uninstalled successfully.');
      
      // Wait for resources to be fully removed
      addComponentLog('Waiting for Grafana resources to be fully removed...');
      await new Promise(resolve => setTimeout(resolve, 10000));
      
      // Clean up ConfigMaps for dashboards
      const dashboardConfigMaps = [
        'grafana-system-overview-dashboard',
        'grafana-component-health-dashboard',
        'grafana-challenge-activity-dashboard',
        'grafana-logs-overview-dashboard'
      ];
      
      for (const cm of dashboardConfigMaps) {
        addComponentLog(`Deleting dashboard ConfigMap: ${cm}...`);
        await window.api.executeCommand('kubectl', [
          'delete',
          'configmap',
          cm,
          '--namespace',
          'monitoring',
          '--ignore-not-found'
        ]);
      }
    }
    
    return true;
  } catch (error) {
    addComponentLog(`Error uninstalling Grafana: ${error.message}`);
    return false;
  }
} 