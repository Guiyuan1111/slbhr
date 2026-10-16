// 模块: States/Level/LevelUI  (init.beautified.js L64709-L64747)
      define("States/Level/LevelUI", ["../Common/Button", "./Clock", "../Common/MuteButton", "Phaser"], function (c, d, e) {
        "use strict";

        var f;
        return f = f = function (e) {
          function f(b, e) {
            this.pauseClicked = a(this.pauseClicked, this);
            this.show = a(this.show, this);
            this.layoutContent = a(this.layoutContent, this);
            var g;
            var h;
            f.__super__.constructor.call(this, b, 0, 0);
            this.game.layers.ui.addChild(this);
            this.pauseButton = h = new c(this.game, this.game.realWidth / 2, -this.game.realHeight / 2, "PopupAssets", "PauseButton0000", this.pauseClicked);
            h.sprite.anchor.set(1, 0);
            h.hitArea = new PIXI.Circle(-h.width / 2, h.width / 2, h.width * 2);
            this.addChild(h);
            this.clock = g = new d(this.game, 0, -this.game.realHeight / 2);
            g.anchor.set(0.5, 0.05);
            this.addChild(g);
            this.visible = false;
          }
          b(f, e);
          f.prototype.layoutContent = function () {
            this.pauseButton.x = this.game.realWidth / 2;
            this.pauseButton.y = -this.game.realHeight / 2;
            this.clock.x = 0;
            return this.clock.y = -this.game.realHeight / 2;
          };
          f.prototype.show = function () {
            return this.visible = true;
          };
          f.prototype.pauseClicked = function () {
            console.log("pause");
            return this.game.level.togglePause();
          };
          return f;
        }(Phaser.Group);
      });