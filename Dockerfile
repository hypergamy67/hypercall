FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY app.js index.html styles.css hyperanruf-logo.png server.js ./

ENV PORT=4173
EXPOSE 4173

CMD ["npm", "start"]
