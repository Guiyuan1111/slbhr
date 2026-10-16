// 模块: States/Level/Devices/BoxPrototype  (init.beautified.js L56093-L56193)
      define("States/Level/Devices/BoxPrototype", ["./BoxedDevice"], function (b) {
        "use strict";

        var c;
        return c = c = function (b) {
          function c(a, b) {
            var d;
            var e;
            var f;
            var g;
            var h;
            var i;
            var j;
            var k;
            var l;
            c.__super__.constructor.call(this, a, b);
            if (this.options.properties.boxSize != null) {
              this.options.boxWidth = this.options.properties.boxSize;
              this.options.boxWidth = this.options.properties.boxSize;
            }
            this.sprite.cacheAsBitmap = true;
            g = 0.1;
            k = new box2d.b2PolygonShape();
            l = [];
            l.push(new box2d.b2Vec2(-this.options.boxWidth / 2 + g, -this.options.boxHeight / 2));
            l.push(new box2d.b2Vec2(this.options.boxWidth / 2 - g, -this.options.boxHeight / 2));
            l.push(new box2d.b2Vec2(this.options.boxWidth / 2, -this.options.boxHeight / 2 + g));
            l.push(new box2d.b2Vec2(this.options.boxWidth / 2, +this.options.boxHeight / 2 - g));
            l.push(new box2d.b2Vec2(this.options.boxWidth / 2 - g, +this.options.boxHeight / 2));
            l.push(new box2d.b2Vec2(-this.options.boxWidth / 2 + g, +this.options.boxHeight / 2));
            l.push(new box2d.b2Vec2(-this.options.boxWidth / 2, +this.options.boxHeight / 2 - g));
            l.push(new box2d.b2Vec2(-this.options.boxWidth / 2, -this.options.boxHeight / 2 + g));
            k.Set(l.reverse());
            i = new box2d.b2FixtureDef();
            i.shape = k;
            i.friction = this.options.properties.friction ?? 0.4;
            i.restitution = 0;
            i.density = this.options.density;
            h = this.body.data.CreateFixture(i);
            h.id = this.body.world.getNextFixtureId();
            this.boxFixture = h;
            j = function (a) {
              return function (b, c) {
                var d;
                d = new box2d.b2CircleShape(b);
                d.m_p.SetXY(c[0], c[1]);
                i = new box2d.b2FixtureDef();
                i.shape = d;
                i.filter.categoryBits = 17;
                i.filter.maskBits = 4097;
                i.friction = a.options.circleFriction;
                i.density = 0;
                i.userData = {
                  lightProperties: {
                    type: "transparent"
                  }
                };
                h = a.body.data.CreateFixture(i);
                h.id = a.body.world.getNextFixtureId();
                return h;
              };
            }(this);
            d = g;
            f = this.options.boxWidth / 2 - g * 0.6;
            j(d, [-f, -f]);
            j(d, [f, -f]);
            j(d, [-f, f]);
            j(d, [f, f]);
            e = new box2d.b2CircleShape(0.1);
            e.m_p.SetXY(0, 0);
            i = new box2d.b2FixtureDef();
            i.shape = e;
            i.filter.categoryBits = 4096;
            i.filter.maskBits = 4096;
            i.friction = 0.5;
            i.density = 0;
            i.userData = {
              "portal-sensor": true,
              lightProperties: {
                type: "transparent"
              }
            };
            h = this.body.data.CreateFixture(i);
            h.id = this.body.world.getNextFixtureId();
            this.body.data.SetLinearDamping(1);
            this.body.data.SetAngularDamping(20);
            return this;
          }
          a(c, b);
          c.prototype.options = {
            boxWidth: 1.77,
            boxHeight: 1.77,
            atlasName: "MechAssets",
            frameName: "movingbox0000",
            layer: "overGround",
            density: 0.45,
            circleFriction: 0.1
          };
          return c;
        }(b);
      });