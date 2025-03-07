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

This is also not a criticism of Go. This was my first Go project, and I actually enjoyed working with the language. Having shied away from it for a while (notably because of lack of sum types), I finally gave it a try because it seemed a good fit for this project. The fast compile times, robust standard library, simplicity of the language, and great developer tooling all delivered on their promise.

For the anecdote, the first time I ran `go build` was on the sample codebase from [Alex Edward's  "Let's Go Further" book](https://lets-go-further.alexedwards.net/) (excellent book by the way), and I had to run it again because it was so much faster than what I was used to (*cough* Haskell *cough*), I thought nothing had happened.

So, I'm feeling very productive on this project. The feedback loop is amazing, I have a working proof of concept in just a couple of days, I'm coding away like there's no tomorrow, zero values and pointers do not scare me, just need to add this last thing and... Then it hits me:

``` text
2024/12/07 12:16:53 http: panic serving [::1]:60984:
runtime error: invalid memory address or nil pointer dereference
goroutine 4 [running]:
net/http.(*conn).serve.func1()
    /usr/local/go/src/net/http/server.go:1947 +0xb0
panic({0x100a00f00?, 0x100f19b00?})
    /usr/local/go/src/runtime/panic.go:785 +0x124
example/main.TransformAction(0x14000115e08)
    /Users/nicolashery/dev/example/main.go:110 +0x1c
example/main.(*Server).handleTransformActions(0x140001cad80, {0x100ad6358, 0x14000160380}, 0x140001597c0)
    /Users/nicolashery/dev/example/main.go:157 +0x20c
[...]
```

Ouch. Having done a lot of Haskell and (strict) TypeScript recently, I had forgotten a bit about such runtime errors. But I don't panic, and I carefully look at the code mentioned in the stack trace.

Below is a simplified version of the code for the sake of this article (the actual implementation had bigger structures and more cases). Can you spot the error? You have 5 seconds.

```go
func TransformAction(a *Action) string {
	var result string

	switch a.Type {
	case ActionType_CreateObject:
		result = fmt.Sprintf(
			"create_object %s %s %s", a.Object.Type, a.Object.ID, a.Object.Name,
		)
	case ActionType_UpdateObject:
		result = fmt.Sprintf(
			"update_object %s %s %s", a.Object.Type, a.Object.ID, a.Object.Name,
		)
	case ActionType_DeleteObject:
		result = fmt.Sprintf("delete_object %s", a.Object.ID)
	case ActionType_DeleteAllObjects:
		result = "delete_all_objects"
	}

	return result
}
```

Ok, obviously you'll want to `Cmd/Ctrl+Click` on `Action` to see what it is:

```go
type Action struct {
	Type   ActionType `json:"type"`
	Object *Object    `json:"object,omitempty"`
	ID     *string    `json:"id,omitempty"`
}

func NewActionCreateObject(object *Object) Action {
	return Action{
		Type:   ActionType_CreateObject,
		Object: object,
	}
}

func NewActionUpdateObject(object *Object) Action {
	return Action{
		Type:   ActionType_UpdateObject,
		Object: object,
	}
}

func NewActionDeleteObject(id string) Action {
	return Action{
		Type: ActionType_DeleteObject,
		ID:   &id,
	}
}

func NewActionDeleteAllObjects() Action {
	return Action{
		Type: ActionType_DeleteAllObjects,
	}
}
```

Did you see the error? I yes, then you can stop reading now and get back to work. I'm joking. Didn't see it in the allowed time limit? Don't worry, the Go type checker couldn't either.

## Decoding JSON sum types in Go, take one

How did I get to the code above you might wonder? Well, imagine our service is receiving a JSON payload that looks like this:

```json
[
  {
    "type": "create_object",
    "object": {
      "type": "user",
      "id": "1",
      "name": "user1"
    }
  },
  {
    "type": "update_object",
    "object": {
      "type": "user",
      "id": "1",
      "name": "user1 updated"
    }
  },
  {
    "type": "delete_object",
    "id": "1"
  },
  {
    "type": "delete_all_objects"
  }
]
```

These are all different types of "actions", and this JSON representation is not unreasonable. The [OpenAPI specification](https://swagger.io/specification/#discriminator-object) has a discriminator "pet" example, and the [Redocly documentation](https://redocly.com/learn/openapi/discriminator) a "vehicle" example, that are similar to this. (I have yet to come across an API with pets so my example will be the less fun "actions", appologies.)

My naive attempt to decode this JSON, because I was in a rush (and maybe also because Copilot suggested it, if I'm being honest), was to create a struct which I call *"bag of all the things"*. This is a struct with all possible fields for every action type merged, and using pointers. The zero-value of pointers is `nil` which will be set for fields that are "unused" by a particular action type. Here it is in all its glory:

```go
type Action struct {
	Type   ActionType `json:"type"`
	Object *Object    `json:"object,omitempty"`
	ID     *string    `json:"id,omitempty"`
}

type ActionType string

const (
	ActionType_CreateObject     ActionType = "create_object"
	ActionType_UpdateObject     ActionType = "update_object"
	ActionType_DeleteObject     ActionType = "delete_object"
	ActionType_DeleteAllObjects ActionType = "delete_all_objects"
)
```

This works because `json.Unmarshal` doesn't care if there are missing fields in the JSON payload, it will just set the zero-value for them:

```go
actions := []Action{}
if err := json.Unmarshal(data, &actions); err != nil {
  return err
}
```

We can of course also go the other way and call `json.Marshal` to encode into the same JSON representation as the snippet above. The `omitempty` struct tag option will remove fields unused by each action type from the resulting JSON.

So we're off to the races, what can go wrong with a bag of pointers? Subtle bugs when trying to access a field that is `nil` because unused by that action type, that's what:

```go
switch a.Type {
case ActionType_CreateObject:
  result = fmt.Sprintf(
    "create_object %s %s %s", a.Object.Type, a.Object.ID, a.Object.Name,
  )
case ActionType_UpdateObject:
  result = fmt.Sprintf(
    "update_object %s %s %s", a.Object.Type, a.Object.ID, a.Object.Name,
  )
case ActionType_DeleteObject:
  result = fmt.Sprintf("delete_object %s", a.Object.ID) // <- the bug was here!
  // for this action type `a.Object` is `nil`
  // the correct code should be: `*a.ID`
case ActionType_DeleteAllObjects:
  result = "delete_all_objects"
}
```

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