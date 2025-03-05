#!/bin/bash

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="EDU-{html_comments_are_not_secure}"
fi

# Insert the flag into the HTML comment in index.html
sed -i "s/FLAG_PLACEHOLDER/$FLAG/g" /usr/share/nginx/html/index.html

# Unset the FLAG environment variable for security
unset FLAG

# Start nginx
exec "$@" 