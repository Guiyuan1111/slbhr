// 模块: States/Common/SoftLockMenu  (init.beautified.js L66242-L66282)
      define("States/Common/SoftLockMenu", ["../Level/IngameMenu", "../Common/StoneButton", "Phaser"], function (c, d) {
        "use strict";

        var e;
        return e = e = function (c) {
          function e(b, c) {
            this.close = a(this.close, this);
            this.renderContent = a(this.renderContent, this);
            e.__super__.constructor.call(this, b, c);
            this.onClose = new Phaser.Signal();
          }
          b(e, c);
          e.prototype.renderContent = function () {
            var a;
            var b;
            var c;
            c = this.game.lang.locale("this") + " " + this.game.lang.locale(this.options.label) + " " + this.game.lang.locale("not_yet");
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 2 + 30, "fontStone", c, 26);
            b.anchor.set(0.5);
            this.board.addChild(b);
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 2 + 140, "fontStone", this.game.lang.locale("complete_more"), 22);
            b.anchor.set(0.5);
            this.board.addChild(b);
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 2 + 200, "fontStone", this.game.lang.locale("to_unlock"), 22);
            b.anchor.set(0.5);
            this.board.addChild(b);
            a = new d(this.game, 0, this.contentSize.halfHeight * 1.1 / 2, this.game.lang.locale("Ok!"), this.close);
            a.anchor.set(0.5);
            return this.board.addChild(a);
          };
          e.prototype.close = function () {
            this.hide();
            return _.delay(function (a) {
              return function () {
                return a.onClose.dispatch();
              };
            }(this), 1000);
          };
          return e;
        }(c);
      });