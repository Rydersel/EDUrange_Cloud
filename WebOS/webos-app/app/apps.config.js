import displayCodeEditor from '@/components/apps/code_editor';
import { displayTerminal } from '@/components/apps/terminal';
import { displaySettings } from '@/components/apps/settings';
import { displayChrome } from '@/components/apps/browser';

import { displayTerminalCalc } from '@/components/apps/calc';
import { displayDoom } from '@/components/apps/doom';
import Cyberchef from "@/components/apps/cyberchef";

const apps = [
    {
        id: "chrome",
        title: "Browser",
        icon: './icons/browser.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayChrome,
        width: 70,  // example width percentage
        height: 80  // example height percentage
    },
    {
        id: "calc",
        title: "Calculator",
        icon: './icons/calculator.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayTerminalCalc,
        width: 5,  // example width percentage
        height: 50  // example height percentage
    },
    {
        id: "codeeditor",
        title: "Code Editor",
        icon: './icons/code-editor.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayCodeEditor,
        width: 60,  // example width percentage
        height: 75  // example height percentage
    },
    {
        id: "terminal",
        title: "Terminal",
        icon: './icons/Remote-Terminal.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displayTerminal,
        width: 60,  // example width percentage
        height: 50  // example height percentage
    },
    {
        id: "settings",
        title: "Settings",
        icon: './icons/settings.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displaySettings,
        width: 50,  // example width percentage
        height: 60  // example height percentage
    },
    {
        id: "doom",
        title: "Doom",
        icon: './icons/doom.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayDoom,
        width: 80,  // example width percentage
        height: 90  // example height percentage
    },
    {
        id: "cyberchef",
        title: "Cyber Chef",
        icon: './icons/cyberchef.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: Cyberchef,
        width: 75,  // example width percentage
        height: 85  // example height percentage
    },
]

export default apps;
