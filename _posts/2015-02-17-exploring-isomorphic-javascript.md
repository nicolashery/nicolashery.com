---
layout: post
title: Exploring Isomorphic JavaScript
---

*This is the result of a first exploration of "Isomorphic JavaScript", apps that run both on the server and in the browser. In this article I try to focus on the concepts and the problems that need to be solved, and towards the end I briefly cover an example implementation using Yahoo's Fluxible libraries and React Router.*

Isomorphic JavaScript applications (you'll also hear the terms "Server-Side Rendering" or ["Progressive JavaScript"](https://medium.com/the-thinkmill/making-the-case-for-progressive-javascript-a98dfa82b9d7)) is something we hear and read quite a bit about lately. Node.js made it possible, [Airbnb blogged about it in 2013](http://nerds.airbnb.com/weve-launched-our-first-nodejs-app-to-product), [React renders HTML on the server](http://facebook.github.io/react/docs/top-level-api.html#react.rendertostring), [Ember.js is working on "FastBoot"](http://emberjs.com/blog/2014/12/22/inside-fastboot-the-road-to-server-side-rendering.html), [Andres Suarez from SoundCloud](https://vimeo.com/108488724) and [Michael Ridgway from Yahoo](https://speakerdeck.com/mridgway/isomorphic-flux) did talks on the subject, etc. I decided to dig in and see what it was all about, what kind of problems it made you encounter, and possible ways to solve them.

I found that it is still a young idea, and I expect the patterns and available libraries (ex: [Fluxible](https://github.com/yahoo/fluxible), [React Router](https://github.com/rackt/react-router), [Nexus React](https://github.com/elierotenberg/react-nexus), [Taunus](https://github.com/taunus/taunus), etc.) to evolve quite a bit in the future. This is one reason why, for a good part of this post, I'll try to stay away from any specific implementation or framework, and focus more on the general concepts and problems to be solved (although of course, you might recognize the influence of certain libraries if you've used them). At the end, I will look out how these ideas translate in a more practical implementation, using Yahoo's Fluxible and React Router.

## A practical implementation

Now that we've explored what kind of concepts and problems arise with Isomorphic JavaScript apps, let's look at a more real-world implementation. This [GitHub repository](https://github.com/nicolashery/example-isomorphic-one) contains an example app built using [Yahoo's Fluxible](https://github.com/yahoo/fluxible) and [React Router](https://github.com/rackt/react-router).

The choice of libraries is quite arbitrary, and I'm sure another one would work quite as well.

Fluxible is a Flux implementation that was built with isomorphism in mind, and provides a solution to the "one Flux state for each request" problem. It does add some additional abstractions you need to learn (ex: different "contexts" for actions, stores, components), but you get used to it. They also tried to keep it modular (for instance I didn't have to use their router solution, and used React Router instead), and extensible (with "Fluxible plugins"). And actions have "done" callbacks, so we can use them on the server.

React Router is quite popular, and works well with "nested" route definitions. This allows you to declare data fetching logic at the component-level (instead of the route-level), and when the route changes the router automatically "walks the component render tree", so you can aggregate and fetch each component's required data. On the flip-side, the router owns the "route state", which means it will be separate from the rest of the app state (i.e. not in a Flux store). But maybe route state needs to be separate, and you can still "sync" it to a store if you want to.

With Fluxible, the `flux` "instance" (i.e. state) that we create on each request is called a `context`. The action creators, stores, and components get access to only part of the context: this ensures, for example, that only action creators can "dispatch" actions, but also means you have to use an additional abstraction.

We can also use the (undocumented) `React.withContext()` function (carefull not to use it to replace `props` though), so that every component has access to Fluxible's component `context` without having to pass it down as a prop.

The `config` values (not exactly "state", since they are set once for the whole app's lifecycle) ended up in Fluxible plugins, since they also have `dehydrate`/`rehydrate` methods. For example, I have an `apiPlugin` that holds the `API_HOST` config value, read from environment variables on the server, and sent to the client via the plugin's dehydrate method.

The routing logic is executed by React Router. Checking authentication and redirecting is done through the `willTransitionTo` static method (at the time of writing I had to use [a fork of React Router](https://github.com/bobpace/react-router/tree/transitionContext) that supports passing the `context` to that method).

The `fetchData` function takes as an argument the `routerState` that was passed to React Router's `router.run()` callback. Using `routerState.routes`,  an array of all handler components that will be rendered for that route, we can grab the `fetchData` static methods from components that have one, and run them in parallel.

Since React Router is separate from the Flux implementation, to be able to "dispatch routing actions" (for example, redirect after sign-in), I wrapped the router in a Fluxible `routerPlugin` so I can call `context.getRouter().transitionTo()` from inside an action creator. It might not be the most elegant way, but it works.

The first render on the client happens inside the `router.run()` like subsequent renders, so we want to be careful and flag it as such so we don't re-fetch all the data we already got from the server-side rendering.

Concerning progressive enhancement, specifically supporting posting forms with JS disabled, since React Router "handlers" are just components, we need a "fake" component to handle the form's "post" route (ex: `<form action="/contact/create">`), using the `willTransitionTo` static method to perform the API call.

If you're going through the example GitHub repository, a good place to start is to look at [server.js](https://github.com/nicolashery/example-isomorphic-one/blob/master/src/server/index.js) and [client.js](https://github.com/nicolashery/example-isomorphic-one/blob/master/src/client/index.js).

## Conclusion

Throughout my exploration and this post, I've tried to extract some general concepts related to Isomorphic JavaScript, that hopefully are common under some form or another accross different implementations. I've also given a small practical example using existing libraries (Fluxible, React Router).

There are of course other things to explore, for example: loading indicators on the client side, "optimistic" updates and the impact on progressive enhancement, handling API call errors, handling "not found" routes, setting/removing cookies, other data fetching strategies, etc.

My conclusions is that Isomorphic JavaScript is still young, and I expect different interesting approaches and libraries to appear in the future. There is also still ongoing debates on the pros & cons, and should/when you do it. I do find that it adds complexity to your app, and increases the "surface area for bugs". But it's definitely something we should pay attention to, and keep an eye on as it evolves.

It does give a web app the feeling of a more "original web"-like experience, versus a "packaged app" that you download. URLs are truly "first-class", and you probably end up spending more time thinking about them. Same goes for the stateless nature of URLs: the app becomes more a function of the URL (and auth information stored in a cookie), returning rendered data.

If you haven't already, give "Isomporphic JavaScript" a try, and do share your thoughts and findings.




































