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

[CircleCI](https://circleci.com/) automatically builds the site and pushes the `master` branch to [Amazon S3](https://aws.amazon.com/s3/).
