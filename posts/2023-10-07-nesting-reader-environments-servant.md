---
layout: post
title: Nesting APIs and ReaderT environments with Servant
description: In this post, we look at how to structure nested APIs using Servant so that each child API builds upon the context of its parent using ReaderT environments.
---

[[TOC]]

## Introduction

Many of the HTTP APIs I've worked on tended to have a nested nature. At each level or sub-API, the request handlers often shared some amount of context. And the deeper you went into the API's nested structure, the more this context grew.

For example, at the top level of the API, all routes could have access to the `TraceId` for telemetry. Going one level down, we could split the API between non-authenticated (aka "public") routes and authenticated (aka "private") routes. Each branch of this split defines a sub-API. All authenticated routes would have access to a `User` object. Inside the authenticated API, another nested API could have routes such as `/projects/:projectId` and `/projects/:projectId/tickets`. The routes of this last sub-API could have access to a `Project` object.

Notice that what goes into the shared context at each API level often comes from the HTTP **headers** and the **URL** path items. In the example above, the `traceparent` HTTP header would help us create a `TraceId`, the `Authorization` header would allow us to load a `User`, and the `:projectId` in the URL path would be used to fetch the `Project`.

This context also typically contains **server dependencies** such as database connection pools, HTTP clients, loggers, etc. As these resources do not depend on the request, they can and should be created ahead of time.

