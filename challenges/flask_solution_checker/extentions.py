#quick fix to prevent circular imports

from flask_sqlalchemy import SQLAlchemy
db = SQLAlchemy()
