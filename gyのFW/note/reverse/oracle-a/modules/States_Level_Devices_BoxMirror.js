// 模块: States/Level/Devices/BoxMirror  (init.beautified.js L56274-L56311)
      define("States/Level/Devices/BoxMirror", ["./BoxedDevice", "./BoxPrototype"], function (b, c) {
        "use strict";

        var d;
        return d = d = function (b) {
          function c(a, b) {
            var d;
            var e;
            var f;
            b.mirrorWidth = 2;
            b.mirrorHeight = 0.05;
            b.frameName = "BoxMirror0000";
            c.__super__.constructor.call(this, a, b);
            this.boxFixture.m_userData = {
              lightProperties: {
                type: "transparent"
              }
            };
            f = new box2d.b2PolygonShape();
            f.SetAsOrientedBox(this.options.mirrorWidth / 2, this.options.mirrorHeight / 2, new box2d.b2Vec2(0, 0), Math.PI / 4);
            e = new box2d.b2FixtureDef();
            e.shape = f;
            e.friction = 0;
            e.restitution = 0;
            e.density = 0;
            e.userData = {
              lightProperties: {
                type: "mirror"
              }
            };
            d = this.body.data.CreateFixture(e);
            d.id = this.body.world.getNextFixtureId();
            return this;
          }
          a(c, b);
          return c;
        }(c);
      });