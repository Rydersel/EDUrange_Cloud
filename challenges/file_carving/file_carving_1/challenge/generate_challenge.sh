#!/bin/bash
# generate_challenge.sh

FLAG="CTF{file_carving_$(openssl rand -hex 4)}"
echo "This is a challenge file. Find the hidden flag." > challenge.txt
echo "The flag is: $FLAG" >> challenge.txt
echo $FLAG > /flag.txt
