const fetch = require('node-fetch');
const check = require('./check');
const lodash = require('lodash');
const config = require('config');
const async = require('async');
const chalk = require('chalk');
const ora = require('ora');
const moment = require('moment');
const notifier = require('node-notifier');
const mongoose = require('mongoose');
mongoose.Promise = require('bluebird');

const spinner = ora();

console.log('Getting PageSpeed results...');
let percent = '';

const PageSpeed = mongoose.model('PageSpeed', {
    path: String,
    strategy: String,
    speed: Number,
    date: Date,
    stats: Array,
    rulesInfo: Array
});

const getElapsedTime = seconds => {
    let time = '';
    if (seconds > 0 && seconds <= 59) {
        time = `****** ${chalk.green(seconds)} second(s) ******`;
    } else if (seconds >= 60 && seconds < 3600) {
        let m = Math.floor(seconds / 60);
        let s = Math.floor(seconds - m * 60);
        time = `****** ${chalk.green(m)} minute(s) and ${chalk.green(s)} seconds ******`;
    } else if (seconds > 3600) {
        let h = Math.floor(seconds / 3600);
        let m = Math.floor((seconds - h * 3600) / 60);
        let s = Math.floor((seconds - h * 3600) - (60 * m));
        time = `****** (${chalk.green(h)} hour(s) ${chalk.green(m)} minute(s) and ${chalk.green(s)} second(s) ******`;
    }

    return time;
}

const percentComplete = (a, b) => {
    let c = a / b;
    let d = c * 100;
    return d.toFixed(2);
}

const getRawData = (opts, callback) => {
    if (check.isEmpty(opts)) {
        return callback(new Error('dataAccess.getRawData: opts is not defined'), null);
    }

    if (check.isEmpty(opts.url)) {
        return callback(new Error('dataAccess.getRawData: opts.url is not defined'), null);
    }

    let queryParams = {
        url: opts.url,
        strategy: opts.strategy || 'desktop',
        key: opts.apiKey
    };

    fetch(`${config.pageSpeed.apiUrl}${queryParams.url}&strategy=${queryParams.strategy}&key=${config.pageSpeed.key}`)
        .then(res => res.text())
        .then(b => {
            let body = JSON.parse(b);
            if (check.isPresent(body.error)) {
                notifier.notify({
                    title: body.error.errors[0].reason,
                    message: body.error.errors[0].message
                });
                process.exit(1);
            }

            if (body.responseCode > 299) {
                return callback(new Error(`Status code ${response.statusCode} not OK`));
            }

            b.strategy = queryParams.strategy;
            return callback(null, { strategy: queryParams.strategy, data: b });
        })
        .catch(err => {
            notifier.notify({
                title: err.code,
                message: err.message
            });
            process.exit(1);
        });
}

const processRawData = (opts) => {
    if (check.isEmpty(opts)) {
        throw (new Error('rawData object not defined'));
    }

    let processedData = {};

    // Key of processedData is the url
    if (check.isEmpty(opts.id)) {
        throw (new Error('id was not returned'));
    }
    processedData = {};

    // Pick pagespeed
    if (check.isEmpty(opts.ruleGroups) || check.isEmpty(opts.ruleGroups.SPEED) || check.isEmpty(opts.ruleGroups.SPEED.score)) {
        throw (new Error('pageSpeed was not returned'));
    }
    processedData.pageSpeed = opts.ruleGroups.SPEED.score;

    let statsArray = [];
    for (let value of Object.keys(opts.pageStats)) {
        let tempObject = {};
        tempObject.stat = value;
        tempObject.value = opts.pageStats[value];
        statsArray.push(tempObject);
    }
    processedData.stats = statsArray;

    // Iterate over the ruleResults and start placing them in high, low, medium buckets
    let formattedResultsData = opts.formattedResults.ruleResults;
    let ruleArray = [];
    for (let value of Object.keys(formattedResultsData)) {
        let tempObject = {};

        // Get localisedRuleName
        tempObject.localisedRuleName = formattedResultsData[value].localizedRuleName;

        // Fetch ruleImpact
        tempObject.ruleImpact = formattedResultsData[value].ruleImpact;

        // Build summary data
        tempObject.summary = buildSummary(formattedResultsData[value].summary);

        // Build url to fix data
        let urlBlocks = buildRulesInfo(formattedResultsData[value].urlBlocks);
        if (urlBlocks) {
            tempObject.urlBlocks = buildRulesInfo(formattedResultsData[value].urlBlocks);
        }

        ruleArray.push(tempObject);
    }

    processedData.rulesInfo = ruleArray;
    return processedData;
};

