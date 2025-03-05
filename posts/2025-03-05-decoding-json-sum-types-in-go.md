---
layout: post
title: Decoding JSON sum types in Go without panicking
description: TODO

---

[[TOC]]

- Wether we like them are not, sum types are here to stay
  - Languages have them
  - OpenAPI has them!
  - They are not a terrible way to model "I can be any one of these things, and nothing else"
  - aka tagged unions, discriminated union, "enums" (Rust)
  - struct/record is "product type" (to get all options you multiply so a struct with three booleans will be 2x2x2 = 8) a "sum type" you add so a sum type with a constant or constant will be 2+1 = 3 possibility (anonymous, signed up, subscribed)
- My first nil pointer panic in Go was due to lack of sum types
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
- Decoding JSON sum types in Go, take one
  - this is the JSON we are getting (it is not unreasonable, OpenAPI has a discriminator example similar to this)
  - naive attempt, "bag of all the things" (all possible fields merged into a struct, as nil-able pointers)
  - works because JSON unmarshall ignores missing and sets to zero value
  - but subtle bug if trying to access a value that is nil because unused by that action type
  - (yes could use methods to access value or transform struct but still have underlying problem of a carrying around a struct with nil pointers)
- How does OpenAPI and Protobuf codegen do it?
  - OpenAPI: bag of all branches or deferred decoding
  - Get back `any` so no static analysis (could still make mistake panic at run time)
  - Protobuf: use a "sealed" interface to represent options
- Decoding JSON sum type in Go, take two
  - sealed interface to represent actions
  - static analysis: go-check-sumtypes (exhaustiveness checking)
  - wrapper struct
  - enums to represent action types
  - static analysis: exhaustive (enums)
  - unmarshall implementation
  - marshall implementation (roundtrip to add type field)
  - note: don't want type field on each struct as this is for serialization only (that is why don't marshal interface directly), and also could lead to inconsistencies
  - boilerplate but between AI and codegen don't mind (code is read and maintained more than written)
- Alternative implementations
  - bag of all branches
  - marshall more effectively (without roundtrip)
  - internally tagged vs externally tagged
- What Go could have been: V lang?
  - example in V
  - niche language but very interesting
  - will probably stick to Go for now
- Examples in other languages
  - if you made it this far
  - link to repo