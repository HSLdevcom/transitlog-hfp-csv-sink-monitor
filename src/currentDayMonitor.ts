require('dotenv').config()

import {BlobClient, BlobServiceClient} from '@azure/storage-blob'
import {format, getHours, getUnixTime, subDays, subHours} from "date-fns";
import { alertSlack } from './alertSlack';
import {HFP_STORAGE_CONNECTION_STRING, HFP_STORAGE_CONTAINER_NAME} from './constants'
import { ensureSecretExists } from './utils';

const MONITOR_BLOB_NAME_WITHIN_HOURS=12
const MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS=4

const DATE_FORMAT = 'yyyy-MM-dd'

/**
 * Designed to run AFTER HFP-data has been updated. Currently HFP-data gets
 * updated every 45 min so we should run the monitor every 50 min.
 */
export async function runCurrentDayMonitor() {
    try {
        await currentDayMonitor()
    } catch(e) {
        let alertMessage = 'Something bad happened. There seems to be an issue with monitoring HFP-data. Investigate and fix the problem.'
        console.log('Something bad happened ', e)
        await alertSlack(alertMessage)
    }
}

async function currentDayMonitor() {
    ensureSecretExists(HFP_STORAGE_CONNECTION_STRING, 'HFP_STORAGE_CONNECTION_STRING')
    ensureSecretExists(HFP_STORAGE_CONTAINER_NAME, 'HFP_STORAGE_CONTAINER_NAME')

    console.log(`Running HFP sink current day monitor for container: ${HFP_STORAGE_CONTAINER_NAME}`)

    let storageClient = BlobServiceClient.fromConnectionString(HFP_STORAGE_CONNECTION_STRING)

    let minOdayDateStr = format(subDays(new Date(), 4), DATE_FORMAT)

    let blobNameMatchingRegexList: RegExp[] = []
    for (let i = 0; i < MONITOR_BLOB_NAME_WITHIN_HOURS; i++) {
        blobNameMatchingRegexList.push(getHfpBlobNameSubHoursRegex(i))
    }

    let foundBlobName: string | null = null

    interface UniqueBlobName {
        blobName: string
        parsedBlobName: string
    }
    let uniqueBlobNamesObjects: UniqueBlobName[] = []
    for await (const blob of storageClient.findBlobsByTags(
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday >= '${minOdayDateStr}'`
    )) {
        // CHECK 1: Find at least one blob with name within MONITOR_BLOB_NAME_WITHIN_HOURS
        if (!foundBlobName && blobNameMatchingRegexList.some((regex) => regex.test(blob.name))) {
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
        let lastModified = blobProperties.lastModified as unknown as string

        let blobDate = new Date(lastModified)
        let minDate = subHours(new Date(), MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS)
        if (getUnixTime(blobDate) > getUnixTime(minDate)) {
            isAnyBlobLastModifiedOk = true
            break
        }
    }

    let alertMessage: string | null = 'HFP sink might be down. '
    let alertMessageEnd = 'Investigate and fix the problem as soon as possible.'
    if (!isAnyBlobLastModifiedOk) {
        alertMessage += `Did not find any blob with lastModified within ${MONITOR_BLOB_LAST_MODIFIED_WITHIN_HOURS} hours. `
        alertMessage += alertMessageEnd
    } else if (!foundBlobName) {
        alertMessage = `Did not find any blob with name within ${MONITOR_BLOB_NAME_WITHIN_HOURS} hours. `
        alertMessage += alertMessageEnd
    } else {
        let dateStr = format(new Date, "dd.MM.yyyy HH:mm")
        console.log(`[${dateStr}] Monitoring OK, found a blob with name: ${foundBlobName}.`)
        alertMessage = null
    }

    if (alertMessage) {
        await alertSlack(alertMessage)
    }
}

// Current blob name format is yyyy-MM-ddTHH-[0-9]
function parseUniqueBlobName(blobName: string) {
    let nameParts = blobName.split('T')
    let dateString = nameParts[0]
    let hours = nameParts[1].substring(0, 4)
    return dateString+hours
}

function getHfpBlobNameSubHoursRegex(minusHours: number) {
    let date = minusHours > 0 ? subHours(new Date(), minusHours) : new Date()
    let hourString = getHours(date).toString().padStart(2, '0')
    let dateString = format(date, 'yyyy-MM-dd')
    return new RegExp(`${dateString}T${hourString}-*.*csv.zst`)
}
