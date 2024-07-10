import displayCodeEditor from '@/components/apps/code_editor';
import { displayTerminal } from '@/components/apps/terminal';
import { displaySettings } from '@/components/apps/settings';
import { displayChrome } from '@/components/apps/browser';
import { displayTerminalCalc } from '@/components/apps/calc';
import { displayDoom } from '@/components/apps/doom';
import Cyberchef from "@/components/apps/cyberchef";
import { displayWebChal } from '@/components/apps/web_chal';
import { displayChallengePrompt } from "@/components/apps/challenge_prompt";

const fetchConfig = async () => {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) {
      throw new Error('Failed to fetch config');
    }
    const config = await response.json();
    console.log(config)
    return config;
  } catch (error) {
    console.error("Failed to fetch apps config:", error);
    return [];
  }
};

const screenMap = {
  displayCodeEditor,
  displayTerminal,
  displaySettings,
  displayChrome,
  displayTerminalCalc,
  displayDoom,
  Cyberchef,
  displayWebChal,
  displayChallengePrompt,
};

const getAppsConfig = async () => {
  const appsConfig = await fetchConfig();

  const apps = appsConfig.map(app => ({
    ...app,
    screen: screenMap[app.screen], // Map the screen string to the actual function
    icon: app.icon.startsWith('/') ? app.icon : `/${app.icon}` // Ensure the icon path is correct
  }));

  return apps;
};

export default getAppsConfig;
