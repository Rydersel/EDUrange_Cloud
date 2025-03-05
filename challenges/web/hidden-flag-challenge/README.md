# Hidden Flag Web Challenge

This is a simple web challenge for EDURange Cloud that tests a user's ability to find hidden information in web pages.

## Challenge Description

In this challenge, users need to find a hidden flag in a web application. The flag is hidden in the HTML source code of a secret page that is mentioned in the robots.txt file.

## Learning Objectives

- Understanding how to view HTML source code
- Learning about robots.txt files and their purpose
- Discovering hidden or unlinked pages on websites
- Using browser developer tools

## Solution

1. View the source code of the main page to find a hint pointing to robots.txt
2. Check robots.txt to discover disallowed pages, including secret.html
3. Visit secret.html to find the flag

## Building and Deployment

To build and push the Docker image:

```bash
docker buildx build --platform linux/amd64 -t registry.rydersel.cloud/hidden-flag-challenge . --push
```

## Challenge Type

This challenge is designed to be used with the "web" challenge type in EDURange Cloud. 