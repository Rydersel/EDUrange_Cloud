import React, { useState, useEffect } from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import TextField from '../../components/TextField';
import { isValidDomain, isValidEmail } from '../../utils/helpers';
import useInstallStore from '../../store/installStore';
import { getCloudflareApiKey } from '../../services/clusterVerificationService';

const DomainSetup = () => {
  const { domain, setDomain, addLog, markStepCompleted } = useInstallStore();
  const [errors, setErrors] = useState({});
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSecret, setIsCheckingSecret] = useState(true);

  // Check for existing Cloudflare API key secret on component mount
  useEffect(() => {
    const checkForExistingSecret = async () => {
      setIsCheckingSecret(true);
      try {
        const { exists, apiKey, email } = await getCloudflareApiKey();
        if (exists && apiKey && email) {
          addLog('Found existing Cloudflare API key secret in the cluster.');
          setDomain('cloudflareApiKey', apiKey);
          setDomain('cloudflareEmail', email);
        }
      } catch (error) {
        console.error('Error checking for existing Cloudflare API key secret:', error);
      } finally {
        setIsCheckingSecret(false);
      }
    };

    checkForExistingSecret();
  }, []);

  // Check form validity whenever domain values change
  useEffect(() => {
    const isValid = validateForm(false);
    if (isValid) {
      markStepCompleted('domain-setup');
    }
  }, [domain]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setDomain(name, value);

    // Clear error when user types
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: null }));
    }
  };

  const validateForm = (showErrors = true) => {
    const newErrors = {};

    if (!domain.name) {
      newErrors.name = 'Domain name is required';
    } else if (!isValidDomain(domain.name)) {
      newErrors.name = 'Please enter a valid domain name (e.g., example.com)';
    }

    if (!domain.cloudflareEmail) {
      newErrors.cloudflareEmail = 'Cloudflare email is required';
    } else if (!isValidEmail(domain.cloudflareEmail)) {
      newErrors.cloudflareEmail = 'Please enter a valid email address';
    }

    if (!domain.cloudflareApiKey) {
      newErrors.cloudflareApiKey = 'Cloudflare API token is required';
    }

    if (!domain.dashboardSubdomain) {
      newErrors.dashboardSubdomain = 'Dashboard subdomain is required';
    }

    if (!domain.instanceManagerSubdomain) {
      // This is now optional since instance-manager is only accessible internally
      // But we still need it for the monitoring service
    }

    if (!domain.databaseSubdomain) {
      // This is now optional since database API is only accessible internally
      // But we still keep it for consistency and potential future use
    }

    if (!domain.monitoringSubdomain) {
      newErrors.monitoringSubdomain = 'Monitoring subdomain is required';
    }

    if (showErrors) {
      setErrors(newErrors);
    }
    return Object.keys(newErrors).length === 0;
  };

  const checkAndDeleteExistingSecret = async () => {
    try {
      setIsLoading(true);
      addLog('Checking for existing Cloudflare API token secret...');

      // Check if cert-manager namespace exists
      const namespaceResult = await window.api.executeCommand('kubectl', [
        'get',
        'namespace',
        'cert-manager',
        '--ignore-not-found'
      ]);

      // Create namespace if it doesn't exist
      if (!namespaceResult.stdout.includes('cert-manager')) {
        await window.api.executeCommand('kubectl', ['create', 'namespace', 'cert-manager']);
      }

      // Check for existing secret
      const secretResult = await window.api.executeCommand('kubectl', [
        'get',
        'secret',
        'cloudflare-api-key-secret',
        '-n',
        'cert-manager',
        '--ignore-not-found'
      ]);

      if (secretResult.stdout.includes('cloudflare-api-key-secret')) {
        addLog('Found existing Cloudflare API token secret. Deleting...');
        await window.api.executeCommand('kubectl', [
          'delete',
          'secret',
          'cloudflare-api-key-secret',
          '-n',
          'cert-manager'
        ]);
        addLog('Existing token secret deleted successfully.');
      }

      // Create new secret
      const secretYaml = `
apiVersion: v1
kind: Secret
metadata:
  name: cloudflare-api-key-secret
  namespace: cert-manager
type: Opaque
stringData:
  api-key: "${domain.cloudflareApiKey}"
  email: "${domain.cloudflareEmail}"
`;

      addLog('Creating new Cloudflare API token secret...');
      const createResult = await window.api.applyManifestFromString(secretYaml);

      if (createResult.code !== 0) {
        throw new Error(`Failed to create token secret: ${createResult.stderr}`);
      }

      addLog('New Cloudflare API token secret created successfully.');
      return true;
    } catch (error) {
      console.error('Error managing Cloudflare token secret:', error);
      addLog(`Error managing Cloudflare token secret: ${error.message}`);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (validateForm()) {
      const success = await checkAndDeleteExistingSecret();
      if (success) {
        // Navigate to next page
        window.location.href = '/ingress-setup';
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Domain Setup</h1>
        <p className="mt-2 text-gray-600">
          Configure your domain and Cloudflare settings for EDURange Cloud.
        </p>
      </div>

      <Card title="Domain Configuration">
        <form onSubmit={handleSubmit} className="space-y-6">
          <TextField
            label="Domain Name"
            id="name"
            name="name"
            value={domain.name || ''}
            onChange={handleChange}
            placeholder="example.com"
            error={errors.name}
            helpText="The root domain you'll use for EDURange Cloud. Must be managed by Cloudflare."
            required
          />

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <TextField
              label="Dashboard Subdomain"
              id="dashboardSubdomain"
              name="dashboardSubdomain"
              value={domain.dashboardSubdomain || ''}
              onChange={handleChange}
              placeholder="dashboard"
              error={errors.dashboardSubdomain}
              helpText="Subdomain for the EDURange Dashboard"
              required
            />

            <TextField
              label="Instance Manager Subdomain"
              id="instanceManagerSubdomain"
              name="instanceManagerSubdomain"
              value={domain.instanceManagerSubdomain || ''}
              onChange={handleChange}
              placeholder="eductf"
              error={errors.instanceManagerSubdomain}
              helpText="Subdomain for CTF challenges (Instance Manager is now only accessible internally)"
            />

            <TextField
              label="Database Subdomain"
              id="databaseSubdomain"
              name="databaseSubdomain"
              value={domain.databaseSubdomain || ''}
              onChange={handleChange}
              placeholder="database"
              error={errors.databaseSubdomain}
              helpText="Subdomain for monitoring service (Database API is now only accessible internally)"
            />

            <TextField
              label="Monitoring Subdomain"
              id="monitoringSubdomain"
              name="monitoringSubdomain"
              value={domain.monitoringSubdomain || ''}
              onChange={handleChange}
              placeholder="monitoring"
              error={errors.monitoringSubdomain}
              helpText="Subdomain for the Monitoring Service"
              required
            />
          </div>
        </form>
      </Card>

      <Card title="Cloudflare Configuration">
        <div className="space-y-6">
          {isCheckingSecret && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-gray-600">Checking for existing Cloudflare API key...</span>
            </div>
          )}

          {!isCheckingSecret && domain.cloudflareApiKey && domain.cloudflareEmail && (
            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4">
              <div className="flex">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-green-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="ml-3">
                  <p className="text-sm text-green-700">
                    Found existing Cloudflare API key in the cluster. The fields have been pre-filled for you.
                  </p>
                </div>
              </div>
            </div>
          )}

          <p className="text-sm text-gray-500">
            EDURange Cloud uses Cloudflare DNS for domain management and certificate issuance.
            You'll need to provide your Cloudflare credentials to set up DNS records and SSL certificates.
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
                  <li>Select the <strong>"Create Custom Token"</strong> option</li>
                  <li>Give your token a name (e.g., "cert-manager")</li>
                  <li>Under "Permissions", add these permissions:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Zone &gt; DNS &gt; Edit</li>
                      <li>Zone &gt; Zone &gt; Read</li>
                    </ul>
                  </li>
                  <li>Under "Zone Resources", select:
                    <ul className="list-disc list-inside ml-4 mt-1">
                      <li>Include &gt; Specific zone &gt; Your domain</li>
                    </ul>
                  </li>
                  <li>Set a TTL (Time to Live) if desired or leave as "No TTL"</li>
                  <li>Click "Continue to summary" and then "Create Token"</li>
                  <li>Copy the generated token and paste it in the field below</li>
                </ol>
              </div>
            </div>
          </div>

          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  Your Cloudflare API token will be stored securely in your Kubernetes cluster as a Secret.
                  It will only be used for DNS validation during certificate issuance.
                </p>
              </div>
            </div>
          </div>

          <TextField
            label="Cloudflare Email"
            id="cloudflareEmail"
            name="cloudflareEmail"
            value={domain.cloudflareEmail || ''}
            onChange={handleChange}
            placeholder="your-email@example.com"
            error={errors.cloudflareEmail}
            helpText="The email address associated with your Cloudflare account"
            required
            disabled={isCheckingSecret}
          />

          <TextField
            label="Cloudflare API Token"
            id="cloudflareApiKey"
            name="cloudflareApiKey"
            type="password"
            value={domain.cloudflareApiKey || ''}
            onChange={handleChange}
            placeholder="••••••••••••••••"
            error={errors.cloudflareApiKey}
            helpText="Your Cloudflare API Token with DNS Edit permissions. Create a custom token with Zone > DNS > Edit and Zone > Zone > Read permissions."
            required
            disabled={isCheckingSecret}
          />
        </div>
      </Card>

      <div className="flex justify-between">
        <Button to="/prerequisites" variant="outline">
          Back
        </Button>

        <Button onClick={handleSubmit} isLoading={isLoading || isCheckingSecret} disabled={isCheckingSecret}>
          Next
        </Button>
      </div>
    </div>
  );
};

export default DomainSetup;
