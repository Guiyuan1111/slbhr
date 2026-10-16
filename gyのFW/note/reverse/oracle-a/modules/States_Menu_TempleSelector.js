// 模块: States/Menu/TempleSelector  (init.beautified.js L67343-L67636)
      define("States/Menu/TempleSelector", ["../Common/StoneButton", "../Common/Button", "Phaser"], function (c, d) {
        "use strict";

        var e;
        return e = e = function (c) {
          function e(b, c, f) {
            this.destroy = a(this.destroy, this);
            this.layoutContent = a(this.layoutContent, this);
            this.getTarget = a(this.getTarget, this);
            this.update = a(this.update, this);
            this.showBuyTemple = a(this.showBuyTemple, this);
            this.showSoftLockWarning = a(this.showSoftLockWarning, this);
            this.templeClicked = a(this.templeClicked, this);
            this.resize = a(this.resize, this);
            this.preload = a(this.preload, this);
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
            var t;
            var u;
            var v;
            var w;
            var x;
            var y;
            var z;
            var A;
            var B;
            var C;
            var D;
            e.__super__.constructor.call(this, b, c, f, "MenuBackgrounds", "_default0000");
            this.onSelected = new Phaser.Signal();
            this.onMove = new Phaser.Signal();
            this.onTarget = new Phaser.Signal();
            this.onShowPopup = new Phaser.Signal();
            this.icon_distance = 256;
            this.strip_height = A = 300;
            D = this.game.realWidth;
            this.strip = this.game.make.sprite(Infinity, 0, "MenuBackgrounds", "_default0000");
            this.addChild(this.strip);
            j = Math.ceil(this.game.realWidth / 256);
            this.bs = i = [];
            i[0] = this.game.make.group();
            i[1] = this.game.make.group();
            p = q = 0;
            u = i.length;
            for (; q < u; p = ++q) {
              g = i[p];
              m = r = 0;
              y = j;
              for (; y >= 0 ? r <= y : r >= y; m = y >= 0 ? ++r : --r) {
                h = this.game.make.sprite(-D / 2 + m * 255, -A, "MenuBackgrounds", "SimpleBackground0000");
                g.addChild(h);
              }
              g.cacheAsBitmap = true;
              g.x = -p * g.width;
              this.strip.addChild(g);
            }
            C = b.progress.get("temples");
            this.icons = [];
            m = s = 0;
            v = C.length;
            for (; s < v; m = ++s) {
              B = C[m];
              o = B.icon || B.id;
              if (B.locked && !this.game.config.devUnlock) {
                n = new d(b, B.index * this.icon_distance, -A / 2, "TempleIcons", [o + "Icon0000", o + "Icon0000"], function (a) {
                  return function () {
                    return a.showBuyTemple(B);
                  };
                }(this));
                w = new Phaser.Sprite(this.game, 0, 0, "MenuAssets", "GoldLock0000");
                w.scale.set(1);
                w.anchor.set(0.5);
                n.addChild(w);
              } else if (B.softLocked && !this.game.config.devUnlock) {
                n = new d(b, B.index * this.icon_distance, -A / 2, "TempleIcons", [o + "Icon0000", o + "Icon0000"], this.showSoftLockWarning);
              } else {
                n = new d(b, B.index * this.icon_distance, -A / 2, "TempleIcons", [o + "Icon0001", o + "Icon0002"], this.templeClicked, null);
                if (B.hasNew) {
                  x = new Phaser.Sprite(this.game, 0, 0, "MenuAssets", "NewSign0000");
                  x.scale.set(0.7);
                  x.x += 60;
                  x.y -= 60;
                  x.anchor.set(0.5);
                  n.addChild(x);
                }
              }
              n.anchor.set(0.5);
              n.data = B;
              this.icons.push(n);
              this.strip.addChild(n);
            }
            this.currentX = this._x = 0;
            this.v = 0;
            this.a = 0;
            this.anchor = 0;
            b.TouchManager.register(this.strip, "panstart", function (a) {
              return function (b) {
                return a.panning = true;
              };
            }(this));
            b.TouchManager.register(this.strip, "panmove", function (a) {
              return function (c) {
                if (a.panning === true) {
                  a._x = a.currentX + c.deltaX / b.camera.scale.x;
                  return a.v = c.overallVelocityX * 10;
                }
              };
            }(this));
            b.TouchManager.register(this.strip, "panend", function (a) {
              return function (b) {
                a.panning = false;
                return a.didpan = true;
              };
            }(this));
            l = this.game.make.group(0, 0);
            this.cover = k = this.game.make.sprite(0, 50, "MenuBackgrounds", "SliderHolder0000");
            k.anchor.set(0.5, 1);
            this.leftSide = t = this.game.make.tileSprite(-k.width / 2, 50, (this.game.realWidth - k.width) / 2, k.height, "MenuBackgrounds", "HolderTexture0000");
            this.rigthSide = z = this.game.make.tileSprite(k.width / 2, 50, (this.game.realWidth - k.width) / 2, k.height, "MenuBackgrounds", "HolderTexture0000");
            t.anchor.set(1, 1);
            z.anchor.set(0, 1);
            l.addChild(k);
            l.addChild(t);
            l.addChild(z);
            k.cacheAsBitmap = true;
            t.cacheAsBitmap = true;
            z.cacheAsBitmap = true;
            this.addChild(l);
            b.TouchManager.register(t, "touchstart", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(t, "mousedown", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(t, "panstart", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(z, "touchstart", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(z, "mousedown", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(z, "panstart", function (a) {
              return function (a) {
                return console.log("prevent event");
              };
            }(this));
            p = this.game.currentTemple != null ? this.game.currentTemple.index : 0;
            this._x = this.anchor = -this.icon_distance * p;
          }
          b(e, c);
          e.prototype.preload = function () {};
          e.prototype.resize = function () {
            var a;
            a = this.game.realWidth;
            this.background.width = a;
            this.background.x = -a / 2;
            this.leftSide.width = (this.game.realWidth - this.cover.width) / 2;
            this.rigthSide.width = (this.game.realWidth - this.cover.width) / 2;
            this.leftSide.x = -this.cover.width / 2;
            return this.rigthSide.x = this.cover.width / 2;
          };
          e.prototype.templeClicked = function (a) {
            if (!this.didpan) {
              this.game.currentSounds.pusher.play();
              console.log("clicked temple" + a.data.id);
              this.onSelected.dispatch(a.data);
            }
            return this.didpan = false;
          };
          e.prototype.showSoftLockWarning = function () {
            if (!this.didpan) {
              console.log("should trigger to show 'complete more levels'");
              this.onShowPopup.dispatch({
                type: "softLock"
              });
            }
            return this.didpan = false;
          };
          e.prototype.showBuyTemple = function (a) {
            if (!this.didpan) {
              console.log("should trigger to show 'buy this temple'");
              this.onShowPopup.dispatch({
                type: "buyTemple",
                value: a
              });
            }
            return this.didpan = false;
          };
          e.prototype.update = function () {
            var a;
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
            if (this.panning) {
              this.a = 0;
            } else {
              b = Math.min(0.04, this.game.time.elapsed / 1000);
              this.a = (this.anchor - this._x) * b * 0.25;
              this.v += this.a;
              this.v *= 0.9;
              this._x += this.v;
              this.currentX = this._x;
            }
            this.anchor = this.icon_distance * Math.round(this._x / this.icon_distance);
            i = this.icons;
            e = 0;
            g = i.length;
            for (; e < g; e++) {
              d = i[e];
              if (d.x + this._x >= ((this.icons.length - 2) / 2 + 1) * this.icon_distance) {
                d.x -= this.icons.length * this.icon_distance;
              } else if (d.x + this._x < -((this.icons.length - 2) / 2 + 1) * this.icon_distance) {
                d.x += this.icons.length * this.icon_distance;
              }
            }
            j = this.bs;
            c = f = 0;
            h = j.length;
            for (; f < h; c = ++f) {
              a = j[c];
              if (a.x + this._x > a.width) {
                a.x -= a.width * 2;
              }
              if (a.x + this._x < -a.width) {
                a.x += a.width * 2;
              }
            }
            if (this.lastAnchor !== this.anchor) {
              this.lastAnchor = this.anchor;
              k = this.getTarget();
              this.onTarget.dispatch(k);
            }
            if (this.strip.x !== Math.round(this._x)) {
              this.strip.x = Math.round(this._x);
              return this.onMove.dispatch();
            }
          };
          e.prototype.getTarget = function () {
            var a;
            return a = this.icons.sort(function (a) {
              return function (b, c) {
                return Math.abs(a._x + b.x) - Math.abs(a._x + c.x);
              };
            }(this))[0];
          };
          e.prototype.layoutContent = function () {
            this.leftSide.width = (this.game.realWidth - this.cover.width) / 2;
            return this.rigthSide.width = (this.game.realWidth - this.cover.width) / 2;
          };
          e.prototype.destroy = function () {
            this.game.TouchManager.unregister(this.leftSide, "touchstart");
            this.game.TouchManager.unregister(this.leftSide, "mousedown");
            this.game.TouchManager.unregister(this.leftSide, "panstart");
            this.game.TouchManager.unregister(this.rigthSide, "touchstart");
            this.game.TouchManager.unregister(this.rigthSide, "mousedown");
            this.game.TouchManager.unregister(this.rigthSide, "panstart");
            this.game.TouchManager.unregister(this.strip, "panstart");
            this.game.TouchManager.unregister(this.strip, "panmove");
            this.game.TouchManager.unregister(this.strip, "panend");
            return e.__super__.destroy.apply(this, arguments);
          };
          return e;
        }(Phaser.Sprite);
      });