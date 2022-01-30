module.exports = function (url, title, caption) {
  return (
    `<figure>` +
    `<img src="/img/${url}" alt="${title || ""}">` +
    `<figcaption>${caption || ""}</figcaption>` +
    `</figure>`
  );
};
