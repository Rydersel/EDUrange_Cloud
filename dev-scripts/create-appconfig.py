import json

# Define the default configuration
defaultConfig = [
    {
        "id": "chrome",
        "title": "Browser",
        "icon": "./icons/browser.svg",
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": True,
        "screen": "displayChrome",
        "width": 70,
        "height": 80,
        "launch_on_startup": False,
    },
    {
        "id": "calc",
        "title": "Calculator",
        "icon": './icons/calculator.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": False,
        "screen": "displayTerminalCalc",
        "width": 5,
        "height": 50,
        "launch_on_startup": False,
    },
    {
        "id": "codeeditor",
        "title": "Code Editor",
        "icon": './icons/code-editor.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": False,
        "screen": "displayCodeEditor",
        "width": 60,
        "height": 75,
        "launch_on_startup": False,
    },
    {
        "id": "terminal",
        "title": "Terminal",
        "icon": './icons/Remote-Terminal.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": False,
        "screen": "displayTerminal",
        "width": 60,
        "height": 55,
        "disableScrolling": True,
        "launch_on_startup": True,
    },
    {
        "id": "settings",
        "title": "Settings",
        "icon": './icons/settings.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": False,
        "screen": "displaySettings",
        "width": 50,
        "height": 60,
        "launch_on_startup": False,
    },
    {
        "id": "doom",
        "title": "Doom",
        "icon": './icons/doom.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": True,
        "screen": "displayDoom",
        "width": 80,
        "height": 90,
        "launch_on_startup": False,
    },
    {
        "id": "cyberchef",
        "title": "Cyber Chef",
        "icon": './icons/cyberchef.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": True,
        "screen": "Cyberchef",
        "width": 75,
        "height": 85,
        "launch_on_startup": False,
    },
    {
        "id": "web_chal",
        "title": "Web Challenge",
        "icon": './icons/browser.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": True,
        "screen": "displayWebChal",
        "width": 70,
        "height": 80,
        "launch_on_startup": False,
        "url": "https://www.edurange.org/"
    },
    {
        "id": "challenge-prompt",
        "title": "Challenge Prompt",
        "icon": './icons/prompt.svg',
        "disabled": False,
        "favourite": True,
        "desktop_shortcut": True,
        "screen": "displayChallengePrompt",
        "width": 70,
        "height": 80,
        "description": "Default description for the challenge prompt",
        "launch_on_startup": True,
        "challenge": {
            "type": "single",
            "title": "Bandit-2",
            "description": "The password for the next level is stored in a file called spaces in this filename located in the home directory",
            "flagSecretName": "flag-secret-ctfchal-clyf1mbf50000u87dl8tvhhvh-8672",
            "pages": [
                {
                    "instructions": "Read the following instructions carefully to complete the challenge.",
                    "questions": [
                        {
                            "type": "flag",
                            "content": "What is the flag?",
                            "id": "flag",
                            "points": 10
                        },

                    ]
                },

            ]
        }
    },
]

# Create a list to store the converted config
converted_config = []

for item in defaultConfig:
    new_item = {
        "id": item.get("id"),
        "icon": item.get("icon"),
        "title": item.get("title"),
        "width": item.get("width"),
        "height": item.get("height"),
        "screen": item.get("screen"),
        "disabled": item.get("disabled"),
        "favourite": item.get("favourite"),
        "desktop_shortcut": item.get("desktop_shortcut"),
        "launch_on_startup": item.get("launch_on_startup"),
    }
    if "disableScrolling" in item:
        new_item["disableScrolling"] = item["disableScrolling"]
    if "url" in item:
        new_item["url"] = item["url"]
    if "description" in item:
        new_item["description"] = item["description"]
    if "challenge" in item:
        new_item["challenge"] = item["challenge"]
    converted_config.append(new_item)

# Save the converted config to a JSON file
with open('converted_config.json', 'w') as f:
    json.dump(converted_config, f, indent=2)

print("Config has been converted and saved to converted_config.json")
