import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompetitionsList } from "./competitions-list";

export default async function CompetitionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

  const now = new Date();

  const competitions = await prisma.competitionGroup.findMany({
    include: {
      _count: {
        select: {
          members: true,
          challenges: true,
        }
      },
      challenges: {
        include: {
          challenge: true,
        }
      },
      members: true,
    },
  });

  // Sort competitions into categories
  const active = competitions.filter((c) => 
    c.startDate <= now && (!c.endDate || c.endDate >= now)
  );
  const upcoming = competitions.filter((c) => c.startDate > now);
  const past = competitions.filter((c) => 
    c.endDate && c.endDate < now
  );

  return <CompetitionsList competitions={{ active, upcoming, past }} />;
} 