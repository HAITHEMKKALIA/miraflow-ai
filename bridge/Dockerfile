FROM node:20-slim

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev || npm install --omit=dev

COPY src ./src

# Auth state Baileys persistant : monter un volume sur /app/auth
RUN mkdir -p /app/auth
VOLUME ["/app/auth"]

EXPOSE 3100
CMD ["node", "src/index.js"]
