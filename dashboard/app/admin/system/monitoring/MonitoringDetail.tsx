import { ChartBarIcon, ServerIcon, CheckBadgeIcon } from "@heroicons/react/24/outline";
import MetricCard from "@/components/common/MetricCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Globe } from "lucide-react";
import { StatusBadge } from "@/components/ui/status-badge";

interface MonitoringDetailProps {
  status: "healthy" | "warning" | "error";
  uptime: string;
  lastRestart: string;
  version: string;
  components: {
    prometheus: string;
    nodeExporter: string;
    monitoringService: string;
  };
  metrics: {
    totalSeries: number;
    scrapeTargets: number;
    activeTargets: number;
  };
  warningMessage?: string;
}

export default function MonitoringDetail({
  status,
  uptime,
  lastRestart,
  version,
  components,
  metrics,
  warningMessage,
}: MonitoringDetailProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <MetricCard
          title="Total Series"
          value={metrics.totalSeries.toString()}
          icon={<ChartBarIcon className="h-5 w-5 text-blue-500" />}
        />
        <MetricCard
          title="Scrape Targets"
          value={metrics.scrapeTargets.toString()}
          icon={<ServerIcon className="h-5 w-5 text-purple-500" />}
        />
        <MetricCard
          title="Active Targets"
          value={metrics.activeTargets.toString()}
          icon={<CheckBadgeIcon className="h-5 w-5 text-green-500" />}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Components</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="flex items-center">
                <Globe className="mr-2 h-4 w-4 text-cyan-500" />
                Monitoring Service
              </span>
              <StatusBadge status={components.monitoringService} />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center">
                <Activity className="mr-2 h-4 w-4 text-blue-500" />
                Prometheus
              </span>
              <StatusBadge status={components.prometheus} />
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center">
                <Activity className="mr-2 h-4 w-4 text-green-500" />
                Node Exporter
              </span>
              <StatusBadge status={components.nodeExporter} />
            </div>
          </div>
        </CardContent>
      </Card>

      {warningMessage && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-4">
          <div className="flex items-center text-yellow-800">
            <span className="font-medium">{warningMessage}</span>
          </div>
        </div>
      )}
    </div>
  );
}
