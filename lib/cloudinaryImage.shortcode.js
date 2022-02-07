module.exports = function (cloudinaryCloudName) {
  return function (path, title, caption, transformations) {
    if (transformations && transformations !== "") {
      transformations = "/" + transformations;
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
