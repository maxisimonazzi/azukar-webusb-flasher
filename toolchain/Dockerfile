# Imagen de síntesis iCE40. Versiones: lo que Debian Trixie publique
# (Yosys ~0.52, nextpnr 0.7). Sin Icarus, sin USB, sin Docker-in-Docker.
FROM debian:trixie-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    yosys \
    nextpnr-ice40 \
    fpga-icestorm \
    python3 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --system --uid 1000 --home-dir /tmp --shell /usr/sbin/nologin compiler

WORKDIR /work
USER compiler

# El HTTP de compile llega más adelante. Por ahora la imagen solo existe.
CMD ["sleep", "infinity"]
