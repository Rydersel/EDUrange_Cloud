import { NextResponse } from 'next/server';

const defaultConfig = [
  {
    id: "chrome",
    title: "Browser",
    icon: "./icons/browser.svg",
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayChrome",
    width: 70,
    height: 80
  },
  {
    id: "calc",
    title: "Calculator",
    icon: './icons/calculator.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayTerminalCalc",
    width: 5,
    height: 50
  },
  {
    id: "codeeditor",
    title: "Code Editor",
    icon: './icons/code-editor.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayCodeEditor",
    width: 60,
    height: 75
  },
  {
    id: "terminal",
    title: "Terminal",
    icon: './icons/Remote-Terminal.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displayTerminal",
    width: 60,
    height: 55,
    disableScrolling: true
  },
  {
    id: "settings",
    title: "Settings",
    icon: './icons/settings.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: false,
    screen: "displaySettings",
    width: 50,
    height: 60
  },
  {
    id: "doom",
    title: "Doom",
    icon: './icons/doom.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayDoom",
    width: 80,
    height: 90
  },
  {
    id: "cyberchef",
    title: "Cyber Chef",
    icon: './icons/cyberchef.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "Cyberchef",
    width: 75,
    height: 85
  },
  {
    id: "web_chal",
    title: "Web Challenge",
    icon: './icons/browser.svg',
    disabled: false,
    favourite: true,
    desktop_shortcut: true,
    screen: "displayWebChal",
    width: 70,
    height: 80,
    url: "https://www.edurange.org/"
  }
];

export async function GET(req) {
  try {
    const response = await fetch('http://localhost:5000/config', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch config from bridge');
    }

    const data = await response.json();
    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.warn("Failed to fetch config, using default config:", error.message);
    return NextResponse.json(defaultConfig, { status: 200 });
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method Not Allowed', details: 'Use GET to fetch config' }, { status: 405 });
}
