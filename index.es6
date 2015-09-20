// Get stack traces that point to the original ES6 code.
import "source-map-support/register";

if (typeof _babelPolyfill === "undefined") {
  // Include babel polyfill
  require("babel/polyfill");
}

import arrify from "arrify";
import chokidar from "chokidar";
import convertSourceMap from "convert-source-map";
import defaults from "lodash/object/defaults";
import fs from "fs-extra";
import path from "path";
import rename from "rename";
import uglify from "uglify-js";
import { EventEmitter } from "events";
import { Logger } from "eazy-logger";

const DEFAULT_OPTS = {
  logLevel: "debug",
  persistent: true,
  delete: true,
  rename: { suffix: ".min" },
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
    this._renameOpts = opts.rename;
    this._outSourceMapRenameOpts = opts.outSourceMap;

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
    const destFile = rename(filePath, this._renameOpts);
    const destPath = path.join(this._destDir, destFile);

    switch (event) {
      case "add":
      case "change":
        const uglifyOpts = defaults({}, this._uglifyOpts);
        if (this._outSourceMapRenameOpts) {
          uglifyOpts.outSourceMap = rename(destFile, this._outSourceMapRenameOpts);
          const converter = convertSourceMap.fromSource(fs.readFileSync(srcPath, "utf8"));
          if (converter) {
            uglifyOpts.inSourceMap = converter.toObject();
          }
        }

        let result;
        const cwd = process.cwd();
        process.chdir(this._srcDir);
        try {
          try {
            result = uglify.minify(filePath, uglifyOpts);
          } finally {
            process.chdir(cwd);
          }
        } catch (e) {
          this._logger.error("{cyan:Minifying {red:failed} for {red:%s}}:\n{red:%s",
              srcPath, e);
          this.emit("failure", filePath, e);
          return;
        }

        fs.outputFileSync(destPath, result.code);
        this._logger.debug("{cyan:Minifying} {green:%s} -> {green:%s}", srcPath, destPath);

        if (uglifyOpts.outSourceMap) {
          const map = JSON.parse(result.map);
          map.file = destFile;
          const mapDestPath = path.join(this._destDir, uglifyOpts.outSourceMap);
          fs.outputFileSync(mapDestPath, JSON.stringify(map));
          this._logger.debug("{cyan:Generating source map} {green:%s} -> {green:%s}",
              srcPath, mapDestPath);
        }

        this.emit("success", filePath);
        break;
      case "unlink":
        if (!this._delete) {
          return;
        }
        fs.removeSync(destPath);
        this._logger.debug("{cyan:Deleted} {green:%s}", destPath);
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
