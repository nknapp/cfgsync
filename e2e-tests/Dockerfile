FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo unzip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

ENV PATH="/usr/local/bin:${PATH}"

RUN groupadd --gid 1000 user && \
    useradd --uid 1000 -m -g user -s /bin/bash cfgsync_user && \
    echo "cfgsync_user ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/cfgsync_user && \
    chmod 0440 /etc/sudoers.d/cfgsync_user && \
    mkdir -p /home/cfgsync_user/e2e-test-tmp && \
    chown cfgsync_user:user /home/cfgsync_user/e2e-test-tmp

USER cfgsync_user
WORKDIR /home/cfgsync_user
