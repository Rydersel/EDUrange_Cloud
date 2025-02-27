# Challenge Installer Documentation

The Challenge Installer is an admin-only tool in EDURange Cloud that allows administrators to upload and install challenge modules to the platform. This document explains how to use the Challenge Installer and the expected format for challenge modules.

## Table of Contents

1. [Overview](#overview)
2. [Access Control](#access-control)
3. [Challenge Module Format](#challenge-module-format)
4. [Installation Process](#installation-process)
5. [Editing Modules Before Installation](#editing-modules-before-installation)
6. [Featured Modules](#featured-modules)
7. [Troubleshooting](#troubleshooting)
8. [Validation Checks](#validation-checks)

## Overview

The Challenge Installer provides a user-friendly interface for administrators to add new challenges to the EDURange Cloud platform. It supports:

- Uploading custom challenge modules in JSON format
- Browsing and selecting from pre-configured featured modules
- Previewing and editing modules before installation
- Installing modules to make them available to users

## Access Control

The Challenge Installer is restricted to users with administrator privileges only. When a non-admin user attempts to access the Challenge Installer, they will see an "Access Denied" message.

## Challenge Module Format

Challenge modules must be in JSON format and follow a specific structure. Here's the expected format:

```json
{
  "moduleName": "Module Name",
  "moduleDescription": "Description of the challenge module",
  "author": "Author Name",
  "version": "1.0.0",
  "createdAt": "2023-01-01T00:00:00Z",
  "challenges": [
    {
      "name": "Challenge Name",
      "challengeImage": "registry.example.com/image-name",
      "difficulty": "EASY",
      "challengeType": "fullos",
      "description": "Challenge description",
      "appConfigs": [
        {
          "appId": "terminal",
          "title": "Terminal",
          "icon": "./icons/terminal.svg",
          "width": 60,
          "height": 75,
          "screen": "displayTerminal",
          "disabled": false,
          "favourite": true,
          "desktop_shortcut": true,
          "launch_on_startup": false,
          "additional_config": "{}"
        }
      ],
      "questions": [
        {
          "content": "Question text",
          "type": "text",
          "points": 10,
          "answer": "answer",
          "order": 1
        }
      ]
    }
  ]
}
```

### Module Properties

| Property | Type | Description |
|----------|------|-------------|
| `moduleName` | String | The name of the module |
| `moduleDescription` | String | A description of the module |
| `author` | String | The author of the module |
| `version` | String | The version of the module (e.g., "1.0.0") |
| `createdAt` | String | ISO 8601 date string when the module was created |
| `challenges` | Array | Array of challenge objects |

### Challenge Properties

| Property | Type | Description |
|----------|------|-------------|
| `name` | String | The name of the challenge |
| `challengeImage` | String | Docker image for the challenge (e.g., "registry.example.com/image-name") |
| `difficulty` | String | Difficulty level: "EASY", "MEDIUM", "HARD", or "VERY_HARD" |
| `challengeType` | String | Type of challenge (e.g., "fullos", "web") |
| `description` | String | A description of the challenge |
| `appConfigs` | Array | Array of app configuration objects |
| `questions` | Array | Array of question objects |

### App Configuration Properties

| Property | Type | Description |
|----------|------|-------------|
| `appId` | String | Unique identifier for the app |
| `title` | String | Display title for the app |
| `icon` | String | Path to the app icon |
| `width` | Number | Width of the app window (percentage) |
| `height` | Number | Height of the app window (percentage) |
| `screen` | String | Screen component to display |
| `disabled` | Boolean | Whether the app is disabled |
| `favourite` | Boolean | Whether the app is marked as a favorite |
| `desktop_shortcut` | Boolean | Whether to create a desktop shortcut |
| `launch_on_startup` | Boolean | Whether to launch the app on startup |
| `additional_config` | String | JSON string with additional configuration |

### Question Properties

| Property | Type | Description |
|----------|------|-------------|
| `content` | String | The question text |
| `type` | String | Question type: "text" or "flag" |
| `points` | Number | Points awarded for correct answer |
| `answer` | String | The correct answer |
| `order` | Number | Order in which questions appear |

## Installation Process

1. **Access the Challenge Installer**: Navigate to Dashboard > Challenge Installer
2. **Choose an Installation Method**:
   - **Upload Module**: Upload a JSON file containing a challenge module
   - **Browse Popular Modules**: Select from pre-configured modules
3. **Review and Edit**: Preview the module and make any necessary edits
4. **Install**: Click the "Install Module" button to add the challenges to the database

## Editing Modules Before Installation

The Challenge Installer allows you to edit modules before installation:

- **Module Properties**: Edit the module name, description, author, and version
- **Challenge Properties**: Edit challenge names, descriptions, images, and difficulty levels
- **Questions**: Edit question content, type, points, and answers

When editing:
- For flag-type questions, the answer field will be disabled as flags are typically predefined
- You can change question types between "text" and "flag"
- You can select from four difficulty levels: EASY, MEDIUM, HARD, and VERY_HARD

If you make changes and want to revert to the original module, use the "Reset" button.

## Featured Modules

The Challenge Installer includes a collection of pre-configured modules that you can browse and install. These modules are maintained by the EDURange team and cover various cybersecurity topics.

To use a featured module:
1. Click the "Browse Popular Modules" tab
2. Browse the available modules
3. Click "Select Module" on the module you want to install
4. Review and edit the module if needed
5. Click "Install Module"

## Troubleshooting

### Common Issues

- **Invalid JSON Format**: Ensure your module file is valid JSON and follows the expected structure
- **Missing Required Fields**: Check that all required fields are present in your module
- **Image Not Found**: Verify that the Docker image specified in `challengeImage` exists and is accessible
- **Installation Errors**: Check the error message displayed after installation fails

## Validation Checks

The Challenge Installer performs comprehensive validation checks on uploaded modules to ensure they meet all requirements. These checks include:

### JSON Structure Validation
- Verifies that the file contains valid JSON syntax
- Provides specific error messages pointing to syntax issues

### Module Properties Validation
- Ensures all required module properties (`moduleName`, `moduleDescription`, `author`, `version`, `createdAt`) are present
- Validates that the `createdAt` date is in proper ISO 8601 format
- Checks that all properties have the correct data types

### Challenge Validation
- Verifies that at least one challenge is included in the module
- Ensures each challenge has a unique name within the module
- Validates required challenge properties (`name`, `challengeImage`, `difficulty`, `challengeType`)
- Confirms that `difficulty` is one of the allowed values: "EASY", "MEDIUM", "HARD", or "VERY_HARD"
- Checks that optional properties have the correct data types

### App Configuration Validation
- Ensures each challenge has at least one app configuration
- Validates required app configuration properties (`appId`, `title`, `icon`, `width`, `height`, `screen`)
- Checks that numeric properties (`width`, `height`) are positive numbers
- Verifies that boolean properties (`disabled`, `favourite`, `desktop_shortcut`, `launch_on_startup`) are actual boolean values
- Validates that `additional_config` contains valid JSON if provided

### Question Validation
- Ensures each challenge has at least one question
- Validates required question properties (`content`, `type`, `points`, `answer`, `order`)
- Confirms that `type` is one of the allowed values: "text" or "flag"
- Checks that `points` is a positive number
- Verifies that `order` is a non-negative number
- Ensures question orders are unique within each challenge

### Error Reporting
- Provides detailed, specific error messages that identify exactly where validation failed
- Includes challenge names and indices in error messages for easy identification
- For nested objects (app configs, questions), includes the specific index and property that failed validation

These comprehensive validation checks help prevent errors during installation and ensure that all challenge modules meet the required format and structure before they are added to the database.

---

