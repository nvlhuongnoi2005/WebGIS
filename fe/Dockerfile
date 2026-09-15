FROM node:24-bookworm-slim AS build

WORKDIR /workspace

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build:fe

FROM nginx:1.27-alpine

COPY fe/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/fe/dist /usr/share/nginx/html

EXPOSE 8080
