# transitlog-hfp-csv-sink-monitor

### Setup locally

Copy `.env.prod` as `.env` and fill in the secrets

Install node modules with `yarn`

### Start the monitor

`yarn run start`

### Deploy for production

Push for `production` branch and image with prod tag will be pushed into `hsldevcom/transitlog-hfp-csv-sink-monitor:prod`

You can inspect the image from https://hub.docker.com/repository/docker/hsldevcom/transitlog-hfp-csv-sink-monitor

To deploy image for use, you have to run deployment from `hsl gitlab/transitlog-sink-stage-prod-deploy`

Note: monitor secrets are set from that deploy repository.
