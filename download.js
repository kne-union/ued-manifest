const {manifest} = require('./manifest');
const request = require('request');
const path = require('path');
const lodash = require('lodash');
const fs = require('fs-extra');
const decompress = require('decompress');
const tmp = require('tmp');

module.exports = async () => {
    const info = await manifest();
    await Promise.all(info['remote-components'].map(async (item) => {
        const url = item.versions[item.version].tarball;
        const {tmpdir, cleanup} = await new Promise((resolve, reject) => {
            tmp.dir({unsafeCleanup: true}, (err, dir, callback) => {
                if (err) {
                    reject(err);
                    return;
                }

                resolve({tmpdir: dir, cleanup: callback});

            });
        });
        const fileDir = path.resolve(tmpdir, lodash.last(url.split('/')));
        await new Promise((resolve, reject) => {
            console.log(`[${item.name}/${item.version}]开始下载包:${url}`);
            const stream = request(url).pipe(fs.createWriteStream(fileDir));
            stream.on('close', () => {
                resolve();
            });
            stream.on('error', (err) => {
                reject(err);
            });
        });
        console.log(`[${item.name}/${item.version}]开始解压压缩包`);
        await decompress(fileDir, tmpdir);
        const output = path.resolve(process.cwd(), 'build', item.name, item.version);
        await fs.emptyDir(output);
        await fs.copy(path.resolve(tmpdir, 'package', 'build'), output);
        console.log(`[${item.name}/${item.version}]下载完成`);
        try {
            cleanup();
            console.log(`[${item.name}/${item.version}]完成临时目录清理`);
        } catch (e) {
            console.warn(`[${item.name}/${item.version}]临时目录清除失败`, e);
        }
    }));
    console.log('完成所有下载任务');
};
