---
layout: post
title: Using environment variables with Webpack and Divshot
---

*Here I show one way to give configuration values to a static web app, using environment variables, for both the Webpack dev server (local development) and the Divshot server (test a build before deploying).*

If you haven't heard of [Webpack](http://webpack.github.io/), it's a great way to bundle modules of any type (scripts, styles, images, etc.), into static files ready for deployment. It comes with [a dev server](http://webpack.github.io/docs/webpack-dev-server.html) for local development, with fast incremental rebuilds.

[Divshot](https://divshot.com/) is a great service that lets you easily deploy those files right from the command line. Think [Heroku](https://www.heroku.com/), but for static web apps. Divshot's command-line tool provides [a server](http://docs.divshot.com/guides/local-dev) that lets you test your build locally.

A common problem in static web apps is configuration. A Node.js app for example, can read values directly from environment variables (`var apiUrl = process.env.API_URL`). Of course, that's not possible for the web app, which is delivered and run in the user's browser.

Divshot mimics [environment variables](http://docs.divshot.com/guides/environment-variables) for your deployed web apps, by allowing you to set values like:

```bash
$ divshot env:add development API_URL=http://development-api.example.com
```

It will then deliver a file at the `/__/env.js` URL that looks like:

```javascript
window.__env = {
  API_URL: 'http://development-api.example.com'
};
```

And your web app can use this global `__env` object.

What would be nice would be to use this locally, both for development with the Webpack dev server, and to test a build with the Divshot CLI's server.

## Situation

- The Divshot server expects a `.env.json` file in the project directory, and uses it to serve a `__/env.js` file
- The `.env.json` file used by Divshot server is static, i.e. we can't directly use environment variables set in our terminal
- The Webpack dev server can serve any static file from the project directory, but we need to create a `__/env.js` file ourselves

## Proposed solution

Your `index.html` in the project root directory looks something like:

```html
<!DOCTYPE html>
<html>
  <!-- ... -->

  <body>
    <p>Loading app...</p>
    <script type="text/javascript" src="/__/env.js"></script>
    <script type="text/javascript" src="bundle.js"></script>
  </body>

</html>
```

Create a `.env.js` file that looks something like:

```javascript
module.exports = {
  API_URL: process.env.API_URL || 'http://localhost:8081'
};
```

Create a `scripts/` directory with two files.

The first, `scripts/buildenv.js`, will create `__/env.js` for the Webpack dev server and `.env.json` for the Divshot static server:

```javascript
require('shelljs/global');
var util = require('util');

var output;
var env = require('../.env.js');

// Used for local development with webpack-dev-server
output = util.inspect(env, {depth: null});
output = 'window.__env = ' + output + ';\n';
output.to('__/env.js');

// Used to test build with divshot server
output = JSON.stringify(env, null, 2);
output = output + '\n';
output.to('.env.json');
```

The second, `scripts/build.js`, will build the Webpack app ready for deployment in the `dist/` directory:

```javascript
require('shelljs/global');

console.log('Cleaning output directory "dist/"...');
rm('-rf', 'dist');
mkdir('-p', 'dist');

console.log('Bundling all the things...');
exec('webpack --colors --progress');

console.log('Copying "index.html"...');
cp('index.html', 'dist/index.html');

console.log('Build successfull');
```

Make sure to update your `.gitignore` with the necessary things:

```
.divshot-cache
dist
__
.env.json
```

We can create npm scripts in our `package.json` to easily call what we just created:

```json
{
  "scripts": {
    "start": "npm run build-env && webpack-dev-server --devtool eval-source-map --cache --colors --progress",
    "build-env": "node scripts/buildenv",
    "build": "node scripts/build",
    "server": "npm run build-env && divshot server -p 8080",
    "deploy": "divshot push"
  }
}
```

Now, if we want to work on the app, hitting a particular API, we can do:

```bash
$ export API_URL=http://localhost:3001
$ npm start
```

If we want to deploy, we'll first build the app:

```bash
$ npm run build
```

Then we can test our build, for example hitting a remote development API:

```bash
$ export API_URL=http://development-api.example.com
$ npm run server
```

If all seems to work, we can deploy!

```bash
$ npm run deploy
```
