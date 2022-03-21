const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");
const markdownIt = require("markdown-it");

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
  const markdownLib = markdownIt({
    // Allow HTML tags in Markdown (enabled by default in Eleventy)
    html: true,
  })
    // Generates anchors for all headings
    .use(require("markdown-it-anchor"))
    // Generate table of contents when `[[toc]]` is included in Markdown
    .use(require("markdown-it-table-of-contents"), {
      containerHeaderHtml: `<div class="table-of-contents-header">Table of contents</div>`,
    });

  eleventyConfig.setLibrary("md", markdownLib);

  return {
    dir: {
      layouts: "_layouts",
    },
  };
};
