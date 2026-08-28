# Borde HTTPS del VPS

Un solo Caddy para todo `maxisimonazzi.com.ar`: certificado, redirección a HTTPS
y ruteo por path. Detrás, cada herramienta es un contenedor con **su** nginx,
sin puertos publicados, colgado de la red Docker `edge`.

```
Internet ──443──> caddy (este compose)
                    ├── /grabador-lattice-webusb/*  ──> grabador-lattice:80  (nginx de la SPA)
                    └── /*                          ──> landing:80           (cuando exista)
```

Esta carpeta no depende del grabador. Está acá porque hoy es el único inquilino;
cuando haya dos o tres, movela a su propio repo (`vps-edge`) sin tocar nada más:
lo único compartido entre el borde y las apps es el nombre de la red y el alias
de cada contenedor.

## Primera vez en el VPS

```bash
docker network create edge
cd deploy/edge
docker compose up -d
```

Antes: DNS `A` (y `AAAA` si hay IPv6) de `maxisimonazzi.com.ar` **y** de
`www.maxisimonazzi.com.ar` a la IP del VPS, con 80 y 443 abiertos. Si el DNS
todavía no resuelve, Caddy no puede sacar el certificado; cuando resuelva:

```bash
docker compose restart caddy
```

## Agregar una herramienta

1. En el compose de la app: nada de `ports`, y un alias en la red `edge`
   (ver `docker-compose.edge.yml` del grabador).
2. En `Caddyfile`: un `handle /lo-que-sea/*` con `reverse_proxy <alias>:80`.
3. Recargar Caddy acá:
   `docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile`
   En caliente, sin cortar conexiones y sin tocar el certificado. **No sirve
   `docker compose up -d`**: el Caddyfile es un bind mount, la definición del
   servicio no cambia y Compose deja el contenedor como está.

Si la app es una SPA con URLs absolutas, compilala con su prefijo (`BASE_PATH`
en el grabador). La otra opción es `handle_path`, que recorta el prefijo antes
de mandarlo al backend, y sirve para apps que ya viven en la raíz y no saben
nada del path público.

## Qué no hacer

- `docker compose down -v`: el `-v` borra `caddy_data` y con eso el certificado.
  Let's Encrypt tiene límite de emisiones por semana.
- Publicar el 9090 (o cualquier puerto de app) en el VPS: el borde es la única
  puerta. Si el firewall solo deja pasar 80/443 ya está resuelto.
- Cloudflare en modo *Flexible*: el tramo CF→VPS iría en claro. **Full (strict)**.
