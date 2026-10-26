# nicolashery.com

My personal website, built as a static site with [Eleventy](https://www.11ty.dev/).

## Install

Requirements:

- [Node.js](https://nodejs.org/)
- [npm](https://www.npmjs.com/)

Both can be installed using [nvm](https://github.com/nvm-sh/nvm). After cloning this repository:

```
nvm use
```

Install dependencies:

```
npm install
```

## Development

Run the development server with:

```
npm start
```

Open a browser to `http://localhost:8080/` to see the site.

To only build the site, run:

```
npm run build
```

For the production build:

```
npm run build-production
```

Test the built site locally before publishing:

```
python3 -m http.server 8000 --directory _site
```

## License

The content in this website, i.e. all images, text, and other assets, included
in blog posts and pages, are licensed under a [Creative Commons
Attribution-NonCommercial-NoDerivatives 4.0 International License](http://creativecommons.org/licenses/by-nc-nd/4.0/).

The source code and configuration, CSS, JavaScript, and other build-related
code, is licensed under the [Unlicense](http://unlicense.org/).
