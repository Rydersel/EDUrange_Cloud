#!/bin/bash

# Create a flag file from environment variable or default
if [ -z "$TARGET_FLAG" ]; then
    echo "TARGET_FLAG environment variable not set, using default flag"
    FLAG="CTF{M3taspl0it_SSH_Brut3f0rc3_Mast3r}"
else
    FLAG="$TARGET_FLAG"
fi

# Create the flag file in the target user's home directory
echo "$FLAG" > /home/target/flag.txt
chown target:target /home/target/flag.txt
chmod 400 /home/target/flag.txt

# Create a hint file
cat > /home/target/README.txt << EOF
Congratulations on finding this user account!

To complete this challenge, find the flag in this user's home directory.
The flag is in the format CTF{...}

Hint: Try looking for hidden files or files with restricted permissions.
EOF

chown target:target /home/target/README.txt
chmod 644 /home/target/README.txt

echo "Flag has been set up successfully." 