const syntaxHighlight = require("@11ty/eleventy-plugin-syntaxhighlight");
const pluginRss = require("@11ty/eleventy-plugin-rss");

const imageShortcode = require("./lib/image.shortcode");
const cloudinaryImageShortcode = require("./lib/cloudinaryImage.shortcode");

const site = require("./_data/site.json");

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("css");
  eleventyConfig.addPassthroughCopy("img");
  eleventyConfig.addPassthroughCopy("keybase.txt");
  eleventyConfig.addPassthroughCopy("nicolas-hery.pdf");
  eleventyConfig.addPassthroughCopy("robots.txt");

  eleventyConfig.setBrowserSyncConfig({
    files: "./_site/css/**/*.css",
  });

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

  return {
    dir: {
      layouts: "_layouts",
    },
  };
};