const buildSummary = opts => {
    let stringToFormat = _mapObject(opts);
    return stringToFormat;
}

const buildRulesInfo = opts => {
    if (opts === undefined || opts.length <= 0) {
        return;
    }

    let formattedResults = [];
    for (let urlBlock of opts) {
        let tempResult = {};
        tempResult.header = _mapObject(urlBlock.header);
        let tempUrlsArr = [];
        if (urlBlock.urls) {
            for (let tempUrl of urlBlock.urls) {
                let tempFormattedUrl = _mapObject(tempUrl.result);
                tempUrlsArr.push(tempFormattedUrl);
            }
        }
        tempResult.urlsToFix = tempUrlsArr;
        formattedResults.push(tempResult);
    }

    return formattedResults;
}

const _mapObject = opts => {
    if (opts === undefined) {
        return '';
    }

    if (opts.format === undefined) {
        return '';
    }

    if (opts.args === undefined || opts.args.length === 0) {
        return opts.format;
    }

    let mapping = {};

    for (let currArg of opts.args) {
        if (currArg.type === 'HYPERLINK') {
            mapping[`BEGIN_${currArg.key}`] = `<a href="${currArg.value}">`;
            mapping[`END_${currArg.key}`] = '</a>';
        } else {
            mapping[currArg.key] = currArg.value;
        }
    }

    let stringToFormat = opts.format;
    stringToFormat = stringToFormat.replace(/\{\{([A-Z0-9_]+)\}\}/g, function (full, matched) {
        let retVal = (mapping[matched]) ? mapping[matched] : '';
        return retVal;
    });
    return stringToFormat;
}

let count = 0;
let q = async.queue((d, callback) => {
    getRawData({
        url: d.url,
        strategy: d.strategy,
        apiKey: config.pageSpeed.key
    }, (error, d) => {
        if (error) {
            spinner.fail(error);
            spinner.start();
            callback();
        }

        let processedData = processRawData(JSON.parse(d.data));
        let speed = processedData.pageSpeed;
        let id = JSON.parse(d.data).id;
        let strategy = d.strategy;
        let data = JSON.parse(d.data);

        if (config.data.save === true) {
            const page_speed = new PageSpeed({
                path: data.id,
                strategy: strategy,
                speed: data.ruleGroups.SPEED.score,
                date: new Date(),
                stats: processedData.stats,
                rulesInfo: processedData.rulesInfo
            });
            
            page_speed.save()
                .then(() => {
                    spinner.succeed(chalk.magenta(data.id) + ' (' + strategy + ') - ' + chalk.green(speed));
                    spinner.text = percentComplete(count = count + 1, urls.length * 2) + `% of ${urls.length * 2} complete`;
                    spinner.start();
                    callback();
                }, err => {
                    data.spinner.fail(err);
                    data.spinner.start();
                });
        } else {
            spinner.succeed(chalk.magenta(data.id) + ' (' + strategy + ') - ' + chalk.green(speed));
            spinner.text = percentComplete(count = count + 1, urls.length * 2) + `% of ${urls.length * 2} complete`;
            spinner.start();
            callback();
        }
    });
}, 1);

q.drain = () => {
    spinner.succeed();
    console.log('done');
    mongoose.connection.close()

    let now = moment(new Date());
    let seconds = now.diff(startTime, 'seconds');
    let time = getElapsedTime(seconds);
    console.log(time);
};

mongoose.connect(config.data.connection, err => {
    if (err) {
        notifier.notify({
            title: err.name,
            message: err.message
        });
        process.exit(1);
    }
});


let urls = config.urls;
let startTime = moment().format();
if (urls.length > 0) {
    spinner.start();
    spinner.color = 'yellow';
    for (let i = 0; i < urls.length; i++) {
        q.push({ strategy: 'desktop', url: urls[i] });
        q.push({ strategy: 'mobile', url: urls[i] });
    }
} else {
    notifier.notify({
        title: 'PageSpeed',
        message: 'No URLs to proccess'
    });
    process.exit(1);
}
