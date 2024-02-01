#!/usr/bin/env node

const download = require('./download');
const {generate} = require('./manifest');

const args = process.argv.slice(2);

const scriptIndex = args.findIndex(x => x === 'build' || x === 'eject' || x === 'start' || x === 'test');
const script = scriptIndex === -1 ? args[0] : args[scriptIndex];

console.log(`执行命令:${script || 'manifest'}`);

switch (script) {
    case 'download':
        download();
        break;
    case 'manifest':
        generate();
    default:
        generate();
}
