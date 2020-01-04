# nicolashery.com

My personal website, built with [Jekyll](http://jekyllrb.com/).

## Install

Requirements:

- [Ruby](http://www.ruby-lang.org/)
- [Bundler](http://bundler.io/)

Clone this repo then install dependencies:

```bash
$ bundle install
```

## Development

Run the Jekyll development server with:

```bash
$ bundle exec jekyll serve
```

Go to `http://localhost:4000/` to see the site.

## Deployment

Create a copy of `env/sample.sh` and edit it with your own keys & secrets:

```bash
$ cp env/sample.sh env/production.sh
```

Build the production-ready site with:

```bash
$ source env/production.sh
$ bundle exec jekyll build
```

If you haven't configured an Amazon S3 bucket yet, you can do so with the [s3_website](https://github.com/laurilehmijoki/s3_website) Gem by running (reads configuration from the `s3_website.yml` file):

```bash
$ source env/production.sh
$ bundle exec s3_website cfg apply # You only need to do this once
```

Finally, push the site with:

```bash
$ source env/production.sh
$ bundle exec s3_website push
```
