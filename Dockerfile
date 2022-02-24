FROM node:14-alpine AS base

ENV WORK /opt/transitlog-hfp-csv-sink-monitor

WORKDIR ${WORK}

# Create app directory
RUN mkdir -p ${WORK}

# Copy files to app directory
COPY . ${WORK}

# Bundle app source
RUN yarn install && yarn run build

FROM node:14-alpine
ENV WORK /opt/transitlog-hfp-csv-sink-monitor
ENV TZ="Europe/Helsinki"

WORKDIR ${WORK}

RUN mkdir -p ${WORK}/build
# Copy build folder from previous stage
COPY --from=base ${WORK}/build ${WORK}/build/
# Copy the .env.<environment> file as .env
COPY .env.prod ${WORK}/.env
COPY yarn.lock package.json ${WORK}/

RUN yarn install --production=true && yarn cache clean

CMD yarn run start:production
