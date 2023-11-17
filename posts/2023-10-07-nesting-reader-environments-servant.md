---
layout: post
title: Nesting APIs and ReaderT environments with Servant
description: In this post we look at how to structure nested APIs using Servant, with each child API building upon the context of its parent using ReaderT environments.
---

[[TOC]]

## Introduction

Many of the HTTP APIs I've worked on tended to have a nested nature. At each level of the API, request handlers often shared some amount of context that they all required to get their transactions done. And the deeper one went in the API's nested structure, the more this context grew. 

For example, at the top level of the API, all routes could have access to the `TraceId` for telemetry. Going to the next level down, there could be a split between non-authenticated (aka "public") and authenticated (aka "private") routes, each defining a sub-API. All authenticated routes would have access to a `User` object. Inside the authenticated API, there could be another nested API with routes such as `/projects/:projectId` and `/projects/:projectId/tickets`. All of these routes could have access to a `Project` object.

As we can see, what goes in the shared context at each level of the API is often coming from the HTTP **headers** and the **URL** path items. For instance, a `traceparent` HTTP header would help us create a `TraceId`, an `Authorization` header would allow us to load a `User`, and the `:projectId` in the URL path would be used to fetch the `Project`.

We'll also see that this context often contains **server dependencies** such as database connection pools, HTTP clients, loggers, etc. As these do not depend on the request they can, and should, be created ahead of time.

