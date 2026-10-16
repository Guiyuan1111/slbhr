// 模块: main  (init.beautified.js L79638-L79987)
      define("main", ["require", "Phaser", "States/Boot", "States/Load", "States/Level/Level", "utils/lang/Lang", "TouchManager", "Ads/AdManager", "bowser", "jquery", "underscore", "superStorage", "cacheBuster"], function (a) {
        var b;
        var c;
        var d;
        var e;
        var f;
        var g;
        var h;
        var i;
        var j;
        var k;
        var l;
        var m;
        var n;
        var o;
        var p;
        var q;
        var r;
        var s;
        h = a("Phaser");
        c = a("States/Boot");
        g = a("States/Load");
        f = a("States/Level/Level");
        e = a("utils/lang/Lang");
        i = a("TouchManager");
        b = a("Ads/AdManager");
        d = a("bowser");
        a("jquery");
        a("underscore");
        a("superStorage");
        a("cacheBuster");
        n = {
          vibrate: true,
          music: true,
          fx: true,
          controls: null
        };
        m = {
          width: window.innerWidth || $(window).width(),
          height: window.innerHeight || $(window).height(),
          renderer: h.AUTO,
          parent: "container",
          transparent: false,
          multiTexture: false,
          antialias: true,
          resolution: window.devicePixelRatio,
          enableDebug: false,
          showFps: false,
          devUnlock: false,
          devSkipAds: true,
          simulateCordova: false,
          log: false
        };
        if (!m.log) {
          console.log = function (a) {
            return function () {};
          }(this);
        }
        $.ajaxSetup({
          data: {
            v: "3086bb2"
          }
        });
        o = new h.Game(m);
        o.bowser = d;
        o.settingsSignal = new h.Signal();
        o.settingsSignal.add(function (a) {
          return function (a) {
            var b;
            if (a === "fx") {
              if (!o.paused) {
                o.sound.mute = !o.settings.fx;
              }
            }
            if (a === "music" && (b = o.state.states[o.state.current], b.updateMusic != null)) {
              return b.updateMusic();
            }
          };
        }(this));
        o.lang = new e();
        o.saveSettings = function () {
          this.storage.setNamespace("fb-" + this.gameConfig.id);
          return this.storage.setItem("settings", JSON.stringify(this.settings));
        };
        o.loadSettings = function () {
          this.storage.setNamespace("fb-" + this.gameConfig.id);
          return this.storage.getItem("settings").then(function (a) {
            return function (b) {
              if (b) {
                a.settings = JSON.parse(b);
              } else {
                a.settings = n;
                if (a.bowser.tablet || a.bowser.mobile) {
                  a.settings.controls = "single";
                } else {
                  a.settings.controls = "keyboard";
                }
              }
              return new Promise(function (a) {
                return a();
              });
            };
          }(this));
        };
        o.state.add("load", g);
        o.state.add("boot", c);
        o.TouchManager = new i();
        o.TouchManager.start(o);
        o.AdManager = new b();
        o.AdManager.start(o);
        l = function (a) {
          return function () {
            var a;
            var b;
            a = ["4399.com", "localhost", "127.0.0.1", "10.241.1.5"];
            return b = a.reduce(function (a, b) {
              // return null != document.referrer && (a = a || document.referrer.indexOf(b) >= 0), null != window.location && null != window.location.hostname && (a = a || window.location.hostname.indexOf(b) >= 0), a;
              return true;
            }, false);
          };
        }(this);
        if (l()) {
          o.state.start("boot");
        } else {
          console.error("Hosting domain not allowed", document.referrer, window.location.hostname);
        }
        k = function (a) {
          return function (b) {
            var c;
            var d;
            var e;
            var f;
            var g;
            f = o.make.sprite();
            d = o.make.graphics(0, 0);
            d.beginFill(0, 1);
            d.drawRect(0, 0, o.realWidth, o.realHeight);
            d.endFill();
            f.addChild(d);
            if (b.showText) {
              g = o.make.bitmapText(0, 0, "font", "Loading", Math.min(30, 36 / Math.max(1, o.resolution)));
              g.anchor.set(0);
              g.alpha = 0;
              g.x = window.innerWidth / 2 - g.textWidth / 2;
              g.y = window.innerHeight / 2 - g.textHeight / 2;
              f.addChild(g);
              d.text = g;
              e = o.time.time;
              c = function () {
                var b;
                var d;
                var f;
                d = o.time.elapsedSince(e);
                f = 800;
                if (d > f) {
                  g.alpha = 1;
                }
                b = Math.floor((d - f) / 300) % 4;
                if (b === 0) {
                  g.text = "Loading...";
                }
                if (b === 1) {
                  g.text = "Loading";
                }
                if (b === 2) {
                  g.text = "Loading.";
                }
                if (b === 3) {
                  g.text = "Loading..";
                }
                if (a.fading) {
                  return requestAnimationFrame(c);
                }
              };
              requestAnimationFrame(c);
            }
            o.stage.addChild(f);
            return f;
          };
        }(this);
        s = function (a) {
          return function (a, b) {
            var c;
            o.paused = false;
            a.alpha = 0;
            c = o.add.tween(a);
            c.to({
              alpha: 1
            }, 500, null);
            c.onComplete.add(function () {
              o.stage.backgroundColor = "#000000";
              o.tweens.remove(c);
              return b();
            });
            return c.start();
          };
        }(this);
        q = function (a) {
          return function (a, b) {
            var c;
            o.stage.backgroundColor = "#000000";
            o.paused = false;
            c = o.add.tween(a);
            c.to({
              alpha: 0
            }, 500, null);
            c.onComplete.add(function () {
              o.tweens.remove(c);
              b();
              return a.kill();
            });
            return c.start();
          };
        }(this);
        p = function (a) {
          return function () {
            var a;
            if (o.bowser.tablet || o.bowser.mobile) {
              a = document.getElementById("root");
              if (a.requestFullscreen) {
                return a.requestFullscreen();
              }
              if (a.webkitRequestFullscreen) {
                return a.webkitRequestFullscreen();
              }
              if (a.mozRequestFullScreen) {
                return a.mozRequestFullScreen();
              }
              if (a.msRequestFullscreen) {
                return a.msRequestFullscreen();
              }
            }
          };
        }(this);
        o.state.fade = function (a, b, c, d) {
          var e;
          if (!this.fading) {
            this.fading = true;
            this.overlay = e = k({
              showText: true
            });
            return s(e, function (f) {
              return function () {
                return f.game.AdManager.showAd(function () {
                  var g;
                  f.game.state.start(a, b, c, d);
                  f.game.paused = false;
                  g = function () {
                    f.fading = false;
                    if (f.overlay != null) {
                      f.overlay.kill();
                    }
                    f.overlay = e = k({
                      showText: false
                    });
                    e.alpha = 1;
                    return requestAnimationFrame(function () {
                      return q(e, function () {
                        f.fading = false;
                        if (f.game.state.states[a].start != null) {
                          return f.game.state.states[a].start();
                        }
                      });
                    });
                  };
                  if (f.game.state.states[a].onReady != null) {
                    return f.game.state.states[a].onReady.addOnce(g);
                  } else {
                    return requestAnimationFrame(function () {
                      return g();
                    });
                  }
                });
              };
            }(this));
          }
        };
        _.deepObjectExtend = function (a, b) {
          var c;
          for (c in b) {
            if (a[c] != null && typeof a[c] == "object" && typeof b[c] == "object") {
              _.deepObjectExtend(a[c], b[c]);
            } else if (a[c] == null) {
              a[c] = _.clone(b[c]);
            }
          }
          return a;
        };
        o.secondsToString = function (a) {
          var b;
          var c;
          var d;
          c = function (a) {
            return (a < 10 ? "0" : "") + a;
          };
          d = a % 60;
          b = (a - d) / 60;
          return c(b) + ":" + c(d);
        };
        j = function (a) {
          return function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            console.log("_resize to height: ", window.innerWidth, "or", $(window).width());
            o.TouchManager.resize();
            e = window.innerWidth || $(window).width();
            b = window.innerHeight || $(window).height();
            o.scale.setGameSize(e, b);
            d = 800;
            c = 600;
            if (o.width < d || o.height < c) {
              o.camera.scale.set(Math.min(o.width / d, o.height / c));
            } else {
              o.camera.scale.set(1, 1);
            }
            o.camera.x = -o.width / 2;
            o.camera.y = -o.height / 2;
            o.realWidth = o.width / o.camera.scale.x;
            o.realHeight = o.height / o.camera.scale.y;
            o.bounds = new h.Rectangle(0, 0, o.width, o.height);
            a = o.state.states[o.state.current];
            if (a != null && a.layoutContent != null) {
              a.layoutContent();
            }
            return o.camera.update();
          };
        }(this);
        h.Sound.prototype.playInstance = function () {
          this.instances ||= 0;
          if (this.instances === 0 || this.loop) {
            this.play();
          } else {
            this.restart();
          }
          this.instances++;
          return this;
        };
        h.Sound.prototype.stopInstance = function () {
          this.instances--;
          if (this.instances === 0) {
            return this.stop();
          }
        };
        r = _.debounce(j, 200);
        $(window).on("resize", r);
        return r();
      });