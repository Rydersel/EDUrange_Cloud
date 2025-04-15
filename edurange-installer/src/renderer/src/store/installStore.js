import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { getDomainFromCertificate } from '../utils/helpers';

const useInstallStore = create(
  persist(
    (set, get) => ({
      // Installation progress
      currentStep: 0,
      completedSteps: [],
      setCurrentStep: (step) => set({ currentStep: step }),
      markStepCompleted: (step) => set((state) => ({
        completedSteps: [...state.completedSteps, step]
      })),
      removeStepCompleted: (step) => set((state) => ({
        completedSteps: state.completedSteps.filter(s => s !== step)
      })),
      
      // Prerequisites check
      prerequisites: {
        kubectl: false,
        helm: false,
        docker: false,
        kubeConnection: false,
      },
      setPrerequisite: (key, value) => set((state) => ({
        prerequisites: {
          ...state.prerequisites,
          [key]: value
        }
      })),
      
      // Domain configuration
      domain: {
        name: '',
        cloudflareApiKey: '',
        cloudflareEmail: '',
        dashboardSubdomain: 'dashboard',
        instanceManagerSubdomain: 'eductf', // Used for monitoring service, instance-manager is now only accessible internally
        databaseSubdomain: 'database',
        monitoringSubdomain: 'monitoring',
      },
      setDomain: (key, value) => set((state) => ({
        domain: {
          ...state.domain,
          [key]: value
        }
      })),
      
      // Function to update domain from certificate
      updateDomainFromCertificate: async () => {
        const domainName = await getDomainFromCertificate();
        if (domainName) {
          set((state) => ({
            domain: {
              ...state.domain,
              name: domainName
            }
          }));
          return domainName;
        }
        return null;
      },
      
      // Function to ensure domain is set, trying to get it from certificate if not
      ensureDomainIsSet: async () => {
        const state = get();
        if (!state.domain.name || state.domain.name.trim() === '') {
          const domainName = await state.updateDomainFromCertificate();
          return domainName !== null;
        }
        return true;
      },
      
      // Database configuration
      database: {
        host: '',
        name: 'postgres',
        user: 'admin',
        password: '',
        useExistingDatabase: false,
        enableStorageCleanup: false,
        enableDebugSidecar: false,
      },
      setDatabase: (key, value) => set((state) => ({
        database: {
          ...state.database,
          [key]: value
        }
      })),
      
      // Registry configuration
      registry: {
        url: 'registry.edurange.cloud/edurange',
      },
      setRegistry: (key, value) => set((state) => ({
        registry: {
          ...state.registry,
          [key]: value
        }
      })),
      
      // Installation status
      installationStatus: {
        ingressController: 'pending',
        certManager: 'pending',
        database: 'pending',
        databaseController: 'pending',
        instanceManager: 'pending',
        monitoringService: 'pending',
        redisService: 'pending',
        dashboard: 'pending',
        userManagement: 'pending',
      },
      setInstallationStatus: (component, status) => set((state) => ({
        installationStatus: {
          ...state.installationStatus,
          [component]: status
        }
      })),
      
      // Logs
      logs: [],
      addLog: (log) => set((state) => ({
        logs: [...state.logs, { timestamp: new Date().toISOString(), message: log }]
      })),
      
      // Reset store
      reset: () => set({
        currentStep: 0,
        completedSteps: [],
        prerequisites: {
          kubectl: false,
          helm: false,
          docker: false,
          kubeConnection: false,
        },
        domain: {
          name: '',
          cloudflareApiKey: '',
          cloudflareEmail: '',
          dashboardSubdomain: 'dashboard',
          instanceManagerSubdomain: 'eductf', // Used for monitoring service, instance-manager is now only accessible internally
          databaseSubdomain: 'database',
          monitoringSubdomain: 'monitoring',
        },
        database: {
          host: '',
          name: 'postgres',
          user: 'admin',
          password: '',
          useExistingDatabase: false,
          enableStorageCleanup: false,
          enableDebugSidecar: false,
        },
        registry: {
          url: 'registry.edurange.cloud/edurange',
        },
        installationStatus: {
          ingressController: 'pending',
          certManager: 'pending',
          database: 'pending',
          databaseController: 'pending',
          instanceManager: 'pending',
          monitoringService: 'pending',
          redisService: 'pending',
          dashboard: 'pending',
          userManagement: 'pending',
        },
        logs: [],
      }),
      
      // Instance Manager configuration
      instanceManager: {
        enableImageCaching: false,
      },
      setInstanceManagerOption: (option, value) => 
        set((state) => ({
          instanceManager: {
            ...state.instanceManager,
            [option]: value
          }
        })),
    }),
    {
      name: 'edurange-installer-storage',
      partialize: (state) => ({
        domain: state.domain,
        completedSteps: state.completedSteps,
        installationStatus: state.installationStatus
      })
    }
  )
);

export default useInstallStore; 