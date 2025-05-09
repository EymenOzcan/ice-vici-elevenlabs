FROM --platform=linux/amd64 node:20-bullseye
RUN apt-get update
RUN apt-get -y install ffmpeg
RUN apt-get -y install libarchive-tools
RUN apt-get -y install git
RUN apt-get -y install curl
RUN apt-get -y install gnupg
RUN apt-get -y install nano
RUN npm install -g pnpm

# LLVM prereqs
RUN apt-get -qq update; \
    apt-get install -qqy --no-install-recommends \
        gnupg2 wget ca-certificates apt-transport-https \
        autoconf automake cmake dpkg-dev file make patch libc6-dev && \
    rm -rf /var/lib/apt/lists/*

RUN mkdir -p /app/node_modules && chown -R node:node /app

WORKDIR /app

COPY package*.json ./

#USER node
USER root
RUN npm install

#COPY --chown=node:node . .
COPY . .


# Start the server by default, this can be overwritten at runtime
EXPOSE 3000
EXPOSE 15000-15020

CMD [ "node", "app.cjs" ]


