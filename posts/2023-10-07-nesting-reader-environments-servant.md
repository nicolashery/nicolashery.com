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

