import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CompetitionsList } from "./competitions-list";
import {redirect} from "next/navigation";
import {requireAdminAccess} from "@/lib/auth-utils";

export default async function CompetitionsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect('/')
  }

  // Check if user is admin
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { role: true }
  });

  const isAdmin = user?.role === 'ADMIN';

  const now = new Date();

  const rawCompetitions = await prisma.competitionGroup.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      startDate: true,
      endDate: true,
      createdAt: true,
      updatedAt: true,
      _count: {
        select: {
          members: true,
          challenges: true,
        }
      },
      challenges: {
        select: {
          points: true,
        }
      },
      members: {
        select: {
          id: true,
          groupPoints: {
            select: {
              points: true
            }
          }
        }
      }
    }
  });

  // Transform the data to match the Competition type
  const competitions = rawCompetitions.map(comp => ({
    ...comp,
    members: comp.members.map(member => ({
      points: member.groupPoints[0]?.points || 0
    }))
  }));

  // Sort competitions into categories
  const active = competitions.filter((c) =>
    c.startDate <= now && (!c.endDate || c.endDate >= now)
  );
  const upcoming = competitions.filter((c) => c.startDate > now);
  const past = competitions.filter((c) =>
    c.endDate && c.endDate < now
  );

  return <CompetitionsList competitions={{ active, upcoming, past }} isAdmin={isAdmin} />;
}
