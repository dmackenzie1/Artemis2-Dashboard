FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY docker/server/package*.json ./docker/server/
RUN npm install
COPY . .
WORKDIR /app/docker/server
RUN npm run build
EXPOSE 4000
CMD ["node", "dist/index.js"]
