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
ARG VITE_ALLOWED_IMPORT_EXTENSIONS=v,pcf,txt
ENV VITE_ALLOWED_IMPORT_EXTENSIONS=$VITE_ALLOWED_IMPORT_EXTENSIONS
RUN npm run build

FROM nginx:1.27-alpine

COPY web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /src/web/dist /usr/share/nginx/html
COPY --from=build /src/web/node_modules/@yowasp/yosys /usr/share/nginx/html/yowasp/yosys
COPY --from=build /src/web/node_modules/@yowasp/nextpnr-ice40 /usr/share/nginx/html/yowasp/nextpnr-ice40

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
