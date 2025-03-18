import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Welcome from './pages/Welcome/index';
import KubectlSetup from './pages/KubectlSetup';
import Prerequisites from './pages/Prerequisites/index';
import DomainSetup from './pages/DomainSetup/index';
import IngressSetup from './pages/IngressSetup/index';
import CertManagerSetup from './pages/CertManagerSetup/index';
import DatabaseSetup from './pages/DatabaseSetup/index';
import ComponentsSetup from './pages/ComponentsSetup/index';
import OAuthSetup from './pages/OAuthSetup/index';
import DashboardSetup from './pages/DashboardSetup/index';
import UserManagement from './pages/UserManagement/index';
import Verification from './pages/Verification/index';
import Completion from './pages/Completion/index';
import { verifyAllSteps } from './services/clusterVerificationService';
import useInstallStore from './store/installStore';

function App() {
  const {
    setPrerequisite,
    markStepCompleted,
    setDomain,
    setInstallationStatus
  } = useInstallStore();

  // Run verification on startup
  useEffect(() => {
    const runVerification = async () => {
      try {
        const results = await verifyAllSteps();

        // Update the store based on verification results
        if (results.kubectlConnected) {
          setPrerequisite('kubeConnection', true);
        } else {
          setPrerequisite('kubeConnection', false);
        }

        // Update installation steps status
        if (results.nginxIngress) {
          markStepCompleted('ingress-setup');
          setInstallationStatus('ingressController', 'installed');
        }

        if (results.certManager && results.wildcardCertificate) {
          markStepCompleted('cert-manager-setup');
          setInstallationStatus('certManager', 'installed');
        }

        if (results.database) {
          markStepCompleted('database-setup');
          setInstallationStatus('database', 'installed');
        }

        if (results.databaseController) {
          setInstallationStatus('databaseController', 'installed');
        }

        if (results.instanceManager) {
          setInstallationStatus('instanceManager', 'installed');
        }

        if (results.monitoringService) {
          setInstallationStatus('monitoringService', 'installed');
        }

        // If all components are installed, mark the components-setup step as completed
        if (results.databaseController && results.instanceManager && results.monitoringService) {
          markStepCompleted('components-setup');
        }

        if (results.oauth) {
          markStepCompleted('oauth-setup');
        }

        if (results.dashboard) {
          markStepCompleted('dashboard-setup');
          setInstallationStatus('dashboard', 'installed');
        }

        if (results.domain && results.domain.configured) {
          markStepCompleted('domain-setup');
          // Update domain in store if it's not already set
          if (results.domain.domain) {
            setDomain('name', results.domain.domain);
          }
        }
      } catch (error) {
        console.error('Error verifying cluster state:', error);
      }
    };

    runVerification();

    // Set up a periodic verification (every 5 minutes)
    const intervalId = setInterval(() => {
      runVerification();
    }, 5 * 60 * 1000);

    return () => clearInterval(intervalId);
  }, [setPrerequisite, markStepCompleted, setDomain, setInstallationStatus]);

  return (
    <Router>
      <Layout>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route path="/kubectl-setup" element={<KubectlSetup />} />
          <Route path="/prerequisites" element={<Prerequisites />} />
          <Route path="/domain-setup" element={<DomainSetup />} />
          <Route path="/ingress-setup" element={<IngressSetup />} />
          <Route path="/cert-manager-setup" element={<CertManagerSetup />} />
          <Route path="/database-setup" element={<DatabaseSetup />} />
          <Route path="/components-setup" element={<ComponentsSetup />} />
          <Route path="/oauth-setup" element={<OAuthSetup />} />
          <Route path="/dashboard-setup" element={<DashboardSetup />} />
          <Route path="/user-management" element={<UserManagement />} />
          <Route path="/verification" element={<Verification />} />
          <Route path="/completion" element={<Completion />} />
        </Routes>
      </Layout>
    </Router>
  );
}

export default App;
