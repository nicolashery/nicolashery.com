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

Let's take a primitive type, a boolean or `bool` in Rust. It has 2 possible values: `true` or `false` (also called "cardinality"). A struct or record is called a **"product type"** because you can count the number of possible values (or cardinality) by *multiplying* the number of possible values of each field. So if I have a struct with 2 boolean fields (example here in Rust):

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

Ok, that section title is a bit cheeky and probably not entirely true. But when I figured out what caused the panic in my code, the thought "sum types would've caught this at compile time" _did_ cross my mind. I'm sure the astute reader could find better ways to structure my first implementation, even without sum types. But humour me for the sake of this article.

Let me say it now: This is _not_ one of those "Go should have sum types" post. A lot has already been written on the topic and I don't want to get into the debate (although you'll probably guess where I stand). Let's just assume I want to _emulate_ something like sum types in Go, then:

1. How do I do so without straying too far from what's idiomatic in the language?
2. How do I encode and decode it to and from JSON with the structure we'll see below?

This is also not a criticism of Go. This was my first Go project, and I actually enjoyed working with the language. Having shied away from it for a while (notably because of lack of sum types), I finally gave it a try because it seemed a good fit for this project. The fast compile times, robust standard library, and great developer tooling all delivered on their promise.

For the anecdote, the first time I ran `go build` was on the sample codebase from [Alex Edward's  "Let's Go Further" book](https://lets-go-further.alexedwards.net/) (excellent book by the way), and I had to run it again because it was so much faster than what I was used to (*cough* Haskell *cough*), I thought nothing had happened.

So, I'm feeling very productive on this project. The feedback loop is amazing, I have a working proof of concept in just a couple of days, I'm coding away like there's no tomorrow, zero values and pointers do not scare me, just need to add this last thing and... Then it hits me:

``` text
nil panic
```

Ouch. Having done a lot of Haskell and (strict) TypeScript recently, I had forgotten a bit about such runtime errors. But I don't panic, and I carefully look at the code mentioned in the stack trace.

Below is a simplified version of the code for the sake of this article (the actual implementation had bigger structures and more cases). Can you spot the error? You have 5 seconds.

```go
// ...
```

Did you see it? I yes, then you can stop reading now and get back to work. I'm joking. Didn't see it in the allowed time limit? Don't worry, the Go type checker couldn't either.

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