---
layout: post
title: Parse data files using Node.js streams
---

*In this post I explain how I used Node.js streams to parse and transform data text files.*

Streams and pipes are an important part of the [Unix philosophy](http://www.faqs.org/docs/artu/ch01s06.html):

> Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface.
>
> -- Doug McIlroy, inventor of Unix pipes and one of the founders of the Unix tradition

This means that we can have small, focused programs that are easily assembled together to tackle more complex problems. Sort of like building awesome things with Lego blocks.

This is also possible in Node.js thanks to the [Stream](http://nodejs.org/api/stream.html) interface, and its `.pipe()` method.

I won't go over the general aspects of streams and pipes in Unix and Node.js. For that, I strongly recommend reading [@substack](https://twitter.com/substack)'s excellent [Stream Handbook](https://github.com/substack/stream-handbook). In this post, I'd like to show how I started using them. 

During one of my projects, I had to parse text files containing data from some "legacy" system in order to make it more usable and load it into a database. The parsing had a few different steps to it (translate the file to JSON, add and modify data for each record, etc.), and the files varied in size and could get relatively big.

I thought this would be an ideal candidate for streams. I could split each step into its own "streaming program", assemble them, and pipe the data through the resulting chain. It would also be fast and memory-efficient, even with bigger files. With streams, the whole file isn't loaded into memory, rather the data is "buffered" to each program of the chain and throttled to the speed at which they can process the data.

You can follow along with the code for the example in this article at [https://github.com/nicolashery/example-stream-parser](https://github.com/nicolashery/example-stream-parser).

<h2 id="the-data-file-to-parse">The data file to parse</h2>

In this example, I'm going to use some silly made-up data (its format inspired by some files I've had to parse).

Let's say our objective is to turn a `data.csv` file containing something like:

```
Game Export (v1.2)
GameId,1234567
Player,1,Homer Simpson
Player,2,Bart Simpson
Player,3,Marge Simpson
Map,101,Crossroads
Time Range,2013-01-11 02:50:40,2013-01-12 05:34:56
Number of Records,100
Index,Timestamp,Event Type,Player Id,Event Data
1,2013-01-11 02:54:42,ResourcesGathered,3,"resource_type=Wood, quantity=11"
2,2013-01-11 03:00:26,ResourcesGathered,2,"resource_type=Gold, quantity=7"
3,2013-01-11 03:05:42,ResourcesGathered,1,"resource_type=Gold, quantity=2"
4,2013-01-11 03:08:05,UnitTrained,3,"unit_type=Knight, health=270, damage=12-15"
5,2013-01-11 03:24:05,DestroyedEnemy,1,"unit_type=Pig Farm"
```

Into this more usable format:

```json
{"header":{"Title":"Game Export (v1.2)","GameId":"1234567","Players":[{"id":"1","name":"Homer Simpson"},{"id":"2","name":"Bart Simpson"},{"id":"3","name":"Marge Simpson"}],"Map":{"id":"101","name":"Crossroads"},"Time Range":{"start":"2013-01-11 02:50:40","end":"2013-01-12 05:34:56"},"Number of Records":"100","Columns":["Index","Timestamp","Event Type","Player Id","Event Data"]}}
{"Index":"1","Timestamp":"2013-01-11 02:54:42","Event Type":"ResourcesGathered","Player Id":"3","Event Data":{"resource_type":"Wood","quantity":"11"}}
{"Index":"2","Timestamp":"2013-01-11 03:00:26","Event Type":"ResourcesGathered","Player Id":"2","Event Data":{"resource_type":"Gold","quantity":"7"}}
{"Index":"3","Timestamp":"2013-01-11 03:05:42","Event Type":"ResourcesGathered","Player Id":"1","Event Data":{"resource_type":"Gold","quantity":"2"}}
{"Index":"4","Timestamp":"2013-01-11 03:08:05","Event Type":"UnitTrained","Player Id":"3","Event Data":{"unit_type":"Knight","health":"270","damage":"12-15"}}
{"Index":"5","Timestamp":"2013-01-11 03:24:05","Event Type":"DestroyedEnemy","Player Id":"1","Event Data":{"unit_type":"Pig Farm"}}
```

<h2 id="a-first-basic-stream">A first basic stream</h2>

Let's create a first Node.js stream to pipe our data file to. This stream will do nothing really, just pass the data as-is to the next stream in the chain.

For that, we will be using the very handy [Transform](http://nodejs.org/api/stream.html#stream_class_stream_transform) stream, which is both [Writable](http://nodejs.org/api/stream.html#stream_class_stream_writable) and [Readable](http://nodejs.org/api/stream.html#stream_class_stream_readable) (in other words, data comes in and also comes out).

All we need is to create a `Transform` stream and implement its `_transform` method. For now we'll just push data without doing anything with it.

```javascript
// parser.js
var Transform = require('stream').Transform;

var parser = new Transform();
parser._transform = function(data, encoding, done) {
  this.push(data);
  done();
};
```

Now let's add a bit to pipe data coming in from `stdin`, through our `parser`, and then out to `stdout`:

```javascript
// Pipe the streams
process.stdin
.pipe(parser)
.pipe(process.stdout);

// Some programs like `head` send an error on stdout
// when they don't want any more data
process.stdout.on('error', process.exit);
```

Now if we run in the terminal:

```bash
$ cat data.csv | node parser
Game Export (v1.2)
GameId,1234567
Player,1,Homer Simpson
# ...
```

We should see our data being streamed through the `parser` correctly!

<h2 id="parse-the-csv-file">Parse the CSV file</h2>

The first thing I'd like to do is split those comma-separated values into objects I can manipulate.

Instead of reinventing the wheel, an [npm](https://npmjs.org) search brings up [csv-streamify](https://github.com/klaemo/csv-stream) which I can use. It will be easy to plug in my own `parser` logic on top of it, thanks to `.pipe()`. This is the beauty of streams.

I'll set the `objectMode` option to `true` for both `csv-streamify` and my `parser` to work with JavaScript objects (instead of strings). The `stdout` stream expects strings though, so I'll convert back to them with [JSONStream](https://github.com/dominictarr/JSONStream):

```javascript
var Transform = require('stream').Transform
  , csv = require('csv-streamify')
  , JSONStream = require('JSONStream');

var csvToJson = csv({objectMode: true});

var parser = new Transform({objectMode: true});
parser._transform = function(data, encoding, done) {
  this.push(data);
  done();
};

var jsonToStrings = JSONStream.stringify(false);

process.stdin
.pipe(csvToJson)
.pipe(parser)
.pipe(jsonToStrings)
.pipe(process.stdout);
```

Now if we run our parser we should see the CSV file is being turned into arrays:

```bash
$ cat data.csv | node parser
["Game Export (v1.2)"]
["GameId","1234567"]
["Player","1","Homer Simpson"]
# ...
```
<h2 id="add-some-data-transforms">Add some data transforms</h2>

Now that we have some basic streams wired up, it's time to add some data manipulation to the `parser`.

We can, for instance, aggregate the header into one object:

```javascript
parser.header = null;
parser._rawHeader = [];
parser._transform = function(data, encoding, done) {
  if (!this.header) {
    this._rawHeader.push(data);
    if (data[0] === 'Index') {
      // We reached the last line of the header
      this.header = this._rawHeader;
      this.push({header: this.header});
    }
  }
  // After parsing the header, push data rows
  else {
    this.push({row: data});
  }
  done();
};
```

Running the program now will output:

```bash
$ cat data.csv | node parser
{"header":[["Game Export (v1.2)"],["GameId","1234567"],["Player","1","Homer Simpson"],["Player","2","Bart Simpson"],["Player","3","Marge Simpson"],["Map","101","Crossroads"],["Time Range","2013-01-11 02:50:40","2013-01-12 05:34:56"],["Number of Records","100"],["Index","Timestamp","Event Type","Player Id","Event Data"]]}
{"row":["1","2013-01-11 02:54:42","ResourcesGathered","3","resource_type=Wood, quantity=11"]}
# ...
```

I won't describe the rest of the transform logic to get to the result mentioned at the beginning of this post, but you can find the [full code on GitHub](https://github.com/nicolashery/example-stream-parser/blob/master/lib/parser.js).

<h2 id="more-streaming-data-fun">More streaming data fun</h2>

From here, there are many things we might want to do with our parsed data. Again, thanks to the composable and elegant interface of Node.js streams, this is very easy to do.

We already have a command line tool working ([examples/cmd.js](https://github.com/nicolashery/example-stream-parser/blob/master/examples/cmd.js)), which allows us to use it with other Unix tools, such as `cat`, `head`, `wc`, etc.

We could also pipe the parser into another stream that would manipulate the data further and possibly save it to a database or HTTP API ([examples/transform.js](https://github.com/nicolashery/example-stream-parser/blob/master/examples/transform.js)).

Another usage could be to include the parser into a server (`request` and `response` passed by [http.Server](http://nodejs.org/api/http.html#http_class_http_server) are also streams!). This way we could provide a "parser-as-a-service" through HTTP ([examples/server.js](https://github.com/nicolashery/example-stream-parser/blob/master/examples/server.js)), like what [@maxogden](https://twitter.com/maxogden) describes in ["Gut: Hosted Open Data Filet Knives"](http://maxogden.com/gut-hosted-open-data-filets.html).

<h2 id="conclusion">Conclusion</h2>

Streams made it really pleasant to build a relatively complex data file parser out of small and simple components. On top of that, I don't have to worry about how big the data files get. The parser will remain fast and memory-efficient thanks to the pipe interface between the streams.

If you weren't familiar with streams before, I hope this example made you curious and want to give them a try.

Or maybe you've already worked with Node.js streams to process data? Feel free to share your experience!

