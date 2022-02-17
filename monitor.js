require('dotenv').config()

import schedule from 'node-schedule'
import {BlobClient, BlobServiceClient} from '@azure/storage-blob'
import got from 'got';
import {format, getHours, getUnixTime, subDays, subHours} from "date-fns";
import {
    HFP_MONITOR_CRON,
    HFP_MONITOR_SLACK_USER_IDS,
    HFP_MONITOR_SLACK_WEBHOOK_URL,
    HFP_STORAGE_CONNECTION_STRING,
    HFP_STORAGE_CONTAINER_NAME
} from './constants.js'

const MONITOR_BLOB_NAME_WITHIN_HOURS=12
const MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS=1

export function scheduleMonitor() {
    if (!HFP_MONITOR_CRON) {
        throw new Error('HFP_MONITOR_CRON ENV variable is missing.')
    }

    console.log(`Scheduled monitor with cron: ${HFP_MONITOR_CRON}`);

    let job = schedule.scheduleJob(HFP_MONITOR_CRON, runHfpSinkMonitor)
    if (job) {
        console.log('Next monitoring will run:', job.nextInvocation().toLocaleString())
    }
}

/**
 * Designed to run AFTER HFP-data has been updated. Currently HFP-data gets
 * updated every 45 min so we should run the monitor every 50 min.
 */
async function runHfpSinkMonitor() {
    if (!HFP_STORAGE_CONNECTION_STRING) {
        throw new Error('Secret HFP_STORAGE_CONNECTION_STRING is missing.')
    }
    if (!HFP_STORAGE_CONTAINER_NAME) {
        throw new Error('Secret HFP_STORAGE_CONTAINER_NAME is missing.')
    }

    console.log(`Running HFP sink monitor for container: ${HFP_STORAGE_CONTAINER_NAME}`)

    let storageClient = BlobServiceClient.fromConnectionString(HFP_STORAGE_CONNECTION_STRING)

    let yesterdayDateStr = format(subDays(new Date(), 1), 'yyyy-MM-dd')

    let blobNameMatchingRegexList = []
    for (let i = 0; i < MONITOR_BLOB_NAME_WITHIN_HOURS; i++) {
        blobNameMatchingRegexList.push(getHfpBlobNameSubHoursRegex(i))
    }

    let matchingRegex = null
    let foundBlobName = null
    // List of uniqueBlobNamesObjects: { blobName, parsedBlobName }
    let uniqueBlobNamesObjects = []
    for await (const blob of storageClient.findBlobsByTags(
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday >= '${yesterdayDateStr}'`
    )) {
        // CHECK 1: Find at least one blob with name within MONITOR_BLOB_NAME_WITHIN_HOURS
        if (!matchingRegex && blobNameMatchingRegexList.some((regex) => regex.test(blob.name))) {
            matchingRegex = regex
            foundBlobName = blob.name
        }

        // Create unique list of blob name objects
        let parsedBlobName = parseUniqueBlobName(blob.name)
        if (!uniqueBlobNamesObjects.some((b) => b.parsedBlobName === parsedBlobName)) {
            uniqueBlobNamesObjects.push({ blobName: blob.name, parsedBlobName })
        }
    }

    // CHECK 2: Find at least one blob with lastModified within MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS
    let isAnyBlobLastModifiedOk = false
    for (let blobNameObject of uniqueBlobNamesObjects) {
        let blobName = blobNameObject.blobName
        let blobClient = new BlobClient(HFP_STORAGE_CONNECTION_STRING, HFP_STORAGE_CONTAINER_NAME, blobName)
        let blobProperties = await blobClient.getProperties()

        let blobDate = new Date(blobProperties.lastModified)
        let minDate = subHours(new Date(), MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS)
        if (getUnixTime(blobDate) > getUnixTime(minDate)) {
            isAnyBlobLastModifiedOk = true
            break
        }
    }

    let alertMessage = 'Critical alert: HFP sink [PRODUCTION] might be down. '
    let alertMessageEnd = 'Investigate and fix the problem as soon as possible.'
    if (!isAnyBlobLastModifiedOk) {
        alertMessage += `Did not find any blob with lastModified within ${MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS} hours. `
        alertMessage += alertMessageEnd
    } else if (!matchingRegex) {
        alertMessage = `Did not find any blob with name within ${MONITOR_BLOB_NAME_WITHIN_HOURS} hours. `
        alertMessage += alertMessageEnd
    } else {
        let dateStr = format(new Date, "dd.MM.yyyy HH:mm")
        console.log(`[${dateStr}] Found a blob with name: ${foundBlobName} with matching regex: ${matchingRegex}`)
        alertMessage = null
    }

    if (alertMessage) {
        await alertSlack(alertMessage)
    }
}

// Current blob name format is yyyy-MM-ddTHH-[0-9]
function parseUniqueBlobName(blobName) {
    let nameParts = blobName.split('T')
    let dateString = nameParts[0]
    let hours = nameParts[1].substring(0, 4)
    return dateString+hours
}

function getHfpBlobNameSubHoursRegex(minusHours) {
    let date = minusHours > 0 ? subHours(new Date(), minusHours) : new Date()
    let hourString = getHours(date).toString().padStart(2, '0')
    let dateString = format(date, 'yyyy-MM-dd')
    return new RegExp(`${dateString}T${hourString}-*.*csv.zst`)
}

async function alertSlack(message) {
    const mentionUserIds = HFP_MONITOR_SLACK_USER_IDS.split(',')
    const fullMessage = `${
        mentionUserIds.length > 0 ? `Hey${mentionUserIds.map((userId) => ` <@${userId}>`)}, ` : ''
    } ${message}`

    console.log('Sending a message to slack: ', fullMessage)

    const body = {
        type: 'mrkdwn',
        text: fullMessage,
    };

    return got(HFP_MONITOR_SLACK_WEBHOOK_URL, {
        method: 'post',
        json: body,
    });

}

scheduleMonitor()
