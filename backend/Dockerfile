FROM node:24-slim
WORKDIR /src

COPY package*.json ./
RUN npm ci
COPY . .
RUN node ace build && cd build && npm ci --omit=dev && mkdir -p tmp storage

WORKDIR /src/build
ENV NODE_ENV=production
# storage/ (Robinhood OAuth tokens) and tmp/ (SQLite) are volumes — see docker-compose.yml
CMD ["sh", "-c", "node ace migration:run --force && node bin/server.js"]
