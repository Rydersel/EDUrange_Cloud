# Source Code Secrets 1: HTML Comments

This is the first challenge in the Source Code Secrets series for EDURange Cloud. It teaches users about inspecting HTML source code to find hidden information.

## Challenge Description

In this challenge, users need to find a hidden flag in the HTML source code of a simple webpage. The flag is hidden in an HTML comment that is not visible when viewing the page normally.

## Learning Objectives

- Understanding how to view HTML source code in a web browser
- Learning about HTML comments and how they can be used (or misused)
- Using browser developer tools to inspect page elements
- Recognizing that sensitive information should never be stored in client-side code

## Solution

1. Visit the main page of the challenge
2. View the page source code (right-click and select "View Page Source" or use Ctrl+U in most browsers)
3. Find the HTML comment containing the flag

## Building and Deployment

To build and push the Docker image:

```bash
./build.sh
```

## Challenge Type

This challenge is designed to be used with the "web" challenge type in EDURange Cloud. 