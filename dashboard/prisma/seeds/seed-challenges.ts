import { PrismaClient, ChallengeDifficulty } from '@prisma/client';

const prisma = new PrismaClient();

const appConfigs = [
  {
    id: 'chrome',
    icon: './icons/browser.svg',
    title: 'Browser',
    width: 70,
    height: 80,
    screen: 'displayChrome',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'calc',
    icon: './icons/calculator.svg',
    title: 'Calculator',
    width: 5,
    height: 50,
    screen: 'displayTerminalCalc',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'codeeditor',
    icon: './icons/code-editor.svg',
    title: 'Code Editor',
    width: 60,
    height: 75,
    screen: 'displayCodeEditor',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'terminal',
    icon: './icons/Remote-Terminal.svg',
    title: 'Terminal',
    width: 60,
    height: 55,
    screen: 'displayTerminal',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    launch_on_startup: true,
    additional_config: '{"disableScrolling": true}'
  },
  {
    id: 'settings',
    icon: './icons/settings.svg',
    title: 'Settings',
    width: 50,
    height: 60,
    screen: 'displaySettings',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'doom',
    icon: './icons/doom.svg',
    title: 'Doom',
    width: 80,
    height: 90,
    screen: 'displayDoom',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'cyberchef',
    icon: './icons/cyberchef.svg',
    title: 'Cyber Chef',
    width: 75,
    height: 85,
    screen: 'Cyberchef',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: false,
    additional_config: '{}'
  },
  {
    id: 'web_chal',
    icon: './icons/browser.svg',
    title: 'Web Challenge',
    width: 70,
    height: 80,
    screen: 'displayWebChal',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    launch_on_startup: false,
    additional_config: '{"url": "https://www.edurange.org/"}'
  }
];

const questions = [
  {
    id: 'flag1',
    type: 'flag',
    content: 'Find the first flag hidden in the system.',
    points: 10,
    order: 0,
    answer: 'placeholder_flag_1'
  },
  {
    id: 'text1',
    type: 'text',
    content: 'What command would you use to list all files, including hidden ones, with detailed information?',
    points: 5,
    order: 1,
    answer: 'hello'
  }
];

async function main() {
  // Find the existing fullos challenge type
  const challengeType = await prisma.challengeType.findFirst({
    where: {
      name: 'fullos'
    }
  });

  if (!challengeType) {
    throw new Error('Could not find fullos challenge type. Please run seed:challenge-types first.');
  }

  // Create a test challenge using the challenge type
  const challenge = await prisma.challenges.create({
    data: {
      name: 'Bandit-1',
      challengeImage: 'registry.rydersel.cloud/bandit1',
      difficulty: ChallengeDifficulty.MEDIUM,
      challengeTypeId: challengeType.id,
    }
  });

  // Create questions for the challenge
  const questionPromises = questions.map(question =>
    prisma.$executeRaw`
      INSERT INTO "ChallengeQuestion" (
        id, 
        "challengeId", 
        content, 
        type, 
        points,
        answer,
        "order",
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${challenge.id},
        ${question.content},
        ${question.type},
        ${question.points},
        ${question.answer},
        ${question.order},
        NOW(),
        NOW()
      )
    `
  );

  const questionResults = await Promise.all(questionPromises);

  // Create app configurations
  const appConfigPromises = appConfigs.map(config =>
    prisma.$executeRaw`
      INSERT INTO "ChallengeAppConfig" (
        id, 
        "challengeId", 
        "appId", 
        title, 
        icon, 
        width, 
        height, 
        screen,
        disabled, 
        favourite, 
        desktop_shortcut, 
        launch_on_startup, 
        additional_config,
        "createdAt",
        "updatedAt"
      )
      VALUES (
        gen_random_uuid(),
        ${challenge.id},
        ${config.id},
        ${config.title},
        ${config.icon},
        ${config.width},
        ${config.height},
        ${config.screen},
        ${config.disabled},
        ${config.favourite},
        ${config.desktop_shortcut},
        ${config.launch_on_startup},
        ${config.additional_config}::jsonb,
        NOW(),
        NOW()
      )
    `
  );

  const appConfigResults = await Promise.all(appConfigPromises);

  console.log('Created test challenge:', {
    id: challenge.id,
    name: challenge.name,
    questions: questionResults.length,
    appConfigs: appConfigResults.length
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

