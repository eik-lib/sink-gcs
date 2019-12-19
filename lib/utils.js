'use strict';

const isStream = (stream) => {
    return stream !== null && typeof stream === 'object' && typeof stream.pipe === 'function';
};
module.exports.isStream = isStream;

const isReadableStream = (stream) => {
    return isStream(stream) && stream.readable !== false && typeof stream._read === 'function' && typeof stream._readableState === 'object';
};
module.exports.isReadableStream = isReadableStream;
