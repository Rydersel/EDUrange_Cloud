/**
 * Monitoring Utilities for EDURange Cloud
 * 
 * This module provides utilities for installing and configuring the monitoring stack
 * including Prometheus, Loki, and Grafana in the EDURange Cloud platform.
 */

import { isLokiInstalled, uninstallLoki, installLoki } from './lokiUtils';
import { isGrafanaInstalled, uninstallGrafana, installGrafana } from './grafanaUtils';
import { generatePromtailConfig, generateLokiIngress } from './loggingUtils';

/**
 * Install Promtail for log collection
 * @param {object} params - Parameters for the installation
 * @returns {Promise<object>} - Result of the installation
 */
export async function installPromtail({
  addComponentLog
}) {
  try {
    addComponentLog('Starting Promtail installation...');

    // Generate Promtail configuration
    const promtailConfig = generatePromtailConfig();

    // Apply the Promtail configuration
    addComponentLog('Applying Promtail configuration...');
    await window.api.applyManifestFromString(promtailConfig);

    addComponentLog('Promtail installation completed successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error installing Promtail: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Clean up existing monitoring resources
 * @param {object} params - Parameters for the cleanup
 * @returns {Promise<object>} - Result of the cleanup
 */
export async function cleanupMonitoringResources({
  addComponentLog,
  uninstallExistingPrometheus
}) {
  try {
    addComponentLog('Cleaning up existing monitoring resources...');

    // Uninstall existing Prometheus installation
    await uninstallExistingPrometheus(addComponentLog);

    // Uninstall existing Loki installation
    await uninstallLoki(addComponentLog);

    // Uninstall existing Grafana installation
    await uninstallGrafana(addComponentLog);

    // Delete Promtail resources
    addComponentLog('Checking for existing Promtail resources...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'daemonset',
      'promtail',
      '--namespace',
      'monitoring',
      '--ignore-not-found'
    ]);

    await window.api.executeCommand('kubectl', [
      'delete',
      'configmap',
      'promtail-config',
      '--namespace',
      'monitoring',
      '--ignore-not-found'
    ]);

    await window.api.executeCommand('kubectl', [
      'delete',
      'serviceaccount',
      'promtail',
      '--namespace',
      'monitoring',
      '--ignore-not-found'
    ]);

    await window.api.executeCommand('kubectl', [
      'delete',
      'clusterrole',
      'promtail',
      '--ignore-not-found'
    ]);

    await window.api.executeCommand('kubectl', [
      'delete',
      'clusterrolebinding',
      'promtail',
      '--ignore-not-found'
    ]);

    // Delete Loki Ingress
    addComponentLog('Checking for existing Loki Ingress...');
    await window.api.executeCommand('kubectl', [
      'delete',
      'ingress',
      'loki-ingress',
      '--namespace',
      'monitoring',
      '--ignore-not-found'
    ]);

    addComponentLog('Monitoring resources cleanup completed successfully.');
    return { success: true };
  } catch (error) {
    addComponentLog(`Error cleaning up monitoring resources: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Install the complete monitoring stack (Prometheus, Loki, Grafana, Promtail)
 * @param {object} params - Parameters for the installation
 * @returns {Promise<object>} - Result of the installation with URLs and credentials
 */
export async function installMonitoringStack({
  addComponentLog,
  domain,
  storageClassName,
  waitForPod,
  uninstallExistingPrometheus,
  installPrometheus,
  grafanaPassword = 'edurange'
}) {
  try {
    addComponentLog('Starting monitoring stack installation...');

    // Clean up existing resources
    await cleanupMonitoringResources({
      addComponentLog,
      uninstallExistingPrometheus
    });

    // Install Prometheus
    addComponentLog('Installing Prometheus...');
    const prometheusResult = await installPrometheus();

    if (!prometheusResult.success) {
      throw new Error(`Failed to install Prometheus: ${prometheusResult.error}`);
    }

    // Install Loki
    addComponentLog('Installing Loki...');
    const lokiResult = await installLoki({
      addComponentLog,
      storageClassName,
      waitForPod,
      domain
    });

    if (!lokiResult.success) {
      throw new Error(`Failed to install Loki: ${lokiResult.error}`);
    }

    // Install Promtail
    addComponentLog('Installing Promtail...');
    const promtailResult = await installPromtail({
      addComponentLog
    });

    if (!promtailResult.success) {
      throw new Error(`Failed to install Promtail: ${promtailResult.error}`);
    }

    // Create Loki Ingress
    addComponentLog('Creating Loki Ingress...');
    const lokiIngress = generateLokiIngress(domain.name);
    await window.api.applyManifestFromString(lokiIngress);

    // Install Grafana
    addComponentLog('Installing Grafana...');
    const grafanaResult = await installGrafana({
      addComponentLog,
      storageClassName,
      waitForPod,
      domain,
      grafanaPassword
    });

    if (!grafanaResult.success) {
      throw new Error(`Failed to install Grafana: ${grafanaResult.error}`);
    }

    addComponentLog('Monitoring stack installation completed successfully.');
    addComponentLog(`Grafana is available at: ${grafanaResult.url}`);
    addComponentLog(`You can log in with username: admin and password: ${grafanaPassword}`);
    addComponentLog('Loki is configured as a data source in Grafana.');
    addComponentLog('Promtail is collecting logs from all containers.');

    return {
      success: true,
      grafanaUrl: grafanaResult.url,
      grafanaCredentials: grafanaResult.credentials,
      lokiUrl: `https://loki.${domain.name}`
    };
  } catch (error) {
    addComponentLog(`Error installing monitoring stack: ${error.message}`);
    return { success: false, error: error.message };
  }
}

/**
 * Check if the monitoring stack is already installed
 * @param {object} params - Parameters for the check
 * @returns {Promise<object>} - Result of the check with URLs and status
 */
export async function isMonitoringStackInstalled({
  addComponentLog,
  domain
}) {
  try {
    addComponentLog('Checking if monitoring stack is already installed...');

    // Check if Prometheus is already installed
    const prometheusListResult = await window.api.executeCommand('helm', [
      'list',
      '--namespace',
      'monitoring',
      '--filter',
      'prometheus',
      '--output',
      'json'
    ]);

    let prometheusInstalled = false;
    if (prometheusListResult.stdout && prometheusListResult.stdout.trim() !== '[]') {
      const releases = JSON.parse(prometheusListResult.stdout);
      const prometheusReleases = releases.filter(release => 
        release.name === 'prometheus' && release.status === 'deployed'
      );
      
      if (prometheusReleases.length > 0) {
        prometheusInstalled = true;
      }
    }

    // Check if Loki is already installed
    const lokiInstalled = await isLokiInstalled(addComponentLog);

    // Check if Grafana is already installed
    const grafanaInstalled = await isGrafanaInstalled(addComponentLog);

    // Check if Promtail is already installed
    const promtailCheckResult = await window.api.executeCommand('kubectl', [
      'get',
      'daemonset',
      'promtail',
      '--namespace',
      'monitoring',
      '--no-headers',
      '--ignore-not-found'
    ]);

    const promtailInstalled = promtailCheckResult.stdout.trim() !== '';

    const allInstalled = prometheusInstalled && lokiInstalled && grafanaInstalled && promtailInstalled;

    if (allInstalled) {
      addComponentLog('Monitoring stack is already installed.');
    } else {
      addComponentLog('Monitoring stack is not fully installed.');
      if (prometheusInstalled) addComponentLog('- Prometheus is installed.');
      if (lokiInstalled) addComponentLog('- Loki is installed.');
      if (grafanaInstalled) addComponentLog('- Grafana is installed.');
      if (promtailInstalled) addComponentLog('- Promtail is installed.');
    }

    return {
      success: true,
      isInstalled: allInstalled,
      components: {
        prometheus: prometheusInstalled,
        loki: lokiInstalled,
        grafana: grafanaInstalled,
        promtail: promtailInstalled
      },
      urls: allInstalled ? {
        grafana: `https://grafana.${domain.name}`,
        loki: `https://loki.${domain.name}`
      } : null
    };
  } catch (error) {
    addComponentLog(`Error checking monitoring stack installation: ${error.message}`);
    return { success: false, error: error.message };
  }
} 