// 模块: States/Level/Devices/BackgroundCover  (init.beautified.js L55468-L55481)
      define("States/Level/Devices/BackgroundCover", ["Phaser"], function (b) {
        var c;
        return c = c = function (b) {
          function c(a, b) {
            c.__super__.constructor.call(this, a, b.x, b.y, "MechAssets", "BackgroundCover0000");
            this.options = b;
            this.width = b.width;
            this.height = b.height;
            a.layers.background.addChild(this);
          }
          a(c, b);
          return c;
        }(b.Sprite);
      });