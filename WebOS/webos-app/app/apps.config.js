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
        icon: `./icons/browser.svg`,
        disabled: false,
        favourite: true,
        desktop_shortcut: true,
        screen: displayChrome,
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
        screen: displayTerminalCalc,
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
        screen: displayCodeEditor,
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
        screen: displayTerminal,
        width: 60,
        height: 55,
        disableScrolling: true // New property to disable scrolling
    },
    {
        id: "settings",
        title: "Settings",
        icon: './icons/settings.svg',
        disabled: false,
        favourite: true,
        desktop_shortcut: false,
        screen: displaySettings,
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
        screen: displayDoom,
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
        screen: Cyberchef,
        width: 75,
        height: 85
    },
]

export default apps;
