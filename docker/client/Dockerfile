FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY docker/client/package*.json ./docker/client/
RUN npm install
COPY . .
WORKDIR /app/docker/client
RUN npm run build

FROM nginx:1.27-alpine
COPY --from=build /app/docker/client/dist /usr/share/nginx/html
