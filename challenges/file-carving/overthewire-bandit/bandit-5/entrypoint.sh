#!/bin/bash

# Write the flag to a hidden file
mkdir /home/challengeuser/inhere && \

cd /home/challengeuser/inhere

for i in {00..19}; do
    # Construct the folders
    foldername="maybehere$i"
    mkdir $foldername
    cd $foldername
    # Construct the files
    for j in {00..03}; do 
        dotname=".file$j"
        base64 /dev/urandom | head -c 1000 > "./$dotname"
        dashname="-file$j"
        base64 /dev/urandom | head -c 1000 > "./$dashname"
        spacename="spaces file$j"
        base64 /dev/urandom | head -c 1000 > "./$spacename"
    done
    cd ..
done

password_file=/home/challengeuser/inhere/maybehere07/.file02
echo $FLAG > $password_file
file_size=$(du -b "$password_file" | cut -f1)

echo "$file_size bytes in size" > /tmp/temp_readme

# Replace line 5 in README with the content of temp_readme
sed -i '5s/.*/'"$(cat /tmp/temp_readme)"'/' /home/challengeuser/readme

# Clean up temporary file
rm /tmp/temp_readme

# Prevent use of debuggers to pull env value (hopefully)
unset FLAG

/home/challengeuser/.cleanup.sh
