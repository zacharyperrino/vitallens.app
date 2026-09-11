// Local-calendar date helpers.
//
// Every "which day is it" decision in the app is made in the user's local
// timezone, never UTC — a meal logged at 9pm in Denver belongs to that Denver
// day. These helpers centralise the one correct way to produce YYYY-MM-DD
// strings so pages don't hand-roll timezone math.

const DAY_MS = 86400000;

/** YYYY-MM-DD for `date` (a Date) in the user's local timezone. */
export function toLocalISO(date) {
    return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().split('T')[0];
}

/** Today's date as YYYY-MM-DD in the user's local timezone. */
export function todayLocalISO() {
    return toLocalISO(new Date());
}

/** The local YYYY-MM-DD `n` days before now (n = 0 is today). */
export function daysAgoLocalISO(n) {
    return toLocalISO(new Date(Date.now() - n * DAY_MS));
}

/** Local midnight for a YYYY-MM-DD string, as an ISO-8601 timestamp without zone. */
export function startOfDayISO(dateStr) {
    return `${dateStr}T00:00:00`;
}

/** Whole days elapsed since `timestamp` (anything `new Date()` accepts). */
export function daysSince(timestamp) {
    return Math.floor((Date.now() - new Date(timestamp).getTime()) / DAY_MS);
}
