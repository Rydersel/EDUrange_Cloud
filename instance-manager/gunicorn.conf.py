import os
import logging
import sys

# Logging configuration
logconfig_dict = {
    'version': 1,
    'disable_existing_loggers': False,
    'formatters': {
        'concise': {
            'format': '%(asctime)s [%(levelname)s] %(message)s'
        },
    },
    'handlers': {
        'console': {
            'class': 'logging.StreamHandler',
            'formatter': 'concise',
            'stream': sys.stdout
        },
    },
    'root': {
        'handlers': ['console'],
        'level': 'INFO',
    },
    'loggers': {
        'gunicorn.error': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'gunicorn.access': {
            'handlers': ['console'],
            'level': 'WARNING',
            'propagate': False,
        },
        'kubernetes': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'kubernetes.client.rest': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        },
        'urllib3': {
            'handlers': ['console'],
            'level': 'ERROR',
            'propagate': False,
        }
    }
}

# Gunicorn config
bind = '0.0.0.0:8000'
workers = 1 # Set to one for now to avoid race conditions
worker_class = 'gevent'
timeout = 120
keepalive = 5
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
loglevel = 'info'
capture_output = True
enable_stdio_inheritance = True

# Prevent buffering of stdout/stderr
os.environ['PYTHONUNBUFFERED'] = '1'

def post_fork(server, worker):
    # Set up logging after fork
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        stream=sys.stdout
    )
