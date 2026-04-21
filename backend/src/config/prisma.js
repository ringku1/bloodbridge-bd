// config/prisma.js
//
// Exports a single shared PrismaClient instance.
//
// Why a single instance?
//   PrismaClient maintains a connection pool to PostgreSQL.
//   If you do `new PrismaClient()` in every file, you'll open
//   too many connections and hit the DB's connection limit.
//   One shared instance = one managed pool.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient({
  // In development, log every SQL query so you can see what Prisma generates.
  // In production, only log errors to avoid noise.
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

module.exports = prisma;
