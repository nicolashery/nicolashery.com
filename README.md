# nicolashery.com

My personal website.

Built with [Jekyll](http://jekyllrb.com/) and deployed to [Amazon S3](http://aws.amazon.com/s3/).

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
$ jekyll serve
```

Go to `http://localhost:4000/` to see the site.

## Deployment

Create an environment variable file off of `env/sample.sh` with your own keys & secrets, and source it:

```bash
$ source env/production.sh
```

Build the production-ready site with:

```bash
$ jekyll build
```

If you haven't configured an Amazon S3 bucket yet, you can do so with the [s3_website](https://github.com/laurilehmijoki/s3_website) Gem by running (reads configuration from the `s3_website.yml` file):

```bash
$ s3_website cfg apply # You only need to do this once
```

Finally, push the site with:

```bash
$ s3_website push
```
