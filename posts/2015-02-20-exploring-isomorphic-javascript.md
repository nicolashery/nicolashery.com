---
layout: post
title: Exploring Isomorphic JavaScript
description: This is the result of my first steps building "Isomorphic JavaScript" apps, that run both on the server and in the browser. In this article I try to focus on the concepts and the problems that need to be solved, and towards the end I briefly cover an example implementation using Yahoo's Fluxible libraries and React Router.
---

Isomorphic JavaScript applications (you'll also hear the terms "Server-Side Rendering" or ["Progressive JavaScript"](https://medium.com/the-thinkmill/making-the-case-for-progressive-javascript-a98dfa82b9d7)) is something we hear and read quite a bit about lately. Node.js made it possible, [Airbnb blogged about it in 2013](http://nerds.airbnb.com/weve-launched-our-first-nodejs-app-to-product), [React renders HTML on the server](http://facebook.github.io/react/docs/top-level-api.html#react.rendertostring), [Ember.js is working on "FastBoot"](http://emberjs.com/blog/2014/12/22/inside-fastboot-the-road-to-server-side-rendering.html), [Andres Suarez from SoundCloud](https://vimeo.com/108488724) and [Michael Ridgway from Yahoo](https://speakerdeck.com/mridgway/isomorphic-flux) did talks on the subject, etc. I decided to dig in and see what it was all about, what kind of problems you encountered, and possible ways to solve them.

I found that it is still a young idea, and I expect the patterns and available libraries (ex: [Fluxible](https://github.com/yahoo/fluxible), [React Router](https://github.com/rackt/react-router), [Nexus React](https://github.com/elierotenberg/react-nexus), [Taunus](https://github.com/taunus/taunus), etc.) to evolve quite a bit in the future. This is one reason why, for a good part of this post, I'll try to stay away from any specific implementation or framework, and focus more on the general concepts and problems to be solved (although of course, you might recognize the influence of certain libraries if you've used them). At the end, I will look at how these ideas translate in a more practical implementation, using Yahoo's Fluxible and React Router.

The code in the examples below is close to "pseudo-code". It stays high-level and the implementation of the functions don't matter as much as what they do. I also assume basic knowledge in [Express](http://expressjs.com/), [React](http://facebook.github.io/react/), and [Flux](http://facebook.github.io/flux/), but even if you've never used them, you should be able to follow along.

## Simplest example

At the most basic level, an isomorphic app should be able to render both on the server (in Node.js) and in the browser. React does this perfectly well (and other libraries too I'm sure).

```javascript
// server.js
var server = express();

server.use(function(req, res) {
  var appHtml = React.renderToString(<App />);
  var html = injectIntoHtml({app: appHtml});
  res.send(html);
});
```

```javascript
// client.js
React.render(<App />, document.getElementById('app'));
```

The only "tricky" bit here, is for the client to **pick up where the server left off**. That is, after the app is loaded in the browser, the first render doesn't "destroy" the DOM generated by the server, but rather "hooks" onto it. This is something that React, with its Virtual DOM implementation, does for you and you don't have to worry about it.

## Sharing state

Let's say the app renders a set of data fetched from a remote API (a pretty common scenario). This data is part of the app's "state" (the data can take different values over time, and the app will render differently). Since we need to create this `state` on the server, it is probably a good idea to share it with the client, so it can pick up where the server left off (instead of re-creating and re-fetching the data, work already done by the server).

```javascript
// server.js
server.use(function(req, res) {
  var state = {};
  fetchData(function(err, data) {
    state.data = data;
    var exposedState = 'window.__STATE__=' + JSON.stringify(state) + ';';
    var appHtml = React.renderToString(<App data={data} />);
    var html = injectIntoHtml({
      app: appHtml,
      state: exposedState
    });
    res.send(html);
  });
});
```

```javascript
// client.js
var state = window.__STATE__;
React.render(<App data={state.data} />, document.getElementById('app'));
```

We see the need to be able to **serialize** all of the state on the server, and then **parse and instantiate** it on the client (you'll hear the terms **dehydrate** and **rehydrate**). This allows us to initialize the app on the client in the exact same state it was on the server before being sent back in HTML form.

Also note that on the **server** the app state is **bound to each request**, i.e. there is one state per request (since a server serves multiple client requests). On the **client**, the app state is **global**, i.e. we only need one state for the whole browser session.

## Simple routing

Most apps render according to different possible routes in the URL. Let's assume our top-level `<App>` React component takes a `route` object as a property and renders accordingly.

On the **server**, we can simply get the route by matching the **request URL** against our "routes declaration" (not shown here):

```javascript
// server.js
server.use(function(req, res) {
  var route = matchPath(req.url);
  var appHtml = React.renderToString(<App route={route} />);
  var html = injectIntoHtml({app: appHtml});
  res.send(html);
});
```

On the **client**, we use the path from the **browser's URL location API** to match a route (implementation not shown here):

```javascript
// client.js
function render(route) {
  React.render(<App route={route} />, document.getElementById('app'));
}

// first render
var route = matchPath(getCurrentPath());
render(route);
// re-render on browser location change
addLocationChangeListener(function(path) {
  var route = matchPath(path);
  render(route);
});
```

Since subsequent route changes will happen on the client, we listen to browser URL location changes (this could be implemented on top of HTML5 History), and re-render the new route.

## Shared state and routing

Let's combine the previous two examples. On the server, we match the `route` and attach it to the app `state` (this makes sense since the route can take different values, each producing different rendering outputs). We then fetch the required data, render the app, and send the HTML back.

```javascript
// server.js
server.use(function(req, res) {
  var state = {};
  var route = matchPath(req.url);
  state.route = route;

  fetchData(route, function(err, data) {
    state.data = data;
    var exposedState = 'window.__STATE__=' + JSON.stringify(state) + ';';
    var appHtml = React.renderToString(<App route={route} data={data} />);
    var html = injectIntoHtml({
      app: appHtml,
      state: exposedState
    });
    res.send(html);
  });
});
```

Note that the `fetchData` function takes the `route` as an argument. Indeed, the **data needed by the app will probably depend on the route** (ex: for `/contacts` we fetch the list of contacts, for `/contact/1/messages` we fetch the contact's details and messages).

**Note**: This means that we declare our data-fetching needs at the route-level (in the "routes declaration"), which might not be the best place to do it in terms of modularity. But we'll see later that some libraries (like React Router) make it possible to declare it at the component-level instead.

On the client, we follow the same logic:

```javascript
// client.js
var state = window.__STATE__;

function render() {
  React.render(
    <App route={state.route} data={state.data} />,
    document.getElementById('app')
  );
}

// first render
render();
// re-render on browser location change
addLocationChangeListener(function(path) {
  var route = matchPath(path);
  state.route = route;

  fetchData(route, function(err, data) {
    merge(state.data, data);
    render();
  });
});
```

Note that **for the first render we don't need to fetch data** (since it was already sent by the server). But for subsequent route changes, we need to fetch the necessary data for that new route.

However, we can improve the logic of that last piece. Indeed, in its current form we wait for the data fetching to finish before actually rendering the route change. While this was necessary on the server, on the client we can **render the route change immediately**, fetch the data in the background, and re-render when it comes back (maybe showing a loading spinner in the meantime):

```javascript
// client.js
// ...
addLocationChangeListener(function(path) {
  var route = matchPath(path);
  state.route = route;
  // render immediately with no/old data (can show a loading spinner)
  render();

  // fetch data in the background then re-render
  fetchData(route, function(err, data) {
    merge(state.data, data);
    render();
  });
});
```

## Authentication

Most apps have some sort of authentication logic. They protect access to certain routes and redirect to a sign-in screen when needed. How would that work with isomorphism?

If authentication is persisted from one browser session to the next, as is often the case, then **cookies are the shared persistence layer** between client and server (both have access to them). If we use an "auth token" to access the remote data API, we can store that token in a cookie (this is not a post on security, so make sure you do your due-diligence regarding setting expiration dates, being able to revoke tokens, using SSL, etc.).

Being authenticated or not is also part the the app's `state`. We can create the following helper function:

```javascript
// isAuthenticated.js
function isAuthenticated(state) {
  return Boolean(state.authToken);
}
```

Now, for each request on the server-side, we first read the value of the cookie, and **check if the auth token is valid**. If it is not valid and we are trying to access a protected route, we **redirect to the sign-in page**. In other cases, we proceed with fetching the data for that route and rendering.

```javascript
// server.js
server.use(function(req, res) {
  var state = {};
  var authToken = getCookie('authToken');
  checkSession(authToken, function(err, isValidToken) {
    if (isValidToken) {
      state.authToken = authToken;
    } else {
      clearCookie('authToken');
      state.authToken = null;
    }
    var route = matchPath(req.url);
    if (isAuthRequiredForRoute(route) && !isAuthenticated(state)) {
      res.redirect(303, signInPath());
      return;
    }
    state.route = route;
    // fetch data, render app, expose state, send html...
  });
});
```

On the client, the first render already has the authentication check done by the server, and the auth token was already loaded from the cookie into the serialized state. However, for each route change happening on the client we also need to perform the check "is this route protected and are we authenticated", and redirect appropriately. "Redirecting" on the client means replacing the browser's URL location (which will trigger a change event, in our implementation).

```javascript
// client.js
// grab server state, first render... then:
addLocationChangeListener(function(path) {
  var route = matchPath(path);
  if (isAuthRequiredForRoute(route) && !isAuthenticated(state)) {
    replaceLocation(signInPath());
    return;
  }
  state.route = route;
  render();
  // fetch data, update state, render...
});
```

## Configuration

Using configuration values is also a common pattern for apps. For instance, you might set `API_HOST` to point to different environments (development, staging, production) of the remote data API.

```javascript
// config.js
var config = {
  API_HOST: process.env.API_HOST || 'http://localhost:3000/api'
};
```

```javascript
// server.js
var config = require('./config');
api.useConfig(config);
```

On the server, we can get config values from **environment variables** (or a local text file). However, that's not possible on the client.

So we'd like to share the `config` values with the client, just like we share the app `state` (for security purposes, you might want to filter some config values like API secrets before sending it to the client). We'll keep it separate, because unlike the app state, config isn't suppose to change during the app's life cycle. Indeed, we initialize services (for example the `api` client) with the config values when the server starts. Config is **shared across requests**, whereas the app state is created on every request. The "serialize, parse & instantiate" mechanism between server and client stays the same.

```javascript
// server.js
var config = require('./config');
api.useConfig(config);

server.use(function(req, res) {
  var state = {};
  // check session, get route, fetch data... then:
  var exposedConfig = 'window.__CONFIG__=' + JSON.stringify(config) + ';';
  var exposedState = 'window.__STATE__=' + JSON.stringify(state) + ';';
  var appHtml = React.renderToString(<App route={route} data={data} />);
  var html = injectIntoHtml({
    app: appHtml,
    config: exposedConfig,
    state: exposedState
  });
  res.send(html);
});
```

```javascript
// client.js
var config = window.__CONFIG__;
var state = window.__STATE__;

api.useConfig(config);
// first render, add location change listener...
```

## Disabling isomorphism

If isomorphism means the app can run both on the server and in the browser, we should be able to "turn off" the server part and still have a working app. This could be useful during development for example, so we can take more advantage of the browser's developer and debugging tools.

Let's use a config value to turn isomorphism on and off:

```javascript
// config.js
var config = {
  // ...
  DISABLE_ISOMORPHISM: process.env.DISABLE_ISOMORPHISM === 'true' || false
};
```

On the server, when isomorphism is off, we only need to send the serialized `config` in an empty HTML page (that contains a link to the JS app bundle), and the client will take care of the rest:

```javascript
// server.js
server.use(function(req, res) {
  if (config.DISABLE_ISOMORPHISM) {
    var exposedConfig = 'window.__CONFIG__=' + JSON.stringify(config) + ';';
    var html = injectIntoHtml({
      config: exposedConfig
    });
    res.send(html);
  } else {
    var state = {};
    // check session, fetch data, render app,
    // expose state & config, send html...
  }
});
```

The client now has more things to do for the first render. It needs to perform the tasks that were usually done by the server when isomorphism was turned on: create a new app state, read the auth token from the cookie, check if it's a valid session, match a route from the browser's URL location, fetch the data for that route, and finally render.

```javascript
// client.js
var config = window.__CONFIG__;
api.useConfig(config);

var state;
// first render
if (config.DISABLE_ISOMORPHISM) {
  state = {};
  var authToken = getCookie('authToken');
  api.checkSession(authToken, function(err, isValidToken) {
    if (isValidToken) {
      state.authToken = authToken;
    } else {
      clearCookie('authToken');
      state.authToken = null;
    }
    var route = matchPath(getCurrentPath());
    if (isAuthRequiredForRoute(route) && !isAuthenticated(state)) {
      replaceLocation(signInPath());
      route = matchPath(signInPath());
    }
    state.route = route;
    // render immediately with no data (can show a loading spinner)
    state.data = {};
    render();
    // fetch data in the background then re-render
    fetchData(route, function(err, data) {
      merge(state.data, data);
      render();
    });
  });
} else {
  state = window.__STATE__;
  render();
}

// add browser location change listener...
```

With this in place, the app should now function normally with isomorphism turned on or off. The first render will just take a little more time in the browser when isomorphism is off.

## Progressive enhancement

In the previous section we saw how to handle turning off the server-side rendering portion. What if we "turned off" the client-side portion? That would probably mean disabling JavaScript in the browser, and "going back" to the good old request/response cycle where every route is rendered on the server.

This is also known as "Progressive Enhancement". There are already plenty of [good articles](http://ponyfoo.com/articles/tagged/progressive-enhancement) that explain why and when you should do it, so I won't go into that here.

The bare-minimum of Progressive Enhancement is to be able to go from one route to another with JS turned off. This means **using actual link tags** (`<a>`) with their `href` attribute defined (this is also important for **accessibility**). When JS is enabled, you can **intercept the click event** on the `<a>` elements to prevent a page refresh and handle the routing on the client. A simple React component achieving this could look like:

```javascript
// Link.jsx
var Link = React.createClass({
  render: function() {
    return (
      <a {...this.props} onClick={this.handleClick}>{this.props.children}</a>
    );
  },
  handleClick: function(e) {
    e.preventDefault();
    navigateTo(this.props.href);
  }
});
```

This should cover most, if not all, of the "read" scenarios for the app. What about "writes", i.e. creating and updating data? For that, we need to make sure to capture user input in a `<form>`, and create **an additional route to handle the form's POST action** (we set this route in the form's `action` attribute). Just like previously, when JS is enabled we **intercept the submit event** on the `<form>` element, and handle the routing on the client.

```javascript
// NewContact.jsx
var NewContact = React.createClass({
  getInitialState: function() {
    return {working: false};
  },

  render: function() {
    <form action="/contacts/create" onSubmit={this.handleSubmit}>
      <input ref="name" name="name" placeholder="New contact" />
      <button type="submit" disabled={this.state.working}>Create</button>
      {this.state.working ? 'Working...' : null}
    </form>
  },

  handleSubmit: function(e) {
    e.preventDefault();
    this.setState({working: true});
    var name = this.refs.name.getDOMNode().value;
    navigateTo('/contact/create?name=' + urlEncode(name));
  }
});
```

Note that when JS is enabled on the client, we can **enhance the experience** by showing a "loading" indicator while we process the form.

For this to work properly, we will need to add **hooks to the routing logic**, specifically *before* the route change, so we can process the form data and then redirect to a new route when done. It could look like this in the `routes` declaration:

```javascript
// routes.js
var routes = {
  'contacts': {
    path: '/contacts'
  },
  'contact-new': {
    path: '/contact/new'
  },
  'contact-create': {
    path: '/contact/create',
    before: function(params, query, done) {
      createContact(query, function() {
        done({redirect: true, path: '/contacts'});
      });
    }
  },
  // ...
};
```

One thing to note is that **routing is now asynchronous**. The `before()` hook takes a `done()` callback, and the route will only change once it is called (or in our case, we redirect to another route). This means that instead of only having to match a path to a route with `var route = matchPath(path)`, we will have something like `executeRouting(path, function(route) { /*...*/ })`.

```javascript
// server.js
server.use(function(req, res) {
  var state = {};
  // check session... then:
  // routing is now async
  executeRouting(req.url, function(route) {
    // check if a routing hook flagged the route as a redirect
    if (route.redirect) {
      res.redirect(303, route.path);
      return;
    }
    if (isAuthRequiredForRoute(route) && !isAuthenticated(state)) {
      res.redirect(303, signInPath());
      return;
    }
    state.route = route;
    // fetch data, render app, expose state & config, send html...
  });
});
```

So now, when JS is disabled, submitting the "new contact" form will sent a `POST` request to `/contact/create`. The `executeRouting()` call will wait until `createContact()` is finished (in the route's `before()` hook), and then redirect to `/contacts`.

We need to update the client-side with the new routing logic as well:

```javascript
// client.js
// grab server state, first render... then:
addLocationChangeListener(function(path) {
  executeRouting(path, function(route) {
    if (route.redirect) {
      replaceLocation(route.path);
      return;
    }
    if (isAuthRequiredForRoute(route) && !isAuthenticated(state)) {
      replaceLocation(signInPath());
      return;
    }
    state.route = route;
    render();
    // fetch data, update state, render...
  });
});
```

If JS is enabled on the client, submitting the "new contact" form will set the state of the `<NewContact>` component to `{working: true}`, thus showing a loading indicator. No page refresh happens: the form is processed entirely client-side, as well as the redirect to `/contacts` when finished, thanks to the same `before()` routing hook.

## Flux

[Flux](http://facebook.github.io/flux/) is a common data-flow architecture for React apps that have a non-trivial amount of data and state to deal with, so let's see how it would look like in an isomorphic app. I purposely left it for last, because I wanted to show that all the previous concerns (sharing state, routing, authentication, progressive enhancement, etc.) have nothing to do with Flux (or React for that matter), and are completely valid in other app architectures.

With Flux, the app **state** is contained in **stores**, and it gets updated by sending **actions** through a **dispatcher**. So just like our simple `state` object used in previous examples, on the server-side we need to make sure to have **one "Flux instance"** of stores and dispatcher **for each request** (so different app states don't collide with each other between requests). We'll imagine we can do this with:

```javascript
var flux = createFlux();
```

The instance has its own dispatcher, and we can send actions to it with action creators, like so:

```javascript
createContact(flux, {name: 'Bob'});
```


The instance has its own stores, registered to its dispatcher, and we can access these stores like so:

```javascript
var contact = flux.ContactStore.get('1');
```

**Checking the user session** and **fetching data** both update the app state, so it makes sense to do them through **actions**. However, for this to work inside a request on the server-side, we need to provide action creators with a `done()` callback so we can wait for the session-checking and data-fetching to finish before sending the server response. Be careful though not to pass any arguments to this `done()` callback, in order to keep the "fire and forget" nature of actions when they are used inside components on the client (we don't want components to "wait" for actions to finish and update their internal state, we want them to listen to changes from stores, the "single source or truth").

```javascript
// actions/loadSession.js
function loadSession(flux, payload, done) {
  var authToken = getCookie('authToken');
  flux.dispatch('LOAD_SESSION_START');
  api.checkSession(authToken, function(err, isValidToken) {
    if (err) {
      flux.dispatch('LOAD_SESSION_FAILURE', err);
      done();
      return;
    }
    if (isValidToken) {
      flux.dispatch('LOAD_SESSION_SUCCESS', authToken);
      state.authToken = null;
    }
    else {
      clearCookie('authToken');
      flux.dispatch('LOAD_SESSION_SUCCESS', null);
    }
    done();
  });
}
```

```javascript
// actions/fetchContact.js
function fetchContact(flux, payload, done) {
  flux.dispatch('FETCH_CONTACT_START');
  api.getContact(payload.contactId, function(err, contact) {
    if (err) {
      flux.dispatch('FETCH_CONTACT_FAILURE', err);
      done();
      return;
    }
    flux.dispatch('FETCH_CONTACT_SUCCESS', contact);
    done();
  });
}
```

Similarly, **routing** can also be done through an **action** since it changes app state:

```javascript
// actions/navigateTo.js
function navigateTo(flux, payload, done) {
  var route = matchPath(payload.path);
  var isAuthenticated = flux.AuthStore.isAuthenticated();
  if (isAuthRequiredForRoute(route) && !isAuthenticated) {
    flux.dispatch('REDIRECT', signInPath());
    done();
    return;
  }
  flux.dispatch('CHANGE_ROUTE', route);
  done();
}
```

Data fetching depends on the route, so we can define it in the routes declaration, and use action creators to execute it:

```javascript
// route.js
var routes = {
  'contact-details': {
    path: '/contact/:id',
    fetchData: function(flux, params, query, done) {
      fetchContact(flux, {contactId: params.id}, done);
    }
  },
  // ...
};
```

We create a general `fetchData` function, which will get the current route from the app state and fetch any required data defined for that route:

```javascript
// fetchData.js
function fetchData(flux, done) {
  var route = flux.RouteStore.currentRoute();
  var dataFetcher = route.fetchData;
  if (!dataFetcher) {
    return done();
  }
  dataFetcher(flux, route.params, route.query, done);
}
```

We still need to be able to **serialize** the app state (now contained in stores) on the server, and **parse and instantiate** it on the client. Let's imagine our `flux` instance has two methods, `var serializedState = flux.dehydrate()` and `flux.rehydrate(serializedState)` that accomplish this. On the server, it asks each store to serialize its state, and on the client it re-populates the state of each store.

Bringing it all together, this is what our server and client would look like:

```javascript
// server.js
server.use(function(req, res) {
  var flux = createFlux();
  loadSession(flux, {}, function() {
    navigateTo(flux, {path: req.url}, function() {
      var redirectPath = flux.RouteStore.redirectPath()
      if (redirectPath) {
        res.redirect(303, redirectPath);
        return;
      }
      fetchData(flux, function() {
        var exposedState = 'window.__STATE__=' + flux.dehydrate() + ';';
        var appHtml = React.renderToString(<App flux={flux} />);
        var html = injectIntoHtml({
          app: appHtml,
          state: exposedState
        });
        res.send(html);
      });
    });
  });
});
```

```javascript
// client.js
var state = window.__STATE__;
var flux = createFlux();
flux.rehydrate(state);

function render() {
  React.render(<App flux={flux} />, document.getElementById('app'));
}

// first render
render();

addLocationChangeListener(function(path) {
  navigateTo(flux, {path: path}, function() {
    var redirectPath = flux.RouteStore.redirectPath()
    if (redirectPath) {
      replaceLocation(redirectPath);
      return;
    }
    render();
    fetchData(flux, render);
  });
});
```

Of course, this is one possible way to combine Flux and isomorphism, and I'm sure there are other completely valid or even better ways.

## Practical implementation

Now that we've explored what general concepts and problems to solve arise with Isomorphic JavaScript apps, let's look at a more real-world implementation. This [GitHub repository](https://github.com/nicolashery/example-isomorphic-one) contains an example app built using [Yahoo's Fluxible](https://github.com/yahoo/fluxible) and [React Router](https://github.com/rackt/react-router).

The is one possible choice of libraries, and I'm sure another one would work just as well.

**Fluxible** is a Flux implementation that was built with isomorphism in mind, and provides a solution to the "one Flux state for each request" problem. It does add some additional abstractions you need to learn (ex: different "contexts" for actions, stores, components), but you get used to it. They also tried to keep it modular (for instance I didn't have to use their router solution, and used React Router instead), and extensible (with "Fluxible plugins"). Actions have "done" callbacks, which means we can use them on the server inside a request handler.

**React Router** is quite popular, and has a "nested" route definitions. This allows you to declare data fetching logic at the component-level (instead of the route-level), and when the route changes the router automatically "walks the component render tree", so you can aggregate and fetch each component's required data. On the flip-side, the router owns the "route state", which means it will be separate from the rest of the app state (i.e. not in a Flux store). But you could still "sync" it to a store if you wanted to.

With Fluxible, the `flux` "instance" (i.e. state) that we create on each request is called a `context`. The action creators, stores, and components get access to only part of the context: this ensures, for example, that only action creators can "dispatch" actions, but also means you have to use an additional abstraction.

We can also use the (undocumented) `React.withContext()` function (careful not to use it to replace `props` though). With it, every component has access to Fluxible's component `context` without having to pass it down as a property.

**Update (2015-04-21):** `React.withContext()` is deprecated, but the React `context` feature is not going away. Fluxible now provides a `FluxibleComponent` that we use to wrap our top-level component, providing child components with Fluxible's context.

I ended up putting `config` values in Fluxible plugins, since they also have `dehydrate`/`rehydrate` methods. For example, I have an `apiPlugin` that holds the `API_HOST` config value, read from an environment variable on the server, and sent to the client via the plugin's dehydrate method.

The routing logic is executed by React Router. Checking authentication and redirecting is done through the `willTransitionTo` static method (at the time of writing I had to use [a fork of React Router](https://github.com/rackt/react-router/pull/590) that supports passing the `context` to that method).

The `fetchData` function takes as an argument the `routerState` that was passed to React Router's `router.run()` callback. Using `routerState.routes`,  an array of all handler components that will be rendered for that route, we can grab all the `fetchData` static methods from components that have one, and run them in parallel.

Since React Router is separate from the Flux implementation, to be able to "dispatch routing actions" (for example, redirect after sign-in), I wrapped the router in a Fluxible `routerPlugin`. This way I can call `context.getRouter().transitionTo()` from inside an action creator. It might not be the most elegant way, but it works.

The first render on the client happens inside the `router.run()` handler, just like subsequent renders. We want to "flag" the first render and treat it differently, so we don't re-fetch all the data we already got from the server-side rendering.

Regarding progressive enhancement, specifically supporting posting forms with JS disabled, we work with the fact that React Router "handlers" are just components. So we need a "fake" component to handle the form's POST route (ex: `<form action="/contact/create">`), and we use that component's `willTransitionTo` static method to perform the API call.

If you're going through the example GitHub repository, a good place to start is to look at [server.js](https://github.com/nicolashery/example-isomorphic-one/blob/master/src/server/index.js) and [client.js](https://github.com/nicolashery/example-isomorphic-one/blob/master/src/client/index.js).

## Conclusion

Throughout my exploration of the subject and this post, I've tried to extract some general concepts related to Isomorphic JavaScript. Hopefully these are common across different implementations, under some form or another. I've also given a small practical example using existing libraries (Fluxible, React Router).

There are of course other things to explore, for example data loading indicators on the client-side, "optimistic" updates and the impact on progressive enhancement, handling API call errors, handling "not found" routes, setting/removing cookies, other data fetching strategies, etc.

My conclusion so far is that Isomorphic JavaScript is still young, and I expect different interesting approaches and libraries to appear in the future. There are also still ongoing debates about the pros & cons, and whether or when should you use it. I do find that it adds some complexity to your app, and increases the "surface area for bugs". But it's definitely something we should pay attention to, and keep an eye on as it evolves.

In some way, it gives a web app a more "original web"-like experience (but with enhanced performance on the client), versus just a "packaged app" that you download. URLs become truly "first-class", and you end up spending more time thinking about them. It also pushes you to embrace the "stateless" nature of URLs. You can see the app somewhat becoming a "function" taking as arguments a URL and some auth information in a cookie, and returning rendered data.

If you haven't already, give "Isomporphic JavaScript" a try, and do share your thoughts and findings!




































