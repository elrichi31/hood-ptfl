FROM node:24-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci
COPY . .
# lib/auth.ts opens storage/auth.db at import time, so the dir must exist during build too
RUN mkdir -p storage && npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["npm", "start"]
