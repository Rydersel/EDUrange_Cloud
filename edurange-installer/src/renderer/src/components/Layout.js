import React from 'react';
import { useLocation, Link, useNavigate } from 'react-router-dom';
import { 
  HomeIcon, 
  ServerIcon, 
  ShieldCheckIcon, 
  GlobeAltIcon, 
  CircleStackIcon,
  CpuChipIcon, 
  CheckCircleIcon,
  ArrowPathIcon,
  CommandLineIcon,
  UserIcon
} from '@heroicons/react/24/outline';
import useInstallStore from '../store/installStore';

const steps = [
  { id: 'welcome', name: 'Welcome', href: '/', icon: HomeIcon },
  { id: 'kubectl-setup', name: 'Kubectl Setup', href: '/kubectl-setup', icon: CommandLineIcon },
  { id: 'prerequisites', name: 'Prerequisites', href: '/prerequisites', icon: ServerIcon },
  { id: 'domain-setup', name: 'Domain Setup', href: '/domain-setup', icon: GlobeAltIcon },
  { id: 'ingress-setup', name: 'Ingress Setup', href: '/ingress-setup', icon: ArrowPathIcon },
  { id: 'cert-manager-setup', name: 'Certificate Setup', href: '/cert-manager-setup', icon: ShieldCheckIcon },
  { id: 'database-setup', name: 'Database Setup', href: '/database-setup', icon: CircleStackIcon },
  { id: 'components-setup', name: 'Components Setup', href: '/components-setup', icon: CpuChipIcon },
  { id: 'oauth-setup', name: 'OAuth Setup', href: '/oauth-setup', icon: ShieldCheckIcon },
  { id: 'dashboard-setup', name: 'Dashboard Setup', href: '/dashboard-setup', icon: CpuChipIcon },
  { id: 'user-management', name: 'User Management', href: '/user-management', icon: UserIcon },
  { id: 'verification', name: 'Verification', href: '/verification', icon: CheckCircleIcon },
  { id: 'completion', name: 'Completion', href: '/completion', icon: CheckCircleIcon },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function Layout({ children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { installationStatus, completedSteps } = useInstallStore();
  const currentStepIndex = steps.findIndex(step => step.href === location.pathname);

  // Check if a step is allowed to be navigated to
  const isStepAllowed = (stepIndex) => {
    // Always allow navigation to current or previous steps
    if (stepIndex <= currentStepIndex) return true;
    
    // Allow navigation to any completed step
    const stepId = steps[stepIndex].id;
    if (completedSteps.includes(stepId)) return true;
    
    // For installation steps, check if they're completed
    if (stepId === 'ingress-setup' && installationStatus.ingressController === 'success') return true;
    if (stepId === 'cert-manager-setup' && installationStatus.certManager === 'success') return true;
    if (stepId === 'database-setup' && installationStatus.database === 'success') return true;
    if (stepId === 'components-setup' && 
        installationStatus.databaseController === 'success' &&
        installationStatus.instanceManager === 'success' &&
        installationStatus.monitoringService === 'success') return true;
    if (stepId === 'oauth-setup' && 
        installationStatus.databaseController === 'success' &&
        installationStatus.instanceManager === 'success' &&
        installationStatus.monitoringService === 'success') return true;
    if (stepId === 'dashboard-setup' && installationStatus.oauth === 'success') return true;
    if (stepId === 'user-management' && installationStatus.dashboard === 'success') return true;
    if (stepId === 'verification' && installationStatus.userManagement === 'success') return true;
    
    // Allow navigation to the next step
    if (stepIndex === currentStepIndex + 1) return true;
    
    // Don't allow skipping to uncompleted steps beyond the next one
    return false;
  };

  const handleNavigation = (e, stepIndex) => {
    if (!isStepAllowed(stepIndex)) {
      e.preventDefault();
      alert('Please complete the current step before proceeding.');
    }
  };

  return (
    <div className="flex min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
        <div className="flex-1 flex flex-col min-h-0 bg-primary-700">
          <div className="flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
            <div className="flex items-center flex-shrink-0 px-4">
              <h1 className="text-xl font-bold text-white">EDURange Cloud Installer</h1>
            </div>
            <nav className="mt-5 flex-1 px-2 space-y-1">
              {steps.map((step, stepIdx) => {
                const isActive = step.href === location.pathname;
                const isCompleted = completedSteps.includes(steps[stepIdx].id) || 
                                  (steps[stepIdx].id === 'ingress-setup' && installationStatus.ingressController === 'success') ||
                                  (steps[stepIdx].id === 'cert-manager-setup' && installationStatus.certManager === 'success') ||
                                  (steps[stepIdx].id === 'database-setup' && installationStatus.database === 'success') ||
                                  (steps[stepIdx].id === 'components-setup' && 
                                   installationStatus.databaseController === 'success' &&
                                   installationStatus.instanceManager === 'success' &&
                                   installationStatus.monitoringService === 'success');
                const isNextStep = stepIdx === currentStepIndex + 1;
                const isDisabled = !isStepAllowed(stepIdx);
                
                return (
                  <Link
                    key={step.name}
                    to={isDisabled ? '#' : step.href}
                    className={classNames(
                      isActive
                        ? 'bg-primary-800 text-white'
                        : isCompleted || isNextStep
                        ? 'text-white hover:bg-primary-600'
                        : isDisabled
                        ? 'text-primary-300 cursor-not-allowed'
                        : 'text-primary-100 hover:bg-primary-600',
                      'group flex items-center px-2 py-2 text-sm font-medium rounded-md'
                    )}
                    onClick={(e) => isDisabled && handleNavigation(e, stepIdx)}
                  >
                    <step.icon
                      className={classNames(
                        isActive
                          ? 'text-white'
                          : isCompleted || isNextStep
                          ? 'text-primary-300'
                          : isDisabled
                          ? 'text-primary-500'
                          : 'text-primary-300 group-hover:text-white',
                        'mr-3 flex-shrink-0 h-6 w-6'
                      )}
                      aria-hidden="true"
                    />
                    {step.name}
                    {isCompleted && (
                      <CheckCircleIcon className="ml-auto h-5 w-5 text-green-400" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="md:pl-64 flex flex-col flex-1">
        <main className="flex-1">
          <div className="py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 md:px-8">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
} 