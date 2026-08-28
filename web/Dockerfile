# Build de la SPA y nginx. Contexto = raíz del repo.
# Replica web/ + boards/ para que ../../../boards y el alias @boards
# resuelvan igual que en el árbol local.
#
# BASE_PATH = prefijo público donde se sirve la app, sin barra final.
#   ""                         -> https://dominio/
#   "/grabador-lattice-webusb" -> https://dominio/grabador-lattice-webusb/
# Entra dos veces: como `base` de Vite (las URLs que escribe el HTML) y como
# subcarpeta del docroot de nginx. Es de build: cambiarlo exige rebuild.
FROM node:22-bookworm-slim AS build

WORKDIR /src
COPY web/package.json web/package.json
WORKDIR /src/web
RUN npm install

WORKDIR /src
COPY web ./web
COPY boards ./boards
WORKDIR /src/web
ARG VITE_ALLOWED_IMPORT_EXTENSIONS=v,pcf,txt,hex
ENV VITE_ALLOWED_IMPORT_EXTENSIONS=$VITE_ALLOWED_IMPORT_EXTENSIONS
ARG BASE_PATH=""
ENV VITE_BASE_PATH=$BASE_PATH/
RUN npm run build

FROM nginx:1.27-alpine

ARG BASE_PATH=""

COPY web/nginx.conf /etc/nginx/conf.d/default.conf

# La página "Welcome to nginx" no llega a producción.
RUN rm -f /usr/share/nginx/html/index.html /usr/share/nginx/html/50x.html

COPY --from=build /src/web/dist /usr/share/nginx/html${BASE_PATH}/
COPY --from=build /src/web/node_modules/@yowasp/yosys /usr/share/nginx/html${BASE_PATH}/yowasp/yosys
COPY --from=build /src/web/node_modules/@yowasp/nextpnr-ice40 /usr/share/nginx/html${BASE_PATH}/yowasp/nextpnr-ice40

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
