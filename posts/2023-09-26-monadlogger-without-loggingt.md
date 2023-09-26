---
layout: post
title: Using MonadLogger without LoggingT
description: This article shows how to integrate code that uses the MonadLogger typeclass with a concrete monad that doesn't use the LoggingT transformer, such as a ReaderT IO monad.
---

This post is likely more useful for people beginning with Haskell than those with more experience. When I was less comfortable with Haskell and its ecosystem, it wasn't obvious to me how to use code with a `MonadLogger` constraint without using the `LoggingT` transformer. Now that it makes sense, I thought I'd write up my notes. They might help someone who is asking themselves the same question.

[[TOC]]

## What are MonadLogger and LoggingT?

I'll assume you are already familiar with `MonadLogger` and `LoggingT`, but here is a quick overview if you need it.

The [`MonadLogger` typeclass](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:MonadLogger) from the `monad-logger` package provides a generic logging interface that other libraries and applications can use. It is then up to the caller to decide how logging actually happens. For example, the logs could go to `stdout` in JSON format, be collected in a list in memory, we could suppress logging altogether, etc. I like to think of it as _dependency injection_.

The [`LoggingT` monad transformer](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:LoggingT) is a helper that allows you to wrap a monad and give it logging capability thanks to its `MonadLogger` instance. It comes with useful utility functions, such as [runStdoutLoggingT](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#v:runStdoutLoggingT), to dispatch the transformer by giving it a concrete logging function.

From what I gathered, `MonadLogger` is quite popular and widespread in the Haskell library ecosystem and application code. Libraries like [`monad-logger-aeson`](https://hackage.haskell.org/package/monad-logger-aeson) and [`Blammo`](https://hackage.haskell.org/package/Blammo) build upon it and provide additional functionality such as structured logging in JSON, pretty-printing logs during development, and configuration via environment variables.

## Background

I was working on a codebase that was using monad transformer stacks. There were between 4 and 6 transformers for each custom monad, sometimes more. Something that looked like this:

```haskell
newtype App a = App
  {unApp :: ReaderT AppConfig (ExceptT AppError (TracingT (LoggingT IO a)))}
```

I had been reading up on the ["ReaderT design pattern"](https://www.fpcomplete.com/blog/readert-design-pattern/) and liked its simplicity and pragmatism.

I was also reading the book [Production Haskell by Matt Parsons](https://leanpub.com/production-haskell), which I recommend. It had a few passages on the topic that I found interesting. One discussing the ReaderT pattern:

> Fortunately, `ReaderT Env IO` is powerful enough that we don’t need any additional transformers.
> Every additional transformer provides more choices and complexity, without offering significant extra power.
> [...]
> We can write an instance of `MonadLogger` directly to avoid needing the `LoggingT` type.
>
> **Matt Parsons, Production Haskell (2023), "5.5 Embed, don't Stack"**

And another one discussing logging libraries:

> A common mispattern with this library [`monad-logger`] is incorporating the `LoggingT` transformer directly into your own code.
> `LoggingT` is a “minimal” transformer that should be used only when providing `MonadLogger` behavior to types you don’t control.
> Instead, consider writing a manual instance of `MonadLogger`, allowing you more flexibility in how the messages are used and formatted.
>
> **Matt Parsons, Production Haskell (2023), "17.4 Libraries in Brief"**

I wanted to see what it would take to refactor this particular codebase to use the ReaderT pattern and what the result would look like. In other words, to end up with something like this:

```haskell
newtype App a = App
  {unApp :: ReaderT AppEnv IO a}
```

The codebase had a lot of functions polymorphic on the monad `m` and using interfaces such as `MonadLogger`. Functions that looked like this:

```haskell
action :: (MonadConfig m, MonadLogger m, MonadIO m) => m ()
action = do
  itemUrl <- configItemUrl <$> getConfig
  logInfo $ "Fetching item" :# ["itemUrl" .= itemUrl]
  item <- liftIO $ fetchItem itemUrl
  -- ...
```

To get to a single `ReaderT`, I had to remove `LoggingT`. But all of the examples of logging I had seen so far used `LoggingT`.

Haskell has somewhat of a reputation that it lacks tutorial-style and beginner-friendly documentation. And that you must often figure things out by reading the types from the generated Haddock documentation. In all fairness, it's impressive that you *can* figure things out from the types most of the time, which I did for this particular matter. Few programming languages can boast of having such property. Nevertheless, there is still room for more tutorials. The rest of this post might help fill that gap.

## With LoggingT

First, let's briefly look at how using `MonadLogger` _with_ `LoggingT` looks like. If you are already familiar with this, feel free to skip to the next section.

We'll include `LoggingT` in our concrete monad `App`. For this example, our monad transformer stack contains only `ReaderT` and `LoggingT`. But it could have more transformers, as mentioned in the introduction above.

```haskell
newtype App a = App
  {unApp :: ReaderT AppEnv (LoggingT IO) a}
  deriving newtype
    ( -- ...
    , MonadIO
    , MonadReader AppEnv
    , MonadLogger
    )
```

Note that there is a [`MonadLogger` instance](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:MonadLogger) for `LoggingT`. There is also an instance for a `ReaderT` containing a monad with a `MonadLogger` instance. That is the idea behind monad transformers. So we can derive the `MonadLogger` instance for `App`, we don't need to write it ourselves.

In our `runApp` function, we can use one of the "run logging" functions provided by `monad-logger` to dispatch the `LoggingT`, such as [`runStdoutLoggingT`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#v:runStdoutLoggingT) (or the [`runStdoutLoggingT`](https://hackage.haskell.org/package/monad-logger-aeson/docs/Control-Monad-Logger-Aeson.html#v:runStdoutLoggingT) from `monad-logger-aeson`):

```haskell
runApp :: AppEnv -> App a -> IO a
runApp env action =
  runStdoutLoggingT $ runReaderT (unApp action) env
```

Alternatively, we can inject it into `runApp` as a `LoggingT IO a -> IO a` parameter. We then defer to the caller, such as our `main` function, to decide which "run logging" function to use. This is consistent with injecting other dependencies, like `AppEnv`:

```haskell
runApp :: AppEnv -> (LoggingT IO a -> IO a) -> App a -> IO a
runApp env runLogging action =
  runLogging $ runReaderT (unApp action) env
```

Let's say we have a function that uses logging, something like:

```haskell
action :: (MonadReader AppEnv m, MonadLogger m, MonadIO m) => m ()
action = do
  itemUrl <- asks appItemUrl
  logInfo $ "Fetching item" :# ["itemUrl" .= itemUrl]
  item <- liftIO $ fetchItem itemUrl
  if isInvalidItem item
    then
      logWarn
        $ "Skipping invalid item"
        :# [ "itemUrl" .= itemUrl
           , "itemId" .= itemId item
           ]
    else processItem item
```

And it is used in our app:

```haskell
app :: App ()
app = do
	-- ...
  action
```

We can run this using our `runApp` function and passing it the required dependencies as arguments:

```haskell
import Control.Monad.Logger.CallStack (runStdoutLoggingT)

main :: IO ()
main = do
  let appEnv =
        AppEnv
          { appName = "example"
          , appItemUrl = "https://www.example.com/item"
          }
      runLogging = runStdoutLoggingT
  runApp appEnv runLogging app
```

The example above also works for `monad-logger-aeson`, which is meant to be a drop-in replacement for `monad-logger` to get JSON structured logging.

[Blammo](https://hackage.haskell.org/package/Blammo) is another useful logging library. It is a wrapper around `monad-logger-aeson`, providing features such as environment variable configuration and pretty printing logs during development. Blammo has its own "run logging" functions to dispatch a `LoggingT`. We can use [`runSimpleLoggingT`](https://hackage.haskell.org/package/Blammo/docs/Blammo-Logging-Simple.html#v:runSimpleLoggingT), which has an equivalent signature to `runStdoutLoggingT`:

```haskell
import Blammo.Logging.Simple (runSimpleLoggingT)

main :: IO ()
main = do
  let -- ...
      runLogging = runSimpleLoggingT
  runApp appEnv runLogging app
```

For more customization, we can also use [`runLoggerLoggingT`](https://hackage.haskell.org/package/Blammo/docs/Blammo-Logging.html#v:runLoggerLoggingT). We pass it a [`Blammo.Logger`](https://hackage.haskell.org/package/Blammo/docs/Blammo-Logging.html#t:Logger) or an app environment record that contains one. See the [Blammo documentation](https://github.com/freckle/blammo#readme) for more details.

## Without LoggingT

If we want to call code with a `MonadLogger m` constraint without using `LoggingT`, we'll still need to run it in a concrete monad with a valid `MonadLogger` instance.  Let's keep our custom monad `App` from the example above, but we'll remove `LoggingT` and only keep `ReaderT` (also known as the ["ReaderT design pattern"](https://www.fpcomplete.com/blog/readert-design-pattern/)):

```haskell
newtype App a = App
  {unApp :: ReaderT AppEnv IO a}
  deriving newtype
    ( -- ...
    , MonadIO
    , MonadReader AppEnv
    )
```

Note that we can't derive a `MonadLogger` instance for `App` as we did earlier. We need to implement it ourselves.

Let's look at the definition of the [`MonadLogger`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:MonadLogger) type class:

```haskell
class Monad m => MonadLogger m where
    monadLoggerLog :: ToLogStr msg => Loc -> LogSource -> LogLevel -> msg -> m ()
```

Now let's look at how `LoggingT` implements it:

```haskell
instance MonadIO m => MonadLogger (LoggingT m) where
    monadLoggerLog a b c d = LoggingT $ \f -> liftIO $ f a b c (toLogStr d)
```

Or, rewritten for clarity:

```haskell
instance MonadIO m => MonadLogger (LoggingT m) where
    monadLoggerLog :: ToLogStr msg => Loc -> LogSource -> LogLevel -> msg -> LoggingT m ()
    monadLoggerLog loc logSource logLevel msg =
        LoggingT $ \logFunc ->
            liftIO $ logFunc loc logSource logLevel (toLogStr msg)
```

If we look at how [`LoggingT`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:LoggingT) is defined:

```haskell
newtype LoggingT m a = LoggingT
  {runLoggingT :: (Loc -> LogSource -> LogLevel -> LogStr -> IO ()) -> m a}
```

It looks similar to a [`ReaderT`](https://hackage.haskell.org/package/transformers/docs/Control-Monad-Trans-Reader.html#t:ReaderT), with `r` swapped for the logging function `Loc -> LogSource -> LogLevel -> LogStr -> IO ()`:

```haskell
newtype ReaderT r m a = ReaderT
  {runReaderT :: r -> m a}
```

Since our `App` is a `ReaderT AppEnv`, we should be able to do something similar as long as `AppEnv` contains a logging function that we can pull out. And since `App` has `IO` as the underlying monad, we can call the logging function, which runs in `IO`.

Let's first add the logging function to our `AppEnv`, aliasing it to `LogFunc` for convenience:

```haskell
type LogFunc = Loc -> LogSource -> LogLevel -> LogStr -> IO ()

data AppEnv = AppEnv
  { -- ...
  , appLogFunc :: LogFunc
  }
```

Now, we can implement our custom `MonadLogger` instance for `App`:

```haskell
instance MonadLogger App where
  monadLoggerLog loc logSource logLevel msg =
    App . ReaderT $ \appEnv -> do
      let logFunc = appLogFunc appEnv
      logFunc loc logSource logLevel (toLogStr msg)
```

Notice how similar this is to the `MonadLogger` instance for `LoggingT` shown earlier. On the outside, we reconstruct our monad with `App` and `ReaderT`. On the inside, the body is the `ReaderT` function `r -> m a`, in this case, `AppEnv -> IO ()`. We extract the logging function from `AppEnv`, and we can call it directly since the body is in `IO`.

An alternative implementation would be to use the instances we have for `App`. The `MonadReader AppEnv` instance gives us `asks`, and the `MonadIO` instance gives us `liftIO`. Using these instances would avoid explicitly rebuilding `App` with `ReaderT`. If our custom monad was more complex than the "ReaderT pattern", this might make things easier. Our new implementation would look like this:

```haskell
instance MonadLogger App where
  monadLoggerLog loc logSource logLevel msg = do
    logFunc <- asks appLogFunc
    liftIO $ logFunc loc logSource logLevel (toLogStr msg)
```

Now that we have a valid `MonadLogger` instance for `App`, we need to find a way to construct a logging function to put into our `AppEnv` when initializing the app.

For inspiration, we can look at the source of [`runStdoutLoggingT`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#v:runStdoutLoggingT) from `monad-logger`, which we used when we had `LoggingT` as part of our stack:

```haskell
runStdoutLoggingT :: MonadIO m => LoggingT m a -> m a
runStdoutLoggingT = (`runLoggingT` defaultOutput stdout)
```

We notice it uses [`defaultOutput`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#v:defaultOutput) from the section "utilities for defining your own loggers", which sounds like what we want. The `stdout` handle is from `base`.

Putting it together, `defaultOutput stdout` fits the type of the logging function we want in `AppEnv`:

```haskell
import Control.Monad.Logger.CallStack (defaultOutput)
import System.IO (stdout)

main :: IO ()
main = do
  let logFunc = defaultOutput stdout
      appEnv =
        AppEnv
          { -- ...
          , appLogFunc = logFunc
          }
  runApp appEnv app
```

The example above works for both `monad-logger` and `monad-logger-aeson`, after changing the imports appropriately. The latter also provides a [`defaultOutputWith`](https://hackage.haskell.org/package/monad-logger-aeson/docs/Control-Monad-Logger-Aeson.html#v:defaultOutputWith) if we need more customization.

For [Blammo](https://hackage.haskell.org/package/Blammo), I needed more work to figure out how to use it. We saw in the previous section that Blammo provides functions such as `runSimpleLoggingT` if we use a `LoggingT`. But it does not have utilities to construct our own logging function, similar to `defaultOutput` from `monad-logger`. It also defines a `Blammo.Logger` type that is initialized and configurable, by default via environment variables.

[Blammo's README](https://github.com/freckle/blammo#readme) has good tutorial-style documentation, with examples of how to customize and integrate it with various frameworks. However, at the time there weren't explicit examples of how to use it without `LoggingT`.

I looked at the source of [`runLoggerLoggingT`](https://hackage.haskell.org/package/Blammo/docs/Blammo-Logging.html#v:runLoggerLoggingT) and saw it was a bit more involved than `runStdoutLoggingT` from `monad-logger`:

```haskell
runLoggerLoggingT
  :: (MonadUnliftIO m, HasLogger env) => env -> LoggingT m a -> m a
runLoggerLoggingT env f = (`finally` flushLogStr logger) $ do
  runLoggingT
    (filterLogger (getLoggerShouldLog logger) f)
    (loggerOutput logger $ getLoggerReformat logger)
 where
  logger = env ^. loggerL
```

It uses non-exported internals such as `loggerOutput` and `getLoggerReformat` to construct a `MonadLogger` logging function. It also does more than build a logging function. For instance, it flushes logs with a `finally` and wraps the `LoggingT m` action `f` with `filterLogger`.

The next place I looked was the examples for RIO and Amazonka, where I noticed the usage of `askLoggerIO` from [`MonadLoggerIO`](https://hackage.haskell.org/package/monad-logger/docs/Control-Monad-Logger.html#t:MonadLoggerIO). This looked promising.

```haskell
class (MonadLogger m, MonadIO m) => MonadLoggerIO m where
    -- | Request the logging function itself.
    askLoggerIO :: m (Loc -> LogSource -> LogLevel -> LogStr -> IO ())
```

`LoggingT IO` has an instance of `MonadLoggerIO`, which makes sense since we give it the logging function when we run it.

So we can use Blammo's `runLoggerLoggingT` or `runSimpleLoggingT` to run a small `LoggingT IO` action just for the purpose of extracting the logging function with `askLoggerIO`:

```haskell
import Blammo.Logging.Simple (runSimpleLoggingT)

type LogFunc = Loc -> LogSource -> LogLevel -> LogStr -> IO ()

getBlammoLogFunc :: IO LogFunc
getBlammoLogFunc =
  runSimpleLoggingT $ do
    logFunc <- askLoggerIO
    pure logFunc
```

Or, more concisely:

```haskell
getBlammoLogFunc :: IO LogFunc
getBlammoLogFunc =
  runSimpleLoggingT askLoggerIO
```

Putting it all together, we can run this `IO` action when the app starts to retrieve our logging function and insert it into `AppEnv`:

```haskell
main :: IO ()
main = do
  logFunc <- getBlammoLogFunc
  let appEnv =
        AppEnv
          { -- ...
          , appLogFunc = logFunc
          }
  runApp appEnv app
```

Let's verify that Blammo's configuration works as expected when running it this way.

Pretty-print by default:

```text
$ cabal run without-loggingt
2023-09-26 18:58:38 [info     ] App started                     appName=example-2c
2023-09-26 18:58:38 [info     ] Fetching item                   itemUrl=https://www.example.com/item
2023-09-26 18:58:38 [warn     ] Skipping invalid item           itemId=652412308 itemUrl=https://www.example.com/item
```

Use JSON output:

```text
$ LOG_FORMAT=json cabal run without-loggingt
{"time":"2023-09-26T18:59:32.092596139Z","level":"info","location":{"package":"main","module":"Main","file":"WithoutLoggingT.hs","line":111,"char":3},"message":{"text":"App started","meta":{"appName":"example-2c"}}}
{"time":"2023-09-26T18:59:32.092616247Z","level":"info","location":{"package":"main","module":"Main","file":"WithoutLoggingT.hs","line":97,"char":3},"message":{"text":"Fetching item","meta":{"itemUrl":"https://www.example.com/item"}}}
{"time":"2023-09-26T18:59:32.09262781Z","level":"warn","location":{"package":"main","module":"Main","file":"WithoutLoggingT.hs","line":101,"char":7},"message":{"text":"Skipping invalid item","meta":{"itemUrl":"https://www.example.com/item","itemId":"652412308"}}}
```

Only display above a certain log level:

```text
$ LOG_LEVEL=warn cabal run without-loggingt
2023-09-26 19:00:22 [warn     ] Skipping invalid item           itemId=652412308 itemUrl=https://www.example.com/item
```

Since working on this, Blammo's maintainers have accepted my pull request to add an [example of using Blammo without LoggingT](https://github.com/freckle/blammo#use-without-loggingt) to the documentation.

## Wrapping up

The TL;DR for running code with a `MonadLogger` constraint without using the `LoggingT` transformer would be:

- Assuming we are using a custom monad `App` that is a `ReaderT AppEnv IO`, or some monad that has `MonadReader AppEnv` and `MonadIO` instances defined
- Add the logging function `Loc -> LogSource -> LogLevel -> LogStr -> IO ()` to the environment type `AppEnv`
- Implement a `MonadLogger` instance for `App`, using `asks` from `MonadReader AppEnv` to grab the logging function from the environment, and `liftIO` from `MonadIO` to call it
- Construct the logging function when initializing the app, and put it in the `AppEnv` created
  - For `monad-logger` and `monad-logger-aeson`, use the utility functions such as `defaultOutput` with a handle such as `stdout`
  - For `Blammo`, use `runSimpleLoggingT` or `runLoggerLoggingT` to run a `LoggingT IO` block that returns the logging function by calling `askLoggerIO` from `MonadLoggerIO`

You can find the complete working examples with and without `LoggingT` used for the article in [this Gist](https://gist.github.com/nicolashery/a5eceb7603262f79f08d8b29ed41aef6).

`LoggingT` was only one of the many transformers I removed while refactoring from a monad transformer stack to a single `ReaderT` over `IO`. I removed `ExceptT` by throwing exceptions in `IO`. The other transformers were equivalent to `ReaderT`, some using an `IORef` or similar for any mutable state. For those transformers, I merged their environments into `AppEnv`.

Hopefully, some will find this post helpful. Writing it at least helped me sharpen my understanding of how this works.

Finally, this is only one possible way of doing things. My goal was to standardize a codebase on the ReaderT design pattern. However, some may find it easier to add the `LoggingT` wrapper into the `App` type and dispatch it in `runApp`. Of course, that works perfectly fine as well. It is a matter of personal preference or the style adopted by the team.
