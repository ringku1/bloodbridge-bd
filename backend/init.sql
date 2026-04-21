-- init.sql
--
-- This file is automatically executed by PostgreSQL when the Docker container
-- is created for the FIRST TIME (via docker-entrypoint-initdb.d/).
--
-- Why do we need this?
--   Prisma handles table creation via migrations, but PostGIS is a database
--   EXTENSION — it must be enabled before any geospatial queries can run.
--   "IF NOT EXISTS" makes it safe to run multiple times.

CREATE EXTENSION IF NOT EXISTS postgis;
