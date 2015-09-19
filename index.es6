// Get stack traces that point to the original ES6 code.
import "source-map-support/register";

if (typeof _babelPolyfill === "undefined") {
  // Include babel polyfill
  require("babel/polyfill");
}

import arrify from "arrify";
import chokidar from "chokidar";
import defaults from "lodash/object/defaults";
import fs from "fs-extra";
import path from "path";
import uglify from "uglify-js";
import { EventEmitter } from "events";
import { Logger } from "eazy-logger";

const DEFAULT_OPTS = {
  logLevel: "off",
  persistent: true,
  delete: false,
  uglify: {}
};

class UglifyWatcher extends EventEmitter {
  constructor(srcDir, destDir, opts) {
    super();

    opts = defaults(opts || {}, DEFAULT_OPTS);
    this._srcDir = srcDir;
    this._destDir = destDir;

    this._logger = new Logger({
      level: opts.logLevel,
      prefix: "[{blue:watch-uglify}] "
    });

    // Have we hit the ready state?
    this._ready = false;

    this._delete = opts.delete;
    this._uglifyOpts = opts.uglify;

    const globs = arrify(opts.glob || ".");

    const chokidarOpts = {
      cwd: srcDir,
      persistent: opts.persistent
    };

    this._watcher = chokidar.watch(globs, chokidarOpts)
      .on("all", (e, p, s) => this._handleWatchEvent(e, p, s))
      .on("error", e => this._handleError(e))
      .on("ready", () => this._handleReady());
  }

  get ready() {
    return this._ready;
  }

  get srcDir() {
    return this._srcDir;
  }

  get destDir() {
    return this._destDir;
  }

  close() {
    this._watcher.close();
    this.removeAllListeners();
  }

  _handleReady() {
    this._ready = true;
    this._logger.info("{cyan:Watching} {magenta:%s}", this._srcDir);
    this.emit("ready");
  }

  _handleError(e) {
    this._logger.error("{red:Error: %s}", e);
    this.emit("error", e);
  }

  _handleWatchEvent(event, filePath) {
    if (!filePath.length) {
      filePath = ".";
    }
    const srcPath = path.join(this._srcDir, filePath);
    const destPath = path.join(this._destDir, filePath);

    switch (event) {
      case "add":
      case "change":
        let result;
        try {
          result = uglify.minify(srcPath, this._uglifyOpts);
        } catch (e) {
          this._logger.error("{cyan:Minifying {red:failed} for {red:%s}} " +
              "({magenta:%s} -> {magenta:%s}):\n{red:%s",
              filePath, this._srcDir, this._destDir, e);
          this.emit("failure", filePath, e);
          return;
        }

        // TODO handle external source maps
        fs.outputFileSync(destPath, result.code);
        this._logger.debug("{cyan:Minifying} {green:%s} ({magenta:%s} -> {magenta:%s})",
            filePath, this._srcDir, this._destDir);
        this.emit("success", filePath);
        break;
      case "unlink":
        if (!this._delete) {
          return;
        }
        fs.removeSync(destPath);
        this._logger.debug("{cyan:Deleted} {green:%s} ({magenta:%s} -> {magenta:%s})",
            filePath, this._srcDir, this._destDir);
        this.emit("delete", filePath);
        break;
      case "unlinkDir":
        if (!this._delete) {
          return;
        }
        fs.removeSync(destPath);
        break;
    }
  }
}

function watchUglify(src, dest, opts) {
  return new UglifyWatcher(src, dest, opts);
}
// Read version in from package.json
watchUglify.version = require("./package.json").version;

export default watchUglify;
