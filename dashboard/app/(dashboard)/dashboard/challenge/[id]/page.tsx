import { PrismaClient } from '@prisma/client';
import { notFound } from 'next/navigation';

const prisma = new PrismaClient();

export async function getData(id: string) {
  const challengeInstance = await prisma.challengeInstance.findUnique({
    where: { id },
  });

  if (!challengeInstance) {
    return null;
  }

  return challengeInstance;
}

export default async function ChallengePage({ params }: { params: { id: string } }) {
  const challengeInstance = await getData(params.id);

  if (!challengeInstance) {
    notFound();
  }

  return (
    <div>
      <h1>Challenge ID: {challengeInstance.id}</h1>
      <iframe
        src={challengeInstance.challengeUrl}
        width="100%"
        height="600px"
        style={{ border: 'none' }}
      ></iframe>
    </div>
  );
}
