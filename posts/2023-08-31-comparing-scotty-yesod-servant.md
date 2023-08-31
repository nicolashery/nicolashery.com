---
layout: post
title: Comparing request handlers in Scotty, Yesod, and Servant
description: This post compares how to implement a non-trivial request handler in some popular Haskell web frameworks. We also consider integrating with a custom monad stack and doing things outside of IO.
---

[[TOC]]

## Context

When someone asks [on the internet](https://www.reddit.com/r/haskell/) "which Haskell web framework should I use?", popular answers are [Scotty](https://github.com/scotty-web/scotty), [Yesod](https://www.yesodweb.com/), or [Servant](https://www.servant.dev/). Each answer gives different arguments and tradeoffs.

On one end of the spectrum, Scotty is easy to start with. It is similar to Ruby's [Sinatra](https://sinatrarb.com/) or Node.js' [Express](http://expressjs.com/), which I've used extensively in previous jobs. Therefore, when learning Haskell, Scotty was a natural pick for [my first small project](https://github.com/nicolashery/example-marvel-app). I wanted to learn the language Haskell, not a web framework and its specifics.

I had a positive experience using Scotty for this first project, so I was curious when reading some comment threads that pointed out some of its shortcomings. For example:

> Sure, [Scotty] *looks* simple, but as soon as you try to do *anything* more flexible or powerful, you need to know how to dig into how monad transformers work. The documentation on extending it isn't great either.
>
> [...]
>
> `ActionM` and `ScottyM` are okay, but then you want a `ReaderT` or you want to `forkIO` or you want to do a `bracket` and suddenly you're thrown into a hell of monad transformer Weirdness.
>
> [r/haskell/comments/l7q1dx/using_scotty_in_production/](https://www.reddit.com/r/haskell/comments/l7q1dx/using_scotty_in_production/)

Also:

> `scotty` has basically 0 features, which makes it seem simple, but it's actually rather complex under the hood, and that complexity leaks out as soon as you need to do anything non-trivial (eg make your handlers in something other than `IO`).
>
> [r/haskell/comments/v7ryqt/minimal_web_framework_ie_flask_for_haskell/](https://www.reddit.com/r/haskell/comments/v7ryqt/minimal_web_framework_ie_flask_for_haskell/)

I don't mean this to be a criticism of Scotty. Users, including myself, agree it fills a specific space in the Haskell web framework ecosystem.

These fair remarks prompted me to try doing something "non-trivial" with Scotty and see how easy or complicated that would be. Then, I would compare it to doing the same with Yesod, which I've used a little, and Servant, which we use at work.

Of course, there are other Haskell web frameworks out there. But in the interest of time, I chose to limit myself to these three due to their popularity and my familiarity with them.

Some of the other frameworks, which I did not look into here, include:

- [IHP](https://ihp.digitallyinduced.com/)
- [Spock](https://www.spock.li/)
- [Hapstack](https://www.happstack.com/)
- [Twain](https://github.com/alexmingoia/twain)
- [Okapi](https://github.com/monadicsystems/okapi)
- [WebGear](https://haskell-webgear.github.io/)
- etc.

## Non-trivial request handler

To create a "non-trivial" web request handler to use as an example, I thought back at previous real-world web applications I had worked on and what similar things they needed to do.

While certainly not exhaustive, these are the features I decided my example web request handler would need to showcase:

- **Read configuration** values (using [`ReaderT`](https://hackage.haskell.org/package/transformers/docs/Control-Monad-Trans-Reader.html#t:ReaderT))
- **Logging** (using [`MonadLogger`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:MonadLogger) and [`monad-logger-aeson`](https://hackage.haskell.org/package/monad-logger-aeson))
- Make **database calls** (using [`postgresql-simple`](https://hackage.haskell.org/package/postgresql-simple))
- Make **HTTP calls** (using [`req`](https://hackage.haskell.org/package/req))
- **Fork threads** for asynchronous behavior (using [`concurrently`](https://hackage.haskell.org/package/unliftio/docs/UnliftIO-Async.html#v:concurrently) from `UnliftIO.Async`)
- Throw and handle **asynchronous exceptions** (using [`catch`](https://hackage.haskell.org/package/unliftio/docs/UnliftIO-Exception.html#v:catch) from `UnliftIO.Exception`)
- Acquire and release **resources** (using [`bracket`](https://hackage.haskell.org/package/unliftio/docs/UnliftIO-Exception.html#v:bracket) from `UnliftIO.Exception`)
- Return early with an **error response** (which depends on the web framework)

I included the Haskell solution I chose for my test, but there are other options. Also, note that these are general web application features and not specific to Haskell.

## Custom monad

The one Haskell-specific thing I wanted my example to demonstrate was using a **custom monad**. Each framework provides a built-in type (ex: `Handler`), which we can use to define web request handlers. Instead, we'll replace or combine it with our custom monad (ex: `App`).

I see this monad as a way to provide "**dependency injection**" to our handlers for logging, database connection pools, HTTP clients, etc. Accessing such dependencies is frequent in "non-trivial" web applications.

There are different flavors of custom monads used in Haskell applications. One is creating a monad transformer stack (ex: stacking `ReaderT`, `LoggingT`, `DatabaseT`, etc.). Another one that is gaining popularity is the so-called [ReaderT design pattern](https://www.fpcomplete.com/blog/readert-design-pattern/). We'll use the latter in our example. We define our custom monad as:

```haskell
newtype App a = App
  { unApp :: ReaderT AppEnv IO a
  }
```

`AppEnv` holds everything we'll need in our web handlers (configuration values, database connection pool, etc.):

```haskell
data AppEnv = AppEnv
  { appEnvConfig :: Config,
    appEnvLogFunc :: LogFunc,
    appEnvHttpConfig :: HttpConfig,
    appEnvDbPool :: Pool Connection
  }
```

## Fake cart purchase for a booking site

To illustrate a somewhat realistic request handler, imagine we're implementing the cart purchase functionality for an event booking site. We'll create a single endpoint:

```text
POST /cart/:cartId/purchase
```

We'll assume the cart is already filled by the user and is stored in the database.

Below is what will happen when a request is made to the purchase endpoint. It covers all of the common web application features listed earlier:

- We retrieve the cart status by making a **database call**.
- If no cart exists for that cart ID, or if the cart is already purchased or locked, we return an **error response**.
- Before starting the purchase, acquire the cart as a **resource** by locking it. When the purchase is successful or when an error occurs, release the cart by unlocking it. We implement this in the example by making a **database call** to update the cart's status, although other ways exist for an actual application. (We use this resource mechanism to prevent, for instance, the double purchase of a cart in the case of multiple requests for the same cart ID.)
- Purchasing a cart involves making two requests to external services: one to a booking partner to reserve the seats and another to a payment provider to process the payment. These requests can be done in parallel. So we **fork threads** and wait for both to complete.
- We use **HTTP calls** to external services to process the booking and payment.
- The API URLs for the booking partner and the payment provider are read as **configuration values**.
- In the scenario where either the booking or the payment fails, **an asynchronous exception** is thrown. We catch it and return a specific error response. (In a real application, we'll also want to do some cleanup here, such as reimburse the payment or cancel the seat reservations.)
- If everything goes well, we mark the cart as purchased using a **database call** and return a successful response.
- During all of this, we use **logging** in key places, such as when we are unable to purchase the cart or before and after making the booking and processing the payment.

This is what the complete handler looks like, using Servant:

```haskell
postCartPurchaseHandler :: CartId -> App CartPurchaseResponse
postCartPurchaseHandler cartId = do
  cartStatusMaybe <- getCartStatus cartId
  case cartStatusMaybe of
    Nothing -> do
      logWarn $ "Cart does not exist" :# ["cart_id" .= cartId]
      throwIO $ jsonError err404 "Cart does not exist"
    Just CartStatusPurchased -> do
      logWarn $ "Cart already purchased" :# ["cart_id" .= cartId]
      throwIO $ jsonError err409 "Cart already purchased"
    Just CartStatusLocked -> do
      logWarn $ "Cart locked" :# ["cart_id" .= cartId]
      throwIO $ jsonError err409 "Cart locked"
    Just CartStatusOpen -> do
      withCart cartId $ do
        logInfo $ "Cart purchase starting" :# ["cart_id" .= cartId]
        let action :: App (Either Text (BookingId, PaymentId))
            action = Right <$> concurrently (processBooking cartId) (processPayment cartId)
            handleError :: CartException -> App (Either Text (BookingId, PaymentId))
            handleError (CartException msg) = pure $ Left msg
        result <- catch action handleError
        case result of
          Left msg -> do
            logWarn $ ("Cart purchase failed: " <> msg) :# ["cart_id" .= cartId]
            throwIO $ jsonError err500 ("Cart purchase failed: " <> msg)
          Right (bookingId, paymentId) -> do
            markCartAsPurchased cartId
            logInfo $ "Cart purchase successful" :# ["cart_id" .= cartId]
            pure $
              CartPurchaseResponse
                { cartPurchaseResponseCartId = cartId,
                  cartPurchaseResponseBookingId = bookingId,
                  cartPurchaseResponsePaymentId = paymentId
                }
```

## Key takeaways

You can find the source code for the full example [on GitHub](https://github.com/nicolashery/example-handlers-haskell). It implements the same web request handler and custom monad based on `ReaderT IO` in all three frameworks: Scotty, Yesod, and Servant.

I won't dive into the implementations' details and the differences between each framework. That could make for another blog post in itself. Instead, I'll highlight what I took away from this experiment.

**Scotty**:

- Scotty's default `ActionM` (alias for `ActionT TL.Text IO`) doesn't allow you to do much outside of `IO`, so most will want to use `ActionT` right from the start (for example, to use a `ReaderT` to access configuration and other dependencies).
- To use `ActionT` with a custom monad (let's call it `App`), you must write the `runApp :: App a -> IO a` transformation. Although there is an example [in Scotty's repo](https://github.com/scotty-web/scotty/blob/master/examples/reader.hs), it may take some work to find, especially for beginners.
- Scotty's `ActionT` is stateful (contains `ExceptT` and `StateT`), so we can't define a `MonadUnliftIO` instance for it. We'll need to use `lift` in the web handler for all operations with that constraint to run them directly in our custom monad `App`.
- Using `lift` means we can't call Scotty's functions inside those blocks. For example, we can't send an HTTP response directly from the error handler of `catch`. (This might not be a bad thing, to help separate HTTP concerns from business logic).
- I think I would still recommend Scotty to beginners (over Yesod and Servant). However, I'd suggest having some basic monad transformer knowledge and using `ActionT` directly. I'd point to an example of such usage (for instance, [nicolashery/example-handlers-haskell](https://github.com/nicolashery/example-handlers-haskell) or [eckyputrady/haskell-scotty-realworld-example-app](https://github.com/eckyputrady/haskell-scotty-realworld-example-app)).

**Yesod**:

- Yesod's `Handler` (alias for `HandlerFor AppEnv`) is similar to a `ReaderT` over `IO` monad, and it already has useful instances for `MonadUnliftIO`, `MonadLogger`, etc. There is no real need to define a custom monad stack if we want to use `ReaderT IO` anyway, so there is no need to call `lift` or `runApp` around our business logic functions.
- However, access to `AppEnv` will require using `getsYesod` instead of `asks`. We can define instances of the type `HasFoo` for `HandlerData AppEnv AppEnv`, to use with a `(MonadReader env m, HasFoo env)` constraint. But that felt like going into Yesod's internal implementation.
- Aside from the web handlers, Yesod's usage of Template Haskell for routes and scaffolding does introduce a bit of indirection and "magic". Although the tradeoff in reduced boilerplate and increased type safety is probably worth it for more experienced Haskell developers, I don't know if I would recommend it for beginners.

**Servant**:

- Servant's documentation explains how to use a custom monad for your web handlers. However, the [tutorial](https://docs.servant.dev/en/stable/tutorial/Server.html#using-another-monad-for-your-handlers) uses the simple example of `Reader String`, and the [cookbook](https://docs.servant.dev/en/stable/cookbook/using-custom-monad/UsingCustomMonad.html) suggests defining a `ReaderT AppEnv Handler`.
- Since `Handler` is stateful (contains `ExceptT`), we can't define a lawful `MonadUnliftIO` instance for it. After searching the web (for example [here](https://harporoeder.com/posts/servant-13-reader-io/) and [here](https://www.parsonsmatt.org/2017/06/21/exceptional_servant_handling.html)), we realize we can use `ReaderT AppEnv IO` instead of `ReaderT AppEnv Handler`. We do this by using `try` and wrapping with an `ExceptT` and `Handler` in our "natural transformation" function.
- After this initial setup, everything else is relatively straightforward since the web handlers run directly in our custom monad `App`.
- Aside from the web handlers, Servant's usage of the type system to define routes does make for a steep learning curve. Although the tradeoff in type safety is probably worth it for a team of experienced and professional Haskell developers, I'm not sure I would recommend it for beginners.

## Further reading

If you'd like to dive deeper into the code of the example, here are a few places to get started:

- The implementation of the "purchase cart" request handler, as well as the definition of the custom `App` monad where applicable, can be found for each framework at:
  - [`src/App/Scotty.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/Scotty.hs)
  - [`src/App/Yesod.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/Yesod.hs)
  - [`src/App/Servant.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/Servant.hs)
- [`src/App/AppEnv.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/AppEnv.hs):
  Shared `AppEnv` used in the `ReaderT` of the custom `App` monad
- [`src/App/Cart.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/Cart.hs): Cart business logic that makes database calls and HTTP calls and is meant to be reusable across frameworks
- [`src/App/External.hs`](https://github.com/nicolashery/example-handlers-haskell/blob/main/src/App/External.hs): A separate HTTP server acting as fake booking and payment external services

## Wrapping up

I had set out to explore how to implement a non-trivial request handler and integrate with a custom monad `App` based on `ReaderT IO` in three popular Haskell web frameworks: Scotty, Yesod, and Servant.

I would say that Servant makes this the easiest since you can write all of your handlers directly in the custom monad `App`. You then provide a transformation function from `App` to Servant's `Handler`. Servant's type-level DSL for defining routes means you get all the request parameters and body as arguments to the handler function. Sending responses is done by returning data from the handler function or throwing an error.

Yesod is a close second. Its `Handler` type is already equivalent to a `ReaderT IO`, so you don't need to define a custom `App` if that's what you want. It also already has useful instances such as `MonadLogger`, `MonadReader`, and `MonadUnliftIO`. This means you generally can use business logic functions directly without using `lift` or `runApp`.

Scotty makes it possible to use a custom monad thanks to `ActionT`. However, as the internet comments from the introduction pointed out, it has some shortcomings. You can't define an instance for `MonadUnliftIO`, so you must `lift` any action that uses it. Other instances might be tricky for beginners to write. Also, parsing request parameters and body is slightly more manual than the other two frameworks.

Nevertheless, Scotty is by far the easiest framework to get started with. It doesn't use advanced type system concepts or code generation with Template Haskell. This is why I would still recommend it for people starting out with Haskell.

On parting thoughts, there might be a place for another Haskell web framework in the spirit of Scotty. One that uses basic Haskell concepts but has a few more features out-of-the-box and is easier to integrate with a custom monad. Perhaps such a framework, or something close to it, already exists.
