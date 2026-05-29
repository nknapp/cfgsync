FROM debian:bookworm-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo unzip curl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deno.land/install.sh | DENO_INSTALL=/usr/local sh

ENV PATH="/usr/local/bin:${PATH}"

RUN groupadd my_group && \
    useradd -m -g my_group -s /bin/bash my_user && \
    echo "my_user ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/my_user && \
    chmod 0440 /etc/sudoers.d/my_user

#USER my_user
WORKDIR /home/my_user

