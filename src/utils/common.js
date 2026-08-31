/** @import { ValuesOf } from '../types/misc.js' */

/**
 * @param {...unknown} [args]
 * @returns {void}
 */
export const debugLog = (...args) => {
    console.debug("[Media Controls]", ...args);
};

/**
 * @param {...unknown} [args]
 * @returns {void}
 */
export const errorLog = (...args) => {
    console.error("[Media Controls]", ...args);
};

/**
 * @template T
 * @param {T} enumObject
 * @param {number} index
 * @returns {ValuesOf<T> | undefined}
 */
export const enumValueByIndex = (enumObject, index) => {
    const values = Object.values(enumObject);
    if (index < 0 || index >= values.length) {
        errorLog(`enumValueByIndex: index ${index} out of bounds`);
        return undefined;
    }
    return values[index];
};

/**
 * @param {number} ms
 * @returns {string}
 */
export const msToHHMMSS = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(ms / 60000);
    const hours = Math.floor(ms / 3600000);
    const secondsString = String(seconds % 60).padStart(2, "0");
    const minutesString = String(minutes % 60).padStart(2, "0");
    const hoursString = String(hours).padStart(2, "0");
    if (hours > 0) {
        return `${hoursString}:${minutesString}:${secondsString}`;
    } else {
        return `${minutesString}:${secondsString}`;
    }
};
