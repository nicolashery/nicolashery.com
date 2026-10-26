import syntaxHighlight from "@11ty/eleventy-plugin-syntaxhighlight";
import pluginRss from "@11ty/eleventy-plugin-rss";
import markdownItAnchor from "markdown-it-anchor";
import markdownItTableOfContents from "markdown-it-table-of-contents";

import imageShortcode from "./lib/image.shortcode.js";
import cloudinaryImageShortcode from "./lib/cloudinaryImage.shortcode.js";

import site from "./_data/site.json" with { type: "json" };

export default function (eleventyConfig) {
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
}
