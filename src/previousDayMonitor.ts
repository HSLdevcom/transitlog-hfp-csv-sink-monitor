import {BlobServiceClient} from '@azure/storage-blob'
import {format, getHours, set, subDays} from 'date-fns'
import {HFP_STORAGE_CONNECTION_STRING, HFP_STORAGE_CONTAINER_NAME} from './constants'
import {cloneDeep} from 'lodash'
import { alertSlack } from './alertSlack'
import { ensureSecretExists } from './utils'

const DATE_FORMAT = 'yyyy-MM-dd'

/**
 * Designed to run once per day so that there has been enough time for
 * HFP-sink to have added all data from the previous day.
 * Checks whether there were clear gaps in previous day's HFP data or not.
 * Checks that there should be four files per hour. The format is "hour-segment"
 * where segment is 1-4 meaning 1 for 0 min, 1 for 15min, 2 for 30 min, 3 for 45 min.
 */
export async function runPreviousDayMonitor() {
    try {
        await previousDayMonitor()
    } catch(e) {
        let alertMessage = 'Something bad happened. There seems to be an issue with monitoring HFP-data. Investigate and fix the problem.'
        console.log('Something bad happened ', e)
        await alertSlack(alertMessage)
    }
}

async function previousDayMonitor() {
    ensureSecretExists(HFP_STORAGE_CONNECTION_STRING, 'HFP_STORAGE_CONNECTION_STRING')
    ensureSecretExists(HFP_STORAGE_CONTAINER_NAME, 'HFP_STORAGE_CONTAINER_NAME')

    console.log(`Running HFP sink previous day monitor for container: ${HFP_STORAGE_CONTAINER_NAME}`)

    let storageClient = BlobServiceClient.fromConnectionString(HFP_STORAGE_CONNECTION_STRING)

    let dayBeforeYesterdayDate = subDays(new Date(), 2)
    let dayBeforeYesterdayDateStr = format(dayBeforeYesterdayDate, DATE_FORMAT)

    let yesterdayDate = subDays(new Date(), 1)
    yesterdayDate = set(yesterdayDate, { hours: 0, minutes: 0, seconds: 0 })
    let yesterdayDateStr = format(yesterdayDate, DATE_FORMAT)


    let foundBlobNameMap = new Map<string, boolean>()
    for(let hour = 0; hour < 24; hour += 1) {
        // Currently data from one hour is split into 4 files
        foundBlobNameMap.set(`${hour}-1`, false)
        foundBlobNameMap.set(`${hour}-2`, false)
        foundBlobNameMap.set(`${hour}-3`, false)
        foundBlobNameMap.set(`${hour}-4`, false)
    }
    for await (const blob of storageClient.findBlobsByTags(
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday <= '${dayBeforeYesterdayDateStr}' AND max_oday >= '${dayBeforeYesterdayDateStr}'`
    )) {
        let { hourString, dateString } = getHourAndDateStrings(blob.name)

        // We are only interested in blobs over 24h+
        if (dateString === yesterdayDateStr) {
            foundBlobNameMap.set(hourString, true)
        }
    }

    for await (const blob of storageClient.findBlobsByTags(
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday <= '${yesterdayDateStr}' AND max_oday >= '${yesterdayDateStr}'`
    )) {
        let { hourString, dateString } = getHourAndDateStrings(blob.name)
        // We are only interested in blobs under 24h
        if (dateString === yesterdayDateStr) {
            foundBlobNameMap.set(hourString, true)
        }
    }

    function getHourAndDateStrings(blobName: string) {
        let nameParts = blobName.split('T')
        let dateString = nameParts[0]
        let hourString = nameParts[1].substring(0, 4)
        // remove one leading zero
        hourString = hourString.replace(/^0/, '')
        return { hourString, dateString }
    }

    let unobservedBlobHours: string[] = []

    for (let [hourString, isBlobFound] of foundBlobNameMap) {
        if (!isBlobFound) {
            unobservedBlobHours.push(hourString)
        }
    }
    let alertMessage: string | null = null
    if (unobservedBlobHours.length > 0) {
        let blobHourDateRanges = getBlobHourRangesFromHfpGaps(unobservedBlobHours, yesterdayDate)
        alertMessage = `Found gap(s) in HFP data (${yesterdayDateStr}): [${blobHourDateRanges.join(', ')}]. Investigate and fix the problem as soon as possible.`
    }

    if (alertMessage) {
        await alertSlack(alertMessage)
    }
}

// Transform given list of hfp hourStrings e.g.
// 0-1 0-2 0-3 0-4 1-1 1-2 1-3 1-4 2-1 2-2 2-4 3-1 3-2 3-3
// into 00:00 - 02:30 02:45 - 03:45
function getBlobHourRangesFromHfpGaps(blobHours: string[], startDate: Date) {
    let currentBh = blobHours.shift()!
    let startBh = cloneDeep(currentBh)
    let [ currentHour, currentSeg ]  = getHourAndSegFromBlobHour(currentBh)
    let dateRanges: string[] = []

    if (blobHours.length === 0) {
        dateRanges.push(getBlobHourRangeFromBlobHours(startBh, currentBh))
    }

    while(blobHours.length > 0) {
        let nextBh = blobHours.shift()!
        let [ nextHour, nextSeg ]  = getHourAndSegFromBlobHour(nextBh)
        // Check if date range continues (happy case) or not (unhappy case)
        if (currentHour === nextHour) {
            if (currentSeg + 1 === nextSeg) {
                // happy case
            } else {
                // unhappy case
                dateRanges.push(getBlobHourRangeFromBlobHours(startBh, currentBh))
                startBh = nextBh
            }
        } else {
            if (currentSeg === 4 && nextSeg === 1) {
                // happy case
            } else {
                // unhappy case
                dateRanges.push(getBlobHourRangeFromBlobHours(startBh, currentBh))
                startBh = nextBh
            }
        }
        if (blobHours.length === 0) {
            // unhappy case
            dateRanges.push(getBlobHourRangeFromBlobHours(startBh, nextBh))
        }
        // happy case
        currentBh = nextBh
        let [ newHour, newSeg ]  = getHourAndSegFromBlobHour(currentBh)
        currentHour = newHour
        currentSeg = newSeg
    }
    return dateRanges
}

function getHourAndSegFromBlobHour(blobHour: string): number[] {
    let [ hour, seg ]  = blobHour.split('-')
    return [ parseInt(hour, 10), parseInt(seg, 10) ]
}

function getBlobHourRangeFromBlobHours(blobHour1: string, blobHour2: string) {
    let [ hour1, seg1 ]  = blobHour1.split('-')
    hour1 = hour1.padStart(2, '0')
    let min1 =  String((parseInt(seg1, 10) - 1) * 15).padStart(2, '0')
    let [ hour2, seg2 ]  = blobHour2.split('-')

    // Increment blobHour2 by 1 segment and use that.
    // We don't want to show 08:30 - 08:30, we want to show 08:30 - 08:45 instead.
    let newHour2 = parseInt(hour2, 10)
    let newSeg2 = parseInt(seg2, 10)
    if (newSeg2 === 4) {
        newHour2 += 1
        newSeg2 = 1
    } else {
        newSeg2 += 1
    }

    hour2 = String(newHour2).padStart(2, '0')
    let min2 = String((newSeg2 - 1) * 15).padStart(2, '0')
    return `${hour1}:${min1} - ${hour2}:${min2}`
}
