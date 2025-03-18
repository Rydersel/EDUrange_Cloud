// Helper function to check if a URL is accessible
const checkUrlAccessible = async (url, maxRetries = 5, retryDelay = 3000) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, {
        method: 'HEAD',
        headers: {
          'Cache-Control': 'no-cache'
        },
        mode: 'no-cors' // This is needed for cross-origin requests
      });

      // If we get any response other than 503, consider it accessible
      if (response.status !== 503) {
        return { success: true, status: response.status };
      }

      // If we're not at the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    } catch (error) {
      // Network errors or CORS issues will end up here
      // If we're not at the last attempt, wait before retrying
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, retryDelay));
      }
    }
  }

  return { success: false };
};

export const checkDashboardStatus = async ({
  componentLog
}) => {
  try {
    componentLog('Checking dashboard status...');

    // Check if dashboard deployment exists
    const deploymentExists = await window.api.executeCommand('kubectl', [
      'get',
      'deployment',
      'dashboard',
      '--ignore-not-found'
    ]);

    if (!deploymentExists.stdout.includes('dashboard')) {
      componentLog('Dashboard deployment not found.');
      return 'not-started';
    }

    // Check if dashboard pods are running
    const podsRunning = await window.api.executeCommand('kubectl', [
      'get',
      'pods',
      '-l',
      'app=dashboard',
      '-o',
      'jsonpath={.items[0].status.phase}'
    ]);

    if (podsRunning.code !== 0 || podsRunning.stdout !== 'Running') {
      componentLog('Dashboard pods are not running.');
      return 'error';
    }

    // Check if dashboard service exists
    const serviceExists = await window.api.executeCommand('kubectl', [
      'get',
      'service',
      'dashboard',
      '--ignore-not-found'
    ]);

    if (!serviceExists.stdout.includes('dashboard')) {
      componentLog('Dashboard service not found.');
      return 'error';
    }

    // Check if dashboard ingress exists
    const ingressExists = await window.api.executeCommand('kubectl', [
      'get',
      'ingress',
      'dashboard-ingress',
      '--ignore-not-found'
    ]);

    if (!ingressExists.stdout.includes('dashboard-ingress')) {
      componentLog('Dashboard ingress not found.');
      return 'error';
    }

    // Get the domain name from the store
    const domain = window.api.getDomain ? await window.api.getDomain() : null;

    if (domain && domain.name) {
      // Check if the dashboard URL is accessible
      componentLog('Checking if dashboard URL is accessible...');
      const dashboardUrl = `https://dashboard.${domain.name}`;

      try {
        const urlCheck = await checkUrlAccessible(dashboardUrl);

        if (!urlCheck.success) {
          componentLog('Dashboard URL is not accessible yet (may be returning 503). The installation is still in progress.');
          return 'installing';
        }

        componentLog(`Dashboard URL is accessible with status: ${urlCheck.status}`);
      } catch (error) {
        componentLog(`Error checking dashboard URL: ${error.message}`);
        // Continue even if URL check fails, as this might be due to CORS or network issues
      }
    }

    componentLog('Dashboard is installed and running.');
    return 'installed';
  } catch (error) {
    console.error('Error checking dashboard status:', error);
    componentLog(`Error checking dashboard status: ${error.message}`);
    return 'error';
  }
};
