function toXmlDateString(date) {
  // "2015-02-20T00:00:00.000Z" becomes "2015-02-20T00:00:00+00:00"
  return date.toISOString().replace(/\.\d+Z$/, "+00:00");
}

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

  // Site title without tagline appended
  siteTitle: (data) => data.site.title,

  description: (data) =>
    (data.description || data.site.description).replace(/"/g, "&quot;"),

  author: (data) => data.site.author,

  locale: (data) => data.site.locale,

  canonicalUrl: (data) => {
    if (data.page.url) {
      return data.site.url + data.page.url;
    }

    return data.site.url;
  },

  date: (data) => {
    if (data.seoPageType !== "article") {
      return null;
    }

    return toXmlDateString(data.page.date);
  },

  image: (data) => {
    if (!data.image) {
      return null;
    }

    return {
      url: data.site.url + "/" + data.image.path,
      width: data.image.width,
      height: data.image.height,
    };
  },

  twitterAccount: (data) => data.site.twitter,

  jsonLd: (data) => {
    const payload = {
      "@context": "https://schema.org",
      "@type": data.page.date ? "BlogPosting" : "WebSite",
      url: data.seo.canonicalUrl,
      headline: data.seo.pageTitle,
      description: data.description || data.site.description,
    };

    if (data.seoPageType === "article") {
      payload.datePublished = toXmlDateString(data.page.date);
      payload.dateModified = toXmlDateString(data.page.date);
      payload.mainEntityOfPage = {
        "@type": "WebPage",
        "@id": data.seo.canonicalUrl,
      };
      payload.author = {
        "@type": "Person",
        name: data.site.author,
      };
    } else {
      payload.name = data.site.title;
    }

    return JSON.stringify(payload);
  },
};
