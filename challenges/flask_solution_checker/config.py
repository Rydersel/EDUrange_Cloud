import os

username = os.environ.get("DB_USERNAME")
password = os.environ.get("DB_PASSWORD")
dbname = os.environ.get("DB_NAME")
host = "10.2.79.11"  # Adjust as necessary

class Config:
    SQLALCHEMY_DATABASE_URI = f"postgresql://{username}:{password}@{host}/{dbname}"
    SQLALCHEMY_TRACK_MODIFICATIONS = False
