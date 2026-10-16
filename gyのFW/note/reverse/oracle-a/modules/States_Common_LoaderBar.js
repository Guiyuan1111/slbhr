// 模块: States/Common/LoaderBar  (init.beautified.js L77820-L77869)
      define("States/Common/LoaderBar", ["./Button", "Phaser"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b, d) {
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            c.__super__.constructor.call(this, a, b, d);
            i = 200;
            g = 20;
            f = this.game.make.sprite(0, 0, "PreloaderAssets", "LoaderBar0000");
            f.x = -i / 2;
            f.y = -g / 2;
            this.addChild(f);
            j = new Phaser.Rectangle(0, 0, 0, g);
            f.crop(j);
            h = new Phaser.Sprite(this.game, 0, 0, "PreloaderAssets", "LoaderHolder0000");
            h.anchor.set(0.5);
            this.addChild(h);
            k = new Phaser.Sprite(this.game, 0, -80, "PreloaderAssets", "LoaderTitle0000");
            k.anchor.set(0.47);
            this.addChild(k);
            l = function (a) {
              return function (a) {
                h5api.progress(a);
                j.width = a / 100 * i;
                return f.crop(j);
              };
            }(this);
            e = function (a) {
              return function () {
                a.game.load.onFileComplete.remove(l);
                a.game.load.onLoadComplete.remove(e);
                return a.destroy();
              };
            }(this);
            this.game.load.onFileComplete.add(l);
            this.game.load.onLoadComplete.add(e);
          }
          a(c, b);
          return c;
        }(Phaser.Group);
      });