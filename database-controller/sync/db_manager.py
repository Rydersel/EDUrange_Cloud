import logging
import os
from prisma import Prisma
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class DatabaseManager:
    def __init__(self):
        # Use DIRECT_DATABASE_URL if available, otherwise fall back to DATABASE_URL
        self.direct_database_url = os.environ.get('DIRECT_DATABASE_URL')
        self.pooled_database_url = os.environ.get('DATABASE_URL')
        self.database_url = self.direct_database_url or self.pooled_database_url
        self.prisma = None

        if self.database_url:
            logging.info("Using database URL from environment variables")

            # Check if we're using PgBouncer and log warning if it's the primary URL
            if 'pgbouncer:6432' in self.database_url:
                if self.direct_database_url:
                    logging.info("Using direct PostgreSQL connection")
                else:
                    logging.warning("Using PgBouncer connection pool in the DATABASE_URL. This may cause issues with Prisma schema operations.")
                    logging.warning("Consider setting DIRECT_DATABASE_URL to point directly to PostgreSQL.")
        else:
            logging.warning("No database URL found in environment variables")

    async def connect(self):
        """Connect to the Prisma database"""
        try:
            # First try with direct connection if available
            if self.direct_database_url:
                logging.info("Attempting to connect with direct PostgreSQL URL")
                self.prisma = Prisma(datasource={'url': self.direct_database_url})
            else:
                # If no direct URL available, use the pooled URL
                logging.info("No direct URL available, using pooled connection")
                self.prisma = Prisma(datasource={'url': self.database_url})
                
            await self.prisma.connect()
            logging.info("Connected to Prisma database")
            return self.prisma
        except Exception as e:
            # If direct connection fails and we have a pooled URL that's different, try that as fallback
            if self.direct_database_url and self.pooled_database_url and self.direct_database_url != self.pooled_database_url:
                logging.warning(f"Direct database connection failed: {str(e)}")
                logging.info("Falling back to pooled connection via PgBouncer")
                try:
                    self.prisma = Prisma(datasource={'url': self.pooled_database_url})
                    await self.prisma.connect()
                    logging.info("Connected to Prisma database using fallback connection")
                    return self.prisma
                except Exception as fallback_error:
                    logging.error(f"Fallback connection also failed: {str(fallback_error)}")
                    raise
            else:
                logging.error(f"Database connection failed: {str(e)}")
                raise

    async def disconnect(self):
        """Disconnect from the Prisma database"""
        if self.prisma:
            await self.prisma.disconnect()
            logging.info("Disconnected from Prisma database")

    async def get_challenge_instances(self):
        """Get all challenge instances from the database"""
        if not self.prisma:
            raise Exception("Database not connected")
        return await self.prisma.challengeinstance.find_many()

    async def find_challenge_by_name(self, challenge_name):
        """Find a challenge by name or formatted ID"""
        if not self.prisma:
            raise Exception("Database not connected")
            
        # First try direct lookup by name
        challenge = await self.prisma.challenge.find_first(
            where={'name': challenge_name}
        )
        
        if challenge:
            return challenge
            
        # Try to format the name to match ID pattern
        formatted_id = challenge_name.lower().replace(' ', '-').replace('-level-', '-')
        formatted_id = formatted_id.replace('level-', '')
        
        # Try to find by formatted ID
        challenge = await self.prisma.challenge.find_first(
            where={'id': formatted_id}
        )
        
        return challenge

    async def find_or_create_default_competition(self):
        """Find the default competition or create it if it doesn't exist"""
        if not self.prisma:
            raise Exception("Database not connected")
            
        # Try to find default competition
        default_competition = await self.prisma.competitiongroup.find_first(
            where={'name': 'Default Competition'}
        )
        
        if default_competition:
            logging.info(f"Found default competition with ID: {default_competition.id}")
            return default_competition
            
        # Create default competition if it doesn't exist
        try:
            from datetime import datetime
            default_competition = await self.prisma.competitiongroup.create(
                data={
                    'name': 'Default Competition',
                    'description': 'Default competition for standalone challenges',
                    'startDate': datetime.now(),
                }
            )
            logging.info(f"Created default competition with ID: {default_competition.id}")
            return default_competition
        except Exception as e:
            logging.error(f"Failed to create default competition: {e}")
            
            # If we can't create a default competition, try to find any competition
            any_competition = await self.prisma.competitiongroup.find_first()
            if any_competition:
                logging.info(f"Using existing competition with ID: {any_competition.id}")
                return any_competition
            else:
                logging.error("No competitions found in database. Cannot proceed.")
                raise Exception("No valid competition found")
