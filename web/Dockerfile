# Build de la SPA y nginx. Contexto = raíz del repo.
#   docker build -f web/Dockerfile .
FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY web/package.json ./
RUN npm install

COPY web/ ./
COPY boards ./boards
RUN npm run build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
