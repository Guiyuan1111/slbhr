// 模块: States/Level/Devices/BoxHeavy  (init.beautified.js L56241-L56256)
      define("States/Level/Devices/BoxHeavy", ["./BoxedDevice", "./BoxPrototype"], function (b, c) {
        "use strict";

        var d;
        return d = d = function (b) {
          function c(a, b) {
            b.frameName = "movingbox20000";
            b.density = 0.8;
            b.circleFriction = 0.05;
            c.__super__.constructor.call(this, a, b);
            return this;
          }
          a(c, b);
          return c;
        }(c);
      });