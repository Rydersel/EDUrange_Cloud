import { requireAdminAccess } from "@/lib/auth-utils";

export default async function ChallengeCreateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Check if user is admin, will redirect if not
  await requireAdminAccess();
  
  return <>{children}</>;
} 