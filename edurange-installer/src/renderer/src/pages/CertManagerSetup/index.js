import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import StatusBadge from '../../components/StatusBadge';
import useInstallStore from '../../store/installStore';

const CertManagerSetup = () => {
  const [isInstalling, setIsInstalling] = useState(false);
  const [isCheckingDns, setIsCheckingDns] = useState(false);
  const [logs, setLogs] = useState([]);
  const [dnsStatus, setDnsStatus] = useState('pending');
  const [verificationStatus, setVerificationStatus] = useState('pending');
  const [externalIp, setExternalIp] = useState('');
  const [dnsCheckAttempts, setDnsCheckAttempts] = useState(0);
  const [forceCancelling, setForceCancelling] = useState(false);
  const { setInstallationStatus, installationStatus, domain, addLog, markStepCompleted, removeStepCompleted } = useInstallStore();

  useEffect(() => {
    // Get the external IP of the ingress controller
    const getExternalIp = async () => {
      try {
        const ipResult = await window.api.getExternalIP('ingress-nginx-controller', 'ingress-nginx');
        if (ipResult.code === 0) {
          setExternalIp(ipResult.stdout.trim());
        }
      } catch (error) {
        console.error('Error getting external IP:', error);
      }
    };

    getExternalIp();
  }, []);

  const checkDnsPropagation = async () => {
    if (isCheckingDns) {
      return; // Prevent multiple simultaneous checks
    }

    if (!externalIp) {
      setDnsStatus('error');
      addLog('Cannot check DNS propagation: External IP not available.');
      setLogs(prev => [...prev, 'Cannot check DNS propagation: External IP not available.']);
      return;
    }

    if (!domain.name) {
      setDnsStatus('error');
      addLog('Cannot check DNS propagation: Domain name not set.');
      setLogs(prev => [...prev, 'Cannot check DNS propagation: Domain name not set.']);
      return;
    }

    setIsCheckingDns(true);
    setDnsCheckAttempts(prev => prev + 1);

    try {
      addLog('Checking DNS propagation...');
      setLogs(prev => [...prev, 'Checking DNS propagation...']);

      // Log the domain being checked in the UI logs only, not console
      setLogs(prev => [...prev, `Checking DNS for domain: ${domain.name}`]);

      // Add a small delay between checks to prevent overwhelming the DNS servers
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Check if dig command is available
      const digCheckResult = await window.api.checkCommand('dig');
      if (digCheckResult) {
        setLogs(prev => [...prev, 'Executing dig command for root domain...']);

        // Check root domain
        const rootDomainResult = await window.api.executeCommand('dig', [
          '+short',
          domain.name
        ]);

        setLogs(prev => [...prev, `Dig command executed for root domain. Exit code: ${rootDomainResult.code}`]);
        setLogs(prev => [...prev, `Stdout: ${rootDomainResult.stdout}`]);
        if (rootDomainResult.stderr) {
          setLogs(prev => [...prev, `Stderr: ${rootDomainResult.stderr}`]);
        }

        setLogs(prev => [...prev, 'Executing dig command for wildcard domain...']);

        // Check wildcard domain (using dashboard subdomain as an example)
        const wildcardDomainResult = await window.api.executeCommand('dig', [
          '+short',
          `${domain.dashboardSubdomain}.${domain.name}`
        ]);

        setLogs(prev => [...prev, `Dig command executed for wildcard domain. Exit code: ${wildcardDomainResult.code}`]);
        setLogs(prev => [...prev, `Stdout: ${wildcardDomainResult.stdout}`]);
        if (wildcardDomainResult.stderr) {
          setLogs(prev => [...prev, `Stderr: ${wildcardDomainResult.stderr}`]);
        }

        const rootDomainIp = rootDomainResult.stdout.trim();
        const wildcardDomainIp = wildcardDomainResult.stdout.trim();

        setLogs(prev => [
          ...prev,
          `Root domain (${domain.name}) resolves to: ${rootDomainIp || 'Not resolved yet'}`,
          `Wildcard domain (${domain.dashboardSubdomain}.${domain.name}) resolves to: ${wildcardDomainIp || 'Not resolved yet'}`,
          `Expected IP: ${externalIp}`
        ]);

        if (rootDomainIp && rootDomainIp.includes(externalIp) &&
            wildcardDomainIp && wildcardDomainIp.includes(externalIp)) {
          setDnsStatus('success');
          addLog('DNS records have propagated successfully!');
          setLogs(prev => [...prev, 'DNS records have propagated successfully!']);
        } else {
          if (dnsCheckAttempts >= 10) {
            setDnsStatus('warning');
            addLog('DNS propagation is taking longer than expected. You can continue, but certificate issuance might fail.');
            setLogs(prev => [...prev, 'DNS propagation is taking longer than expected. You can continue, but certificate issuance might fail.']);
          } else {
            setDnsStatus('pending');
            addLog('DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.');
            setLogs(prev => [...prev, 'DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.']);
          }
        }
      } else {
        // Fallback method for DNS check using nslookup
        const nslookupResult = await checkDnsWithNslookup();
        if (nslookupResult) {
          setDnsStatus('success');
          addLog('DNS records have propagated successfully!');
          setLogs(prev => [...prev, 'DNS records have propagated successfully!']);
        } else {
          setDnsStatus('pending');
          addLog('DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.');
          setLogs(prev => [...prev, 'DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.']);
        }
      }
    } catch (error) {
      console.error('Error checking DNS propagation:', error);
      setDnsStatus('error');
      addLog(`Error checking DNS propagation: ${error.message}`);
      setLogs(prev => [...prev, `Error checking DNS propagation: ${error.message}`]);
    } finally {
      setIsCheckingDns(false);
    }
  };

  // Auto-check DNS propagation every 30 seconds
  useEffect(() => {
    let interval;

    // Only start the interval if we have the necessary data, we're not already checking, and DNS hasn't propagated
    if (externalIp && domain.name && !isCheckingDns && dnsStatus !== 'success') {
      // Run the check immediately once when the component mounts
      checkDnsPropagation();

      // Then set up the interval
      interval = setInterval(() => {
        // Only run the check if we're not already checking and DNS hasn't propagated yet
        if (!isCheckingDns && dnsStatus !== 'success') {
          checkDnsPropagation();
        } else if (dnsStatus === 'success') {
          // If DNS has propagated, clear the interval
          clearInterval(interval);
        }
      }, 10000); // Check every 10 seconds
    }

    return () => {
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [externalIp, domain.name, dnsStatus, isCheckingDns]);

  // Fallback method for DNS check using nslookup
  const checkDnsWithNslookup = async () => {
    try {
      setLogs(prev => [...prev, 'Trying fallback method with nslookup...']);

      // Check root domain
      const rootDomainResult = await window.api.executeCommand('nslookup', [
        domain.name
      ]);

      setLogs(prev => [...prev, `Nslookup command executed for root domain. Exit code: ${rootDomainResult.code}`]);
      setLogs(prev => [...prev, `Stdout: ${rootDomainResult.stdout}`]);
      if (rootDomainResult.stderr) {
        setLogs(prev => [...prev, `Stderr: ${rootDomainResult.stderr}`]);
      }

      // Check wildcard domain
      const wildcardDomainResult = await window.api.executeCommand('nslookup', [
        `${domain.dashboardSubdomain}.${domain.name}`
      ]);

      setLogs(prev => [...prev, `Nslookup command executed for wildcard domain. Exit code: ${wildcardDomainResult.code}`]);
      setLogs(prev => [...prev, `Stdout: ${wildcardDomainResult.stdout}`]);
      if (wildcardDomainResult.stderr) {
        setLogs(prev => [...prev, `Stderr: ${wildcardDomainResult.stderr}`]);
      }

      // Parse nslookup output to find IP addresses
      const parseNslookupOutput = (output) => {
        const lines = output.split('\n');
        for (const line of lines) {
          if (line.includes('Address:')) {
            const ip = line.split('Address:')[1].trim();
            if (ip && !ip.includes('53')) { // Filter out DNS server addresses
              return ip;
            }
          }
        }
        return '';
      };

      const rootDomainIp = parseNslookupOutput(rootDomainResult.stdout);
      const wildcardDomainIp = parseNslookupOutput(wildcardDomainResult.stdout);

      setLogs(prev => [
        ...prev,
        `Root domain (${domain.name}) resolves to: ${rootDomainIp || 'Not resolved yet'}`,
        `Wildcard domain (${domain.dashboardSubdomain}.${domain.name}) resolves to: ${wildcardDomainIp || 'Not resolved yet'}`,
        `Expected IP: ${externalIp}`
      ]);

      if (rootDomainIp && rootDomainIp.includes(externalIp) &&
          wildcardDomainIp && wildcardDomainIp.includes(externalIp)) {
        setDnsStatus('success');
        addLog('DNS records have propagated successfully!');
        setLogs(prev => [...prev, 'DNS records have propagated successfully!']);
        return true;
      } else {
        if (dnsCheckAttempts >= 10) {
          setDnsStatus('warning');
          addLog('DNS propagation is taking longer than expected. You can continue, but certificate issuance might fail.');
          setLogs(prev => [...prev, 'DNS propagation is taking longer than expected. You can continue, but certificate issuance might fail.']);
        } else {
          setDnsStatus('pending');
          addLog('DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.');
          setLogs(prev => [...prev, 'DNS records have not fully propagated yet. This can take up to 24-48 hours, but usually completes within minutes.']);
        }
        return false;
      }
    } catch (error) {
      console.error('Error checking DNS with nslookup:', error);
      setLogs(prev => [...prev, `Error checking DNS with nslookup: ${error.message}`]);
      return false;
    }
  };

  const installCertManager = async () => {
    setIsInstalling(true);
    setInstallationStatus('certManager', 'installing');
    addLog('Starting cert-manager installation...');
    try {
      // Check if Helm is installed
      addLog('Checking for Helm...');
      setLogs(prev => [...prev, 'Checking for Helm...']);
      const helmResult = await window.api.executeCommand('helm', ['version']);

      if (helmResult.code !== 0) {
        addLog('Helm not found. Please install Helm before continuing.');
        setLogs(prev => [...prev, 'Helm not found. Please install Helm before continuing.']);
        throw new Error('Helm not found. Please install Helm before continuing.');
      }

      addLog('Helm found, proceeding with installation.');
      setLogs(prev => [...prev, 'Helm found, proceeding with installation.']);

      // Step 1: Add Jetstack Helm repository
      addLog('Adding Jetstack Helm repository...');
      setLogs(prev => [...prev, 'Adding Jetstack Helm repository...']);

      const addRepoResult = await window.api.executeCommand('helm', [
        'repo',
        'add',
        'jetstack',
        'https://charts.jetstack.io'
      ]);

      if (addRepoResult.code !== 0) {
        addLog(`Warning: Failed to add Jetstack repository: ${addRepoResult.stderr}`);
        setLogs(prev => [...prev, `Warning: Failed to add Jetstack repository: ${addRepoResult.stderr}`]);
      }

      // Step 2: Update Helm repositories
      addLog('Updating Helm repositories...');
      setLogs(prev => [...prev, 'Updating Helm repositories...']);

      const updateRepoResult = await window.api.executeCommand('helm', ['repo', 'update']);

      if (updateRepoResult.code !== 0) {
        addLog(`Warning: Failed to update repositories: ${updateRepoResult.stderr}`);
        setLogs(prev => [...prev, `Warning: Failed to update repositories: ${updateRepoResult.stderr}`]);
      }

      // Step 3: Install cert-manager using Helm
      addLog('Installing cert-manager via Helm...');
      setLogs(prev => [...prev, 'Installing cert-manager via Helm...']);

      const installResult = await window.api.executeCommand('helm', [
        'upgrade',
        '--install',
        'cert-manager',
        'jetstack/cert-manager',
        '--namespace',
        'cert-manager',
        '--create-namespace',
        '--version',
        'v1.13.1',
        '--set',
        'installCRDs=true'
      ]);

      if (installResult.code !== 0) {
        throw new Error(`Failed to install cert-manager: ${installResult.stderr}`);
      }

      addLog('cert-manager installed successfully via Helm.');
      setLogs(prev => [...prev, 'cert-manager installed successfully via Helm.']);

      // Step 4: Wait for cert-manager pods to be ready
      addLog('Waiting for cert-manager pods to be ready...');
      setLogs(prev => [...prev, 'Waiting for cert-manager pods to be ready...']);

      const waitResult = await window.api.waitForPod('app.kubernetes.io/instance=cert-manager', 'cert-manager', 120);

      if (waitResult.code !== 0) {
        throw new Error(`Timed out waiting for cert-manager pods: ${waitResult.stderr}`);
      }

      addLog('cert-manager pods are ready.');
      setLogs(prev => [...prev, 'cert-manager pods are ready.']);

      // Step 5: Create Cloudflare API Token Secret
      addLog('Creating Cloudflare API token secret...');
      setLogs(prev => [...prev, 'Creating Cloudflare API token secret...']);

      const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-key-secret
  namespace: cert-manager
type: Opaque
stringData:
  api-key: "${domain.cloudflareApiKey}"
`;

      const secretResult = await window.api.applyManifestFromString(secretYaml);

      if (secretResult.code !== 0) {
        throw new Error(`Failed to create Cloudflare API token secret: ${secretResult.stderr}`);
      }

      addLog('Cloudflare API token secret created successfully.');
      setLogs(prev => [...prev, 'Cloudflare API token secret created successfully.']);

      // Step 6: Create ClusterIssuer
      addLog('Creating ClusterIssuer...');
      setLogs(prev => [...prev, 'Creating ClusterIssuer...']);

      const clusterIssuerYaml = `
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: cert-clusterissuer
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: ${domain.cloudflareEmail}
    privateKeySecretRef:
      name: letsencrypt-dns01-private-key
    solvers:
    - dns01:
        cloudflare:
          email: ${domain.cloudflareEmail}
          apiTokenSecretRef:
            name: cloudflare-api-key-secret
            key: api-key
`;

      const clusterIssuerResult = await window.api.applyManifestFromString(clusterIssuerYaml);

      if (clusterIssuerResult.code !== 0) {
        throw new Error(`Failed to create ClusterIssuer: ${clusterIssuerResult.stderr}`);
      }

      addLog('ClusterIssuer created successfully.');
      setLogs(prev => [...prev, 'ClusterIssuer created successfully.']);

      // Step 7: Create Certificate
      addLog('Creating wildcard certificate...');
      setLogs(prev => [...prev, 'Creating wildcard certificate...']);

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

      const certificateResult = await window.api.applyManifestFromString(certificateYaml);

      if (certificateResult.code !== 0) {
        throw new Error(`Failed to create certificate: ${certificateResult.stderr}`);
      }

      addLog('Wildcard certificate created successfully.');
      setLogs(prev => [...prev, 'Wildcard certificate created successfully.']);

      // Set success status
      setVerificationStatus('installed');
      setInstallationStatus('certManager', 'installed');

      // Save the step state
      await window.api.executeStep('cert-manager-setup');

      // Mark step as completed
      markStepCompleted('cert-manager-setup');

    } catch (error) {
      console.error('Error during cert-manager installation:', error);
      addLog(`Error during cert-manager installation: ${error.message}`);
      setLogs(prev => [...prev, `Error during cert-manager installation: ${error.message}`]);
      setInstallationStatus('certManager', 'error');
    } finally {
      setIsInstalling(false);
    }
  };

  const uninstallCertManager = async () => {
    if (window.confirm('Are you sure you want to uninstall cert-manager? This will remove all certificates and issuers.')) {
      setIsInstalling(true);
      setInstallationStatus('certManager', 'deleting');
      addLog('Uninstalling cert-manager...');

      try {
        // Step 1: Delete the certificate first
        addLog('Deleting certificate...');
        await window.api.executeCommand('kubectl', [
          'delete', 'certificate', 'wildcard-certificate-prod', '--ignore-not-found'
        ]);

        // Step 2: Delete the ClusterIssuer
        addLog('Deleting ClusterIssuer...');
        await window.api.executeCommand('kubectl', [
          'delete', 'clusterissuer', 'cert-clusterissuer', '--ignore-not-found'
        ]);

        // Step 3: Delete the Cloudflare API token secret
        addLog('Deleting Cloudflare API token secret...');
        await window.api.executeCommand('kubectl', [
          'delete', 'secret', 'cloudflare-api-token-secret', '--ignore-not-found'
        ]);

        // Step 4: Delete cert-manager namespace which will remove all cert-manager resources
        addLog('Deleting cert-manager namespace...');
        await window.api.executeCommand('kubectl', [
          'delete', 'namespace', 'cert-manager', '--ignore-not-found'
        ]);

        // Step 5: Delete Helm release
        addLog('Deleting cert-manager Helm release...');
        await window.api.executeCommand('helm', [
          'uninstall', 'cert-manager', '--namespace', 'cert-manager', '--ignore-not-found'
        ]);

        // Wait for resources to be fully deleted
        addLog('Waiting for resources to be fully deleted...');
        await new Promise(resolve => setTimeout(resolve, 5000));

        setInstallationStatus('certManager', 'not-started');
        addLog('cert-manager uninstallation completed successfully.');
        
        // Remove the step from completedSteps
        removeStepCompleted('cert-manager-setup');
      } catch (error) {
        console.error('Error during cert-manager uninstallation:', error);
        addLog(`Error during cert-manager uninstallation: ${error.message}`);
        setInstallationStatus('certManager', 'error');
      } finally {
        setIsInstalling(false);
      }
    }
  };

  const forceCancelInstallation = async () => {
    if (window.confirm('Are you sure you want to force cancel the cert-manager installation? This will attempt to clean up any resources created so far.')) {
      setForceCancelling(true);
      setInstallationStatus('certManager', 'deleting');
      addLog('Force cancelling cert-manager installation...');

      try {
        // Clean up cert-manager resources
        addLog('Cleaning up cert-manager resources...');

        // Delete the certificate first
        addLog('Deleting certificate...');
        await window.api.executeCommand('kubectl', [
          'delete', 'certificate', 'wildcard-certificate-prod', '--ignore-not-found'
        ]);

        // Delete the ClusterIssuer
        addLog('Deleting ClusterIssuer...');
        await window.api.executeCommand('kubectl', [
          'delete', 'clusterissuer', 'cert-clusterissuer', '--ignore-not-found'
        ]);

        // Delete the Cloudflare API token secret
        addLog('Deleting Cloudflare API token secret...');
        await window.api.executeCommand('kubectl', [
          'delete', 'secret', 'cloudflare-api-token-secret', '--ignore-not-found'
        ]);

        // Delete cert-manager namespace which will remove all cert-manager resources
        addLog('Deleting cert-manager namespace...');
        await window.api.executeCommand('kubectl', [
          'delete', 'namespace', 'cert-manager', '--ignore-not-found'
        ]);

        // Delete Helm release
        addLog('Deleting cert-manager Helm release...');
        await window.api.executeCommand('helm', [
          'uninstall', 'cert-manager', '--namespace', 'cert-manager', '--ignore-not-found'
        ]);

        setInstallationStatus('certManager', 'not-started');
        addLog('cert-manager installation force cancelled and resources cleaned up.');

        // Clear logs
        setLogs([]);
      } catch (error) {
        console.error('Error during force cancellation of cert-manager:', error);
        addLog(`Error during force cancellation: ${error.message}`);
      } finally {
        setForceCancelling(false);
        setIsInstalling(false);
      }
    }
  };

  // Check if cert-manager is already installed when the component mounts
  useEffect(() => {
    const checkCertManager = async () => {
      try {
        // Check if cert-manager namespace exists
        const namespaceResult = await window.api.executeCommand('kubectl', [
          'get',
          'namespace',
          'cert-manager',
          '--ignore-not-found'
        ]);

        if (namespaceResult.code === 0 && namespaceResult.stdout.includes('cert-manager')) {
          // Check if cert-manager pods are installing
          const podsResult = await window.api.executeCommand('kubectl', [
            'get',
            'pods',
            '-n',
            'cert-manager',
            '-l',
            'app.kubernetes.io/instance=cert-manager'
          ]);

          if (podsResult.code === 0 && podsResult.stdout.includes('Running')) {
            // Check if ClusterIssuer exists - first try the new name
            const issuerResult = await window.api.executeCommand('kubectl', [
              'get',
              'clusterissuer',
              'cert-clusterissuer',
              '--ignore-not-found'
            ]);

            let issuerExists = issuerResult.code === 0 && issuerResult.stdout.includes('cert-clusterissuer');

            // If not found, try the legacy name
            if (!issuerExists) {
              const legacyIssuerResult = await window.api.executeCommand('kubectl', [
                'get',
                'clusterissuer',
                'cert-clusterissuer',
                '--ignore-not-found'
              ]);

              issuerExists = legacyIssuerResult.code === 0 && legacyIssuerResult.stdout.includes('cert-clusterissuer');
            }

            if (issuerExists) {
              // Check if wildcard certificate exists
              const certResult = await window.api.executeCommand('kubectl', [
                'get',
                'certificate',
                'wildcard-certificate-prod',
                '-n',
                'default',
                '--ignore-not-found'
              ]);

              if (certResult.code === 0 && certResult.stdout.includes('wildcard-certificate-prod')) {
                // All components are installed
                setVerificationStatus('installed');
                setInstallationStatus('certManager', 'installed');
                addLog('cert-manager is already installed and configured.');

                // Save the step state
                await window.api.executeStep('cert-manager-setup');

                // Mark step as completed
                markStepCompleted('cert-manager-setup');
                return; // Exit early since we've found everything is installed
              }
            }
          }
        }
        
        // If we get here, cert-manager is not fully installed or configured
        // Make sure it's not marked as completed
        removeStepCompleted('cert-manager-setup');
        if (installationStatus.certManager === 'installed') {
          setInstallationStatus('certManager', 'not-started');
        }
      } catch (error) {
        console.error('Error checking cert-manager installation:', error);
      }
    };

    checkCertManager();
  }, [addLog, markStepCompleted, setInstallationStatus, removeStepCompleted, installationStatus.certManager]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Certificate Manager Setup</h1>
        <p className="mt-2 text-gray-600">
          Install and configure cert-manager with Cloudflare DNS validation for SSL certificates.
        </p>
      </div>

      <Card title="Cloudflare API Token Setup">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Before proceeding, you need to create a Cloudflare API token with the correct permissions.
            This token will be used by cert-manager to create and modify DNS records for certificate validation.
          </p>

          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700 font-medium">
                  How to create a Cloudflare API token:
                </p>
                <ol className="list-decimal list-inside text-sm text-blue-700 mt-1 space-y-2">
                  <li>Log in to your Cloudflare account</li>
                  <li>Go to "My Profile" &gt; "API Tokens"</li>
                  <li>Click "Create Token"</li>
                  <li>Select the <strong>"Edit zone DNS"</strong> template</li>
                  <li>Under "Zone Resources", select:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Include &gt; Specific zone &gt; Your domain ({domain.name})</li>
                    </ul>
                  </li>
                  <li>Click "Continue to summary" and then "Create Token"</li>
                  <li>Copy the generated token and paste it in the Cloudflare API Key field below</li>
                </ol>
                <p className="text-sm text-blue-700 mt-2">
                  <strong>Important:</strong> The "Edit zone DNS" template is required because cert-manager needs to create temporary TXT records
                  in your DNS to validate domain ownership when issuing wildcard certificates.
                </p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card title="DNS Configuration">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Before proceeding, you need to configure your DNS records in Cloudflare to point to the external IP of the ingress controller.
          </p>

          {externalIp ? (
            <div className="bg-green-50 border-l-4 border-green-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    External IP of the ingress controller: <span className="font-mono font-bold">{externalIp}</span>
                  </p>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    Could not retrieve the external IP of the ingress controller. Please make sure the ingress controller is installed and running.
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="bg-blue-50 border-l-4 border-blue-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2h-1V9a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-blue-700">
                  Please create the following DNS records in your Cloudflare account for domain <strong>{domain.name || 'your domain'}</strong>:
                </p>
                <ul className="list-disc list-inside text-sm text-blue-700 mt-1">
                  <li>Type: <strong>A</strong>, Name: <strong>@</strong>, Content: <strong>{externalIp || 'EXTERNAL_IP'}</strong></li>
                  <li>Type: <strong>A</strong>, Name: <strong>*</strong>, Content: <strong>{externalIp || 'EXTERNAL_IP'}</strong></li>
                </ul>
                <p className="text-sm text-blue-700 mt-2">
                  Make sure to set the proxy status to <strong>DNS only</strong> (gray cloud) for both records.
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 mr-2">DNS Propagation Status:</span>
              <StatusBadge status={
                dnsStatus === 'success' ? 'installed' :
                dnsStatus === 'error' ? 'error' :
                dnsStatus === 'warning' ? 'warning' :
                'pending'
              } text={
                dnsStatus === 'success' ? 'Propagated' :
                dnsStatus === 'error' ? 'Error' :
                dnsStatus === 'warning' ? 'Partial/Slow' :
                'Checking...'
              } />
            </div>

            <Button
              onClick={checkDnsPropagation}
              isLoading={isCheckingDns}
              disabled={isCheckingDns || (!externalIp && !domain.name)}
              variant="outline"
            >
              Check DNS Propagation
            </Button>
          </div>

          {dnsStatus === 'pending' && (
            <div className="flex items-center justify-center p-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
              <span className="ml-2 text-sm text-gray-500">Waiting for DNS propagation... This may take a few minutes to several hours.</span>
            </div>
          )}

          {dnsStatus === 'warning' && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    DNS propagation is taking longer than expected. You can continue with the installation, but certificate issuance might fail if the DNS records haven't fully propagated.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      <Card title="cert-manager">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            cert-manager is a Kubernetes add-on that automates the management and issuance of TLS certificates.
            It will be configured to use Cloudflare DNS validation to issue wildcard certificates for your domain.
          </p>

          <div className="flex items-center justify-between">
            <div className="flex items-center">
              <span className="font-medium text-gray-900 mr-2">Status:</span>
              <StatusBadge status={installationStatus.certManager} />
            </div>

            <div className="space-x-4">
              {installationStatus.certManager === 'installed' ? (
                <Button
                  onClick={uninstallCertManager}
                  isLoading={isInstalling && !forceCancelling}
                  disabled={isInstalling || installationStatus.certManager === 'installing' || installationStatus.certManager === 'deleting'}
                  variant="danger"
                >
                  Uninstall
                </Button>
              ) : installationStatus.certManager === 'error' ? (
                <Button
                  onClick={installCertManager}
                  isLoading={isInstalling && !forceCancelling}
                  disabled={isInstalling || !domain.name || !domain.cloudflareApiKey || !domain.cloudflareEmail || dnsStatus !== 'success' || installationStatus.certManager === 'installing' || installationStatus.certManager === 'deleting'}
                >
                  Retry Installation
                </Button>
              ) : (
                <Button
                  onClick={installCertManager}
                  isLoading={isInstalling && !forceCancelling}
                  disabled={isInstalling || !domain.name || !domain.cloudflareApiKey || !domain.cloudflareEmail || dnsStatus !== 'success' || installationStatus.certManager === 'installing' || installationStatus.certManager === 'deleting'}
                >
                  Install
                </Button>
              )}

              {isInstalling && (
                <Button
                  onClick={forceCancelInstallation}
                  variant="danger"
                  isLoading={forceCancelling}
                  disabled={forceCancelling}
                >
                  Force Cancel
                </Button>
              )}
            </div>
          </div>

          {logs.length > 0 && (
            <div className="mt-4">
              <h3 className="text-sm font-medium text-gray-900">Installation Logs</h3>
              <div className="mt-2 bg-gray-800 text-gray-200 p-4 rounded-md overflow-auto max-h-64 font-mono text-sm">
                {logs.map((log, index) => (
                  <div key={index} className="whitespace-pre-wrap">
                    {log}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </Card>

      <div className="flex justify-between">
        <Button to="/ingress-setup" variant="outline">
          Back
        </Button>

        <Button
          to="/database-setup"
          disabled={verificationStatus !== 'installed'}
        >
          Next
        </Button>
      </div>
    </div>
  );
};

export default CertManagerSetup;
