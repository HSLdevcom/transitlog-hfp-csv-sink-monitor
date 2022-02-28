import {BlobServiceClient} from '@azure/storage-blob'
import {format, getHours, set, subDays} from 'date-fns'
import {HFP_STORAGE_CONNECTION_STRING, HFP_STORAGE_CONTAINER_NAME} from './constants'
import {cloneDeep} from 'lodash'
import { alertSlack } from './alertSlack'

const DATE_FORMAT = 'yyyy-MM-dd'

/**
 * Designed to run once per day so that there has been enough time for
 * HFP-sink to have added all data from the previous day.
 * Checks whether there were clear gaps in previous day's HFP data or not.
 * Checks that there should be at least one file name per hour with VP in it's name.
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
    if (!HFP_STORAGE_CONNECTION_STRING) {
        throw new Error('Secret HFP_STORAGE_CONNECTION_STRING is missing.')
    }
    if (!HFP_STORAGE_CONTAINER_NAME) {
        throw new Error('Secret HFP_STORAGE_CONTAINER_NAME is missing.')
    }

    console.log(`Running HFP sink previous day monitor for container: ${HFP_STORAGE_CONTAINER_NAME}`)

    let storageClient = BlobServiceClient.fromConnectionString(HFP_STORAGE_CONNECTION_STRING)

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
        `@container='${HFP_STORAGE_CONTAINER_NAME}' AND min_oday = '${yesterdayDateStr}'`
    )) {
        let nameParts = blob.name.split('T')
        let dateString = nameParts[0]
        let hourString = nameParts[1].substring(0, 4)

        // Blobs with min_oday = yesterdayDateStr can have blobs from the current day if
        // there is traffic 24h+ traffic. Filter those blobs out.
        if (dateString === format(new Date(), 'yyyy-MM-dd')) {
            continue
        }

        foundBlobNameMap.set(hourString, true)
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
        alertMessage = `Found gap(s) in HFP data (${yesterdayDateStr}): [${blobHourDateRanges.join(' ')}]. Investigate and fix the problem as soon as possible.`
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
    let currentHour: number = parseInt(currentBh.charAt(0), 10)
    let currentSeg: number = parseInt(currentBh.charAt(2), 10)
    let dateRanges: string[] = []
    let currentStartBh = currentBh

    while(blobHours.length > 0) {
        let nextBh = blobHours.shift()!
        let nextHour: number = parseInt(nextBh.charAt(0), 10)
        let nextSeg: number = parseInt(nextBh.charAt(2), 10)
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
        currentHour = parseInt(currentBh.charAt(0), 10)
        currentSeg = parseInt(currentBh.charAt(2), 10)
    }

    function getBlobHourRangeFromBlobHours(blobHour1: string, blobHour2: string) {
        let hour1 = String(parseInt(blobHour1.charAt(0), 10)).padStart(2, '0')
        let min1 =  String((parseInt(blobHour1.charAt(2), 10) - 1) * 15).padStart(2, '0')
        let hour2 = String(parseInt(blobHour2.charAt(0), 10)).padStart(2, '0')
        let min2 = String((parseInt(blobHour2.charAt(2), 10) - 1) * 15).padStart(2, '0')
        return `${hour1}:${min1} - ${hour2}:${min2}`
    }
    return dateRanges
}
