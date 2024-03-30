#!/bin/bash
# check_solution.sh

echo "Enter your solution:"
read SOLUTION

CORRECT_FLAG=$(cat /flag.txt)

if [ "$SOLUTION" == "$CORRECT_FLAG" ]; then
    echo "Correct! Well done."
else
    echo "Incorrect. Try again."
fi
