# pagespeed

Get the pagespeed results of URLs and optionally save them to a database.

## Prerequisites

You will need the following things properly installed on your computer.

* [Git](https://git-scm.com/)
* [Yarn](https://yarnpkg.com/en/) or [Node.js](https://nodejs.org/) (with NPM)

## Installation

* `git clone https://github.com/Mithrilhall/pagespeed` this repository
* `cd pagespeed`
* `yarn` or `npm install`

## Running

1. Get a PageSpeed API key [here](https://developers.google.com/speed/docs/insights/v4/getting-started) by signing up; it's free.
2. Update `pageSpeed.key` in `default.json` with your key from the previous step.
3. Replace `urls` in `default.json` with your list of URLs.

* `node index.js`

