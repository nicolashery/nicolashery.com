---
layout: post
title: Moving a blog from Jekyll to Eleventy
description: This post walks through how to set up a blog with the Eleventy static site generator and deploy it using Netlify. We'll cover topics such as migrating from Jekyll, configuring and extending Eleventy, adding syntax highlighting, an RSS feed, a sitemap, SEO meta tags, privacy-friendly analytics, web fonts, and hosting images.
---

Earlier this year I spent some time moving this site from [Jekyll](https://jekyllrb.com/) over to [Eleventy](https://www.11ty.dev/). It was probably a way to procrastinate on writing. If you have also fallen into this classic trap, this post might help you spend less time setting things up and get back to writing. And even if you are starting a blog from scratch and not migrating from Jekyll, there should be some useful things here to help you get started with Eleventy.

[[TOC]]

## Why Eleventy?

Jekyll is still a good option for a static site generator. It is popular and has been around for a while, so you can find results on Google for almost any issue or question. I did read that some people found it slow for larger sites. In my case, I just wanted to try out one of the newer static site generators. I also didn't mind removing the dependency on Ruby, which I don't use much.

I looked at a few options. I wanted to stay with something relatively popular, so I kept to the top of the [Jamstack Site Generators](https://jamstack.org/generators/) list. This means I didn't pick something like [Zola](https://www.getzola.org/), although its zero-dependencies and minimalist aspects were appealing.

Using a generator based on Node.js and JavaScript presented a few benefits. Many frontend tools and libraries require it, so if later I wanted to be more sophisticated and pull in something like [Tailwind.css](https://tailwindcss.com/), I would already have the Node.js dependency installed. I'm also comfortable writing JavaScript, so I wouldn't have too much of a hard time extending it if I needed to.

[Hugo](https://gohugo.io/) also looked like a good option, but it would mean I'd have to convert all my Liquid templates to Go templates. And if I got fancier with my frontend CSS or JavaScript, I would probably need to pull in Node.js and npm anyways.

Eleventy seemed closer in spirit to Jekyll compared to the more popular JavaScript options such as [Next.js](https://nextjs.org/) and [Gatsby.js](https://www.gatsbyjs.com/). Eleventy is focused on generating static pages, whereas Next and Gatsby seem to do a lot more, such as dynamic content and single-page app functionality.

The fact that [Mozilla also moved a site from Jekyll to Eleventy](https://hacks.mozilla.org/2020/10/to-eleventy-and-beyond/) and had come to the same conclusion in terms of similarity between both, was another validation for me.

Finally, Eleventy had just [hit 1.0](https://www.11ty.dev/blog/eleventy-one-point-oh/) when I was doing my research, so that was a good sign of future stability.

## Why Netlify?

Since I was already changing the static site generator, I also took the opportunity to simplify how the site was remotely built and published. For this, I switched over to using [Netlify](https://www.netlify.com/).

Previously, the site's build artifacts were stored in an [S3](https://aws.amazon.com/s3/) bucket, with [Cloudflare](https://www.cloudflare.com/) CDN sitting in front, using [Cloudflare's CNAME flattening](https://developers.cloudflare.com/dns/additional-options/cname-flattening/) to serve off of `nicolashery.com` instead of `www.nicolashery.com` (a personal choice: it is perfectly fine to serve off of `www.`, and in some cases [recommended](https://www.netlify.com/blog/2020/03/26/how-to-set-up-netlify-dns-custom-domains-cname-and-a-records/)). I had [CircleCI](https://circleci.com/) set up to build the site on each push to GitHub, and used the Python [awscli](https://pypi.org/project/awscli/) to sync the build artifacts to S3.

This worked fine. But Netlify fills the roles of a build environment (replacing CircleCI in my case), a hosting provider (replacing S3), and a CDN (replacing Cloudflare). And if you point your registrar to Netlify so it can manage your DNS, you can also serve off of the bare domain (replacing Cloudflare's DNS with CNAME flattening). Fewer things to manage and think about.

Note that Netlify also fully supports Jekyll. So I could've made this switch without touching the site generator.

## Migrating from Jekyll

Porting the site from Jekyll to Eleventy wasn't complicated. Granted, my site is small so that probably made things easier.

After a bit of googling to see what to look out for, I found [Xavier Decuyper's post](https://savjee.be/2021/04/migrating-this-blog-from-jekyll-to-eleventy/) and [Mozilla's post](https://hacks.mozilla.org/2020/10/to-eleventy-and-beyond/) to be useful. There is also the official [Eleventy base blog starter](https://github.com/11ty/eleventy-base-blog) that is good to use as a reference.

Here are some changes I made to get the source code ready to build with Eleventy:

- Remove Ruby's `Gemfile` and `Gemfile.lock`, replace them with Node's `package.json` and `package-lock.json` (via `npm init` and `npm install`)
- Add `.nvmrc` (see [nvm](https://github.com/nvm-sh/nvm))
- Update `.gitignore`
- Remove Jekyll's `_config.yml`, replace it with Eleventy's `.eleventy.js` and `.eleventyignore`
- Jekyll has a special `_posts/` folder, Eleventy doesn't, so I just renamed it to `posts/` (no underscore)
- Jekyll has support for [Sass](https://sass-lang.com/) out of the box, Eleventy doesn't, so I added a separate workflow following Mike Aparicio's [Add a Sass workflow](https://11ty.recipes/recipes/add-a-sass-workflow/) recipe (I later removed Sass to use plain CSS, more on that later in this article)
- Add a `_data/site.json` [global data file](https://www.11ty.dev/docs/data-global/), and hold some site-wide template data previously in Jekyll's `_config.yml` file (ex: `site.title`, `site.description`, etc.)

## Configuring Eleventy

Eleventy doesn't make a lot of assumptions on how your site is structured, which gives it great flexibility. But it also means you need to tweak a few things before the site builds and renders properly. Here are some configuration changes I made:

- Add `README.md` to `.eleventyignore`
- By default Eleventy searches for layouts in the `_includes/` directory; However, I liked how Jekyll has a special `_layouts/` directory, so I updated the Eleventy configuration to have a [separate directory for layouts](https://www.11ty.dev/docs/config/#directory-for-layouts-(optional))
- Copy static files over to the build directory using Eleventy's [passthrough file copy](https://www.11ty.dev/docs/copy/) configuration option (ex: `css/`, `img/`, `robots.txt`)
- [Dates can appear off by one day](https://www.11ty.dev/docs/dates/#dates-off-by-one-day); To fix this with Liquid templates, I updated the template configuration to always display dates in UTC:

```javascript
eleventyConfig.setLiquidOptions({
  // Display dates in UTC (so they don't risk being off by one day)
  timezoneOffset: 0,
});
```

In addition to the configuration changes above, I created a `posts/posts.json` [directory data file](https://www.11ty.dev/docs/data-template-dir/). I used it to add the following metadata to all posts:

- Set `{% raw %}"permalink": "{{ page.fileSlug }}/"{% endraw %}`; This means that a post with a filename of `2022-01-31-blog-with-eleventy.md` will be accessible at the URL `nicolashery.com/blog-with-eleventy` (no date in the URL)

- Add `"tags": ["posts"]`; This allows me to display a list of posts using [collections](https://www.11ty.dev/docs/collections/):

```liquid
{% raw %}{% assign posts_latest_first = collections.posts | reverse %}
{% for post in posts_latest_first %}
<li>
  <a class="posts-link" href="{{ post.url }}">{{ post.data.title }}</a>
  <div class="posts-date">{{ post.date | date: "%d %B, %Y" }}</div>
</li>
{% endfor %}{% endraw %}
```

## Syntax highlighting

Syntax highlighting for code blocks is done with [Prism](https://prismjs.com/). Follow [Eleventy's documentation](https://www.11ty.dev/docs/plugins/syntaxhighlight/) to install the required plugin.

You can browse the list of [themes](https://github.com/PrismJS/prism-themes), and download the CSS file for the one you select. For example, save the file to `css/prism-one-dark.css`and include the proper tag in your layout:

```liquid
<link rel="stylesheet" href="{{ '/css/prism-one-dark.css' | url }}">
```

You might need to make a few tweaks to the file. These were the ones I made in my case:

- Remove the theme's `font-family` attribute for `pre` and `code` elements (I manage all fonts in my `main.css` file)
- Remove the `margin` attribute on the `pre` (I also manage this in the `main.css` file with other block spacing rules)

One pitfall I fell into is that I had some plain text code blocks without any language declarations, like so:

````text
```
plain text code block
```
````

These were not being picked up by Prism. Sol I had to manually update them to add the `text` language:

````text
```text
plain text code block
```
````

## 404 page

I created a `404.md` "not found" page, and made sure to add the `permalink: 404.html` (so it shows up at `/404.html` and not `404/index.html`).

[Netlify will automatically use `404.html`](https://docs.netlify.com/routing/redirects/redirect-options/#custom-404-page-handling) if present.

## RSS feed

The documentation has [instructions to set up an RSS feed](https://www.11ty.dev/docs/plugins/rss/), with a plugin to install and a sample `feed.njk` template to use.

For my setup, I moved the metadata from the template to the global data file `_data/site.json`.

## Sitemap

Adding a sitemap is also straightforward. Mike Aparicio has a [recipe](https://11ty.recipes/recipes/add-a-sitemap/) with a sample `sitemap.njk` template to use.

Make sure to add `eleventyExcludeFromCollections: true` to the frontmatter of pages that should not appear in the sitemap, such as the `404.md` page.

## SEO

Jekyll has an [SEO plugin](https://github.com/jekyll/jekyll-seo-tag) that adds a lot of meta tags to the site. I did find [eleventy-plugin-seo](https://github.com/artstorm/eleventy-plugin-seo), but I got a runtime error when trying to use it. Regardless, I liked the idea of not having a dependency for this, and of having a bit more control on the tags I added. It was also an opportunity to learn a bit more about these tags. So I decided to implement my own solution.

I created an `_includes/seo.html` that I added in the `<head>` tag.

I used Eleventy's [computed data](https://www.11ty.dev/docs/data-computed/) functionality to centralize and produce all the values used by the template include (instead of doing so directly in the template). For this, I created `lib/seo.computed.js` that looks a bit like:

```javascript
module.exports = {
  // Full title for `<title>` tag
  title: (data) => {
    if (data.title) {
      return `${data.title} - ${data.site.title}`;
    }

    return `${data.site.title} - ${data.site.tagline}`;
  },

  // Page title without site title or description appended
  pageTitle: (data) => data.title || data.site.title,

  // ...
};
```

To add these attributes to the computed data available when generating the site, you need to create `_data/eleventyComputed.js` with:

```javascript
const seo = require("../lib/seo.computed");

module.exports = {
  seo: seo,
};
```

You can then use those value in `_includes/seo.html`:

```liquid
{% raw %}<title>{{ seo.title }}</title>

<meta property="og:title" content="{{ seo.pageTitle }}">
<meta name="twitter:title" content="{{ seo.pageTitle }}">{% endraw %}
```

One thing to look out for is how to access different data attributes in the computed data JavaScript file. For example, in my case:

- `data.title` looks for the `title` attribute in a page's [front matter](https://www.11ty.dev/docs/data-frontmatter/)
- `data.site.title` points to the `title` attribute in my [global data file](https://www.11ty.dev/docs/data-global/) `_data/site.json`
- `data.page.url` uses Eleventy's [supplied page data](https://www.11ty.dev/docs/data-eleventy-supplied/#page-variable)

There are a lot of SEO tags that exist. I'm not an expert, and I used Jekyll's SEO plugin source code as inspiration. The tags I ended up including were:

- Standard tags (title, canonical link, description, author)
- [Open Graph](https://ogp.me/)
- [Twitter Card](https://developer.twitter.com/en/docs/twitter-for-websites/cards)
- [LD JSON](https://developers.google.com/search/docs/advanced/structured-data/article)

## License

It's good to remember to add a license to open-source projects and public content. The only thing I want to call out here is that I opted to provide two licenses:

- A [Creative Commons](https://creativecommons.org/licenses/by-nc-nd/4.0/) license for all of the _content_ of the site
- An [Unlicense](https://unlicense.org/) for any _custom code_ that builds the site

I saw this particular setup in [Oskar Wickström's blog](https://github.com/owickstrom/wickstrom.tech/blob/master/LICENSE) and used it as inspiration.

## Deploying with Netlify

[Netlify](https://www.netlify.com/) has become a popular option to build and host static sites and single-page apps. Both the onboarding after creating an account and the [documentation](https://docs.netlify.com/) are great, so I won't repeat it here. I'll just highlight a few settings that I used.

You can configure the build directly in the Netlify UI, but I chose a [file-based configuration](https://docs.netlify.com/configure-builds/file-based-configuration/). This way if I change the build command in the repository later, I don't have to go back to the Netlify UI. I created a `netlify.toml` in the root directory of the repository with:

```toml
[build]
  publish = "_site"
  command = "npm run build"
```

We can also add some configuration options for the processing of static assets. I enabled **minifying** CSS files by adding the following to `netlify.toml`:

```toml
[build.processing]
  skip_processing = false

[build.processing.css]
  bundle = false
  minify = true
```

There is a setting to enable **bundling** of CSS or JS files. I chose not to because I only have two source files, `main.css` and `prism-one-dark.css`. It also gives me the option to optimize by not including the syntax highlighting CSS on some of the site's pages.

These post-processing options from Netlify are nice because they allow me to keep the build setup simple in the repository itself, and reduce the number of Node.js dependencies. The tradeoff is that it ties me to Netlify a little bit.

**UPDATE (2023-07-25):** Netlify has since [deprecated the asset optimization feature](https://www.netlify.com/blog/deprecation-of-post-processing-asset-optimization-feature/). One solution is to use a CSS minification CLI tool such as [Lightning CSS](https://lightningcss.dev/docs.html#from-the-cli) in our production build step.

Make sure your `.toml` file doesn't contain any syntax errors before pushing. If you don't want to install an editor extension to do so, you can easily check it with [an online TOML validator](https://www.toml-lint.com/).

To specify the [Node version]((https://docs.netlify.com/configure-builds/manage-dependencies/#node-js-and-javascript)) used during the build, note that Netlify will pick up a `.nvmrc` file if it finds one. Since I use [nvm](https://github.com/nvm-sh/nvm) locally, I had that checked in my repository already.

After creating a Netlify account, you will need to grant GitHub access to Netlify via OAuth, so it can pull from your repositories when you push changes. During this step, I chose to only give it access to selected repositories (`github.com/nicolashery/nicolashery.com` in my case).

After deploying, Netlify will automatically do some additional post-processing to check the site contents (ex: detection of mixed content, and insecure links using `http` instead of `https`). This is useful, so make sure to check the deployment logs for any warnings.

Finally, Netlify generates a random site name. Even though we'll set up DNS to use a custom domain, I changed the site name to `nicolashery.netlify.app` to easily identify it in the Netlify UI.

## Custom domain with Netlify DNS

There are [two ways you can set up a custom domain](https://www.netlify.com/blog/2020/03/26/how-to-set-up-netlify-dns-custom-domains-cname-and-a-records/) to point at your Netlify site:

- Use **Netlify DNS** to manage your domain (and its subdomains)
- Or use your existing DNS provider and add a `CNAME` record to point to the Netlify site

The advantage of choosing Netlify DNS is that it makes it easy to use either the bare domain (`nicolashery.com`) or a subdomain (`www.nicolashery.com`). I was using the bare domain before with [Cloudflare's CNAME flattening](https://developers.cloudflare.com/dns/additional-options/cname-flattening/). I also didn't have any special DNS requirements for this domain that pushed me to use another DNS provider. For these reasons, I went with Netlify DNS.

I'm using [Gandi.net](https://www.gandi.net/) as the registrar for my domain. Gandi also provides email addresses. The steps to make those work with Netlify DNS were:

- Click "Domains" in "Site Settings", and add `nicolashery.com` as the primary domain
- Click "Activate Netlify DNS"
- Log in to Gandi and under "Nameservers" use external ones setting them to those given by Netlify
- In Gandi, under "Email", copy the mail DNS records given and add them in Netlify DNS
- Wait 12-24 hours for propagation

## Analytics

Previously the site used [Google Analytics](https://analytics.google.com/analytics/web/). For this new version, I took the opportunity to switch to something that was more:

- User privacy-focused
- Lightweight

After a bit of research, I found a list of options (in no particular order): [Plausible](https://plausible.io/), [Fathom](https://usefathom.com/), [Matomo](https://matomo.org/) (formerly Piwik), [Simple Analytics](https://simpleanalytics.com/).

The ability to self-host was not a requirement for me. In the end, I opted for [Plausible](https://plausible.io/) as it seemed to be gaining in popularity. There [are](https://blog.umesh.wtf/fathom-vs-plausible-which-privacy-focused-google-analytics-alternative-should-you-use) many [articles](https://www.andrewbass.blog/posts/plausible-vs-fathom) out [there](https://www.carlcassar.com/articles/privacy-focused-alternatives-to-google-analytics) comparing the different options.

After creating an account, setting it up is as simple as [adding a script](https://plausible.io/docs/plausible-script) tag to your website.

I didn't want to load this script during local development, because it creates a warning in the console. This isn't a big issue, but it is some noise that might cause me to miss an important console warning. To decide when to load the script, we can check the `NETLIFY` environment variable. It is [automatically set by Netlify](https://docs.netlify.com/configure-builds/environment-variables/#read-only-variables) during its build step, and absent during local development.

To expose the environment variable to templates, I created a [JavaScript data file](https://www.11ty.dev/docs/data-js/) named`_data/env.js`:

```javascript
module.exports = function () {
  return {
    NETLIFY: process.env.NETLIFY,
  };
};
```

Then in my Liquid template:

```liquid
{% raw %}{% if env.NETLIFY %}
  {% include "plausible.html" %}
{% endif %}{% endraw %}
```

The last thing useful to set up is the [Google Search Console integration](https://plausible.io/docs/google-search-console-integration). This allows Plausible to display the search terms visitors used when coming in as organic traffic from Google. The documentation walks you through how to set things up.

When setting up the Search Console on Google, I picked a **Domain Property** (vs. a URL Prefix Property). It is more general and can help you catch [unexpected traffic](https://erudite.agency/insights/domain-property-google-search-console/), for instance to a subdomain or to `http` instead of `https`. Google will need to verify that you own the site. Pick the **Any DNS Provider** verification and copy the `TXT` record that Google gives you. In my case, Netlify handles DNS for the site. So I logged into Netlify, selected my Team, clicked Domains, selected my domain, and added the `TXT` record. Once that is done, click "Verify" in the Google Search Console. Come back after about 24 hours once the verification to complete.

Back in Plausible, under site Settings, click Search Console. When you connect with Google OAuth, make sure to grant Plausible permission to view your Search Console website data. Choose the `sc-domain` property in Plausible. Wait 24-36 hours before seeing the data come in.

**Note**: Once this is done, don't remove the TXT DNS record you added. Leave it in order to [stay verified](https://support.google.com/webmasters/answer/9008080#domain_name_verification&zippy=%2Cdomain-name-provider).

## Commenting

My previous setup was using the [Disqus](https://disqus.com/) plugin to add comments to article pages. I wasn't getting a lot of value from it, and in the interest of simplicity, I decided not to add comments in this new version.

I may add a link to a [Hacker News](https://news.ycombinator.com/), [Reddit](https://www.reddit.com/), or [Lobsters](https://lobste.rs/) submission and let readers know that they can comment over there.

I did a bit of research for **Disqus alternatives**, so I'll post the results here, even if I didn't use them in the end:

- [Commento](https://commento.io/) (paid, by design, which means you truly own your data)
- [Talkyard](https://www.talkyard.io/) (does a little more than blog comments, "with features like in StackOverflow, Slack, Discourse, Reddit, Disqus")
- [Isso](https://posativ.org/isso/) (self-hosted, uses SQLite to store data)

## CSS

When I set up the first version of this site with Jekyll, I was used [Sass](https://sass-lang.com/) as a CSS pre-processor. But since then, CSS has come a long way. Features such as  [`var()`](https://developer.mozilla.org/en-US/docs/Web/CSS/var()) and [`calc()`](https://developer.mozilla.org/en-US/docs/Web/CSS/calc()) are now well-supported across modern browsers. For this reason, I chose to switch to plain CSS.

The style needs of this site are small, so I kept everything in a single `css/main.css` file. This forces me to keep things minimal. I organize the file with simple comment headers like so:

```css
/* Variables
-------------------------------------------------------- */

:root {
  --content-width: 640px;
}

/* Reset
-------------------------------------------------------- */

*,
::before,
::after {
  box-sizing: border-box;
  background-repeat: no-repeat;
}

/* etc. */
```

Since I'm using [Netlify's post-processing](https://docs.netlify.com/site-deploys/post-processing/), I don't need to install a library to minify the CSS. Nor would I need a library to bundle multiple files if I had more than one.

**UPDATE (2023-07-25):** Netlify has since [deprecated the asset optimization feature](https://www.netlify.com/blog/deprecation-of-post-processing-asset-optimization-feature/). One solution is to use a CSS minification CLI tool such as [Lightning CSS](https://lightningcss.dev/docs.html#from-the-cli) in our production build step.

[Hugo's Paper theme](https://github.com/nanxiaobei/hugo-paper/blob/main/assets/app.css) was one source of inspiration for the design of this site. I stumbled across it via [Philipp Tanlak's blog](https://philipptanlak.com/). I liked the simplicity and contrast.

Some of the CSS reset rules were taken from [sanitize.css](https://csstools.github.io/sanitize.css/), although I didn't use all of it.

For color picking, I use a palette website such as [Color Hunt](https://colorhunt.co/) to look for inspiration. I tend to stick to just one or two colors for a small site like this one.

## Google web fonts

[Google web fonts](https://developers.google.com/fonts/docs/css2) make it easy to include custom font files to a site. It is good to keep in mind that there is a performance cost to having the user download fonts, but typography is a big part of the style of a blog or other content-centric site.

To help pick a font, you can use the browser developer tools to check the font used by a site you particularly like. Or you can search Google and find [lists of popular options](https://www.typewolf.com/google-fonts).

Once you've picked a font, head over to its page on [Google Fonts](https://fonts.google.com/specimen/Source+Sans+Pro) (Source Sans Pro in this example). Select the weights and styles you need. Typically you'll want Regular 400, Italic Regular 400, and Bold 700. Having both Bold and Italic at the same time is not something we use much so let's leave it out. Keep in mind the more variants you include, the bigger the downloaded payload for the visitor.

After selecting the variants, the right-side panel should open with HTML tags to copy and paste into the `<head>` section.

Finally, update the site's CSS to set the proper font, along with fallbacks. For example:

```css
html {
  font-family:
    /* Google Font */ "Source Sans Pro",
    system-ui,
    /* macOS 10.11-10.12 */ -apple-system,
    /* Windows 6+ */ "Segoe UI",
    /* Android 4+ */ "Roboto",
    /* Ubuntu 10.10+ */ "Ubuntu",
    /* Gnome 3+ */ "Cantarell",
    /* KDE Plasma 5+ */ "Noto Sans",
    /* fallback */ sans-serif;
}
```

(Taken from [sanitize.css](https://csstools.github.io/sanitize.css/).)

## Images with Cloudinary

In the previous setup, I had images (`.png`, `.jpg`) and other non-text files (like a `.pdf` version of my resume) checked in the Git repository. Although that didn't amount to a lot of space, I like the idea of not bloating the Git repository and keeping it for text files only.

Netlify offers a [Large Media](https://docs.netlify.com/large-media/overview/) solution based on [Git LFS](https://git-lfs.github.com/) (for "Large File Storage"). I don't have a lot of experience using Git LFS, but after some research, I saw [some negative points](https://gregoryszorc.com/blog/2021/05/12/why-you-shouldn't-use-git-lfs/) mentioned on the web. Netlify also [calls out some limitations](https://docs.netlify.com/large-media/requirements-and-limitations/) directly on its documentation page.

I opted for [Cloudinary](https://cloudinary.com/) which offers storage, delivery through a CDN, [dynamic resizing and transformations](https://cloudinary.com/documentation/image_transformations), as well as other features which I don't need just now but could be useful to others. It seemed like a good option, even if it means a little more manual work to upload files to this third-party service. It will also be more portable than Netlify's Large Media solution if I ever switch hosting from Netlify to something else.

At the time of writing, Cloudinary offers a free tier for 25k transformations or 25GB bandwidth per month, so it should be plenty for a small blog. After signing up for the free account, it asks you what product you want to use, and I selected "Programmable Media". I kept the auto-generated Cloud Name, which will be used in the URLs for the images.

One thing to note is that Cloudinary's Media Library automatically adds random characters to uploaded file names, to avoid duplicates. This might be useful for some workflows, but it isn't something I wanted in my case. To disable it, go to "Settings > Upload", scroll down to "Upload Presets" and edit the default one used by the Media Library to have `Unique filename: false`. I then simply drag-and-dropped all images from my system's file explorer to the Media Library.

On the Eleventy side, I added `cloudinaryCloudName` to `_data/site.json`. There is nothing secret about the Cloud Name so it is safe to check in a repository.

I then created a [shortcode](https://www.11ty.dev/docs/shortcodes/) in the file `lib/cloudinaryImage.shortcode.js`:

```javascript
module.exports = function (cloudinaryCloudName) {
  return function (path, title, caption, transformations) {
    if (transformations && transformations !== "") {
      transformations = transformations + "/";
    } else {
      transformations = "";
    }
    const url = `https://res.cloudinary.com/${cloudinaryCloudName}/image/upload/${transformations}${path}`;

    return (
      `<figure>` +
      `<img src="${url}" alt="${title || ""}">` +
      `<figcaption>${caption || ""}</figcaption>` +
      `</figure>`
    );
  };
};

```

It's a closure around the Cloud Name, and you can pass in the value when you register the shortcode in `.eleventy.js`:

```javascript
const cloudinaryImageShortcode = require("./lib/cloudinaryImage.shortcode");
const site = require("./_data/site.json");

module.exports = function (eleventyConfig) {
  // ...
  eleventyConfig.addShortcode(
    "cloudinaryImage",
    cloudinaryImageShortcode(site.cloudinaryCloudName)
  );
};
```

I can then use the shortcode in my Liquid templates like so:

```liquid
{% raw %}{% cloudinaryImage "user-interface-data-03.png" "UI as data" "The final version of the app with CSS" "c_scale,w_640" %}{% endraw %}
```

**Note**: I did find [juanfernandes/eleventy-plugin-cloudinary](https://github.com/juanfernandes/eleventy-plugin-cloudinary), but it is simple enough that I decided not to introduce the dependency. It will also make it easier to adapt to my specific needs in the future.

## Conclusion

This wraps up the main steps I took to set up a personal website and blog. There are many options out there to choose from. I picked the static site generator Eleventy, deployed it using Netlify, added analytics with Plausible, and hosted images on Cloudinary.

Feel free to browse the full source code for the site at [github.com/nicolashery/nicolashery.com](https://github.com/nicolashery/nicolashery.com). Keep in mind that there may have been changes since I wrote this article.

Hopefully, some of this can be useful to speed up your own blog setup. Because as much fun as it is to spend time with these tools and technologies, it is more important to spend time [writing](https://www.haskellforall.com/2021/10/advice-for-aspiring-bloggers.html).

