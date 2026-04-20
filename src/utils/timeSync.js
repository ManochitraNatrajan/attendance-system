import axios from 'axios';

let serverTimeOffset = 0;

export const initTimeSync = async () => {
    try {
        const res = await axios.get('/api/time');
        if (res.data && res.data.serverTime) {
            serverTimeOffset = res.data.serverTime - Date.now();
            console.log(`[TimeSync] Offset set to ${serverTimeOffset}ms`);
        }
    } catch(e) {
        console.warn("[TimeSync] Failed to sync with server time", e);
    }
};

export const getSyncedTime = () => {
    return new Date(Date.now() + serverTimeOffset);
};

export const getSyncedTimeNow = () => {
    return Date.now() + serverTimeOffset;
};
