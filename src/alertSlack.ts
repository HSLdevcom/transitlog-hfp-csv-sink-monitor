import got from 'got';
import {
    HFP_MONITOR_SLACK_USER_IDS,
    HFP_MONITOR_SLACK_WEBHOOK_URL,
    HFP_MONITOR_TARGET_ENVIRONMENT,
} from './constants'

export async function alertSlack(message: string) {
    const mentionUserIds: string[] = HFP_MONITOR_SLACK_USER_IDS.split(',')
    const fullMessage = `${
        mentionUserIds.length > 0 ? `Hey${mentionUserIds.map((userId) => ` <@${userId}>`)}, ` : ''
    } [${HFP_MONITOR_TARGET_ENVIRONMENT}] ${message}`

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