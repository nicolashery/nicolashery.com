# nicolashery.com

My personal website.

Built with [Jekyll](http://jekyllrb.com/) and [Grunt](http://gruntjs.com/), deployed to [Amazon S3](http://aws.amazon.com/s3/).

## Install

Requirements:

- [Ruby](http://www.ruby-lang.org/)
- [Node.js](http://nodejs.org/)
- [Grunt](http://gruntjs.com/) (`npm install -g grunt-cli`)
- [Bower](http://bower.io/) (`npm install -g bower`)
- [Python](http://www.python.org/) with [pip](http://www.pip-installer.org/)

Clone this repo then install dependencies:

```bash
$ gem install --no-document jekyll compass compass-inuit s3_website
# Or: $ bundle install
$ npm install
$ bower install
$ pip install -r requirements.txt
```

## Development

In a first terminal, watch for changes in JS or CSS files, compile and concatenate them as needed to the `debug/` directory, by running:

```bash
$ grunt debug
```

In a second terminal, run the development server, watch for changes in Liquid layout or Markdown content files and rebuild the site as needed to the `_site/` directory, by running (alias to `jekyll serve --watch`):

```bash
$ grunt server
```

Go to `http://localhost:4000/` to see the site.

## Deployment

Create an environment variable file off of `env/sample.sh` with your own keys & secrets, and source it:

```bash
$ source env/production.sh
```

Build the production-ready site with:

```bash
$ grunt build
```

This will compile, concatenate, and minify JS and CSS files in the `build/` directory, and run `jekyll build` to build the site in the `_site/` directory using the minified JS and CSS files.

If you haven't configured an Amazon S3 bucket yet, you can do so with the [s3_website](https://github.com/laurilehmijoki/s3_website) Gem by running (reads configuration from the `s3_website.yml` file):

```bash
$ s3_website cfg apply # You only need to do this once
```

Finally, push the site with:

```bash
$ s3_website push
```
