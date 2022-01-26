# transitlog-hfp-csv-sink-monitor

### Setup locally

Copy `.env.prod` as `.env` and fill in the secrets

Install node modules with `yarn`

### Start the monitor

`yarn run start`

### Deploy for production

Push for production branch and image with prod tag will be pushed into `hsldevcom/transitlog-hfp-csv-sink-monitor:prod`

To deploy image for use, you have to run deployment from `hsl gitlab/transitlog-sink-stage-prod-deploy`