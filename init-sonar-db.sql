-- Enable vector search extension on primary database
CREATE EXTENSION IF NOT EXISTS vector;

-- Create dedicated database for SonarQube owned by primary user
CREATE DATABASE sonar WITH OWNER devuser;

-- Grant full privileges on sonar database
GRANT ALL PRIVILEGES ON DATABASE sonar TO devuser;

-- Infisical secrets manager (shared postgres; also ensured by init-infisical-db)
CREATE DATABASE infisical WITH OWNER devuser;
GRANT ALL PRIVILEGES ON DATABASE infisical TO devuser;