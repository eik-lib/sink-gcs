'use strict';

const { test } = require('tap');
const Sink = require('../lib/main');

test('Sink() - Object type', (t) => {
    const obj = new Sink();
    t.equal(Object.prototype.toString.call(obj), '[object SinkGCS]', 'should be SinkGCS');
    t.end();
});