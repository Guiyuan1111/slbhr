// 模块: States/Level/Devices/Ball  (init.beautified.js L55747-L55800)
      define("States/Level/Devices/Ball", ["./BoxedDevice"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b) {
            var d;
            var e;
            var f;
            var g;
            b.x -= a.physics.box2d.mpx(0.5);
            b.y += a.physics.box2d.mpx(0.65);
            c.__super__.constructor.call(this, a, b);
            g = new box2d.b2CircleShape(this.radius);
            f = new box2d.b2FixtureDef();
            f.shape = g;
            f.friction = 0.2;
            f.restitution = 0.1;
            f.density = 2.3;
            f.filter.categoryBits = 17;
            e = this.body.data.CreateFixture(f);
            e.id = this.body.world.getNextFixtureId();
            if (this.options.properties != null && this.options.properties.linearDamping != null) {
              this.body.data.SetLinearDamping(this.options.properties.linearDamping);
            }
            if (this.options.properties != null && this.options.properties.angularDamping != null) {
              this.body.data.SetAngularDamping(this.options.properties.angularDamping);
            }
            d = new box2d.b2CircleShape(0.1);
            d.m_p.SetXY(0, 0);
            f = new box2d.b2FixtureDef();
            f.shape = d;
            f.filter.categoryBits = 4096;
            f.filter.maskBits = 4096;
            f.friction = 0.5;
            f.density = 0;
            f.userData = {
              "portal-sensor": true
            };
            e = this.body.data.CreateFixture(f);
            e.id = this.body.world.getNextFixtureId();
            return this;
          }
          a(c, b);
          c.prototype.options = {
            boxWidth: 1.8,
            boxHeight: 1.8,
            atlasName: "MechAssets",
            frameName: "ball0000"
          };
          c.prototype.radius = 0.4;
          return c;
        }(b);
      });