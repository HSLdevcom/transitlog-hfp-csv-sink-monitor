require('dotenv').config()

import schedule from 'node-schedule'
import { BlobServiceClient } from '@azure/storage-blob'
import got from 'got';
import { format, getHours, subDays, subHours } from "date-fns";
import {
    HFP_STORAGE_CONNECTION_STRING,
    HFP_STORAGE_CONTAINER_NAME,
    HFP_MONITOR_CRON,
    HFP_MONITOR_SLACK_WEBHOOK_URL,
    HFP_MONITOR_SLACK_USER_IDS
} from './constants.js'

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

    let regex0 = getHfpBlobNameRegex(0)
    let regex1 = getHfpBlobNameRegex(1)

    let matchingRegex = null
    let foundBlobName = null
    for await (const blob of storageClient.findBlobsByTags(
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday >= '${yesterdayDateStr}'`
    )) {
        // Now we need to find at least one blob with name having curr/prev hour
        if (regex0.test(blob.name)) {
            matchingRegex = regex0
            foundBlobName = blob.name
            break;
        }
        if (regex1.test(blob.name)) {
            matchingRegex = regex1
            foundBlobName = blob.name
            break;
        }
    }
    if (matchingRegex) {
        let dateStr = format(new Date, "dd.MM.yyyy HH:mm")
        console.log(`[${dateStr}] Found a blob with name: ${foundBlobName} with matching regex: ${matchingRegex}`)
    } else {
        let message = `Critical alert: HFP sink might be down, did not receive any data from HFP-sink within 2 hours (did not find HFP blobs with name matching pattern: ${regex0} or ${regex1}). Investigate and fix the problem as soon as possible.`
        await alertSlack(message)
    }
}

function getHfpBlobNameRegex(minusHours) {
    let date = minusHours > 0 ? subHours(new Date(), minusHours) : new Date()
    let hourString = getHours(date).toString().padStart(2, '0')
    let dateString = format(date, 'yyyy-MM-dd')
    return new RegExp(`${dateString}T${hourString}.*csv.zst`)
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