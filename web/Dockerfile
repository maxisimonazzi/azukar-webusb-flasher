# Build de la SPA y nginx. Contexto = raíz del repo.
# Replica web/ + boards/ para que ../../../boards y el alias @boards
# resuelvan igual que en el árbol local.
FROM node:22-bookworm-slim AS build

WORKDIR /src
COPY web/package.json web/package.json
WORKDIR /src/web
RUN npm install

WORKDIR /src
COPY web ./web
COPY boards ./boards
WORKDIR /src/web
RUN npm run build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
