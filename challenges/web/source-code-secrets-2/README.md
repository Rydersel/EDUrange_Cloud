# Source Code Secrets 2: Hidden Attributes

## Challenge Description

This challenge teaches users about hidden HTML attributes that may contain sensitive information. Users must find a flag hidden in an HTML attribute that is not visible when viewing the page normally but can be found by inspecting the page's source code or using browser developer tools.

## Learning Objectives

- Understanding how HTML attributes can store data that isn't visible on the page
- Learning to use browser developer tools to inspect HTML elements and their attributes
- Recognizing that sensitive information should not be stored in HTML attributes
- Understanding the concept of "security through obscurity" and why it's ineffective

## Solution Steps

1. Visit the main page of the challenge
2. Right-click on the page and select "Inspect" or "Inspect Element" to open the browser's developer tools
3. Look through the HTML elements, particularly focusing on the section with class "hidden-content"
4. Find the `data-flag` attribute on this section element, which contains the flag

## Building and Deployment

To build and push the Docker image for this challenge:

```bash
./build.sh
```

## Challenge Type

This challenge is categorized under the "web" challenge type in EDURange Cloud. 