"use strict";

var expect = require("chai").expect;
var fs = require("fs-extra");
var path = require("path");
var vm = require("vm");
var watchUglify = require("./");

describe("watchUglify", function() {
  var nextId = 0;
  var exampleInput = "var x = 10";
  var tempRoot;
  var testSrcDir;
  var testDestDir;
  var createdWatchers;

  beforeEach(function(done) {
    tempRoot = path.join("tmp", String(nextId++));
    fs.removeSync(tempRoot);
    fs.mkdirsSync(tempRoot);

    testSrcDir = path.join(tempRoot, "src");
    fs.mkdirSync(testSrcDir);

    testDestDir = path.join(tempRoot, "dest");
    fs.mkdirsSync(testDestDir);

    createdWatchers = [];

    // I've observed an apparent race occassionally on OSX where we copy the
    // test-fs directory synchronously above, add a watcher in tests below, and
    // get duplicated watch events. I've only reproduced this with `useFsEvents
    // = true`, so it may be a problem with fsevents. For now, this incredibly
    // lame timeout seems to have stabilized the tests.
    setTimeout(function() { done(); }, 10);
  });

  afterEach(function() {
    createdWatchers.forEach(function(watcher) {
      watcher.close();
    });
  });

  it("exposes the srcDir property", function() {
    expect(createWatcher(testSrcDir, testDestDir, { peristent: false }).srcDir)
      .equals(testSrcDir);
  });

  it("exposes the destDir property", function() {
    expect(createWatcher(testSrcDir, testDestDir, { peristent: false }).destDir)
      .equals(testDestDir);
  });

  it("runs uglify on existing files before 'ready' event", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir, { persistent: false })
      .on("ready", function() {
        expect(runScript("script.min.js").x).equals(10);
        expect(readDestFile("script.min.js")).to.have.length.below(exampleInput.length);
        done();
      });
  });

  it("runs uglify on new files after 'ready' event", function(done) {
    createWatcher(testSrcDir, testDestDir)
      .on("ready", function() {
        this.on("success", function(fp) {
          expect(fp).equals("script.js");
          expect(runScript("script.min.js").x).equals(10);
          expect(readDestFile("script.min.js")).to.have.length.below(exampleInput.length);
          done();
        });
        fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
      });
  });

  it("runs uglify on updated files after 'ready' event", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    var newInput = "var x = 50;";
    createWatcher(testSrcDir, testDestDir)
      .on("ready", function() {
        this.on("success", function(fp) {
          expect(fp).equals("script.js");
          expect(runScript("script.min.js").x).equals(50);
          expect(readDestFile("script.min.js")).to.have.length.below(newInput.length);
          done();
        });
        fs.writeFileSync(path.join(testSrcDir, "script.js"), newInput);
      });
  });

  it("deletes removed scripts if delete=true", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir, { delete: true })
      .on("ready", function() {
        this.on("delete", function(fp) {
          expect(fp).equals("script.js");
          expectNotExists("script.min.js");
          done();
        });
        fs.removeSync(path.join(testSrcDir, "script.js"));
      });
  });

  it("does not delete removed scripts if delete=false", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir, { delete: false })
      .on("ready", function() {
        this.on("delete", function() {
          done(new Error("Should not have deleted file with delete=true"));
          done();
        });
        fs.removeSync(path.join(testSrcDir, "script.js"));
        setTimeout(function() {
          expect(runScript("script.min.js").x).equals(10);
          done();
        }, 200);
      });
  });

  it("does not replace a file if the change fails minification", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir)
      .on("ready", function() {
        this.on("success", function() {
          done(new Error("Should not have changed file with minification error"));
        });
        this.on("failure", function(fp) {
          expect(fp).equals("script.js");
          expect(runScript("script.min.js").x).equals(10);
          done();
        });
        fs.writeFileSync(path.join(testSrcDir, "script.js"), "this is not javascript");
      });
  });

  it("allows the output filename to be changed", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir, { persistent: false, rename: { prefix: "min-" } })
      .on("ready", function() {
        expect(runScript("min-script.js").x).equals(10);
        done();
      });
  });

  it("generates a source map file if outSourceMap is defined", function(done) {
    fs.writeFileSync(path.join(testSrcDir, "script.js"), exampleInput);
    createWatcher(testSrcDir, testDestDir, { persistent: false, outSourceMap: { extname: ".js.map" } })
      .on("ready", function() {
        // Side effecty: if the file doesn't exist this call will throw an error
        var mapJson = JSON.parse(readDestFile("script.min.js.map"));
        expect(mapJson.file).equals("script.min.js");
        expect(mapJson.sources).includes("script.js");
        done();
      });
  });

  function runScript(relativePath) {
    var sandbox = {};
    vm.runInNewContext(readDestFile(relativePath), sandbox);
    return sandbox;
  }

  function readDestFile(relativePath) {
    var destFile = path.join(testDestDir, relativePath);
    return fs.readFileSync(destFile, "utf8");
  }

  function expectNotExists(relativePath) {
    expect(function() {
      fs.statSync(path.join(testDestDir, relativePath));
    }).to.throw();
  }

  function createWatcher() {
    var args = Array.prototype.slice.call(arguments);
    var watcher = watchUglify.apply(watchUglify, args);
    createdWatchers.push(watcher);
    return watcher;
  }
});

describe("watchUglify.version", function() {
  it("returns the current version in package.json", function() {
    var version = JSON.parse(fs.readFileSync("package.json")).version;
    expect(watchUglify.version).equals(version);
  });
});

