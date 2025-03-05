# Source Code Secrets 3: JavaScript Secrets

## Challenge Description

This challenge teaches users about sensitive information hidden in JavaScript files. Users must find a flag hidden within a JavaScript file that is loaded by the webpage. This challenge emphasizes the importance of not storing sensitive information in client-side code.

## Learning Objectives

- Understanding how JavaScript files are loaded and executed in web browsers
- Learning to examine JavaScript source code for sensitive information
- Recognizing the risks of storing secrets in client-side code
- Using browser developer tools to inspect JavaScript files

## Solution Steps

1. Visit the main page of the challenge
2. Right-click on the page and select "View Page Source" or press Ctrl+U
3. Look for the JavaScript file reference in the HTML (script.js)
4. Either click on the script.js link in the source view or open the browser's developer tools (F12) and navigate to the "Sources" or "Debugger" tab
5. Find the `securitySettings` object in the JavaScript file, which contains a `secretToken` property with the flag

## Building and Deployment

To build and push the Docker image for this challenge:

```bash
./build.sh
```

## Challenge Type

This challenge is categorized under the "web" challenge type in EDURange Cloud. 