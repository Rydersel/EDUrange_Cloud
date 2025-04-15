import { CheckCircleIcon, ClockIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import MetricCard from "@/components/common/MetricCard";

interface CertManagerDetailProps {
  status: "healthy" | "warning" | "error";
  uptime: string;
  lastRestart: string;
  version: string;
  validCertificates: number;
  expiringSoonCertificates: number;
  expiredCertificates: number;
  warningMessage?: string;
}

export default function CertManagerDetail({
  status,
  uptime,
  lastRestart,
  version,
  validCertificates,
  expiringSoonCertificates,
  expiredCertificates,
  warningMessage,
}: CertManagerDetailProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
      <MetricCard
        title="Valid Certificates"
        value={validCertificates.toString()}
        icon={<CheckCircleIcon className="h-5 w-5 text-green-500" />}
      />
      <MetricCard
        title="Expiring Soon"
        value={expiringSoonCertificates.toString()}
        icon={<ClockIcon className="h-5 w-5 text-yellow-500" />}
      />
      <MetricCard
        title="Expired"
        value={expiredCertificates.toString()}
        icon={<ExclamationTriangleIcon className="h-5 w-5 text-red-500" />}
      />
    </div>
  );
}
