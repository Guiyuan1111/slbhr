// 模块: States/Level/CameraManager  (init.beautified.js L63685-L63957)
      define("States/Level/CameraManager", [], function () {
        "use strict";

        var c;
        return c = c = function (c) {
          function d(b) {
            this.destroy = a(this.destroy, this);
            this.checkBounds = a(this.checkBounds, this);
            this.animate = a(this.animate, this);
            this.focusOn = a(this.focusOn, this);
            this.updateCamera = a(this.updateCamera, this);
            this.update = a(this.update, this);
            var c;
            var d;
            this.game = b.game;
            this.level = b;
            this.camGraphics = this.game.add.graphics(0, 0);
            this.camGraphics.fixedToCamera = true;
            this.viewportPadding = {
              top: 64,
              left: 0,
              bottom: 0,
              right: 0
            };
            this.worldPadding = {
              top: 100,
              left: 200,
              bottom: 100,
              right: 200
            };
            this.target = {
              x: 0,
              y: 0,
              scale: 1,
              vx: 0,
              vy: 0,
              vscale: 0,
              ax: 0,
              ay: 0,
              ascale: 0
            };
            this.updateCamera();
            this.minScale = d = Math.min(GameConfig.zooming.minScaleRatio * this.game.realWidth / this.game.level.size.width, GameConfig.zooming.minScaleRatio * this.game.realHeight / this.game.level.size.height);
            this.lockScale = Math.min(GameConfig.zooming.lockScaleRatio * this.game.realWidth / this.game.level.size.width, GameConfig.zooming.lockScaleRatio * this.game.realHeight / this.game.level.size.height);
            this.maxScale = 1.5;
            this.level.root.x = -(this.game.level.size.width / 2) * d;
            this.level.root.y = -(this.game.level.size.height / 2) * d;
            this.level.root.scale.set(d);
            this.camFreeze = true;
            c = _.debounce(function (a) {
              return function () {
                if (a.wheelScale == null || !GameConfig.zooming.lockAtMinScale || a.wheelScale > a.lockScale) {
                  return a.wheelScale = null;
                } else {
                  return a.wheelScale = a.lockScale;
                }
              };
            }(this), 1000);
            $(window).on("wheel", function (a) {
              return function (b) {
                console.log("zoom", b.originalEvent.deltaY);
                if (b.originalEvent.deltaY > 0) {
                  a.wheelScale = Math.min(a.maxScale, Math.max(a.minScale, a.level.root.scale.x * 0.8));
                } else {
                  a.wheelScale = Math.min(a.maxScale, Math.max(a.minScale, a.level.root.scale.x * 1.2));
                }
                b.stopPropagation();
                b.preventDefault();
                return c();
              };
            }(this));
            this.game.TouchManager.register(this, "pinch", function (a) {
              return function (b) {
                if (!a.game.level.pers1.cursors.active && !a.game.level.pers2.cursors.active) {
                  if (a.userScale == null) {
                    a.pinchScale = a.level.root.scale.x;
                    a.pinchOrigin = {
                      x: -a.level.root.x,
                      y: -a.level.root.y
                    };
                    a.pinchCenter = {
                      x: -a.level.root.x - a.game.realWidth / 2 + b.center.x / a.pinchScale,
                      y: -a.level.root.y - a.game.realHeight / 2 + b.center.y / a.pinchScale
                    };
                  }
                  a.userScale = Math.min(a.maxScale, Math.max(a.minScale, b.scale * a.pinchScale));
                  return a.userCenter = new box2d.b2Vec2(a.pinchOrigin.x + a.pinchCenter.x * a.userScale - a.pinchCenter.x * a.pinchScale - b.deltaX / a.game.camera.scale.x, a.pinchOrigin.y + a.pinchCenter.y * a.userScale - a.pinchCenter.y * a.pinchScale - b.deltaY / a.game.camera.scale.y);
                }
              };
            }(this));
            this.game.TouchManager.register(this, "pinchend", function (a) {
              return function (b) {
                if (a.userScale == null || !GameConfig.zooming.lockAtMinScale || a.userScale > a.lockScale) {
                  a.userScale = null;
                } else {
                  a.userScale = a.lockScale;
                }
                return a.userCenter = null;
              };
            }(this));
            this.game.TouchManager.register(null, "pan", function (a) {
              return function (b) {
                if (!a.game.level.pers1.cursors.active && !a.game.level.pers2.cursors.active) {
                  if (a.userCenter == null) {
                    a.panOrigin = {
                      x: -a.level.root.x,
                      y: -a.level.root.y
                    };
                  }
                  return a.userCenter = new box2d.b2Vec2(a.panOrigin.x - b.deltaX / a.game.camera.scale.x, a.panOrigin.y - b.deltaY / a.game.camera.scale.y);
                }
              };
            }(this));
            this.game.TouchManager.register(null, "panend", function (a) {
              return function (b) {
                return a.userCenter = null;
              };
            }(this));
          }
          b(d, c);
          d.prototype.update = function () {
            if (!this.camFreeze) {
              this.updateCamera();
              return this.animate();
            }
          };
          d.prototype.updateCamera = function () {
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
            if (this.level.pers1 != null && this.level.pers2 != null) {
              f = new box2d.b2Vec2(this.level.pers1.sprite.x, this.level.pers1.sprite.y);
              g = new box2d.b2Vec2(this.level.pers2.sprite.x, this.level.pers2.sprite.y);
              b = g.Clone().SelfSub(f);
              k = {
                width: this.game.realWidth - this.viewportPadding.left - this.viewportPadding.right,
                height: this.game.realHeight - this.viewportPadding.top - this.viewportPadding.bottom
              };
              i = j = 1;
              c = Math.abs(b.x) + this.worldPadding.left + this.worldPadding.right;
              d = Math.abs(b.y) + this.worldPadding.top + this.worldPadding.bottom;
              c = Math.min(c, this.game.level.size.width);
              d = Math.min(d, this.game.level.size.height);
              if (c > k.width) {
                i = k.width / c;
              }
              if (d > k.height) {
                j = k.height / d;
              }
              h = i < 1 || j < 1 ? Math.min(i, j) : 1;
              e = this.game.gameConfig.id === "elements" || this.game.bowser.mobile || this.game.width <= 780 || this.game.height <= 480 ? {
                width: 20,
                height: 15
              } : {
                width: 40,
                height: 30
              };
              if (h * this.game.physics.box2d.mpx(e.width) > this.game.realWidth) {
                h = this.game.realWidth / this.game.physics.box2d.mpx(e.width);
              }
              if (h * this.game.physics.box2d.mpx(e.height) > this.game.realHeight) {
                h = this.game.realHeight / this.game.physics.box2d.mpx(e.height);
              }
              if (this.userScale != null) {
                h = this.userScale;
              }
              if (this.wheelScale != null) {
                h = this.wheelScale;
              }
              a = f.Clone().SelfAdd(b.Clone().SelfMul(0.5)).SelfMul(h);
              if (this.userCenter != null) {
                a = new box2d.b2Vec2(this.userCenter.x, this.userCenter.y);
              }
              if (this.level.debug) {
                h = 1;
                a = new box2d.b2Vec2(this.game.realWidth / 2, this.game.realHeight / 2);
                this.game.camera.x = 0;
                this.game.camera.y = 0;
              }
              this.focusOn(a, h);
              if (this.level.debug) {
                return undefined;
              } else {
                return this.checkBounds();
              }
            }
          };
          d.prototype.focusOn = function (a, b) {
            this.target.x = Math.round(-a.x + this.game.realWidth / 2);
            this.target.y = Math.round(-a.y + this.game.realHeight / 2);
            return this.target.scale = b;
          };
          d.prototype.animate = function () {
            var a;
            var b;
            if (this.target.x !== this.level.root.x || this.target.y !== this.level.root.y || this.target.scale !== this.level.root.scale.x) {
              a = this.userCenter != null ? 1 / 3 : 1 / 15;
              b = 0.5;
              this.target.ax = (this.target.x - this.level.root.x) * a;
              this.target.ay = (this.target.y - this.level.root.y) * a;
              this.target.ascale = (this.target.scale - this.level.root.scale.x) * a;
              this.target.vx += this.target.ax;
              this.target.vx *= b;
              this.target.vy += this.target.ay;
              this.target.vy *= b;
              this.target.vscale += this.target.ascale;
              this.target.vscale *= b;
              this.level.root.x += this.target.vx;
              this.level.root.y += this.target.vy;
              this.level.root.scale.x += this.target.vscale;
              return this.level.root.scale.y += this.target.vscale;
            }
          };
          d.prototype.checkBounds = function () {
            var a;
            var b;
            var c;
            var d;
            var e;
            var f;
            d = {
              left: false,
              top: false,
              right: false,
              bottom: false
            };
            b = new Phaser.Rectangle(0, 0, this.game.level.size.width, this.game.level.size.height);
            c = 0;
            e = this.game.realWidth;
            f = 0;
            a = this.game.realHeight;
            if (c <= this.target.x + b.x * this.target.scale) {
              d.left = true;
              this.target.x = b.x * this.target.scale;
            }
            if (e >= this.target.x + b.right * this.target.scale) {
              d.right = true;
              this.target.x = e - b.right * this.target.scale;
            }
            if (f <= this.target.y + b.y * this.target.scale) {
              d.top = true;
              this.target.y = b.top * this.target.scale;
            }
            if (a >= this.target.y + b.bottom * this.target.scale) {
              d.bottom = true;
              this.target.y = a - b.bottom * this.target.scale;
            }
            if (b.width * this.target.scale < this.game.realWidth && (d.right || d.left)) {
              this.target.x = this.game.realWidth / 2 - b.width * this.target.scale / 2;
            }
            if (b.height * this.target.scale < this.game.realHeight && (d.top || d.bottom)) {
              this.target.y = this.game.realHeight / 2 - b.height * this.target.scale / 2;
            }
            this.target.x -= this.game.realWidth / 2;
            this.target.y -= this.game.realHeight / 2;
          };
          d.prototype.destroy = function () {
            this.camGraphics.destroy();
            $(window).off("wheel");
            this.game.TouchManager.unregister(this, "pinch pinchend");
            return this.game.TouchManager.unregister(null, "pan panend");
          };
          return d;
        }(Object);
      });