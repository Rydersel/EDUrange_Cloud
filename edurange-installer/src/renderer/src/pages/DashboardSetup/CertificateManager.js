export const checkAndUpdateWildcardCertificate = async ({
  componentLog,
  domain
}) => {
  try {
    componentLog('Checking wildcard certificate...');

    // Get kubectl path
    let kubectlPath = 'kubectl'; // Default to just the command name
    try {
      const kubectlCheck = await window.api.checkCommand('kubectl');
      if (kubectlCheck.exists) {
        kubectlPath = kubectlCheck.path;
        componentLog(`Using kubectl at: ${kubectlPath}`);
      }
    } catch (error) {
      componentLog(`Warning: Could not verify kubectl path: ${error.message}`);
    }

    // Import the safeExecuteCommand function
    const safeExecuteCommand = async (command, args, errorMessage) => {
      componentLog(`Executing: ${command} ${args.join(' ')}`);
      try {
        // If the command is kubectl, use the stored path
        const actualCommand = command === 'kubectl' ? kubectlPath : command;
        
        const result = await window.api.executeCommand(actualCommand, args);
        if (result.code !== 0) {
          throw new Error(`${errorMessage}: ${result.stderr}`);
        }
        return result;
      } catch (error) {
        componentLog(`Command execution error: ${error.message}`);
        throw error;
      }
    };

    // Check if wildcard certificate exists
    const certResult = await safeExecuteCommand('kubectl', [
      'get',
      'certificate',
      'wildcard-certificate-prod',
      '-n',
      'default',
      '--ignore-not-found'
    ], 'Failed to check if wildcard certificate exists');

    if (!certResult.stdout.includes('wildcard-certificate-prod')) {
      throw new Error('Wildcard certificate not found. Please complete the Certificate Setup step first.');
    }

    // Check if the certificate is for the correct domain
    const certDomainResult = await safeExecuteCommand('kubectl', [
      'get',
      'certificate',
      'wildcard-certificate-prod',
      '-n',
      'default',
      '-o',
      'jsonpath={.spec.dnsNames}'
    ], 'Failed to get certificate domain information');

    const dnsNames = certDomainResult.stdout;
    const wildcardDomain = `*.${domain.name}`;
    const rootDomain = domain.name;

    if (!dnsNames.includes(wildcardDomain) || !dnsNames.includes(rootDomain)) {
      componentLog(`Certificate domain mismatch. Updating certificate for domain: ${domain.name}`);

      // Delete the existing certificate
      try {
        await safeExecuteCommand('kubectl', [
          'delete',
          'certificate',
          'wildcard-certificate-prod',
          '-n',
          'default'
        ], 'Failed to delete existing certificate');
      } catch (error) {
        componentLog(`Warning: Failed to delete existing certificate: ${error.message}`);
        // Continue anyway, as we'll try to recreate it
      }

      // Create a new certificate with the correct domain
      const certificateYaml = `
apiVersion: cert-manager.io/v1
kind: Certificate
metadata:
  name: wildcard-certificate-prod
  namespace: default
spec:
  secretName: wildcard-domain-certificate-prod
  issuerRef:
    name: cert-clusterissuer
    kind: ClusterIssuer
  dnsNames:
  - '*.${domain.name}'
  - '${domain.name}'
`;

      try {
        const createResult = await window.api.applyManifestFromString(certificateYaml);
        if (createResult.code !== 0) {
          throw new Error(`Failed to create updated certificate: ${createResult.stderr}`);
        }
      } catch (error) {
        componentLog(`Error creating updated certificate: ${error.message}`);
        throw error;
      }

      componentLog('Certificate updated successfully. Waiting for it to be issued...');

      // Wait for the certificate to be ready (up to 5 minutes)
      let isReady = false;
      let attempts = 0;
      const maxAttempts = 30; // 5 minutes with 10-second intervals

      while (!isReady && attempts < maxAttempts) {
        try {
          const readyResult = await safeExecuteCommand('kubectl', [
            'get',
            'certificate',
            'wildcard-certificate-prod',
            '-n',
            'default',
            '-o',
            'jsonpath={.status.conditions[?(@.type=="Ready")].status}'
          ], 'Failed to check certificate ready status');

          if (readyResult.stdout === 'True') {
            isReady = true;
            componentLog('Certificate is ready.');
          } else {
            attempts++;
            componentLog(`Waiting for certificate to be ready... (${attempts}/${maxAttempts})`);
            await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
          }
        } catch (error) {
          attempts++;
          componentLog(`Error checking certificate status (attempt ${attempts}/${maxAttempts}): ${error.message}`);
          await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
        }
      }

      if (!isReady) {
        componentLog('Warning: Certificate may not be fully ready yet. Proceeding anyway...');
      }
    } else {
      componentLog('Wildcard certificate is valid for the current domain.');
    }
  } catch (error) {
    console.error('Error checking/updating wildcard certificate:', error);
    componentLog(`Error checking/updating wildcard certificate: ${error.message}`);
    throw error;
  }
}; 