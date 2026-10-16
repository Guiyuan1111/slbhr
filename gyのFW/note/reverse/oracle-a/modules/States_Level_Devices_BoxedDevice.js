// 模块: States/Level/Devices/BoxedDevice  (init.beautified.js L55697-L55729)
      define("States/Level/Devices/BoxedDevice", ["./Device"], function (c) {
        "use strict";

        var d;
        return d = d = function (c) {
          function d(b, c) {
            this.ocupy = a(this.ocupy, this);
            var e;
            this._defaults.enableBody = true;
            e = new box2d.b2Vec2(b.physics.box2d.mpx(this.boxSize.x / 2), b.physics.box2d.mpx(this.boxSize.y / 2));
            e = e.SelfRotateRadians(-Math.PI * c.rotation / 180 || 0);
            c.x = c.x + e.x;
            c.y = c.y - e.y;
            d.__super__.constructor.call(this, b, c);
          }
          b(d, c);
          d.prototype.boxSize = {
            x: 2,
            y: 2
          };
          d.prototype.ocupy = function (a) {
            var b;
            var c;
            b = this.options.x / 32;
            c = this.options.y / 32;
            this.ocupyTile(a, b, c);
            this.ocupyTile(a, b - 1, c - 1);
            this.ocupyTile(a, b - 1, c);
            return this.ocupyTile(a, b, c - 1);
          };
          return d;
        }(c);
      });