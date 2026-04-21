# Dockerfile
#
# Multi-stage is overkill for dev. This is a simple single-stage image.
#
# Layer ordering matters for Docker cache:
#   Copy package.json FIRST → install deps → then copy source code.
#   This way "npm install" only re-runs when package.json changes,
#   not every time you edit a .js file.

FROM node:20-alpine

WORKDIR /app

# Step 1: install dependencies (cached unless package.json changes)
COPY package*.json ./
RUN npm install

# Step 2: generate Prisma client from schema (must happen before running server)
COPY prisma ./prisma
RUN npx prisma generate

# Step 3: copy all source code
COPY . .

EXPOSE 3000

# Use nodemon in container so code changes are picked up without rebuilding image
CMD ["npm", "run", "dev"]
