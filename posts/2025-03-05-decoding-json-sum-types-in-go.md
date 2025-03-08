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

My naive attempt to decode this JSON, because I was in a rush (and maybe also because Copilot suggested it, if I'm being honest), was to create a struct which I call *"bag of all the fields"*. This is a struct with all possible fields for every action type merged, and using pointers. The zero-value of pointers is `nil` which will be set for fields that are "unused" by a particular action type. Here it is in all its glory:

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

## How do OpenAPI and Protobuf handle this?

I pick myself up after this runtime panic, and have the following genius idea: There are code generators for OpenAPI, if I give them the specification for the JSON discriminated union above, what do they output for Go? Also, [Protocol Buffers](http://protobuf.dev/) is a popular wire format that is based on code generation, and the [Oneof field](https://protobuf.dev/programming-guides/editions/#oneof) looks a lot like a sum type, so what do they generate for Go?

The OpenAPI schema for an action would look like this:

```yaml
Action:
  type: object
  discriminator:
    propertyName: type
    mapping:
      "create_object": "#/components/schemas/CreateObject"
      "update_object": "#/components/schemas/UpdateObject"
      "delete_object": "#/components/schemas/DeleteObject"
      "delete_all_objects": "#/components/schemas/DeleteAllObjects"
  oneOf:
    - $ref: "#/components/schemas/CreateObject"
    - $ref: "#/components/schemas/UpdateObject"
    - $ref: "#/components/schemas/DeleteObject"
    - $ref: "#/components/schemas/DeleteAllObjects"
CreateObject:
  type: object
  properties:
    type:
      type: string
    object:
      $ref: "#/components/schemas/Object"
# ...
```

If I feed this to the [OpenAPI Generator](https://openapi-generator.tech/) (note that I'm using the `useOneOfDiscriminatorLookup=true` option for better output), I get what I'll call a *"bag of all the branches"*:

```go
type Action struct {
	createObject     *CreateObject
	updateObject     *UpdateObject
	deleteObject     *DeleteObject
	deleteAllObjects *DeleteAllObjects
}

type CreateObject struct {
	Object Object `json:"object"`
}

// ...
```

It generates an `UnmarshalJSON` method for `Action` that:

- first decodes the JSON to check the `"type"` field (this is thanks to the `useOneOfDiscriminatorLookup=true` codegen option)
- according to the value of `"type"`, it chooses the appropriate branch and decodes the JSON using the corresponding struct (`CreateObject`, `UpdateObject`, etc.)

Edited for clarity, it looks something like this:

```go
func (a *Action) UnmarshalJSON(data []byte) error {
	var tagged struct {
		Type ActionType `json:"type"`
	}

	if err := json.Unmarshal(data, &tagged); err != nil {
		return err
	}

	var err error
	switch tagged.Type {
	case ActionType_CreateObject:
		err = json.Unmarshal(data, &a.createObject)
	case ActionType_UpdateObject:
		err = json.Unmarshal(data, &a.updateObject)
	case ActionType_DeleteObject:
		err = json.Unmarshal(data, &a.deleteObject)
	case ActionType_DeleteAllObjects:
		err = json.Unmarshal(data, &a.deleteAllObjects)
	}

	return nil
}
```

To get to the actual underlying value, the generator creates a method (which I'll name `Value()` here) that returns the first non-nil pointer:

```go
func (a *Action) Value() any {
	if a.createObject != nil {
		return a.createObject
	}

	if a.updateObject != nil {
		return a.updateObject
	}

	if a.deleteObject != nil {
		return a.deleteObject
	}

	if a.deleteAllObjects != nil {
		return a.deleteAllObjects
	}

	return nil
}
```

So this is already a big improvement on my *"bag of all the fields"* approach. Since the accessor method to the underlying value returns `any`, I'm now checking the `.(type)` which can be one of the more precise structs (`CreateObject`, `UpdateObject`, etc.):

```go
func TransformAction(action *Action) string {
	var result string

	switch v := action.Value().(type) {
	case *CreateObject:
		result = fmt.Sprintf(
			"create_object %s %s %s", v.Object.Type, v.Object.ID, v.Object.Name,
		)
	case *UpdateObject:
		result = fmt.Sprintf(
			"update_object %s %s %s", v.Object.Type, v.Object.ID, v.Object.Name,
		)
	case *DeleteObject:
		result = fmt.Sprintf("delete_object %s", v.ID) // <- can't make the same mistake here!
		// trying to do `v.Object.ID` will cause a compiler error:
		// "type *DeleteObject has no field or method Object"
	case *DeleteAllObjects:
		result = "delete_all_objects"
	}

	return result
}
```

Some issues remain though:

- I "trust" the `any` return value of the accessor method to be one of the action structs (`CreateObject`, `UpdateObject`, etc.) and nothing else
- If I add a "branch" (i.e. another action type), I can forget to update the `switch` statement in `TransformAction`

There is another generator [oapi-codegen](https://github.com/oapi-codegen/oapi-codegen) that I tried out. I has a slight twist in that it holds on to a `json.RawMessage` and delays the decoding until we call an equivalent of the `action.Value()` accessor method:

```go
type Action struct {
	union json.RawMessage
}

type CreateObject struct {
	Type   string `json:"type"`
	Object Object `json:"object"`
}

// ...

func (a *Action) Value() (any, err) {
  // JSON decoding happens here now
}
```

The decoding works essentially the same, first decode enough to check the `"type"` field, then according to its value unmarshal into one of the action structs (`CreateObject`, `UpdateObject`, etc.). The [ `json.RawMessage` documentation](https://pkg.go.dev/encoding/json#example-RawMessage-Unmarshal) actually has a similar example.

Since delaying JSON decoding wasn't particularly useful in my case, I didn't choose this route. But I wanted to mention it for completeness' sake.

What about **Protocol Buffers** (aka "Protobuf")? They were interesting to me because I spotted this in the [Go generated code guide](https://pkg.go.dev/encoding/json#example-RawMessage-Unmarshal):

> For a oneof field, the protobuf compiler generates a single field with an interface type `isMessageName_MyField`. It also generates a struct for each of the singular fields within the oneof. These all implement this `isMessageName_MyField` interface.

Even though we're working with a JSON API, a Protobuf definition for our data model could look like this:

```protobuf
message Action {
  oneof value {
    CreateObject create_object = 1;
    UpdateObject update_object = 2;
    DeleteObject delete_object = 3;
    DeleteAllObjects delete_all_objects = 4;
  }
}

message CreateObject {
  Object object = 1;
}

// ...
```

The generated code indeed creates an interface `isAction_Value` with a single method, and an `Action` struct that holds a field of that interface.

```go
type Action struct {
	Value isAction_Value `protobuf_oneof:"value"`
	// other protobuf-specific fields omitted
}

type isAction_Value interface {
	isAction_Value()
}

type Action_CreateObject struct {
	CreateObject *CreateObject `protobuf:"bytes,1,opt,name=create_object,json=createObject,oneof"`
}

func (*Action_CreateObject) isAction_Value() {}

// ...
```

Now these two code generators, OpenAPI and Protobuf, will be the inspiration for my second attempt at decoding the JSON sum type in a more type-safe way...

## Decoding JSON sum types in Go, take two

After a bit of searching on the topic of "Go sum types", I stumbled across this: [go-check-sumtype](https://github.com/alecthomas/go-check-sumtype). From the README:

> A typical proxy for representing sum types in Go is to use an interface with an unexported method and define each variant of the sum type in the same package to satisfy said interface. This guarantees that the set of types that satisfy the interface is closed at compile time.

This "interface with an unexported method" (also called "sealed interface", or "marker interface") sounded like a reasonable way to do it. And it's also what the Protobuf codegen seems to be using.

I replaced my single "bag of all the fields"  struct with a sealed interface `IsAction` and a struct for each variant that implements the interface (`CreateObject`, `UpdateObject`, etc.):

```go
//sumtype:decl
type IsAction interface {
	// sealed interface to emulate sum type
	isAction()
}

type CreateObject struct {
	Object Object `json:"object"`
}

func (*CreateObject) isAction() {}

type UpdateObject struct {
	Object Object `json:"object"`
}

func (*UpdateObject) isAction() {}

type DeleteObject struct {
	ID string `json:"id"`
}

func (*DeleteObject) isAction() {}

type DeleteAllObjects struct{}

func (*DeleteAllObjects) isAction() {}
```

Now I am quite pleased. Not only do these structs for each action type provide more type-safety, but if I forget to handle a variant in my `switch` statement (or if I add a new variant), the `go-check-sumtype` linter will catch it instead of getting an error at runtime!

```go
func TransformAction(action *Action) string {
	var result string

	switch v := action.Value().(type) { // <- if we miss a case here, `go-check-sumtype` will catch it!
	// for example, omitting `case *DeleteAllObjects` will cause a linter error:
	// "exhaustiveness check failed for sum type IsAction: missing cases for DeleteAllObjects"
	case *CreateObject:
		result = fmt.Sprintf(
			"create_object %s %s %s", v.Object.Type, v.Object.ID, v.Object.Name,
		)
	case *UpdateObject:
		result = fmt.Sprintf(
			"update_object %s %s %s", v.Object.Type, v.Object.ID, v.Object.Name,
		)
	case *DeleteObject:
		result = fmt.Sprintf("delete_object %s", v.ID) // <- better type-safety for each branch!
		// for example, trying to do `v.Object.ID` will cause a compiler error:
		// "type *DeleteObject has no field or method Object"
	case *DeleteAllObjects:
		result = "delete_all_objects"
	}

	return result
}
```

I still needed to figure out how to decode the JSON sum types payload into this interface and structs. You can't unmarshal into an interface value directly, you need to pass a concrete type. So I created a wrapper struct like so:

```go
type Action struct {
	value IsAction
}
```

I also found the [exhaustive](https://github.com/nishanths/exhaustive) linter, so why stop at sum types when you can also have enums! I defined one for action types, which are used as "tags" in my tagged union, along with the proper methods for JSON and string representations:

```go
type ActionType int

const (
	ActionType_CreateObject ActionType = iota
	ActionType_UpdateObject
	ActionType_DeleteObject
	ActionType_DeleteAllObjects
)

// note: `exhaustive` linter will catch if we miss an entry here
var ActionTypeStringMap = map[ActionType]string{
	ActionType_CreateObject:     "create_object",
	ActionType_UpdateObject:     "update_object",
	ActionType_DeleteObject:     "delete_object",
	ActionType_DeleteAllObjects: "delete_all_objects",
}

func (t ActionType) MarshalJSON() ([]byte, error) {
	// ...
}

func (t *ActionType) UnmarshalJSON(data []byte) error {
	// ...
}

func (t ActionType) String() string {
	// ...
}
```

I then defined `UnmarshalJSON` for my wrapper struct like so:

```go
func (a *Action) UnmarshalJSON(data []byte) error {
	var tag struct {
		Type ActionType `json:"type"`
	}

	if err := json.Unmarshal(data, &tag); err != nil {
		return err
	}

	var v IsAction
	// note: `exhaustive` linter will catch if we miss a case here
	switch tag.Type {
	case ActionType_CreateObject:
		v = new(CreateObject)
	case ActionType_UpdateObject:
		v = new(UpdateObject)
	case ActionType_DeleteObject:
		v = new(DeleteObject)
	case ActionType_DeleteAllObjects:
		v = new(DeleteAllObjects)
	}

	if err := json.Unmarshal(data, v); err != nil {
		return err
	}

	a.value = v
	return nil
}
```

This works similarly to what we saw in the OpenAPI generated code:

- first decode the JSON only enough to check the `"type"` field
- second, according to the value of `"type"`, choose the appropriate variant struct of the sum type and decode into that (`CreateObject`, `UpdateObject`, etc.)

For the other way around, I also defined `MarshalJSON` for the wrapper struct:

```go
func (a *Action) MarshalJSON() ([]byte, error) {
	v := a.value

	data, err := json.Marshal(&v)
	if err != nil {
		return nil, err
	}

	var tagged map[string]any
	if err := json.Unmarshal(data, &tagged); err != nil {
		return nil, err
	}

	// note: `go-check-sumtype` linter will catch if we miss a case here
	switch v.(type) {
	case *CreateObject:
		tagged["type"] = ActionType_CreateObject
	case *UpdateObject:
		tagged["type"] = ActionType_UpdateObject
	case *DeleteObject:
		tagged["type"] = ActionType_DeleteObject
	case *DeleteAllObjects:
		tagged["type"] = ActionType_DeleteAllObjects
	}

	return json.Marshal(&tagged)
}
```

In this method we:

- first encode the wrapped interface as JSON (unlike decoding, we can do this because the interface here will be initialized with an underlying concrete type: `CreateObject`, `UpdateObject`, etc.)
- second, to add the tag in the `"type"` field, we do a roundtrip of: decoding into a `map[string]any`, adding the tag to that map, and re-encoding the map into JSON

Notice that for `UnmarshalJSON` I use the `exhaustive` linter in `UnmarshalJSON` to make sure I handle all possible tags, and for `MarshalJSON` I use the `go-check-sumtype` linter to make sure I handle all possible variant structs. So given I keep the "enum" and "sum type" up-to-date, I will have exhaustiveness checking in both these methods (in addition to other methods or functions, such as `TransformAction` we saw earlier).

That's it! Yes, there is a bit of boilerplate, but if one is doing Go they are already probably ok with a little boilerplate here and there. Also, between AI coding assistants and other codegen tools, the cost of boilerplate can be mitigated. And finally there is that thing we say, "code is read (and maintained) much more often that written"? So I'd argue the added type-safety and catching things and compile-time instead of runtime might be worth the tradeoff.

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