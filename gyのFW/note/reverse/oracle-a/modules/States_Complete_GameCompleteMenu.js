// 模块: States/Complete/GameCompleteMenu  (init.beautified.js L66714-L66749)
      define("States/Complete/GameCompleteMenu", ["../Level/IngameMenu", "../Common/StoneButton", "Phaser"], function (c, d) {
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
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 3, "font", this.game.lang.locale("congratulations"), 36);
            b.anchor.set(0.5);
            this.board.addChild(b);
            b = this.game.make.bitmapText(0, -this.contentSize.halfHeight / 3 + b.height * 1.2, "font", this.game.lang.locale("you_completed"), 28);
            b.anchor.set(0.5);
            this.board.addChild(b);
            a = new d(this.game, 0, this.contentSize.halfHeight / 2, this.game.lang.locale("Ok"), this.close);
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