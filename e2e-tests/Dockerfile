FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo unzip curl ca-certificates faketime \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

ENV PATH="/usr/local/bin:${PATH}"

RUN groupadd --gid 1000 user && \
    useradd --uid 1000 -m -g user -s /bin/bash user && \
    echo "user ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/user && \
    chmod 0440 /etc/sudoers.d/user

USER user
WORKDIR /home/user

COPY --chown=user:user deno.json deno.lock /tmp/deno-cache/
RUN echo 'import { assertEquals } from "@std/assert";' > /tmp/deno-cache/dummy.ts && \
    deno cache --config /tmp/deno-cache/deno.json /tmp/deno-cache/dummy.ts && \
    rm -rf /tmp/deno-cache
