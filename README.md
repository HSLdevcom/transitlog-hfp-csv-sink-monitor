# transitlog-hfp-csv-sink-monitor

[![CI/CD](https://github.com/HSLdevcom/transitlog-hfp-csv-sink-monitor/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/HSLdevcom/transitlog-hfp-csv-sink-monitor/actions/workflows/ci-cd.yml)

Monitors the HFP CSV sink and alerts on Slack when something looks wrong:

- current day: recent HFP blobs exist in Azure Blob Storage
- previous day: no gaps in yesterday's quarter-hour blobs
- Pulsar backlog of the `transitlog_hfp_csv_sink` subscription

### Setup locally

Requires Node.js 24.

Copy `.env.prod` as `.env` and fill in the secrets.

Install node modules with `npm ci`.

### Start the monitor

`npm start`

### Check and test

`npm run check-and-build` runs the type check, Prettier, the tests (with coverage) and the build.
`npm run prettier` formats the code.

### Build and deploy

CI/CD uses the shared workflow from
[transitdata-shared-workflows](https://github.com/HSLdevcom/transitdata-shared-workflows).
The Docker image is based on the shared InfoDevOps Node base image.

- Every merge to `main` publishes `hsldevcom/transitlog-hfp-csv-sink-monitor:edge`.
- A version tag `vX.Y.Z` publishes `hsldevcom/transitlog-hfp-csv-sink-monitor:X.Y.Z`.

You can inspect the images at https://hub.docker.com/r/hsldevcom/transitlog-hfp-csv-sink-monitor

The deployment and its secrets live in the Azure DevOps repository `transitlog-aks-workload`
(`manifests/transitlog-hfp-csv-sink-monitor.yaml`).
