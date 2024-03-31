import hashlib

SECRET_SALT = "YourConstantSaltHere"

def generate_flag(user_id, challenge_id):
    seed = f"{user_id}-{challenge_id}-{SECRET_SALT}"
    flag = hashlib.sha256(seed.encode()).hexdigest()
    return flag[:8]  # Use the first 8 characters for simplicity

def verify_flag(user_id, challenge_id, user_flag):
    correct_flag = generate_flag(user_id, challenge_id)
    return user_flag == correct_flag
