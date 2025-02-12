import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // First check if the type exists
  let challengeType = await prisma.challengeType.findFirst({
    where: {
      name: 'fullos'
    }
  });

  // If it doesn't exist, create it
  if (!challengeType) {
    challengeType = await prisma.challengeType.create({
      data: {
        name: 'fullos'
      }
    });
    console.log('Created new challenge type:', challengeType);
  } else {
    console.log('Using existing challenge type:', challengeType);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  }); 
