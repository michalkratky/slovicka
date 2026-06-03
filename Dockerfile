FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

RUN mkdir -p /data

ENV NODE_ENV=production
ENV DATA_DIR=/data
ENV PORT=3000

EXPOSE 3000

CMD ["sh", "-c", "if [ -f \"$DATA_DIR/database.db\" ]; then node database/migrate.js --skip-words; else node database/migrate.js; fi && node server.js"]
