

export function toSafeInt(n: number, def?: number): number {
    if (Number.isSafeInteger(n)) {
        return n;
    }

    if (typeof(n) === 'number' && Number.isFinite(n)) {
        return Math.floor(n);
    } else if (arguments.length >= 2) {
        try {
            return toSafeInt(def);
        } catch (e) {
            throw new Error(`Neither ${n} nor default value ${def} are parsable numbers.`);
        }
    } else {
        throw new Error(`${n} is not a parsable number and default value not provided.`);
    }
}
