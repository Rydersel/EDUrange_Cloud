#!/bin/bash

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="EDU-{javascript_secrets_exposed}"
fi

# Insert the flag into the JavaScript file
sed -i "s/FLAG_PLACEHOLDER/$FLAG/g" /usr/share/nginx/html/script.js

# Unset the FLAG environment variable for security
unset FLAG

# Start nginx
exec "$@" 