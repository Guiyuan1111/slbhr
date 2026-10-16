// 模块: States/Level/IngameMenu  (init.beautified.js L64018-L64136)
      define("States/Level/IngameMenu", ["../Common/StoneButton", "Phaser"], function (c) {
        "use strict";

        var e;
        return e = e = function (c) {
          function e(b, c) {
            this.destroy = a(this.destroy, this);
            this.update = a(this.update, this);
            this.fixToCamera = a(this.fixToCamera, this);
            this.layoutContent = a(this.layoutContent, this);
            this.renderContent = a(this.renderContent, this);
            var d;
            var f;
            e.__super__.constructor.call(this, b, 0, 0);
            this.options = c;
            this.background = b.make.graphics(0, 0);
            this.background.boundsPadding = 0;
            this.addChild(this.background);
            this.board = d = b.make.sprite(0, 0, "PopupAssets", "_default0000");
            d.anchor.set(0.5);
            this.boardBg = f = b.make.sprite(0, 0, "PopupAssets", "PopupBackground0000");
            f.anchor.set(0.5);
            f.cacheAsBitmap = true;
            this.board.addChild(f);
            this.addChild(d);
            b.TouchManager.register(this.background, "mousedown", function (a) {
              return function () {
                return console.log("prevent event");
              };
            }(this));
            b.TouchManager.register(this.background, "touchstart", function (a) {
              return function () {
                return console.log("prevent event");
              };
            }(this));
            this.visible = false;
            this.game.add.existing(this);
            this.fixToCamera();
            this.target = this.outside;
            this.force = 2.3;
            this.vy = 0;
            this.ay = 0;
            this.friction = 0.7;
            this.board.x = this.target.x;
            this.board.y = this.target.y;
            this.renderContent();
          }
          b(e, c);
          e.prototype.renderContent = function () {};
          e.prototype.layoutContent = function () {
            this.fixToCamera();
            if (this.shown) {
              this.target = this.center;
            } else {
              this.target = this.outside;
            }
            return this.board.x = this.target.x;
          };
          e.prototype.show = function () {
            this.target = this.center;
            this.shown = true;
            return this.visible = true;
          };
          e.prototype.hide = function () {
            this.shown = false;
            return this.target = this.outside;
          };
          e.prototype.fixToCamera = function () {
            var a;
            this.x = -this.game.realWidth / 2;
            this.y = -this.game.realHeight / 2;
            this.background.clear();
            this.background.beginFill(0);
            this.background.drawRect(0, 0, this.game.realWidth, this.game.realHeight);
            this.background.alpha = 0;
            a = Math.min(1, Math.min(this.game.realWidth / this.boardBg.texture.frame.width, this.game.realHeight / this.boardBg.texture.frame.height));
            this.board.scale.set(a);
            this.contentSize = {
              width: this.boardBg.width * 0.8,
              height: this.boardBg.height
            };
            this.contentSize.halfWidth = this.contentSize.width / 2;
            this.contentSize.halfHeight = this.contentSize.height / 2;
            this.center = {
              x: this.game.realWidth / 2,
              y: this.game.realHeight / 2
            };
            return this.outside = {
              x: this.game.realWidth / 2,
              y: this.game.realHeight * 1.5
            };
          };
          e.prototype.update = function () {
            var a;
            if (this.visible) {
              this.background.alpha = (1 - (this.board.y - this.center.y) / (this.outside.y - this.center.y)) * 0.7;
              if (Math.abs(this.board.y - this.target.y) < 1 && Math.abs(this.vy) < 1) {
                return;
              }
              a = Math.min(0.04, this.game.time.elapsed / 1000);
              this.ay = (this.target.y - this.board.y) * this.force * a;
              this.vy += this.ay;
              this.vy *= this.friction;
              this.board.y += this.vy;
              if (Math.abs(this.board.y - this.outside.y) < 3) {
                return this.visible = false;
              }
            }
          };
          e.prototype.destroy = function () {
            var a;
            a = arguments.length >= 1 ? d.call(arguments, 0) : [];
            this.background.clear();
            this.visible = false;
            return e.__super__.destroy.apply(this, a);
          };
          return e;
        }(Phaser.Group);
      });