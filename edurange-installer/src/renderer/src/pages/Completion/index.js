import React from 'react';
import Card from '../../components/Card';
import Button from '../../components/Button';
import { CheckCircleIcon } from '@heroicons/react/24/solid';
import useInstallStore from '../../store/installStore';

const Completion = () => {
  const { domain } = useInstallStore();

  return (
    <div className="space-y-6">
      <div className="text-center">
        <CheckCircleIcon className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="mt-4 text-3xl font-bold text-gray-900">Installation Complete!</h1>
        <p className="mt-2 text-lg text-gray-600">
          EDURange Cloud has been successfully installed on your Kubernetes cluster.
        </p>
      </div>

      <Card title="Next Steps">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            Here are some next steps to get started with EDURange Cloud:
          </p>

          <ol className="list-decimal list-inside space-y-3 text-gray-700">
            <li>
              <span className="font-medium">Access the Dashboard:</span>{' '}
              <a
                href={`https://${domain.dashboardSubdomain}.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.dashboardSubdomain}.{domain.name}
              </a>
            </li>

            <li>
              <span className="font-medium">Set up GitHub OAuth:</span>{' '}
              Configure GitHub OAuth for user authentication by following the instructions in the verification step.
            </li>

            <li>
              <span className="font-medium">Create your first challenge:</span>{' '}
              Use the dashboard to create and deploy your first cybersecurity challenge.
            </li>

            <li>
              <span className="font-medium">Monitor your cluster:</span>{' '}
              Use the monitoring service to keep track of your cluster's performance and health.
            </li>

            <li>
              <span className="font-medium">Explore the documentation:</span>{' '}
              Check out the EDURange Cloud documentation for more information on how to use the platform.
            </li>
          </ol>
        </div>
      </Card>

      <Card title="Important Information">
        <div className="space-y-4">
          <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="text-sm text-yellow-700">
                  <strong>Important:</strong> Make sure to keep your Kubernetes cluster running and properly maintained.
                  Regular backups of the database are recommended.
                </p>
              </div>
            </div>
          </div>

          <h3 className="text-sm font-medium text-gray-900">Access URLs</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-gray-50 rounded-md">
              <h4 className="font-medium text-gray-900">Dashboard</h4>
              <a
                href={`https://${domain.dashboardSubdomain}.${domain.name}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.dashboardSubdomain}.{domain.name}
              </a>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <h4 className="font-medium text-gray-900">Monitoring Service</h4>
              <a
                href={`https://${domain.instanceManagerSubdomain}.${domain.name}/metrics`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://{domain.instanceManagerSubdomain}.{domain.name}/metrics
              </a>
            </div>

            <div className="p-3 bg-gray-50 rounded-md">
              <h4 className="font-medium text-gray-900">Database API</h4>
              <p className="text-gray-600">
                <span className="text-amber-600 font-medium">Internal access only</span> - 
                For security reasons, the Database API is only accessible from within the Kubernetes cluster 
                at <code className="bg-gray-100 px-1 py-0.5 rounded">http://database-api-service.default.svc.cluster.local</code>
              </p>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Support">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">
            If you need help or have questions about EDURange Cloud, you can:
          </p>

          <ul className="list-disc list-inside space-y-2 text-gray-700">
            <li>
              <span className="font-medium">Visit the GitHub repository:</span>{' '}
              <a
                href="https://github.com/edurange/edurange-cloud"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://github.com/edurange/edurange-cloud
              </a>
            </li>

            <li>
              <span className="font-medium">Report issues:</span>{' '}
              <a
                href="https://github.com/edurange/edurange-cloud/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-500"
              >
                https://github.com/edurange/edurange-cloud/issues
              </a>
            </li>

            <li>
              <span className="font-medium">Contact the EDURange team:</span>{' '}
              <a
                href="mailto:support@edurange.org"
                className="text-primary-600 hover:text-primary-500"
              >
                support@edurange.org
              </a>
            </li>
          </ul>
        </div>
      </Card>

      <div className="flex justify-center">
        <Button
          onClick={() => window.close()}
          size="lg"
        >
          Close Installer
        </Button>
      </div>
    </div>
  );
};

export default Completion;
