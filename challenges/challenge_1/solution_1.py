def extract_answer(input_path="challenge_1/disk_image.bin"):

    with open(input_path, 'rb') as f:
        # Reads the entire disk image into memory
        data = f.read()

    # Assuming the message starts with 'flag{' and ends with '}'
    start = data.find(b'flag{')
    end = data.find(b'}', start) + 1

    if start != -1 and end != -1:
        # Decode and print answer
        message = data[start:end].decode()
        print("Hidden message found:", message)
        return message
    else:
        print("Error: Failed to decrypt flag")


