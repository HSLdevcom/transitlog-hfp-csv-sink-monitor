
#!/bin/bash
set -e

ORG=${ORG:-hsldevcom}

DOCKER_TAG=prod
DOCKER_IMAGE=$ORG/transitlog-hfp-csv-sink-monitor:${DOCKER_TAG}

docker build -t $DOCKER_IMAGE .
docker push $DOCKER_IMAGE