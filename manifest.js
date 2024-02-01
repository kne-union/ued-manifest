const fs = require('fs-extra');
const path = require('path');
const spawn = require('cross-spawn-promise');
const request = require('request-promise');
const ensureSlash = require('@kne/ensure-slash');
const lodash = require('lodash');

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
            };
        }, {}),
        homepage: packageData.homepage,
        repository: packageData.repository
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

    return manifest;
};

const generate = async () => {
    await fs.writeJson(path.resolve(process.cwd(), 'manifest.json'), await manifest());
};

module.exports = {
    generate, manifest, loadPackageInfo
};