[Servant](https://docs.servant.dev/) gives us powerful tools to build [nested APIs](https://docs.servant.dev/en/stable/tutorial/Server.html#nested-apis) in a type-safe manner with its type-level DSL, even if at the cost of a bit of a learning curve. Newer versions of the web framework also introduce [NamedRoutes](https://www.tweag.io/blog/2022-02-24-named-routes/). This feature allows us to structure APIs using records, making it easier to work with more complex route hierarchies.

The ["ReaderT design pattern"](https://www.fpcomplete.com/blog/readert-design-pattern/) gives us tools to define a shared context that request handlers can easily access. While it is not the only way to do so, it is popular and approachable enough that we'll use it in this post. The Reader or ReaderT's "**environment**" represents the request context within this pattern. By nesting environments, we can create different levels of context.

In this article, I'll assume some familiarity with Servant and the ReaderT design pattern. We'll also use Servant's [`hoistServer`](https://docs.servant.dev/en/stable/tutorial/Server.html#using-another-monad-for-your-handlers) to run our custom ReaderT monad and nest our environments. If you need a refresher, the Servant example in [this post](https://nicolashery.com/comparing-scotty-yesod-servant/) could be a good item to review.

## Server vs. request environment

Before we dive into building nested APIs and defining different levels of context for each of them, let's focus on "level 0": the *server* environment. All other levels of context will be *request* environments.

The server environment is different because it is created only once upon application startup, and the resources or attributes it holds will be *shared across requests*. On the other hand, a request environment is *recreated on every request*, and the attributes that it holds are scoped to that particular request.

This is an important distinction and was actually the source of a minor bug on a codebase I worked on.

Let's take a look at an example. Imagine we have an API, only one level for now, defined as:

```haskell
type Api =
  "v1"
    :> Header "traceparent" TraceParentHeader
    :> Header "Authorization" AuthorizationHeader
    :> "tickets"
    :> NamedRoutes TicketApi

data TicketApi mode = TicketApi
  { createTicket
      :: mode
        :- ReqBody '[PlainText] CreateTicketRequest
        :> Post '[PlainText] CreateTicketResponse
  , getTicket
      :: mode
        :- Capture "ticketId" TicketId
        :> Get '[PlainText] GetTicketResponse
  }
```

We want to run our request handlers in a custom monad `App` that follows the ReaderT design pattern:

```haskell
newtype App a = App
  { unApp :: ReaderT AppEnv IO a
  }
```

Our environment holds the resources and context that most of our request handlers will need. In this example, the environment contains a [pool](https://hackage.haskell.org/package/resource-pool/docs/Data-Pool.html#t:Pool) of database connections, an [HTTP connection manager](https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#t:Manager) used by our HTTP client, a `TraceId` for telemetry, and an authenticated `User` object:

```haskell
data AppEnv = AppEnv
  { dbPool :: Pool Connection
  , httpManager :: Manager
  , traceId :: TraceId
  , user :: User
  }
```

We define a helper function, `runAppServant`, that we'll use later. Given an `AppEnv`, it runs an `App` action in Servant's `Handler` monad:

```haskell
runAppServant :: AppEnv -> App a -> Handler a
runAppServant env action =
  Handler . ExceptT . try $ runReaderT (unApp action) env
```

To create the server, we first wire up the request handlers in the `TicketApi` record defined earlier:

```haskell
createTicketHandler :: CreateTicketRequest -> App CreateTicketResponse
createTicketHandler = -- ...

getTicketHandler :: TicketId -> App GetTicketResponse
getTicketHandler = -- ...

ticketServer :: ServerT (NamedRoutes TicketApi) App
ticketServer =
  TicketApi
    { createTicket = createTicketHandler
    , getTicket = getTicketHandler
    }
```

Now we can put it all together in the root `server`:

```haskell
server
  :: Maybe TraceParentHeader
  -> Maybe AuthorizationHeader
  -> Server (NamedRoutes TicketApi)
server maybeTraceParentHeader maybeAuthHeader =
  hoistServer (Proxy @(NamedRoutes TicketApi)) run ticketServer
  where
    run :: App a -> Handler a
    run action = do
      let appEnv = -- ...
      runAppServant appEnv action
```

Since our request handlers are defined in the custom `App` monad, we use Servant's [`hoistServer`](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:hoistServer). We pass it a `run` function that converts an action from `App` to Servant's `Handler`. This function is also called "natural transformation" in the documentation. Inside `run`, we use the helper function `runAppServant` that we defined earlier. We must also create an `AppEnv` to pass to `runAppServant` as an argument.

Let's look at a first implementation of `run`:

```haskell
server
  :: Maybe TraceParentHeader
  -> Maybe AuthorizationHeader
  -> Server (NamedRoutes TicketApi)
server maybeTraceParentHeader maybeAuthHeader =
  hoistServer (Proxy @(NamedRoutes TicketApi)) run ticketServer
  where
    run :: App a -> Handler a
    run action = do
      -- Bad: These get recreated on every request
      dbPool <- liftIO $ createDbPool "app:app@localhost:5432/app" 10
      httpManager <- liftIO $ createHttpManager 20
      -- Good: These need to be created on every request
      traceId <- liftIO $ getOrGenerateTraceId maybeTraceParentHeader
      user <- liftIO $ authenticateUser httpManager maybeAuthHeader
      let appEnv =
            AppEnv
              { dbPool = dbPool
              , httpManager = httpManager
              , traceId = traceId
              , user = user
              }
      runAppServant appEnv action
```

One thing that is not immediately apparent when calling `hoistServer`, at least not for me at first, is that the natural transformation function you give it (i.e. `run` in our case) gets _called on every request_.

The comments in the code snippet above gave it away, but server-wide resources such as database connection pools or HTTP connection managers are not something you want to recreate for every request. It is either wasteful or misses out on the optimizations brought by resource pools and keeping connections alive.

On the other hand, the `TraceId` and the `User` object are definitely request-specific. Indeed, we need to use the request object to create them. In this case, we used the request's HTTP headers, but it could also have been the URL path parameters.

The minor bug mentioned earlier was an HTTP connection `Manager` being recreated on every request because it was done in the transformation function passed to `hoistServer`. Nothing critical, but definitely not how the HTTP connection `Manager` is meant to be used:

> If possible, you should share a single `Manager` between multiple threads and requests.
>
> https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#t:Manager

> Creating a new `Manager` is a relatively expensive operation, you are advised to share a single `Manager` between requests instead.
>
> https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#v:newManager

In our example, let's add logging to the functions that create the resources and attributes for `AppEnv`. Then, we'll run the first server implementation above and make two requests. Here is the log output in the terminal, with some comments added for clarity:

```text
# Server startup
# (nothing)

# Request 1
[Info] Created new database connection pool of size 10 for app:app@localhost:5432/app
[Info] Created new HTTP client manager with number of connections kept-alive per host of 20
[Info] Using existing trace ID 208327fb-d2ca-473f-9e15-85ce49db7493
[Info] Authenticated user with ID d42ed530-adba-41f0-99af-60bd6c476617

# Request 2
[Info] Created new database connection pool of size 10 for app:app@localhost:5432/app
[Info] Created new HTTP client manager with number of connections kept-alive per host of 20
[Info] Generating new trace ID 849a577b-7137-4738-9314-3bf9658d883d
[Info] Authenticated user with ID d42ed530-adba-41f0-99af-60bd6c476617
```

Indeed, we see that the database connection pool and the HTTP client manager are being recreated for each request, which we don't want. Let's fix this with a second server implementation.

Since we called our _request-specific_ environment `AppEnv`, let's define another record `AppServerEnv` that holds the _server-wide_ resources shared across requests:

```haskell
data AppServerEnv = AppServerEnv
  { dbPool :: Pool Connection
  , httpManager :: Manager
  }
```

Now, instead of creating these server resources inside the `run` transformation function, we add them as a parameter to the `server` function:

```haskell
server
  :: AppServerEnv
  -> Maybe TraceParentHeader
  -> Maybe AuthorizationHeader
  -> Server (NamedRoutes TicketApi)
server AppServerEnv {dbPool, httpManager} maybeTraceParentHeader maybeAuthHeader =
	hoistServer (Proxy @(NamedRoutes TicketApi)) run ticketServer
  where
    run :: App a -> Handler a
    run action = do
      -- Good: Only these get created on every request
      traceId <- liftIO $ getOrGenerateTraceId maybeTraceParentHeader
      user <- liftIO $ authenticateUser httpManager maybeAuthHeader
      let appEnv =
            AppEnv
              { dbPool = dbPool
              , httpManager = httpManager
              , traceId = traceId
              , user = user
              }
      runAppServant appEnv action
```

**Note**: Most functions in a web service run in the context of a request. This is why I haven't defined a monad for the server context `AppServerEnv` and called it "level 0". But if we have some functions that only require these server-wide resources and are not request-specific, we could define a custom monad `AppServer` to run them in.

Now we create `AppServerEnv` and its resources upon application startup instead of inside the `hoistServer` transformation function:

```haskell
main :: IO ()
main = do
  -- Good: These get created only once, at server startup
  dbPool <- createDbPool "app:app@localhost:5432/app" 10
  httpManager <- createHttpManager 20
  let port = 3000
      appServerEnv =
        AppServerEnv
          { dbPool = dbPool
          , httpManager = httpManager
          }
      waiApp = serve (Proxy @Api) (server appServerEnv)
  Warp.run port waiApp
```

Let's run this second server implementation and make our two requests to make sure resource and environment creation is now happening the way we want it:

```text
# Server startup
[Info] Created new database connection pool of size 10 for app:app@localhost:5432/app
[Info] Created new HTTP client manager with number of connections kept-alive per host of 20

# Request 1
[Info] Using existing trace ID 208327fb-d2ca-473f-9e15-85ce49db7493
[Info] Authenticated user with ID d42ed530-adba-41f0-99af-60bd6c476617

# Request 2
[Info] Generating new trace ID 849a577b-7137-4738-9314-3bf9658d883d
[Info] Authenticated user with ID d42ed530-adba-41f0-99af-60bd6c476617
```

Indeed, we see that the database connection pool and the HTTP client manager only get created once instead of being recreated for each request.

If you'd like to read through this section's complete and runnable examples, you can do so in [this gist](https://gist.github.com/nicolashery/4603a6976b02ef8e4f477e3e93160e46).

## An example nested API

Now that we've underlined the difference between the server and request environments, and when to create them, let's focus on nesting and creating different _request environments_.

We'll imagine we're building an API for a ticket and issue tracker, similar to Jira but greatly simplified for this example. The layout of the API looks like this (adapted from the [layout](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:layout) helper function from Servant):

```text
/v1
└─ Header "traceparent"
   ├─ GET /health
   ├─ GET /layout
   |
   └─ Header "Authorization"
      ├─ GET /organizations
      |
      └─ /organizations/:organizationId
         ├─ POST /projects
         ├─ GET /projects/:projectId
         |
         └─ /projects/:projectId
            ├─ POST /tickets
            └─ GET /tickets/:ticketId
```

Here, we have four levels of nesting. The handlers for each level will run in their own custom monad based on the ReaderT design pattern (ex: `AppTicket` for the last level) and with their own environment (ex: `AppTicketEnv`). These environments will also include all of the contexts from the levels above them.

In this way, each level of handlers creates a "sub-API" (ex: `TicketApi`). Everything needed to implement the handlers of a sub-API comes from the environment of the monad they run in or the definition of the sub-API itself.

For example, the `:ticketId` URL path parameter in the last endpoint is included in the `TicketAPI` definition and allows us to retrieve the ticket. But suppose we need to check user access control for this ticket's project. In that case, we'll use the `AppTicketEnv` environment. It contains the information we need, captured by the API levels above this one: the user from the `"Authorization"` header and the project from the `:projectId` URL path parameter.

From top to bottom, or parent to child, the different levels in this example are as follows:

- Level 1: `App` (`ReaderT AppEnv IO`)
  - Includes all server-wide context (`Logging` function and `Database` connection pool in this example)
  - Captures the `"traceparent"` HTTP header and uses it to create an OpenTelemetry `Tracing` context (setting the active [span](https://opentelemetry.io/docs/concepts/signals/traces/#spans) in this example)
- Level 2: `AppAuthenticated` (`ReaderT AppAuthenticatedEnv IO`)
  - Includes everything from the level above it
  - Captures the `"Authorization"` HTTP header and uses it to authenticate the current user and create an `Auth` context (containing the `UserId` in this example)
- Level 3: `AppProject` (`ReaderT AppProjectEnv IO`)
  - Includes everything from the levels above it
  - Captures the `:organizationId` URL path parameter and uses it to fetch the `Organization` object that the projects belong to
- Level 4: `AppTicket` (`ReaderT AppTicketEnv IO`)
  - Includes everything from the levels above it
  - Captures the `:projectId` URL path parameter and uses it to fetch the `Project` object that the tickets belong to

And here is what the first couple of levels look like in Haskell, using Servant's `NamedRoutes` to declare each sub-API as a record:

```haskell 
type Api =
  "v1"
    :> Header "traceparent" TraceParentHeader
    :> NamedRoutes RootApi

-- Level 1: App
data RootApi mode = RootApi
  { health
      :: mode
        :- "health"
        :> GetNoContent
  , layout
      :: mode
        :- "layout"
        :> Get '[PlainText] LayoutResponse
  , authenticatedApi
      :: mode
        :- Header "Authorization" AuthorizationHeader
        :> NamedRoutes AuthenticatedApi
  }

-- Level 2: AppAuthenticated
data AuthenticatedApi mode = AuthenticatedApi
  { listOrganizations
      :: mode
        :- "organizations"
        :> Get '[PlainText] ListOrganizationsResponse
  , projectApi
      :: mode
        :- "organizations"
        :> Capture "organizationId" OrganizationId
        :> "projects"
        :> NamedRoutes ProjectApi
  }

-- Level 3: AppProject
data ProjectApi mode = ProjectApi
	{ -- ...
	}
```

For the full Servant API definition, see [`Api.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-api-hs) of the gist containing the example used in this post.

## Nested ReaderT environments

Most codebases I've seen run all request handlers in the same custom monad, for example `App`. At the top level, Servant's [`hoistServer`](https://docs.servant.dev/en/stable/tutorial/Server.html#using-another-monad-for-your-handlers) is used to translate `App` back to a Servant `Handler` and run the server with [`serve`](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:serve), as we saw in the first section of this article.

That is perfectly fine for a lot of applications. But as the API becomes more complex and nested, we might notice one of two things. Either the `AppEnv` context contained in the `App` monad becomes big and holds attributes only used by a subset of handlers and ignored by the rest. Or we find ourselves repeating many of the same logic in the handlers, such as authenticating the `User` or fetching the `Organization` that the resources belong to.

One way to approach this can be to define different environments and monads for each sub-API, as described in the previous section. But how do we translate everything back to the `Handler` that Servant understands? We could do it manually by wrapping each handler individually, but that can quickly become cumbersome.

What wasn't apparent to me initially was that you can *make multiple calls* to `hoistServer`. Moreover, the documentation presents `hoistServer` as a utility to bring handlers running in a custom monad such as `App` back to Servant's `Handler`. But we can use it to translate a server from any arbitrary monad (ex: `AppAuthenticated`) to another arbitrary monad (ex: `App`).

Let's take a look at an example. We create different custom monads based on the ReaderT design pattern (`App`, `AppAuthenticated`, `AppProject`, etc.) corresponding to each level of our API definition above. Each monad has an associated environment, suffixed with `*Env`, that holds the environment from the level above it and any additional context specific to that level. We also have a transformation function, prefixed with `run*`, that translates each monad to the monad from the level above it. The topmost function finally translates back to Servant's `Handler`. We'll look at the implementation of these transformation functions later.

```haskell
-- Level 1
newtype App a = App
  { unApp :: ReaderT AppEnv IO a
  }

data AppEnv = AppEnv
  { appLogger :: LogFunc
  , dbPool :: Pool Connection
  , tracer :: Tracer
  -- Above are server-wide dependencies, below are request-specific
  , activeSpan :: IORef Span
  }
  
runApp :: AppEnv -> App a -> Handler a
runApp = -- ...

-- Level 2
newtype AppAuthenticated a = AppAuthenticated
  { unApp :: ReaderT AppAuthenticatedEnv IO a
  }

data AppAuthenticatedEnv = AppAuthenticatedEnv
  { appEnv :: AppEnv -- Environment from Level 1
  , userId :: UserId
  , appOrganizationService :: OrganizationService
  }

runAppAuthenticated :: AppAuthenticatedEnv -> AppAuthenticated a -> App a
runAppAuthenticated = -- ...

-- Level 3
newtype AppProject a = AppProject
  { unApp :: ReaderT AppProjectEnv IO a
  }

data AppProjectEnv = AppProjectEnv
  { appAuthenticatedEnv :: AppAuthenticatedEnv -- Environment from Level 2
  , projectOrganization :: Organization
  }

runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
runAppProject = -- ...

-- etc.
```

Each sub-API from the definition has its own "sub-server", and that sub-server's handlers run in the appropriate monad. For example:

```haskell
-- Level 1
rootServer :: AppDeps -> ServerT (NamedRoutes RootApi) App
rootServer deps =
  RootApi
    { health = healthHandler
    , layout = layoutHandler
    , authenticatedApi = -- ...
    }
    
healthHandler :: App NoContent
layoutHandler :: App Text

-- Level 2
authenticatedServer
  :: Maybe AuthorizationHeader
  -> ServerT (NamedRoutes AuthenticatedApi) AppAuthenticated
authenticatedServer maybeAuthHeader =
  AuthenticatedApi
    { listOrganizations = listOrganizationsHandler
    , projectApi = -- ...
    }
   
listOrganizationsHandler :: AppAuthenticated ListOrganizationsResponse

-- Level 3
projectServer :: OrganizationId -> ServerT (NamedRoutes ProjectApi) AppProject
projectServer organizationId =
  ProjectApi
    { createProject = createProjectHandler
    , getProject = getProjectHandler
    , ticketApi = -- ...
    }

createProjectHandler :: CreateProjectRequest -> AppProject CreateProjectResponse
getProjectHandler :: ProjectId -> AppProject GetProjectResponse

-- etc.
```

At the top level, we define the `server` that runs in Servant's `Handler`. We use `hoistServer` as we did at the beginning of the article to create the `AppEnv` and translate `rootServer` running in `App` to `server` running in `Handler`:

```haskell
server
  :: AppDeps
  -> Maybe TraceParentHeader
  -> Server (NamedRoutes RootApi)
server deps maybeTraceParentHeader =
  hoistServer (Proxy @(NamedRoutes RootApi)) run (rootServer deps)
  where
    run :: App a -> Handler a
    run action = do
      activeSpan <- -- Use `maybeTraceParentHeader` to create
      let appEnv =
            AppEnv
              { appLogger = depsLogger deps
              , dbPool = depsDbPool deps
              , tracer = depsTracer deps
              , activeSpan = activeSpan
              }
      runApp appEnv action

rootServer :: AppDeps -> ServerT (NamedRoutes RootApi) App
rootServer = -- ...
```

**Note:** `AppDeps` contains any dependencies created at application startup, such as database connection pools and loggers, i.e. the server-wide environment described earlier.

For each of the other levels, we can do something similar. We use `hoistServer` again to translate one level's monad to the monad from the level above it. In the `run` function passed to `hoistServer`, we create the environment for the lower level. We use information from the request, such as URL parameters or headers, and make necessary HTTP or database calls to populate the environment's attributes.

For example, to go from `AppAuthenticated` to `App`:

```haskell
rootServer :: AppDeps -> ServerT (NamedRoutes RootApi) App
rootServer deps =
  RootApi
    { health = healthHandler
    , layout = layoutHandler
    , authenticatedApi = authenticatedServer' deps
    }

authenticatedServer'
  :: AppDeps
  -> Maybe AuthorizationHeader
  -> ServerT (NamedRoutes AuthenticatedApi) App
authenticatedServer' deps maybeAuthHeader =
  hoistServer (Proxy @(NamedRoutes AuthenticatedApi)) run (authenticatedServer maybeAuthHeader)
  where
    run :: AppAuthenticated a -> App a
    run action = do
    	appEnv <- ask
    	userId <- -- Use `maybeAuthHeader` to authenticate user
    	let appAuthenticatedEnv =
    				AppAuthenticatedEnv
              { appEnv = appEnv
              , userId = userId
              , appOrganizationService = depsOrganizationService deps
              }
      runAppAuthenticated appAuthenticatedEnv action
        
authenticatedServer
  :: Maybe AuthorizationHeader
  -> ServerT (NamedRoutes AuthenticatedApi) AppAuthenticated
authenticatedServer = -- ...
```

**Note:** We introduce an intermediary `authenticatedServer'` for clarity and to keep the code similar to the previous level.

You can see in the snippet above how `authenticatedServer`, running in `AppAuthenticated`, is mounted in `rootServer`, running in `App`. We use `hoistServer` a second time like we did the first time to translate `rootServer` from `App` to `Handler`.

The main logic happens in the `run :: AppAuthenticated a -> App a` transformation function passed to `hoistServer`. In this function, we must construct an `AppAuthenticatedEnv` to pass to `runAppAuthenticated`.

To do so, we first retrieve the `AppEnv` context from the `App` monad using `ask` from `ReaderT`, and embed it in `AppAuthenticatedEnv`. This is how we nest the different `ReaderT` environments: each environment has an attribute that holds the environment from the level above it.

Next, we extend the `AppAuthenticatedEnv` context by adding other attributes. For instance, we can use the `"Authorization"` header to authenticate and fetch the user's information, such as the `userId`. We can do this with HTTP calls, database queries, or other `IO` actions since these custom monads are based on `ReaderT env IO`.

Let's take a look at another example, going from `AppProject` to `AppAuthenticated`:

```haskell
authenticatedServer
  :: Maybe AuthorizationHeader
  -> ServerT (NamedRoutes AuthenticatedApi) AppAuthenticated
authenticatedServer _ =
  AuthenticatedApi
    { listOrganizations = listOrganizationsHandler
    , projectApi = projectServer'
    }

projectServer' :: OrganizationId -> ServerT (NamedRoutes ProjectApi) AppAuthenticated
projectServer' organizationId =
  hoistServer (Proxy @(NamedRoutes ProjectApi)) run (projectServer organizationId)
  where
    run :: AppProject a -> AppAuthenticated a
    run action = do
    	appAuthenticatedEnv <- ask
    	projectOrganization <- -- Use `organizationId` to fetch organization object
    	let appProjectEnv =
    				AppProjectEnv
              { appAuthenticatedEnv = appAuthenticatedEnv
              , projectOrganization = projectOrganization
              }
      runAppProject appProjectEnv action

projectServer :: OrganizationId -> ServerT (NamedRoutes ProjectApi) AppProject
projectServer = -- ...
```

We use `hoistServer` a third time to embed `projectServer` in `authenticatedServer`. In the `run` transformation function for this level, we also grab the previous environment, `AppAuthenticatedEnv`, and nest it in the new environment, `AppProjectEnv`. This time, we enhance the new environment by using the `organizationId` in the URL path parameters to fetch the organization that owns the projects in the current request.

Now let's go back and implement the helper functions for each custom monad that we've been using inside the `run` functions passed to `hoistServer`. As a reminder, here are their signatures:

```haskell
runApp :: AppEnv -> App a -> Handler a
runAppAuthenticated :: AppAuthenticatedEnv -> AppAuthenticated a -> App a
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
-- etc.
```

The top-level `runApp` gets us to a Servant `Handler`, as we've seen earlier. There are already existing examples and explanations that break it down, such as [this article](https://www.parsonsmatt.org/2017/06/21/exceptional_servant_handling.html). Here is the implementation:

```haskell
runApp :: AppEnv -> App a -> Handler a
runApp env action =
  Handler . ExceptT . try $ runReaderT (unApp action) env
```

Let's take one of the sub-API transformation functions, for instance `runAppProject`. Since both `AppProject` and `AppAuthenticated` are `ReaderT env IO` monads, one way to get from one to the other is by unwrapping `AppProject` with `runReaderT` and reconstructing `AppAuthenticated` with `ReaderT`:

```haskell
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
runAppProject appProjectEnv action =
  AppAuthenticated
    . ReaderT
    $ \_appAuthenticatedEnv -> runReaderT (unAppProject action) appProjectEnv
```

We're only going from one `ReaderT` to another and translating the target monad's environment (`AppAuthenticatedEnv`) into the source monad environment (`AppProjectEnv`).

It turns out [`withReaderT`](https://hackage.haskell.org/package/transformers/docs/Control-Monad-Trans-Reader.html#v:withReaderT) does exactly that. So we can simplify a little and write:

```haskell
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
runAppProject appProjectEnv action =  do
  let mapEnv _appAuthenticatedEnv' = appProjectEnv
  AppAuthenticated $ withReaderT mapEnv (unAppProject action)

-- For reference:
withReaderT :: (r' -> r) -> ReaderT r m a -> ReaderT r' m a
```

In our case, the environment transformation function `mapEnv :: r' -> r` replaces the environment altogether. But since all our sub-API environments have their parent's environment embedded in them, we might be able to use `withReaderT` more effectively. Let's start by in-lining `runAppProject` in `projectServer'` where it was used:

```haskell
projectServer' :: OrganizationId -> ServerT (NamedRoutes ProjectApi) AppAuthenticated
projectServer' organizationId =
  hoistServer (Proxy @(NamedRoutes ProjectApi)) run (projectServer organizationId)
  where
    run :: AppProject a -> AppAuthenticated a
    run action = do
    	appAuthenticatedEnv <- ask
    	projectOrganization <- fetchOrganization organizationId
    	let appProjectEnv =
    				AppProjectEnv
              { appAuthenticatedEnv = appAuthenticatedEnv
              , projectOrganization = projectOrganization
              }
          mapEnv _appAuthenticatedEnv' = appProjectEnv
      AppAuthenticated $ withReaderT mapEnv (unAppProject action)
```

We can simplify `run` and remove the `ask` for `appAuthenticatedEnv` since `withReaderT` passes it to the `mapEnv` function:

```haskell
run :: AppProject a -> AppAuthenticated a
run action = do
  projectOrganization <- fetchOrganization organizationId
  let mapEnv appAuthenticatedEnv =
        AppProjectEnv
          { appAuthenticatedEnv = appAuthenticatedEnv
          , projectOrganization = projectOrganization
          }
  AppAuthenticated $ withReaderT mapEnv (unAppProject action)
```

Finally, since most of the work of going from an `AppProject` to an `AppAuthenticated` is building the `AppProjectEnv`, we can encapsulate all that and re-introduce the `runAppProject` function. The parameters of `runAppProject` provide it with everything it needs to build `AppProjectEnv`, in this particular case the `OrganizationId`:

```haskell
projectServer' :: OrganizationId -> ServerT (NamedRoutes ProjectApi) AppAuthenticated
projectServer' organizationId =
  hoistServer
    (Proxy @(NamedRoutes ProjectApi))
    (runAppProject organizationId)
    (projectServer organizationId)

runAppProject :: OrganizationId -> AppProject a -> AppAuthenticated a
runAppProject organizationId action = do
  projectOrganization <- fetchOrganization organizationId
  let mapEnv appAuthenticatedEnv =
        AppProjectEnv
          { appAuthenticatedEnv = appAuthenticatedEnv
          , projectOrganization = projectOrganization
          }
  AppAuthenticated $ withReaderT mapEnv (unAppProject action)
```

If you'd like to see the complete source code for this section, [`Server.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-server-hs) in the gist is a good place to start.

## Implementing the request handlers

Let's now look at how to use these different monads and nested environments, by implementing some request handlers. We'll go a couple levels down, and write the handler for the "create project" endpoint from level 3:

```text
POST /v1/organizations/:organizationId/projects
```

The handler will:

- Create an new telemetry span, using the `tracer` and `activeSpan` from the `AppEnv` parent context
- Grab the current `userId` from the `AppAuthenticatedEnv` parent context
- Grab the current `projectOrganization` from its own `AppProjectEnv` context

- Save a new project record in the database using the `dbPool` connection information from the `AppEnv` parent context

- Log a message saying the project was created using the `appLogger` from the `AppEnv` parent context
- Send a response most likely, but we'll skip over that part

Since all the handler monads are newtypes over `ReaderT` and have a `MonadReader` derived instance, we can use [`asks`](https://hackage.haskell.org/package/mtl-2.3.1/docs/Control-Monad-Reader-Class.html#v:asks) along with the path through the nested environment records up to the specific context attribute that we need. Here is a first implementation:

```haskell
createProjectHandler :: CreateProjectRequest -> AppProject CreateProjectResponse
createProjectHandler projectName = do
  tracer <- asks (tracer . appEnv . appAuthenticatedEnv)
  activeSpan <- asks (activeSpan . appEnv . appAuthenticatedEnv)
  tracedWith tracer activeSpan "create_project" $ do
    userId <- asks (userId . appAuthenticatedEnv)
    organizationId <- asks (organizationId . projectOrganization)
    dbPool <- asks (dbPool . appEnv . appAuthenticatedEnv)
    _ <-
      runDatabaseWith dbPool
        $ query
          "insert into projects (name, organization_id) values (?, ?) returning id"
          (projectName, organizationId)
    logFunc <- asks (appLogger . appEnv . appAuthenticatedEnv)
    _ <-
      flip runLoggingT logFunc
        $ logInfo
        $ "created project"
        :# [ "user_id" .= userId
           , "organization_id" .= organizationId
           ]
    -- ...
```

This works perfectly fine and we could stop here. However, there is a bit of repetitiveness with the selector functions passed to `asks`. I'd argue it has the advantage of being very clear and explicit. But it does get worse if you have a lot of nested environments. Indeed, if we look at the "create ticket" handler one level deeper:

```haskell
createTicketHandler :: CreateTicketRequest -> AppTicket CreateTicketResponse
createTicketHandler ticketName = do
  tracer <- asks (tracer . appEnv . appAuthenticatedEnv . appProjectEnv)
  activeSpan <- asks (activeSpan . appEnv . appAuthenticatedEnv . appProjectEnv)
  tracedWith tracer activeSpan "create_project" $ do
    userId <- asks (userId . appAuthenticatedEnv . appProjectEnv)
    organizationId <- asks (organizationId . projectOrganization . appProjectEnv)
    projectId <- asks (projectId . ticketProject)
    dbPool <- asks (dbPool . appEnv . appAuthenticatedEnv . appProjectEnv)
    -- ...
```

On thing we can do to improve the code is define small helper functions that can be re-used across handlers of the same level of nesting. For the `AppProject` level, we can define:

```haskell
traced :: Text -> AppProject a -> AppProject a
traced spanName action = do
  tracer <- asks (tracer . appEnv . appAuthenticatedEnv)
  activeSpan <- asks (activeSpan . appEnv . appAuthenticatedEnv)
  tracedWith tracer activeSpan spanName action

getUserId :: AppProject UserId
getUserId = asks (userId . appAuthenticatedEnv)

getProjectOrganization :: AppProject Organization
getProjectOrganization = asks projectOrganization

runDatabase :: Database a -> AppProject a
runDatabase action = do
  dbPool <- asks (dbPool . appEnv . appAuthenticatedEnv)
  runDatabaseWith dbPool action

runLogging :: LoggingT AppProject () -> AppProject ()
runLogging action = do
  logFunc <- asks (appLogger . appEnv . appAuthenticatedEnv)
  runLoggingT action logFunc
```

Our "create project" handler from before now becomes:

```haskell
createProjectHandler :: CreateProjectRequest -> AppProject CreateProjectResponse
createProjectHandler projectName = traced "create_project" $ do
  userId <- getUserId
  organizationId <- organizationId <$> getProjectOrganization
  _ <-
    runDatabase
      $ query
        "insert into projects (name, organization_id) values (?, ?) returning id"
        (projectName, organizationId)
  runLogging
    $ logInfo
    $ "created project"
    :# [ "user_id" .= userId
       , "organization_id" .= organizationId
       ]
  -- ...
```

Some of these helper functions remind me of the "embed" pattern described by Matt Parsons in his book [Production Haskell](https://leanpub.com/production-haskell):

> The general pattern that I recommend is to *embed* things into your App
> type.
>
> ```
> runSql :: Database a -> App a
> runRedis :: Redis a -> App a
> ```
>
> **Matt Parsons, Production Haskell (2023), "5.5 Embed, don’t Stack"**

The drawback of this approach, is that we need to re-implement the helper functions for each monad level that needs them (`App`, `AppAuthenticated`, `AppProject`, etc.).

Also, if we change the structure of the nested environments a little causing the path in `asks` to change, we would potentially need to refactor a lot of code (although type system would guide us through the whole process).

We'll see in the next section one way to address these issues.

**Note:** As a bonus, since I'm using [monad-logger-aeson](https://hackage.haskell.org/package/monad-logger-aeson) for logging, we could already get rid of `runLogging` by implementing a `MonadLogger` instance for `AppProject` and all the other request handler monads. For details on how to do that, please refer to [this post](https://nicolashery.com/monadlogger-without-loggingt/).

## The Has type class pattern

For functionality that is re-used across different levels of the nested API (ex: `traced`, `getUserId`, `runDatabase`, etc.), instead of hard-coding to a specific monad and environment (ex: `App`, `AppAuthenticated`, etc.), we could introduce `Has*` type classes.

Similar to the "ReaderT" design pattern, the "Has type class" pattern seems to be another popular pattern. For what it is worth, it is a the recommended approach taken by the `rio` library (see the ["`Has` type classes"](https://www.fpcomplete.com/haskell/library/rio/) section of the tutorial).

What does it look like for our example? Let's take the tracing functionality with the `traced` function, a good example of re-use since all of our handlers call it. We'll first wrap everything the function needs from the environment, the tracer and the active span in this case, in a single record `TracingEnv`. Then we'll define the `HasTracing` type class to retrieve this tracing context:

```haskell
data TracingEnv = TracingEnv
  { tracer :: Tracer
  , activeSpan :: IORef Span
  }

class HasTracing env where
  getTracing :: env -> TracingEnv
```

**Note:** The `Has` type class pattern is sometimes used in combination with [lenses](https://www.fpcomplete.com/haskell/tutorial/lens/), notably by the `rio` library and documentation. I do not use them here because they add another concept to learn and I find the type errors can be more difficult to work with. But all of these examples would work perfectly fine with them.

To generalize, we'll use these `Has*` type classes in combination with the [`MonadReader`](https://hackage.haskell.org/package/mtl/docs/Control-Monad-Reader-Class.html) type class. All of our custom monads are `ReaderT env IO` and can automatically derive `MonadReader`.

So the concrete implementation of `traced` we wrote earlier for `AppProject`:

```haskell
traced :: Text -> AppProject a -> AppProject a
traced spanName action = do
  tracer <- asks (tracer . appEnv . appAuthenticatedEnv)
  activeSpan <- asks (activeSpan . appEnv . appAuthenticatedEnv)
  tracedWith tracer activeSpan spanName action
```

Can now be generalized to:

```haskell
traced :: (MonadReader env m, HasTracing env, MonadIO m) => Text -> m a -> m a
traced spanName action = do
	tracer <- tracer <$> asks getTracing
  activeSpan <- activeSpan <$> asks getTracing
  tracedWith tracer activeSpan spanName action
```

The `Has*` type classes and the helper functions using them can be moved to their own module, [`Tracing.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-tracing-hs) in this case. This module can be used by request handlers regardless from all levels of the nested API, regardless of the monad they run in as long as the monad's environment defines an instance of `HasTracing`.

As a reminder, `AppProject` was defined as:

```haskell
newtype AppProject a = AppProject
  { unApp :: ReaderT AppProjectEnv IO a
  }

data AppProjectEnv = AppProjectEnv
  { appAuthenticatedEnv :: AppAuthenticatedEnv
  , projectOrganization :: Organization
  }
```

So for the environment of `AppProject`, we can define the `HasTracing` instance as:

```haskell
instance HasTracing AppProjectEnv where
  getTracing = tracingEnv . appEnv . appAuthenticatedEnv
```

**Note:** The `AppEnv` record now wraps the tracer and active span in the `TracingEnv` record we introduced.

We can go a little further. Since we'll probably define a `HasTracing` instance for all levels (`App`, `AppAuthenticated`, etc.) and since our environments are nested, we can use `getTracing` from the level right above ours:

```haskell
instance HasTracing AppProjectEnv where
  getTracing = getTracing . appAuthenticatedEnv
```

The `AppTicket` environment instance is similar:

```haskell
instance HasTracing AppTicketEnv where
  getTracing = getTracing . appProjectEnv
```

For authentication information, we can similarly create a re-usable [`Authentication.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-authentication-hs) module and introduce a `HasAuth` type class:

```haskell
data AuthEnv = AuthEnv
  { userId :: UserId
  }

class HasAuth env where
  getAuth :: env -> AuthEnv
```

An replace the concrete helper function we defined in the previous section:

```haskell
getUserId :: AppProject UserId
getUserId = asks (userId . appAuthenticatedEnv)
```

With a generalized version using the `HasAuth` type class:

```haskell
getUserId :: (MonadReader env m, HasAuth env) => m UserId
getUserId = userId <$> asks getAuth
```

We then define instances for the environments of each handler monads:

```haskell
instance HasAuth AppAuthenticatedEnv where
  getAuth = authEnv

instance HasAuth AppProjectEnv where
  getAuth = getAuth . appAuthenticatedEnv

instance HasAuth AppTicketEnv where
  getAuth = getAuth . appProjectEnv
```

The request handler implementations stay the same as in the previous section, except now we are importing the shared helper functions that leverage the `Has*` type classes, instead of using concrete implementations for each level of the nested API:

```haskell
import Authentication (getUserId)
import Database (query, runDatabase)
import Tracing (traced)

createProjectHandler :: CreateProjectRequest -> AppProject CreateProjectResponse
createProjectHandler projectName = traced "create_project" $ do
  userId <- getUserId
  organizationId <- organizationId <$> getProjectOrganization
  _ <-
    runDatabase
      $ query
        "insert into projects (name, organization_id) values (?, ?) returning id"
        (projectName, organizationId)
  logInfo
    $ "created project"
    :# [ "user_id" .= userId
       , "organization_id" .= organizationId
       ]
  -- ...
```

Note that using this "Has type class" pattern is optional and staying with the implementation from the previous section is perfectly fine and could work for a lot of projects and teams.

One may call out that defining all the `Has*` type classes and providing instances does feel like a bit of boilerplate still. I think [the `rio` tutorial](https://www.fpcomplete.com/haskell/library/rio/) has some good arguments on why that is acceptable:

> - The boilerplate here, amortized across a project, is really small
> - This is the “safe” kind of boilerplate: the compiler will almost always prevent you from making a mistake
> - The code above is obvious and easy to follow
> - The code above compiles really quickly

I'll also add that, like any generalization at the type level, the compiler errors might be a little more difficult to parse, notably for less experienced Haskell developers:

> We can write a type class `HasAppEnvironment` and require that instead of a concrete `AppEnvironment` [...]
> I generally recommend against this approach. Type class polymorphism is a great way to introduce confusing type errors into a project.
>
> **Matt Parsons, Production Haskell (2023), "5.3 AppEnvironment"**

Although in practice and on the codebases I've worked on, I didn't see or hear of any notable issues with this particular pattern.

## Wrapping up

If you'd like to browse the full source code for the example used in this post you can find it in [this gist](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02). The modules are organized as such:

- [`Api.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-api-hs): Servant nested API definition using `NamedRoutes`

- [`Server.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-server-hs): Wire the API definition to request handlers to create nested Servant Servers using `hoistServer`

- [`Main.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-main-hs): Create server-wide dependencies and run the root Server

- The different `ReaderT env IO` custom monads and their environments, along with the handler implementations for each level of the nested API:
  - [`App.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-app-hs)
  - [`AppAuthenticated.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-appauthenticated-hs)
  - [`AppProject.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-appproject-hs)
  - [`AppTicket.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-appticket-hs)

- Reusable logic and services, using the `Has*` type class pattern:
  - [`Database.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-database-hs)
  - [`Logging.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-logging-hs)
  - [`Tracing.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-tracing-hs)
  - [`Authentication.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-authentication-hs)
  - [`Organization.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-organization-hs)

If you're curious, I also created [a `rio` port](https://gist.github.com/nicolashery/cbce0a831dc8a9ac7161e03abfab2d79) of the same gist.

To summarize, some of the key takeaways for this article are:

- **Use `NamedRoutes` and records to define nested Servant APIs**. Although not a requirement, they help with code clarity and better type errors over anonymous routes.
- **Be wary of re-creating server-wide dependencies and resources on every request** by instantiating them in the transformation function of `hoistServer`. Instead, create them in your `main` function and pass them as a dependencies to the server functions.
- **Use `hoistServer` multiple times to embed handlers running in different custom monads**, matching the nested structure of the API definition.
- **Use `withReaderT` to map from one request environment to another**, embedding the previous environment in the next one, and adding new context attributes and resources.

Be mindful of what you choose to put in the different `ReaderT` request environments. As a reminder, the transformation function passed to `hoistServer` runs on every request. For example, fetching the user object might be cheap and used by most handlers, so a good candidate for adding the environment. But avoid more expensive operations or loading data that is only used by one or two handlers, that would be better done in the handlers themselves.

The pattern described in this article using nested calls to `hoistServer` is not exactly a "middleware", although at first it seemed close to it for me. You can for instance throw an error if authentication fails and short-circuit all of the downstream handlers this way. However, you can't set response headers for instance.

For proper middleware functionality, one can use any [WAI middleware](https://hackage.haskell.org/package/wai/docs/Network-Wai.html#t:Middleware) (ex: the ones in [`wai-extra`](https://hackage.haskell.org/package/wai-extra)) at the top-level. Or for more advanced users, you can also create your own Servant combinators (see William Yao's article ["Writing Servant combinators for fun and profit"](https://williamyaoh.com/posts/2023-02-28-writing-servant-combinators.html) for a good introduction on how to do so).

Finally, I'll mention that this is only one possible way to structure your web application. Regardless which patterns and conventions are used, what's probably more important is that they are documented and well understood by the team. I also recommend to let the structure of the application grow organically. It's better to start simple with a single environment, and only split things up when obvious sub-domains start to emerge.