[Servant](https://docs.servant.dev/) with its type-level DSL, although at the cost of a bit of a learning curve, gives us powerful tools to build [nested APIs](https://docs.servant.dev/en/stable/tutorial/Server.html#nested-apis) in a type-safe manner. Newer versions of the web framework also introduced [NamedRoutes](https://www.tweag.io/blog/2022-02-24-named-routes/). They allow us to structure APIs using records and make it easier to work with more complex route hierarchies.

The ["ReaderT design pattern"](https://www.fpcomplete.com/blog/readert-design-pattern/) gives us tools to define a shared context across request handlers. While it is not the only way to do so, it is popular and approachable enough that we'll use it in this post's example. The context described earlier is referred to as the Reader or ReaderT's "**environment**". Nesting environments allows us to create different levels of context.

In this article, I'll assume familiarity with Servant and the ReaderT design pattern. We'll also be using Servant's [`hoistServer`](https://docs.servant.dev/en/stable/tutorial/Server.html#using-another-monad-for-your-handlers) to run our custom ReaderT monad in Servant as well as nest our environments. If you need a refresher, the Servant example in [this post](https://nicolashery.com/comparing-scotty-yesod-servant/) could be a good item to review.

## Server vs. request environment

Before we dive into building nested APIs and defining different levels of context for each sub-API, let's take a look at what we can think of "level 0": the _server_ context or environment as it is called in the ReaderT pattern. We'll treat it separately from all other levels of context, which are _request_ environments.

What makes the server environment different is that it is created only once, upon application startup, and the resources or attributes that it holds will be _shared across requests_. The request environments on the other hand are _recreated on every request_, and the attributes that it holds are scoped to that particular request.

This is an important distinction and was actually the source of a small bug on a codebase I worked on.

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

We want to run our request handlers in a custom monad `App` using the ReaderT design pattern, which we define as:

```haskell
newtype App a = App
  { unApp :: ReaderT AppEnv IO a
  }
```

Our environment holds resources and context that most of our request handlers will need. In this example, the environment contains a [pool](https://hackage.haskell.org/package/resource-pool/docs/Data-Pool.html#t:Pool) of database connections, an [HTTP connection manager](https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#t:Manager) used by our HTTP client, a `TraceId` for telemetry, and an authenticated `User` object:

```haskell
data AppEnv = AppEnv
  { dbPool :: Pool Connection
  , httpManager :: Manager
  , traceId :: TraceId
  , user :: User
  }
```

We define a helper function `runAppServant` that we'll use later. Given an `AppEnv`, it runs an `App` action in Servant's `Handler` monad:

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

ticketServer :: TicketApi (AsServerT App)
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

Since our request handlers are defined in the custom `App` monad, we use Servant's [`hoistServer`](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:hoistServer). We pass it a `run` function that converts an action from `App a` to Servant's `Handler a`, also called "natural transformation" in the documentation. Inside `run`, we use the helper function `runAppServant` defined earlier, and we need to create an `AppEnv` to pass to it as an argument.

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

One thing that is not immediately apparent when calling `hoistServer`, at least it wasn't for me, is that the natural transformation function (i.e. `run` in our case) that you pass to it gets _called on every request_.

The comments in the code snippet above gave it away, but server-wide resources such as database connection pools or HTTP connection managers are not something you want to recreate for every request. It is either wasteful or misses out on the optimizations brought by resource pools and keeping connections alive.

On the other had, the `TraceId` and the `User` object are definitely something that is request-specific. This is emphasized by the fact that we have to use the request object to create them: HTTP headers in this case but it could also be URL path parameters.

The subtle bug I saw in a codebase that I mentioned earlier was the HTTP connection `Manager` being recreated on every request because it was done in the transformation function passed to `hoistServer`. Not the end of the world, but definitely not how it is meant to be used:

> If possible, you should share a single `Manager` between multiple threads and requests.
>
> https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#t:Manager

> Creating a new `Manager` is a relatively expensive operation, you are advised to share a single `Manager` between requests instead.
>
> https://hackage.haskell.org/package/http-client/docs/Network-HTTP-Client.html#v:newManager

To convince ourselves, let's add logging to the different functions that create the resources and attributes that will build up into `AppEnv`. Then let's run the server implementation above and make two requests. Here is the log output in the terminal, with some comments added for clarity:

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

We clearly see the database connection pool and the HTTP client manager being created on each request, which we don't want. Let's fix this with a second server implementation.

Since we called our _request-specific_ environment `AppEnv`, let's define another record `AppServerEnv` that holds the _server-wide_ resources:

```haskell
data AppServerEnv = AppServerEnv
  { dbPool :: Pool Connection
  , httpManager :: Manager
  }
```

Now instead of creating these resources shared across requests inside the `run` transformation function, we take it as a parameter:

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

**Note**: Most functions in the source code of a web service run in the context of request. This is why I don't really consider this a first level of nesting of `AppServerEnv` into `AppEnv`, and called it "level 0". But if we have some functions that only require these server-wide resources and are not request-specific, we could define a custom monad `AppServer` to run them in.

We now create `AppServerEnv` and its resources upon application startup, instead of inside the `hoistServer` transformation function:

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

Let's run this second server implementation and make our two requests to make sure resource and environment creation is happening the way we want it now:

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

We see indeed that the database connection pool and HTTP client manager only get created once, instead of being recreated for each request.

If you'd like to read through the full and runnable examples for this section, you can do so in [this Gist](https://gist.github.com/nicolashery/4603a6976b02ef8e4f477e3e93160e46).

## An example nested API

Now that we've emphasized the difference between the server and request environments, and when to create them, let's focus on nesting and creating different _request environments_.

We'll imagine that we're building an API for a ticket and issue tracker, similar to Jira, but of course greatly simplified for this example. The layout of the API looks like this (adapted from the [`layout`](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:layout) helper function from Servant):

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

Here we have 4 levels of nesting. The handlers for each level will run in their own custom monad based on the ReaderT design pattern (ex: `AppTicket` for the last level) and will define their own environment (ex: `AppTicketEnv`) that also includes all of the context from the environments in the levels above it.

In this way, each level of handlers creates a "sub-API" (ex: `TicketApi`). Everything needed to implement the handlers and that is not included in the definition of the sub-API itself comes from the environment of the monad the handlers run in.

For example the `:ticketId` URL path parameter in the last endpoint is included in the `TicketAPI` definition, and allows us to retrieve the ticket. But if we need to check access control for the user for this particular project, then we'll use the `AppTicketEnv` environment which will have captured the `"Authorization"` header (giving us the user) and `:projectId` URL path parameter (giving us the project) from the API levels above it. 

From top to bottom, or parent to child, the different levels in this example are as follows:

- Level 1: `App` (`ReaderT AppEnv IO`)
  - Includes all server-wide context (`Logging` function and `Database` connection pool in this example)
  - Captures the `"traceparent"` HTTP header and uses it to create an OpenTelemetry `Tracing` context (setting the active [span](https://opentelemetry.io/docs/concepts/signals/traces/#spans) in this example)
- Level 2: `AppAuthenticated` (`ReaderT AppAuthenticatedEnv IO`)
  - Includes everything from the level above it
  - Captures the `"Authorization"` HTTP header and uses it to authenticate the current user and create `Auth` context (containing the `UserId` in this example)
- Level 3: `AppProject` (`ReaderT AppProjectEnv IO`)
  - Includes everything from the levels above it
  - Captures the `:organizationId` URL path parameter and uses it to fetch the `Organization` object that the projects belong to
- Level 4: `AppTicket` (`ReaderT AppTicketEnv IO`)
  - Includes everything from the levels above it
  - Captures the `:projectId` URL path parameter and uses it to fetch the `Project` object that the tickets belong to

And here is what the first couple levels look like in Haskell, using Servant's `NamedRoutes` to declare each sub-API as a record:

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

For the whole Servant API definition, see [`Api.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-api-hs) of the Gist containing the example used in this post.

## Nested ReaderT environments

Most of the codebases I've seen run all of the request handlers in the same custom monad, for instance `App`. At the top level, we use Servant's [`hoistServer`](https://docs.servant.dev/en/stable/tutorial/Server.html#using-another-monad-for-your-handlers) to translate `App` back to a Servant `Handler` so we can run the server using [`serve`](https://hackage.haskell.org/package/servant-server/docs/Servant-Server.html#v:serve), as we saw in the first section of this article.

That is perfectly fine for a lot of applications. But as the API becomes more complex and nested, we might notice one of two things. Either the `AppEnv` context contained in the `App` monad becomes rather big and holds attributes that are really only used by a subset of handlers and ignored by the rest. Or we find ourselves repeating a lot of the same logic in the handlers, such as authenticating a `User` or fetching the `Organization` that the resources belong to, etc.

One way to approach this would be to define different environments and monads, for each of the sub-APIs, as described in the previous section. But how does one go about translating everything back to the `Handler` that Servant understands? We could certainly do it manually, by wrapping each handler individually, but that can be cumbersome.

What wasn't immediately apparent to me at first, is that you can _make multiple calls_ to `hoistServer`. And although it is presented in the documentation as a utility to bring handlers running in a custom monad back to Servant's `Handler` , we can use it to translate a server from any arbitrary monad, say `AppAuthenticated`, to another arbitrary monad, say `App`.

Let's take a look at an example. Say we created different custom monads (`App`, `AppAuthenticated`, `AppProject`, etc.) corresponding to each level of our API definition above. We then write a translation function for each monad to the level right above it, until we finally translate back to Servant's `Handler` monad:

```haskell
-- Level 1
newtype App a = App
  { unApp :: ReaderT AppEnv IO a
  }
  
runApp :: AppEnv -> App a -> Handler a

-- Level 2
newtype AppAuthenticated a = AppAuthenticated
  { unApp :: ReaderT AppAuthenticatedEnv IO a
  }
  
runAppAuthenticated :: AppAuthenticatedEnv -> AppAuthenticated a -> App a

-- Level 3
newtype AppProject a = AppProject
  { unApp :: ReaderT AppProjectEnv IO a
  }
  
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a

-- etc.
```

Each sub-API from the definition has its own "sub-server", with the server's handlers running in the appropriate monad. For example:

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

At the top level, we define the `server` that runs in Servant's `Handler`. We use `hoistServer` as we did in the beginning of the article to create the `AppEnv` and translate `rootServer` running in `App` to `server` running in `Handler`:

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

**Note:** `AppDeps` contains any dependencies created at application startup such as database connection pools and loggers, i.e. the server-wide environment described earlier.

Now for each level below, we can do something similar.  We use `hoistServer` again, to translate that level's monad into the level right above it. In the `run` function passed to `hoistServer`, we create the appropriate environment for that level, using information from the request such as URL parameters or headers and making necessary HTTP calls or database calls to populate the environment's attributes.

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
              , appOrganizationService = depsOrganizationService deps
              , userId = userId
              }
      runAppAuthenticated appAuthenticatedEnv action
        
authenticatedServer
  :: Maybe AuthorizationHeader
  -> ServerT (NamedRoutes AuthenticatedApi) AppAuthenticated
authenticatedServer = -- ...
```

**Note:** We used an intermediary `authenticatedServer'` for clarity and to keep the same pattern as the previous level.

You can see in the snippet above how the `authenticatedServer`, running in `AppAuthenticated`, gets mounted in the `rootServer`, running in `App`. We again use `hoistServer`, just as we did to translate `rootServer` into a server running in `Handler` that Servant can understand.

The main logic happens in the `run :: AppAuthenticated a -> App a` transformation function that is passed to `hoistServer`. In it, we need to construct an `AppAuthenticatedEnv` to pass to the `runAppAuthenticated` helper function.

To do so, we first retrieve the `AppEnv` context from the `App` monad using `ask` from `ReaderT`, and embed it in the `AppAuthenticatedEnv`. This is how we nest the different ReaderT environments: each environment has an attribute that holds the environment from the one above it.

Next, we extend the `AppAuthenticatedEnv` context by adding other attributes. For instance, we can use the `"Authorization"` header to authenticate and fetch the user's information, `userId` in the example above. This can be done with HTTP or database calls, or more generally other `IO` actions, since we are in the `App` monad and all of these custom monads are based on `ReaderT env IO`.

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

We again use `hoistServer` to embed the `projectServer` in the `authenticatedServer`. In the `run` transformation function for this level, we also grab the previous environment, `AppAuthenticatedEnv`, and nest it in the new environment, `AppProjectEnv`. We enhance the new environment, in this case by using the `organizationId` in the URL path parameters to fetch the organization object that the projects in the current request belong to.

Now let's circle back and implement the translation helper functions for each custom monad that we've been using inside the `run` function passed to `hoistServer`. Here are their signatures as a reminder:

```haskell
runApp :: AppEnv -> App a -> Handler a
runAppAuthenticated :: AppAuthenticatedEnv -> AppAuthenticated a -> App a
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
-- etc.
```

The top-level `runApp` is the one we've seen earlier which gets us to a Servant `Handler`, and for which there are already examples and explanations (for instance [here](https://www.parsonsmatt.org/2017/06/21/exceptional_servant_handling.html)):

```haskell
runApp :: AppEnv -> App a -> Handler a
runApp env action =
  Handler . ExceptT . try $ runReaderT (unApp action) env
```

Let's take one of the sub-API transformation function, for instance `runAppProject`. Since both `AppProject` and `AppAuthenticated` are `ReaderT env IO` monads, one way to get from one to the other is by unwrapping `AppProject` with `runReaderT` an reconstructing `AppAuthenticated` with `ReaderT`:

```haskell
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
runAppProject appProjectEnv action =
  AppAuthenticated
    . ReaderT
    $ \_appAuthenticatedEnv -> runReaderT (unAppProject action) appProjectEnv
```

We're really only going from one `ReaderT` to another, and translating the environment of the target monad (`AppAuthenticatedEnv`) into the environment of the source monad (`AppProjectEnv`).

It turns out [`withReaderT`](https://hackage.haskell.org/package/transformers/docs/Control-Monad-Trans-Reader.html#v:withReaderT) does exactly that. So we can simplify a bit and write:

```haskell
runAppProject :: AppProjectEnv -> AppProject a -> AppAuthenticated a
runAppProject appProjectEnv action =  do
  let mapEnv _appAuthenticatedEnv' = appProjectEnv
  AppAuthenticated $ withReaderT mapEnv (unAppProject action)

withReaderT :: (r' -> r) -> ReaderT r m a -> ReaderT r' m a
```

In our case the environment transformation function `mapEnv :: r' -> r` is just replacing the environment altogether. But since all our sub-API environments have their parent's environment embedded in them, we might be able to use `withReaderT` more effectively. Let's start by in-lining `runAppProject` in the `projectServer'` where it was used:

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

We see that we can simplify `run` and remove the `ask` for `appAuthenticatedEnv` since `withReaderT` passes it to the `mapEnv` function:

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

Finally, since most of the work of going from an `AppProject` to an `AppAuthenticated` is building the `AppProjectEnv`, we can encapsulate all of that and re-introduce the `runAppProject` function, this time passing it all it needs to build the `AppProjectEnv` (in our case, the `OrganizationId`):

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

If you'd like to see the full source code for this section, [`Server.hs`](https://gist.github.com/nicolashery/4dcf7003564c576d0d2f4872447c7b02#file-server-hs) in the Gist is a good place to start.

