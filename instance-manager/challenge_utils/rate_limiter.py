from datetime import datetime, timedelta
import logging

class SimpleRateLimiter:
    """
    A rate limiter that can use either Redis or memory for storage.
    Provides a way to limit how many requests a user can make in a given time period.
    """
    def __init__(self, redis_client=None, key_prefix="rate_limit", points=20, duration=60, block_duration=120):
        """
        Initialize a new rate limiter.
        
        Args:
            redis_client: Redis client instance or None to use memory-based storage
            key_prefix: Prefix for Redis keys
            points: Number of requests allowed in the duration
            duration: Time window in seconds
            block_duration: Time in seconds to block if limit is exceeded
        """
        self.redis_client = redis_client
        self.key_prefix = key_prefix
        self.points = points
        self.duration = duration
        self.block_duration = block_duration
        self.use_redis = redis_client is not None
        self._memory_store = {}  # Used for in-memory rate limiting

    def consume(self, key):
        """
        Consume a point from the rate limit.
        
        Args:
            key: Identifier for the rate limit (e.g., user ID or IP)
            
        Returns:
            True if the request is allowed, raises Exception if limit exceeded
            
        Raises:
            Exception: If rate limit is exceeded
        """
        if self.use_redis:
            return self._consume_redis(key)
        else:
            return self._consume_memory(key)

    def _consume_redis(self, key):
        # Check if user is blocked
        block_key = f"{self.key_prefix}:{key}:block"
        if self.redis_client.exists(block_key):
            block_ttl = self.redis_client.ttl(block_key)
            raise Exception(f"Rate limit exceeded. Try again later.")

        # Get or create counter
        counter_key = f"{self.key_prefix}:{key}"
        current = self.redis_client.get(counter_key)

        if current is None:
            # First request, set counter to 1 with expiration
            self.redis_client.setex(counter_key, self.duration, 1)
            return True

        current = int(current)
        if current >= self.points:
            # Block the user
            self.redis_client.setex(block_key, self.block_duration, 1)
            raise Exception(f"Rate limit exceeded. Try again later.")

        # Increment the counter
        self.redis_client.incr(counter_key)
        return True

    def _consume_memory(self, key):
        now = datetime.now()

        # Check if user is blocked
        if key in self._memory_store.get('blocks', {}):
            expiration = self._memory_store['blocks'][key]
            if now < expiration:
                seconds_remaining = (expiration - now).total_seconds()
                raise Exception(f"Rate limit exceeded. Try again in {int(seconds_remaining)} seconds.")
            else:
                # Remove expired block
                del self._memory_store['blocks'][key]

        # Initialize memory store if needed
        if 'counters' not in self._memory_store:
            self._memory_store['counters'] = {}
        if 'blocks' not in self._memory_store:
            self._memory_store['blocks'] = {}

        # Get or create counter
        if key not in self._memory_store['counters']:
            self._memory_store['counters'][key] = {
                'count': 1,
                'reset_at': now + timedelta(seconds=self.duration)
            }
            return True

        counter = self._memory_store['counters'][key]

        # Reset if expired
        if now > counter['reset_at']:
            counter['count'] = 1
            counter['reset_at'] = now + timedelta(seconds=self.duration)
            return True

        # Check if limit exceeded
        if counter['count'] >= self.points:
            # Block the user
            self._memory_store['blocks'][key] = now + timedelta(seconds=self.block_duration)
            raise Exception(f"Rate limit exceeded. Try again later.")

        # Increment the counter
        counter['count'] += 1
        return True

    def get_token_count(self, key):
        """
        Get remaining tokens for a key
        
        Args:
            key: Identifier for the rate limit
            
        Returns:
            Number of remaining requests allowed in the current window
        """
        if self.use_redis:
            counter_key = f"{self.key_prefix}:{key}"
            current = self.redis_client.get(counter_key)
            if current is None:
                return self.points
            return self.points - int(current)
        else:
            if key not in self._memory_store.get('counters', {}):
                return self.points
            return self.points - self._memory_store['counters'][key]['count'] 