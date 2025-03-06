# Source Code Secrets 4: Hacker's Login

## Challenge Description

This challenge simulates a secure login portal for a fictional cybersecurity system called "CyberNexus." Your task is to find the hidden login credentials in the source code and use them to access the system and retrieve the flag.

This challenge combines all the techniques you've learned in the previous challenges:
- Finding information in HTML comments
- Discovering hidden attributes in HTML elements
- Analyzing JavaScript code for secrets

## Learning Objectives

- Understand how sensitive information can be accidentally exposed in web applications
- Learn to thoroughly examine all aspects of a website's source code
- Recognize common security mistakes in web development
- Apply multiple source code analysis techniques to solve a complex challenge

## Difficulty

Advanced (Finale of the Source Code Secrets module)

## Solution Steps

1. **Examine the HTML source code**:
   - Right-click on the page and select "View Page Source"
   - Look for HTML comments that might contain credentials
   - You'll find a test account in the HTML comments: `admin_test / cybersec2023!`

2. **Check the footer section**:
   - In the HTML source, examine the footer section
   - Find a hidden attribute with a Base64 encoded value: `data-backdoor-hash="c3VwZXJzZWNyZXRhZG1pbg=="`
   - Decode this value to get: `supersecretadmin`

3. **Analyze the JavaScript code**:
   - Open the browser's developer tools (F12)
   - Go to the "Sources" or "Debugger" tab
   - Find and examine the script.js file
   - Look for the backdoor credentials object
   - Discover that the username is `backdoor` and the password is Base64 encoded

4. **Login with the discovered credentials**:
   - Try logging in with the test account: `admin_test / cybersec2023!`
   - Or try the backdoor account: `backdoor / supersecretadmin`
   - Upon successful login, the flag will be revealed

## Flag

The flag is: `EDU-{m4st3r_0f_s0urc3_c0d3_s3cr3ts}` 