FROM node:16-alpine

ENV WORK /opt/transitlog-hfp-csv-sink-monitor

ENV TZ="Europe/Helsinki"

# Create app directory
RUN mkdir -p ${WORK}
WORKDIR ${WORK}

# Install app dependencies
COPY yarn.lock ${WORK}
COPY package.json ${WORK}
RUN yarn

# Bundle app source
COPY . ${WORK}

COPY .env ${WORK}/.env

CMD yarn run start