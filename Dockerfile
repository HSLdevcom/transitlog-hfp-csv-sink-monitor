# syntax=docker/dockerfile:1
# check=error=true

FROM hsldevcom/infodevops-docker-base-images:1.1.0-24-node AS base

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update \
  && apt-get upgrade --assume-yes \
  && rm -rf /var/lib/apt/lists/*

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node ./package.json ./package-lock.json ./



FROM base AS installer
ENV NODE_ENV=development
RUN npm ci



FROM installer AS tester
COPY --chown=node:node . .
CMD ["npm", "run", "check-and-build"]



FROM base AS node_modules
ENV NODE_ENV=production
RUN npm ci --omit=dev



# Requires tsc.
FROM installer AS builder
ENV NODE_ENV=production
COPY --chown=node:node . .
RUN npm run build



# The base image should be the same as the base image of base. Yet using ARG for
# the base image irritates hadolint and might break Dependabot.
FROM hsldevcom/infodevops-docker-base-images:1.1.0-24-node AS production

ARG DEBIAN_FRONTEND=noninteractive
ENV NODE_ENV=production
# The monitors compare blob names and times in Finnish local time.
ENV TZ="Europe/Helsinki"

RUN apt-get update \
  && apt-get upgrade -y \
  && rm -rf /var/lib/apt/lists/*

USER node
RUN mkdir /home/node/app
WORKDIR /home/node/app
COPY \
  --chown=node:node \
  --from=builder \
  /home/node/app/build \
  ./build
COPY \
  --chown=node:node \
  --from=node_modules \
  /home/node/app/node_modules \
  ./node_modules
# Default configuration (cron schedules etc.); the deployment overrides the
# rest with environment variables.
COPY --chown=node:node .env.prod ./.env

ENTRYPOINT ["/usr/bin/tini", "--", "docker-entrypoint.sh"]
CMD ["node", "-r", "dotenv/config", "build/index.js"]
