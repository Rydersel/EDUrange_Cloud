import os


# Can't decide if it would be beneficial to have each challenge be its own class or not

def create_disk_image(output_path="challenge_1/disk_image.bin", message="flag{ryder}"):
    # Creates a binary disk image containing randomized data, a hidden message, and more fluff data.

    os.makedirs(os.path.dirname(output_path), exist_ok=True)

    with open(output_path, 'wb') as f:
        # Fluff
        f.write(os.urandom(1024))  # 1024 bytes of random data

        # Encode and write the secret message
        f.write(message.encode())

        # Fluff
        f.write(os.urandom(1024))



