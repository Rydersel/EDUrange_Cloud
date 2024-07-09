#!/bin/bash

# Write the flag to a hidden file
password_file=/var/lib/dpkg/info/bandit7.password
echo $FLAG > $password_file
file_size=$(du -b "$password_file" | cut -f1)

echo "$file_size bytes in size" > /tmp/temp_readme

# Replace line 5 in README with the content of temp_readme
sed -i '6s/.*/'"$(cat /tmp/temp_readme)"'/' /home/challengeuser/readme

# Clean up temporary file
rm /tmp/temp_readme

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

/home/challengeuser/.cleanup.sh
