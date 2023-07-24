const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const markdownItAnchor = require("markdown-it-anchor");
const markdownItTableOfContents = require("markdown-it-table-of-contents");

const imageShortcode = require("./lib/image.shortcode");
const cloudinaryImageShortcode = require("./lib/cloudinaryImage.shortcode");

const site = require("./_data/site.json");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("keybase.txt");
  eleventyConfig.addPassthroughCopy("robots.txt");

  eleventyConfig.addPlugin(syntaxHighlight);
  eleventyConfig.addPlugin(pluginRss);

  eleventyConfig.addShortcode("image", imageShortcode);
  eleventyConfig.addShortcode(
    "cloudinaryImage",
    cloudinaryImageShortcode(site.cloudinaryCloudName)
  );

  eleventyConfig.setLiquidOptions({
    // Display dates in UTC (so they don't risk being off by one day)
    timezoneOffset: 0,
  });

  // Customize Markdown rendering
  eleventyConfig.amendLibrary("md", (mdLib) => {
    // Generates anchors for all headings
    mdLib.use(markdownItAnchor);

    // Generate table of contents when `[[toc]]` is included in Markdown
    mdLib.use(markdownItTableOfContents, {
      containerHeaderHtml: `<div class="table-of-contents-header">Table of contents</div>`,
    });
  });

  return {
    dir: {
      layouts: "_layouts",
    },
  };
};
