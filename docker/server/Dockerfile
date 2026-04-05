FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
COPY backend/package*.json ./backend/
RUN npm install
COPY . .
WORKDIR /app/backend
RUN npm run build
EXPOSE 4000
CMD ["npm", "run", "start"]
