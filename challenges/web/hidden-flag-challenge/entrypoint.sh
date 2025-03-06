#!/bin/bash

# Check if FLAG environment variable is set
if [ -z "$FLAG" ]; then
    # Use a default flag for local testing
    FLAG="EDU-{test_flag_please_set_env_var}"
fi

# Insert the flag into the HTML comment in index.html
sed -i "s/FLAG_PLACEHOLDER/$FLAG/g" /usr/share/nginx/html/index.html

# Insert the flag into the secret.html file
sed -i "s/FLAG_PLACEHOLDER/$FLAG/g" /usr/share/nginx/html/secret.html

# Unset the FLAG environment variable for security
unset FLAG

# Start nginx
exec "$@" 