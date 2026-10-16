// 模块: States/End  (init.beautified.js L65056-L65098)
      define("States/End", ["./Level/EndMenu", "./Level/GameOverMenu"], function (c, d) {
        "use strict";

        var e;
        return e = e = function (e) {
          function f() {
            this.shutdown = a(this.shutdown, this);
            this.pauseUpdate = a(this.pauseUpdate, this);
            this.layoutContent = a(this.layoutContent, this);
            this.create = a(this.create, this);
            this.init = a(this.init, this);
            return f.__super__.constructor.apply(this, arguments);
          }
          b(f, e);
          f.prototype.init = function (a) {
            return this.levelState = a;
          };
          f.prototype.create = function () {
            if (this.levelState.success) {
              this.game.progress.update(this.levelState);
              this.menu = new c(this.game, this.levelState);
              return this.menu.show();
            } else {
              this.menu = new d(this.game, this.levelState);
              return this.menu.show();
            }
          };
          f.prototype.layoutContent = function () {
            if (this.menu.layoutContent != null) {
              return this.menu.layoutContent();
            }
          };
          f.prototype.pauseUpdate = function () {
            this.menu.update();
            return this.game.tweens.update();
          };
          f.prototype.shutdown = function () {
            console.log("shuting down end, with levelstate ", this.game.state.states.level);
            return this.game.state.states.level.killAll();
          };
          return f;
        }(Phaser.State);
      });