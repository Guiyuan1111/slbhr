// 模块: States/Boot  (init.beautified.js L77668-L77802)
      define("States/Boot", ["require", "Phaser", "States/Menu/SingleMenu", "States/Menu/MultiMenu", "ProgressModel", "States/Complete/Complete", "promise-polyfill"], function (c) {
        var d;
        var e;
        var f;
        var g;
        var h;
        var i;
        g = c("Phaser");
        i = c("States/Menu/SingleMenu");
        f = c("States/Menu/MultiMenu");
        h = c("ProgressModel");
        e = c("States/Complete/Complete");
        c("promise-polyfill");
        return d = d = function (c) {
          function d() {
            this.initialize = a(this.initialize, this);
            this.loadSettings = a(this.loadSettings, this);
            this.setStorageAdapter = a(this.setStorageAdapter, this);
            return d.__super__.constructor.apply(this, arguments);
          }
          b(d, c);
          d.prototype.preload = function () {
            console.log("Preloading Boot State");
            this.game.load.json("gameConfig", "game.json");
            this.game.load.atlasJSONArray("PreloaderAssets", "assets/atlasses/PreloaderAssets.png", "assets/atlasses/PreloaderAssets.json");
            return this.game.load.image("KiziLogo", "assets/images/branding/branding_logo_kizi.png");
          };
          d.prototype.create = function () {
            this.game.add.plugin(PhaserSuperStorage.StoragePlugin);
            this.game.add.plugin(PhaserCachebuster.CacheBuster);
            this.game.load.cacheBuster = "3086bb2";
            this.game.gameConfig = this.game.cache.getJSON("gameConfig");
            return this.setStorageAdapter().then(function (a) {
              return function () {
                return a.loadSettings().then(function () {
                  return a.initialize().then(function () {
                    return a.game.state.start("load");
                  });
                });
              };
            }(this));
          };
          d.prototype.setStorageAdapter = function () {
            var a;
            a = function () {
              var a;
              try {
                return window.self !== window.top;
              } catch (b) {
                a = b;
                return true;
              }
            };
            return new Promise(function (b) {
              return function (c) {
                var d;
                if (a()) {
                  d = new PhaserSuperStorage.StorageAdapters.IframeStorage("", document.referrer);
                  return d.init().then(function () {
                    b.game.storage.setAdapter(d);
                    return c();
                  }).catch(function (a) {
                    b.game.storage.forcePromises = true;
                    return c();
                  });
                } else {
                  b.game.storage.forcePromises = true;
                  return c();
                }
              };
            }(this));
          };
          d.prototype.loadSettings = function () {
            return this.game.loadSettings();
          };
          d.prototype.initialize = function () {
            var a;
            var b;
            this.game.camera.reset = function () {
              this.target = null;
              this._shake.duration = 0;
              return this.resetFX();
            };
            if (this.game.gameConfig.type === "multi") {
              this.game.state.add("menu", f);
            } else {
              this.game.state.add("menu", i);
            }
            this.game.sound.volume = 0.1;
            this.game.sound.mute = !this.game.settings.fx;
            this.game.onResume.add(function (a) {
              return function () {
                return a.game.sound.mute = !a.game.settings.fx;
              };
            }(this));
            this.game.camera.bounds = null;
            b = 800;
            a = 600;
            if (this.game.width < b || this.game.height < a) {
              this.game.camera.scale.set(Math.min(this.game.width / b, this.game.height / a));
            }
            this.game.camera.x = -this.game.width / 2;
            this.game.camera.y = -this.game.height / 2;
            this.game.realWidth = this.game.width / this.game.camera.scale.x;
            this.game.realHeight = this.game.height / this.game.camera.scale.y;
            this.game.make.resSprite = function (a, b, c, d) {
              return this.game.make.sprite(a, b, c, d);
            };
            this.game.gameConfig.temples = this.game.gameConfig.temples;
            if (this.game.gameConfig.target === "cordova") {
              return reutnr(new Promise(function (a) {
                return function (b) {
                  return document.addEventListener("deviceready", function () {
                    return a.doStart().then(function () {
                      return b();
                    });
                  }, false);
                };
              }(this)));
            } else {
              return this.doStart();
            }
          };
          d.prototype.doStart = function () {
            this.game.progress = new h(this.game);
            return new Promise(function (a) {
              return function (b) {
                a.game.progress.on("sync", b);
                return a.game.progress.fetch();
              };
            }(this));
          };
          return d;
        }(g.State);
      });