---
layout: post
title: Decoding JSON sum types in Go without panicking
description: The Go programming language doesn't have native support for sum types, but we'll see how we can emulate them, how to decode and encode them into JSON, and how in some cases they can help avoid a runtime panic exception.
---

[[TOC]]

## Whether we find them useful or not, sum types are here to stay

Sum types (aka [tagged unions](https://zig.guide/language-basics/unions/), [discriminated unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), [variants](https://ocaml.org/docs/basic-data-types#variants), or sometimes [enums](https://doc.rust-lang.org/book/ch06-00-enums.html)) are unavoidable as a software developer. Unless you live under a rock desperatly holding on to a single programming language that happens not to have them of course.

Many languages support sum types natively: [Zig](https://zig.guide/language-basics/unions/), [TypeScript](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions), [OCaml](https://ocaml.org/docs/basic-data-types#variants), [Rust](https://doc.rust-lang.org/book/ch06-00-enums.html), just to name a few. And even [OpenAPI has them](https://swagger.io/specification/#discriminator-object), the de-facto standard and language-agnostic way to define HTTP APIs using JSON. So even if the particular programming your using right now doesn't natively support sum types, you may have to handle a JSON payload over the wire that is modelled as one. And you'll have to decide how you want to decode that.

Personal feelings about sum types aside, I think most people would agree they are not a terrible way to model a data structure that can be *"one of these (potentially very different) things, and nothing else"*. And once you've used sum types in a match/**switch statement**/expression combined with **exhaustiveness checking**, well I find it's hard to go back.

If you already know what a sum type is and why they are called that way feel free to skip over to the next section. Let's take a primitive type, a boolean or `bool` in Rust. It has 2 possible values: `true` or `false` (also called "cardinality").

A struct or record is called a **"product type"** because you can count the number of possible values (or cardinality) by *multiplying* the number of possible values of each field. So if I have a struct with 2 boolean fields (example here in Rust):

```rust
struct UserStatus {
    signed_up: bool,
    subscribed: bool,
}
```

The number of possible values for this struct (or "product type") is: 2x2 = **4**.

Now I didn't choose this example struct completely at random. Some of the possible values are not valid in this particular domain: a user can't be *subscribed* if they are not *signed up* as well. You'll also hear the phrase "make illegal states unrepresentable" when talking about sum types.

A **"sum type"** is called that way because... you guessed it. You can count the number of possible values (or cardinality) by *summing* the number of possible values of each branch. So if I have the following sum type (example still in Rust, where they are called "enums"):

```rust
enum UserStatus {
    Anonymous,
    SignedUp { subscribed: bool },
}
```

The number of possible values for this "sum type" is: 1+2 = **3**.

I'll leave it as an exercise to the reader to discuss and decide which of these two data structures is better adapted for representing this particular domain.

## My first nil pointer panic in Go was due to lack of sum types

- cheeky but kind of felt that way
- if I'm honest probably could've structured my code better (even without sum types) instead of coding like a gorilla trying to go fast, as we'll see
- first Go project
- don't get me wrong, really enjoy working with Go at the moment and this is not one of those "Go should have sum types" post
- fast compile times, doing a lot with sdtlib, great dev tooling
- Alex Edward's Let's Go Further example compiled so fast had to run it again to be sure
- sync service between Keycloak (authentication) and Topaz (authorization)
- feeling really productive (coming from TypeScript, Haskell most recently)
- first proof of concept in a week or so
- then it hits me (nil pointer panic)
- can you spot the error in the code? you have 5 seconds. Yes? you can stop reading now (joking) No? the Go type checking couldn't either don't worry

## Decoding JSON sum types in Go, take one

- this is the JSON we are getting (it is not unreasonable, OpenAPI has a discriminator example similar to this)
- naive attempt, "bag of all the things" (all possible fields merged into a struct, as nil-able pointers)
- works because JSON unmarshall ignores missing and sets to zero value
- but subtle bug if trying to access a value that is nil because unused by that action type
- (yes could use methods to access value or transform struct but still have underlying problem of a carrying around a struct with nil pointers)

## How does OpenAPI or Protobuf codegen do it?

- OpenAPI: bag of all branches or deferred decoding
- Get back `any` so no static analysis (could still make mistake panic at run time)
- Protobuf: use a "sealed" interface to represent options

## Decoding JSON sum type in Go, take two

- sealed interface to represent actions
- static analysis: go-check-sumtypes (exhaustiveness checking)
- wrapper struct
- enums to represent action types
- static analysis: exhaustive (enums)
- unmarshall implementation
- marshall implementation (roundtrip to add type field)
- note: don't want type field on each struct as this is for serialization only (that is why don't marshal interface directly), and also could lead to inconsistencies
- boilerplate but between AI and codegen don't mind (code is read and maintained more than written)

## Alternative implementations

- bag of all branches
- marshall more effectively (without roundtrip)
- internally tagged vs externally tagged

## What Go could have been: V lang?

- example in V
- niche language but very interesting
- will probably stick to Go for now

## Examples in other languages

- if you made it this far
- link to repo