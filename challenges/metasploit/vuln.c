#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <unistd.h>

void vuln_function(char *input) {
    char buffer[64];
    strcpy(buffer, input);
    printf("You entered: %s\n", buffer);
}

int main(int argc, char *argv[]) {
    if (argc != 2) {
        printf("Usage: %s <input>\n", argv[0]);
        exit(1);
    }

    printf("Running with EUID: %d\n", geteuid());
    vuln_function(argv[1]);
    return 0;
}
