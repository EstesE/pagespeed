function isBlank(obj) {
    return isEmpty(obj) || (typeof obj === 'string' && obj.match(/\S/) === null);
}

function isEmpty(obj) {
    var none = isNone(obj);
    if (none) {
        return none;
    }

    if (typeof obj.size === 'number') {
        return !obj.size;
    }

    var objectType = typeof obj;

    if (objectType === 'object') {
        let size = obj.size;
        if (typeof size === 'number') {
            return !size;
        }
    }

    if (typeof obj.length === 'number' && objectType !== 'function') {
        return !obj.length;
    }

    if (objectType === 'object') {
        let length = obj.length;
        if (typeof length === 'number') {
            return !length;
        }
    }

    return false;
}

function isEqual(a, b) {
    if (a && typeof a.isEqual === 'function') {
        return a.isEqual(b);
    }

    if (a instanceof Date && b instanceof Date) {
        return a.getTime() === b.getTime();
    }

    return a === b;
}

function isNone(obj) {
    return obj === null || obj === undefined;
}

function isPresent(obj) {
    return !isBlank(obj);
}

module.exports = {
    isBlank,
    isEmpty,
    isEqual,
    isNone,
    isPresent
}