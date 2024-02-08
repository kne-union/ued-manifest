const fs = require('fs-extra');
const path = require('path');
const spawn = require('cross-spawn-promise');
const request = require('request-promise');
const ensureSlash = require('@kne/ensure-slash');
const lodash = require('lodash');
const tmp = require("tmp");
const decompress = require("decompress");

const loadPackageInfo = async (packageName) => {
    const registryDomain = await spawn('npm', ['config', 'get', 'registry']);
    console.log(`从npm获取package[${packageName}]信息...`);
    const downloadInfo = await request(ensureSlash(registryDomain.toString().trim(), true) + packageName);
    const packageData = JSON.parse(downloadInfo);
    return {
        name: lodash.last(packageName.split('/')),
        packageName: packageData.name,
        version: packageData['dist-tags'].latest,
        versions: lodash.transform(packageData.versions, (result, item, key) => {
            result[key] = {
                version: item.version,
                fileCount: item.dist.fileCount,
                integrity: item.dist.integrity,
                shasum: item.dist.shasum,
                signatures: item.dist.signatures,
                tarball: item.dist.tarball,
                unpackedSize: item.dist.unpackedSize,
                time: packageData.time[item.version]
            };
        }, {}),
        homepage: packageData.homepage,
        repository: packageData.repository,
        readme: packageData.readme
    }
};

const manifest = async () => {
    const packageJson = await fs.readJson(path.resolve(__dirname, 'package.json'));
    const manifest = {};

    await Promise.all(Object.keys(packageJson['ued-config']).map(async (type) => {
        manifest[type] = (await Promise.all(packageJson['ued-config'][type].map((name) => {
            return loadPackageInfo(name).catch((e) => {
                console.error(`包信息获取失败:${name}`);
                console.error(e);
                return null;
            });
        }))).filter((item) => !!item);
    }));

    console.log('生成结果:', JSON.stringify(manifest, null, 2));

    return manifest;
};

const generate = async () => {
    const output = path.resolve(process.cwd(), 'build');
    await fs.ensureDir(output);
    await fs.writeJson(path.resolve(output, 'manifest.json'), lodash.transform(await manifest(), (result, value, key) => {
        if (key === 'libs' && Array.isArray(value)) {
            result[key] = value.map((item) => {
                return lodash.omit(Object.assign({}, item, {
                    versions: {[item.version]: item.versions[item.version]}
                }), ['readme']);
            });
            return;
        }

        if (key === 'miniprograms' && Array.isArray(value)) {
            result[key] = value.map((item) => {
                return Object.assign({}, item, {
                    versions: {[item.version]: item.versions[item.version]}
                });
            });
            return;
        }

        result[key] = value.map((item) => {
            return lodash.omit(Object.assign({}, item, {
                versions: lodash.transform(item.versions, (result, value, key) => {
                    if (Object.keys(result).length < 10) {
                        result[key] = value;
                    }
                }, {})
            }), ['readme']);
        });
    }, {}));
};

const download = async () => {
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

module.exports = {generate, manifest, loadPackageInfo, download};
