---
layout: post
title: Creating a fast and mobile-friendly website with Jekyll
---

*This is a full walkthrough of how I created a static website with Jekyll, keeping it fast and mobile-friendly.*

[Jekyll](http://jekyllrb.com/) is a static site generator: it transforms plain text files (in [Markdown](http://daringfireball.net/projects/markdown/) for content, [Liquid](http://wiki.shopify.com/Liquid) for templates) into an HTML, CSS, and JavaScript website ready for deployment.

There are other options out there to create a website or blog, like the popular [Wordpress](http://wordpress.org/), or the more recent [Squarespace](http://www.squarespace.com/) and [Ghost](http://tryghost.org/). These are *dynamic*, which means your content is stored in a database and is filled in templates when a user visits the site. They also have an administration section, which allows you to log in and edit your content. That usually makes the website or blog easier to update, especially for less technical people.

But using a static site generator like Jekyll has a few advantages over these other solutions:

- The website is usually very **fast**: Since it's only static files, there are no round-trips to a database, and web servers have become really good at serving plain files.

- It's also very **scalable**: Even if you have a ton of traffic, it's easier for a static web server to handle than, for instance, a PHP Wordpress application.

- It's very **easy to deploy**: There are many static file web server options out there, you don't need to hook up and configure a database, or install and maintain any application.

- You really **own your content**: It's all plain text files, usually in Markdown, that you can safely keep in your Dropbox or GitHub repository.

- It's **extensible**: Since a static site generator like Jekyll only focuses on turning plain text files into HTML, and provides you with a plugin interface, you can basically do anything: add third-party libraries like Disqus or Google Analytics, create your own logic to insert images into pages, etc.

Building a website "from scratch" using Jekyll might feel a little complicated at first, as there are a lot of moving parts, things to configure, etc. In this post, I'd like to walk you through how I went about it, and hopefully that will help you get started more quickly and serve as a checklist of the things you need to think about for your website. Keep in mind that this is just *one* way of doing things. You are more than welcome to adapt this workflow to your liking!

This is also a fairly long read, since I wanted to include the end-to-end process from installing the tools to deploying the site. The table of contents below will help you jump to different sections.

If you want, you can follow along with this [source code](https://github.com/nicolashery/nicolashery.com).

## Table of contents

- [Installing Jekyll](#installing-jekyll)
- [Installing Grunt](#installing-grunt)
- [Workflow](#workflow)
- [CSS](#css)
- [JavaScript](#javascript)
- [Images](#images)
- [Code blocks](#code-blocks)
- [Comments](#comments)
- [SEO](#seo)
- [Analytics](#analytics)
- [Deployment](#deployment)
- [Conclusion](#conclusion)

<h2 id="installing-jekyll">Installing Jekyll</h2>

We will use [Jekyll](http://jekyllrb.com/) (Ruby) to generate the HTML files, the [Grunt](http://gruntjs.com/) build tool (Node.js) to compile and minify CSS and JavaScript files, and [Pygments](http://pygments.org/) (Python) for code syntax highlighting in our posts.

This means you will need to have installed:

- [Ruby](http://www.ruby-lang.org/) with [RubyGems](http://rubygems.org/)
- [Node.js](http://nodejs.org/) with [NPM](https://npmjs.org/)
- [Python](http://www.python.org/) with [pip](http://www.pip-installer.org/)

If you don't have all of these installed and are using a Mac, you can check out my [Mac Dev Setup](https://github.com/nicolashery/mac-dev-setup) guide for help.

Install Jekyll with:

```bash
$ gem install jekyll
```

Jekyll has great [documentation](http://jekyllrb.com/docs/home/) to help you learn how to use it.

A basic directory structure looks something like this:

```
.
├── _includes/
|   ├── footer.html
|   ├── header.html
|   └── posts.html
├── _plugins/
|   ├── asset_url.rb
|   └── image_tag.rb
├── _layouts/
|   ├── default.html
|   ├── page.html
|   └── post.html
├── _posts/
|   ├── 2013-02-11-pictures-of-cats.md
|   └── 2013-01-31-hello-world.md
├── _site/
├── _config.yml
└── index.html
```

The static website is generated in the `_site` folder. Any other file or directory than the ones listed above (like CSS and JavaScript files) will be copied over into the `_site` directory, except if you explicitly exclude them in `_config.yml`.

We use [Git](http://git-scm.com/) for version control, so let's immediately add `_site` to our `.gitignore` file.

<h2 id="installing-grunt">Installing Grunt</h2>

Jekyll processes our layout and content text files into HTML. We will use [Grunt](http://gruntjs.com/) to process our CSS and JavaScript files.

Install the Grunt command line tool with:

```bash
$ npm install -g grunt-cli
```

Let's create directories for our source files, and add them to the `exclude` list in `_config.yml` so they are not copied to the site:

```
...
├── css/
└── js/
```

If you use preprocessors, like [Sass](http://sass-lang.com/), [LESS](http://lesscss.org/), or [CoffeeScript](http://coffeescript.org/), you can add corresponding `sass/`, `less/`, or `coffee/` directories.

We also create directories for our concatenated (`debug/`) and minified (`build/`) files, which will be copied to the site, and add them to `.gitignore` so they are not tracked in version control:

```
...
├── debug/
└── build/
```

Finally, we create an `assets/` directory for larger files such as images, also excluded from version control in `.gitignore`:

```
...
└── assets/
```

A word of explanation: we will create our stylesheets and scripts in their source directories, using as many files as we like to keep the code maintainable. We then combine those files into one CSS file `style.css` and one JavaScript file `main.js` in the `debug/` directory, which keeps the number of HTTP requests to a minimum for best performance. To do so, we can use the following Grunt [plugins](http://gruntjs.com/plugins), depending on which tools you use (I like [Compass](http://compass-style.org/) for CSS and [Browserify](http://browserify.org/) for JavaScript):

- [grunt-contrib-concat](https://npmjs.org/package/grunt-contrib-concat)
- [grunt-contrib-sass](https://npmjs.org/package/grunt-contrib-sass)
- [grunt-contrib-compass](https://npmjs.org/package/grunt-contrib-compass)
- [grunt-contrib-less](https://npmjs.org/package/grunt-contrib-less)
- [grunt-browserify2](https://npmjs.org/package/grunt-browserify2)
- [grunt-contrib-coffee](https://npmjs.org/package/grunt-contrib-coffee)

For deployment, we will also minify the files into `style.min.css` and `main.min.js` in the `build/` directory, using:

- [grunt-contrib-cssmin](https://npmjs.org/package/grunt-contrib-cssmin)
- [grunt-contrib-uglify](https://npmjs.org/package/grunt-contrib-uglify)

All these tasks are defined in the `Gruntfile.js` of your project. You can check out Grunt's [documentation](http://gruntjs.com/getting-started) and my example [Gruntfile.js](https://github.com/nicolashery/nicolashery.com/blob/master/Gruntfile.js) for help setting it up.

<h2 id="workflow">Workflow</h2>

I set up some Grunt tasks to help me automate my workflow. During development, when I'm modifying my site layout, writing content, changing CSS, etc., I open up a first terminal and run:

```bash
$ grunt debug
```

This tasks watches for changes in CSS and JS files (and/or Sass, LESS, CoffeeScript), compiles and concatenates source files in the `debug/` directory. In a second terminal I run:

```bash
$ grunt server
```

This task is basically an alias for `jekyll serve --watch`, which runs the development server on `http://localhost:4000/` and also watches for changes in Liquid layout or Markdown content files and rebuilds the site.

Before deployment, I run:

```bash
$ grunt build
```

This compiles, concatenates, and minifies styles and scripts, as well as re-generates the whole Jekyll site, and uses the environment variable `JEKYLL_ENV` by setting it to `"production"` to tell my Jekyll templates to point to the minified files in the `build/` directory instead of `debug/`.

We will see later, but to deploy the website and publish changes, I use the command:

```bash
$ jekyll-s3
```

The Grunt tasks described above use a combination of the plugins mentioned earlier. I invite you to check out my [Gruntfile.js](https://github.com/nicolashery/nicolashery.com/blob/master/Gruntfile.js) and use it as inspiration for your own workflow.

<h2 id="css">CSS</h2>

Writing plain CSS has its limits, and there are preprocessors like [Sass](http://sass-lang.com/) (Ruby) and [LESS](http://lesscss.org/) (Node.js) that help you overcome them. There are also frameworks like [Bootstrap](http://twitter.github.io/bootstrap/) (LESS) and [Foundation](http://foundation.zurb.com/) (Sass) that give you a head start with styles for elements like grids, buttons, typography, etc.

Personally, I use Sass with [Compass](http://compass-style.org/). I also like [Inuit.css](http://inuitcss.com/) as a lightweight, extensible framework. I will explain how to set those up, but you can use whichever tool you prefer.

To install Compass and its Inuit framework plugin:

```bash
$ gem install compass compass-inuit
```

I then configure the Grunt plugin [grunt-contrib-compass](https://npmjs.org/package/grunt-contrib-compass) in my `Gruntfile.js` and add it to my `grunt debug` and `grunt build` tasks.

Using preprocessors helps you keep your CSS maintainable and modular. If interested, you can dive into the work around [Object-Oriented CSS (OOCSS)](http://coding.smashingmagazine.com/2011/12/12/an-introduction-to-object-oriented-css-oocss/) or [SMACS](http://smacss.com/). To start simple, I find it a good practice to separate styles specific to certain parts your website in different files, and prefix the CSS rules with those "module" names. For example:

```
sass/
├── ui/
|   ├── _footer.scss
|   ├── _header.scss
|   ├── _page.scss
|   └── _scaffolding.scss
├── _config.scss
└── main.scss
```

```sass
// _header.scss

.header--nav {
  @extend .nav;
  @extend .nav--banner;

  margin-bottom: 0;
}

// ...

```

Now is a good time to say a few words on building a mobile-friendly website. It has a become best practice to use [Responsive Web Design](http://en.wikipedia.org/wiki/Responsive_web_design), i.e. building a site that adapts nicely to different device screen sizes. To do so, add the following in your `<head>` HTML tag:

```html
<meta name="viewport" content="width=device-width, initial-scale=1.0">
```

You can then use CSS3 [media queries](https://developer.mozilla.org/en-US/docs/Web/Guide/CSS/Media_queries) to define rules for certain screen sizes. I like the [mobile-first](http://www.html5rocks.com/en/mobile/responsivedesign/) approach, so I often design my site for the smallest screen size first, then add rules to complement or override the styles as the screen gets bigger. For example:

```css
body {
  max-width: 700px;
  padding: 12px;
  padding-bottom: 0;
}

@media only screen and (min-width: 481px) {
  body {
    padding-top: 24px;
    padding-right: 24px;
    padding-left: 24px;
  }
}
```

Finally, include the link to the concatenated stylesheet in the `<head>` tag of `_layouts/default.html`:

```html
{% raw %}
{% if site.env == 'production' %}
  <link rel="stylesheet" href="/build/style.min.css">
{% else %}
  <link rel="stylesheet" href="/debug/style.css">
{% endif %}
{% endraw %}
```

<h2 id="javascript">JavaScript</h2>

I use the [Bower](http://bower.io/) package manager to install front-end JS libraries, like [jQuery](http://jquery.com/). It has a pretty extensive registry of these front-end [components](http://sindresorhus.com/bower-components/). Some front-end libraries can also be found on [NPM](https://npmjs.org/).

Bower will install libraries in the `components/` directory. For example:

```bash
$ bower install jquery fastclick
```

I then use [Browserify](http://browserify.org/) and the Grunt plugin [grunt-browserify2](https://npmjs.org/package/grunt-browserify2) to combine these different libraries into one single JS file. My main JS file will look something like:

```javascript
// js/main.js

var $ = require('jquery')
  , FastClick = require('fastclick');

// On DOM ready
$(function() {
  
  // Eliminates the 300ms delay between a physical tap and the firing of a
  // click event on mobile browsers
  new FastClick(document.body);

  // ...

});
```

To be able to write `require('jquery')`, you need to use [browserify-shim](https://github.com/thlorenz/browserify-shim) in your `Gruntfile.js` and provide the path to each component.

In your `default.html` layout, link to the concatenated JS file just before the closing `</body>` tag (for best performance):

```html
{% raw %}
  <!-- ... -->
  {% if site.env == 'production' %}
    <script src="/build/app.min.js"></script>
  {% else %}
    <script src="/debug/app.js"></script>
  {% endif %}
</body>
{% endraw %}
```

<h2 id="images">Images</h2>

Regarding website performance, images are a tricky thing. We took the time to concatenate and minify our CSS and JS files, but a single image can weight more kilobytes than both files combined.

As [Dave Rupert](http://daverupert.com/about.html)'s article ["Ughck. Images."](http://daverupert.com/2013/06/ughck-images/) shows, the solution to "Responsive Images" isn't quite here yet.

In the meantime, I needed something relatively simple that would allow me to include images on a website in a way that keeps it loading fast. I focused on two things:

- **Lazy load** images only once the user scrolls down to them, thanks to the [JAIL](https://github.com/sebarmeli/JAIL.git) jQuery plugin
- **Responsive images** that load a different version depending on the screen size and resolution, thanks to a [modified version](https://github.com/nicolashery/nicolashery.com/blob/master/js/lib/picturefill.js) of the [picturefill](https://github.com/scottjehl/picturefill) library (small tweak to make it compatible with JAIL)

After installing and setting up the JavaScript libraries, I create a [Jekyll plugin](http://jekyllrb.com/docs/plugins/) called [image_tag.rb](https://github.com/nicolashery/nicolashery.com/blob/master/_plugins/image_tag.rb), that allows me to easily insert images in my Markdown files with a custom Liquid tag:

    {% raw %}
    {% image my-image.png "Image alt text" "Optional image caption" %}
    {% endraw %}

With this in place, pages of the website should feel faster as images aren't loaded until they become visible in the browser viewport.

I chose this solution because it is simple, and my website doesn't use images much, but there are other options out there. For instance, [Paul Stamatiou](http://paulstamatiou.com/about), who also does photograpy, offers a more sophisticated solution in his article ["Developing a responsive, Retina-friendly site"](http://paulstamatiou.com/responsive-retina-blog-development-part-2).

<h2 id="code-blocks">Code blocks</h2>

With a blog on programming, I'm going to be using a lot of code examples. It's important that they look good, both on desktop and mobile.

For syntax highlighting, Jekyll has a nice integration with [Pygments](). To install, run:

```bash
$ pip install pygments
```

And add to your `_config.yml` file:

```yaml
pygments: true
```

I like using **fenced code blocks**, as found in [GitHub-Flavored Markdown](https://help.github.com/articles/github-flavored-markdown), instead of Liquid `highlight` tags. To do so, I switched my Jekyll Markdown parser to [redcarpet](https://github.com/vmg/redcarpet):

```bash
$ gem install redcarpet
```

And add to the `_config.yml` file:

```yaml
markdown: redcarpet
```

And now you can include code blocks with:

    ```javascript
    var msg = 'Hello world!';
    ```

For me, this also has the benefit of making the Markdown files of my blog posts compatible with [Marked](http://markedapp.com/) (also check "Strip YAML Front Matter" in Marked's preferences).

As I said, I find it important that the code blocks look good on a small mobile screen as well as the desktop. To achieve this, I first use the following CSS rule:

```css
pre {
  white-space: pre-wrap;
}
```

This will wrap the code when a line is longer than the screen size, instead of displaying a horizontal scroll bar (I find horizontal scrolling awkward, but that might be just me). Wrapped code isn't great though, and a little difficult to read. To limit this on small screens, diminish the font-size to make as much code as possible fit on one line, using media queries:

```css
pre, pre > code {
  /* Make more code fit on small screens */
  font-size: 14px;
}

@media only screen and (min-width: 481px) {
  pre, pre > code {
    /* Bigger font on bigger screens */
    font-size: 16px;
  }
}
```

Finally, for the colors of the syntax highlighting, I like the [Solarized](http://ethanschoonover.com/solarized) theme. I put together [two CSS stylesheets](https://gist.github.com/nicolashery/5765395) to use with Pygments and Jekyll, the "Light" and "Dark" versions.

Here I realized the importance of **testing a website on an actual mobile device** (versus just in a resized desktop browser). Indeed, the Solarized Dark theme was fine on the bright screen of my MacBook Air, but too dark and diffictult to read on my iPhone screen. That's one of the reasons I opted for Solarized Light.

<h2 id="comments">Comments</h2>

Many blogs and websites use [Disqus](http://disqus.com/) to manage their comments. Setting it up with Jekyll is [very easy](http://help.disqus.com/customer/portal/articles/472138-jekyll-installation-instructions).

First you need to [create a Disqus account](https://disqus.com/profile/signup/) if you don't have one already, then [register your site](https://disqus.com/admin/signup/).

Once that is done, paste the universal code Disqus gives you into a Jekll include, `_includes/disqus.html`, and replace the shortname with a Liquid output:

```javascript
{% raw %}
var disqus_shortname = '{{ site.disqus.shortname }}'; 
{% endraw %}
```

Then, in your `_config.yml`, insert your Disqus shortname:

```yaml
disqus:
    shortname: 'nicolashery'
```

Now, anywhere on your site you want to add Disqus comments (for instance, in `_layouts/post.html`), all you have to do is include `disqus.html` with the Liquid tag:

    {% raw %}
    {% include disqus.html %}
    {% endraw %}

<h2 id="seo">SEO</h2>

I'll be honest, I don't know much about [Search Engine Optimization](http://en.wikipedia.org/wiki/Search_engine_optimization). This might be a bit naive, but to me the best way to be on top of search results is to have great content, tell people about it, and if they like it they will link to your content, and that will bring more people and help your ranking.

I did learn however, mostly thanks to [Segment.io](https://segment.io/)'s article ["The Quickest Wins in SEO"](https://segment.io/academy/the-quickest-wins-in-seo/), that there are a couple basic steps you should take.

First, it is good to include a short meta description in the `<head>` tag of your page, as Google will display that under the link to your site in the search results:

```html
<meta name="description" content="Short description of my website that will appear in search results.">
```

Next, add a [robots.txt](http://www.robotstxt.org/) file in your root directory, which tells crawlers (but doesn't force them to) which parts of the site they should index or not. Don't worry about it too much, just use the simplest form of `robots.txt`:

    User-agent: *
    Allow: /

I'm not sure if this is really SEO-related, but it's also good practice to include an `error.html` or `404.html` file in the root directory, that will be displayed for example if a user mistypes a link to your site. Usually that page displays a short "Not Found" message with a link to other parts of the site (example: [GitHub 404](https://github.com/404)).

Finally, include a [Sitemap](http://en.wikipedia.org/wiki/Site_map), which is an XML file that helps crawlers find content to index on your site. With Jekyll, all you need to do is copy the [sitemap_generator.rb](https://github.com/danielgroves/jekyll-plugins/blob/master/sitemap_generator.rb) plugin to your `_plugins` folder. Re-generate the site, and a `sitemap.xml` file will appear in the `_site` folder.

## RSS feed

An [RSS](http://en.wikipedia.org/wiki/RSS) feed is a good way for visitors to keep updated on new blog posts when they add it to their feed reader.

To generate the XML file for your RSS feed, just copy the [feed.xml](https://github.com/snaptortoise/jekyll-rss-feeds/blob/master/feed.xml) template to your project root directory, and add a link to `/feed.xml` somewhere on your site.

<h2 id="analytics">Analytics</h2>

I'm going to explain how to set up [Google Analytics](http://www.google.com/analytics/) on the site, but you can adapt this to other analytics services like [Mixpanel](https://mixpanel.com), [GoSquared](https://www.gosquared.com/), etc. (for a nice list of different services out there, see the [Segment.io documentation](https://segment.io/docs/integrations)).

First, register for Google Analytics with your Google account, if you haven't done so already.

Then, add the code snippet provided in the [documentation](https://support.google.com/analytics/answer/1008080?hl=en&ref_topic=1008079) into a Jekyll include, like `_includes/google_analytics.html`. Replace the tracking code with a Liquid output:

```javascript
{% raw %}
_gaq.push(['_setAccount', '{{ site.google_analytics_id }}']);
{% endraw %}
```

You could put your Google Analytics ID in the `_config.yml`, but it's best not to commit these kind of tokens inside the Git repository. Instead, I set it as an environment variable in the terminal that's running the Jekyll build. In order to do this, I created a simple [environment_variables.rb](https://github.com/nicolashery/nicolashery.com/blob/master/_plugins/environment_variables.rb) plugin in which I add the line:

```ruby
site.config['google_analytics_id'] = ENV['GOOGLE_ANALYTICS_ID']
```

That way I can run:

```bash
$ export GOOGLE_ANALYTICS_ID='UA-XXXXX-Y'
$ grunt build
```

Which will make the environment variable's value available to the Liquid template through `site.google_analytics_id`.

As explained in Google's documentation, include the snippet just before the closing `</head>` tag with:

```html
{% raw %}
  <!-- ... -->
  {% include google_analytics.html %}
</head>
{% endraw %}
```

<h2 id="deployment">Deployment</h2>

Deploying has a few different pieces that we'll need to select:

- A host for the static files (ex: [Amazon S3](http://aws.amazon.com/s3/), [GitHub Pages](https://help.github.com/categories/20/articles))
- A registrar for the domain name (ex: [Gandi](https://www.gandi.net/))
- Optionally, a separate [DNS](http://en.wikipedia.org/wiki/Domain_Name_System) provider (ex: [DNSimple](https://dnsimple.com/), [Amazon Route 53](http://aws.amazon.com/route53/))
- Optionally, a CDN (ex: [CloudFront](http://aws.amazon.com/cloudfront/))

As mentioned at the beginning of this post, one advantage of a static website is that it can be deployed to just about any host that can serve static files. Here I'll explain how to deploy to [Amazon S3](http://aws.amazon.com/s3/), which has a "pay-according-to-traffic" pricing model (it ends up being pretty cheap, unless you really have a ton of traffic). If you don't have many images or other big files, [GitHub Pages](https://help.github.com/categories/20/articles) is also a nice option.

I'm also going to explain how to host your site at the "root" (or "naked" or "apex") domain (i.e. "nicolashery.com" instead of "www.nicolashery.com"), which is a little more tricky. This is my preference, but if you'd like to host at the "www" domain, you should be able to adapt these instructions fairly easily.

Pushing a Jekyll website to Amazon S3 is really easy, thanks to the [jekyll-s3](https://github.com/laurilehmijoki/jekyll-s3) tool. Create an [Amazon Web Services](http://aws.amazon.com/) (AWS) account if you don't have one already, then install the tool with:

```bash
$ gem install jekyll-s3
```

In the Amazon S3 console, create a bucket (select the "US Standard" region) with a name that matches your domain name, (in my case "nicolashery.com").

**Note**: Since I'm hosting at the root domain "nicolashery.com", I will also create a second bucket "www.nicolashery.com" that I will leave empty, and configure it to redirect all requests to "nicolashery.com", as explained in the [AWS documentation](http://docs.aws.amazon.com/AmazonS3/latest/dev/website-hosting-custom-domain-walkthrough.html).

Next, create a `_jekyll_s3.yml` file with your Amazon credentials declared as environment variables:

```yaml
s3_id: <%= ENV['S3_ID'] %>
s3_secret: <%= ENV['S3_SECRET'] %>
s3_bucket: nicolashery.com
gzip: true
```

Obtain your Amazon credentials from the AWS console (click on your name in the top right and "Security Credentials"), and set the environment variables:

```bash
$ export S3_ID='YOUR_AWS_S3_ACCESS_KEY_ID'
$ export S3_SECRET='YOUR_AWS_S3_SECRET_ACCESS_KEY'
```

Once that is done, run the S3 bucket configuration tool provided with `jekyll-s3`, which will prepare it to host a static website (for now, say "no" when it asks you if you want to configure it for the CloudFront CDN):

```bash
configure-s3-website --config-file _jekyll_s3.yml
```

Finally, build your site for production and deploy to Amazon S3 with:

```bash
$ grunt build
$ jekyll-s3
```

You can already visit the live site with the `example.com.s3-website-us-east-1.amazonaws.com` address provided (replace "example.com" with your domain of course). 

To point our domain name to this Amazon S3 bucket, we need to configure its DNS records. If we were hosting at the "www.example.com" domain, all we would need to do is create a `CNAME` record:

    CNAME www.example.com www.example.com.s3-website-us-east-1.amazonaws.com

However, we are hosting at the root domain "example.com", which requires an `A` record that has to point to an IP address. This is where it gets tricky: the IP address of our Amazon S3 can change.

To work around that, we need to use a separate DNS provider, [DNSimple](https://dnsimple.com/) or [Amazon Route 53](http://aws.amazon.com/route53/). They both have special `ALIAS` records ([DNSimple ALIAS](http://support.dnsimple.com/articles/alias-record), [Route 53 ALIAS](http://docs.aws.amazon.com/Route53/latest/DeveloperGuide/HowToAliasRRS.html)) that allow you to point a root domain ("example.com") to another domain, much like a `CNAME`.

In the case of DNSimple, we create two records:

    ALIAS example.com example.com.s3-website-us-east-1.amazonaws.com
    CNAME www.example.com www.example.com.s3-website-us-east-1.amazonaws.com

To use a separate DNS provider, you need to configure your registrar (mine is [Gandi](https://www.gandi.net/)) to point to its DNS servers.

I won't dive right now into how to configure a CDN like [CloudFront](http://aws.amazon.com/cloudfront/). Different CDN, DNS, host combinations could be a whole other article. Feel free to read through the CloudFront documentation, it should be pretty straighforward to set up using `jekyll-s3` and Route 53.

<h2 id="conclusion">Conclusion</h2>

Using Jekyll does require a bit of tinkering and setting up, but hopefully this walkthrough will help you get started faster.

I like the fact that creating "from scratch" forces you to learn and understand what goes into making a fast and modern website. I also appreaciate the flexibility it gives you, since you can use plugins and other tools like Grunt to adapt it to what's specific about your project.

Did you find this article helpful? Do you use Jekyll and have a different workflow you'd like to share? Feel free to reach out!
