# watch-uglify

Watches for changes to javascript files and runs them through
[uglify](https://github.com/mishoo/UglifyJS2) to minify them.

## Getting Started

Install `watch-uglify` via `NPM`:

```
npm install watch-uglify
```

Then require it to use it:

```js
var watchUglify = require("watch-uglify");

var srcDir = ".";
var destDir = "/tmp/watchBabel";
var options = { glob: "**/*.js" };
var watcher = watchUglify(srcDir, destDir, options);
watcher.on("ready", function() { console.log("ready"); });
watcher.on("success", function(filepath) {
  console.log("Minified ", filepath);
});
watcher.on("failure", function(filepath, e) {
  console.log("Failed to minify", filepath, "(Error: ", e);
});
watcher.on("delete", function(filepath) {
  console.log("Deleted file", filepath);
});
```

By default watchUglify is persistent, which means it will run even after the
initial minification pass. You can close the watcher with `watcher.close()`.

## API

### `watchUglify(srcDir, destDir, [options])`

- `srcDir` is the source directory to watch.
- `destDir` is the path to the destination directory. The directory will be
  created if it does not already exist.
- `options` is an optional set of configuration entries, as described in the
  Options section below.

#### Options

- `persistent` (default: `true`). If `true` continue to watch the srcDir for
  changes after the initial minification. To close a persistent watcher use
  `watcher.close()`.
- `delete` (default: `true`). When `true` a delete of a file in `srcDir` after
  the `ready` event will cause the associated file in `destDir` to be removed.
- `rename` (default: `{ suffix: ".min" }`). Applies a transform to the file
  name in the destination directory. For example, if the input is `script.js`
  then the output will be `script.min.js` by default. See
  [rename](https://github.com/popomore/rename) for rename options.
- `outSourceMap` (default: undefined). If defined, generates a source map for
  the minified file by applying [rename](https://github.com/popomore/rename) to
  the destination file name. For example, if the destination file name is
  `script.min.js` and `outSourceMap = { extname: ".js.map" }` then a source map
  will be generated with the name `script.min.js.map`.
- `uglify` (default: {}). Any options to send to uglify for minification.

#### Events

- `ready` is fired after the initial minification pass.
- `success` is fired when minification of a file succeeded.
- `failure` is fired when minification of a file failed.
- `delete` is fired when a file is deleted.
- `error` is fired if setting up the watcher failed.

#### Properties

- `srcDir` is the directory that is being watched.
- `destDir` is the directory that minified files are writtent to.
- `ready` indicates if the `ready` event has been fired.

### `watchUglify.version()`

Returns the version of the `watchUglify` library.
