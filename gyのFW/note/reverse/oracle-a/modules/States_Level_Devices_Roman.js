// 模块: States/Level/Devices/Roman  (init.beautified.js L58628-L58733)
      define("States/Level/Devices/Roman", ["./BoxedDevice"], function (b) {
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
            var m;
            var n;
            var o;
            var p;
            var q;
            var r;
            var s;
            c.__super__.constructor.call(this, a, b);
            if (this.options.polygon[0][0] === this.options.polygon[1][0]) {
              m = this.pxm(this.options.polygon[2][0] - this.options.polygon[1][0]) * 2;
              k = this.pxm(this.options.polygon[1][1] - this.options.polygon[0][1]);
              f = 0.6;
              d = -Math.atan(k / (m / 2));
            } else {
              m = this.pxm(this.options.polygon[1][0] - this.options.polygon[0][0]) * 2;
              k = this.pxm(this.options.polygon[1][1] - this.options.polygon[0][1]);
              f = 0.6;
              d = Math.atan(k / (m / 2));
            }
            h = {
              x: this.options.polygon[1][0] + this.options.x + this.mpx(1),
              y: this.options.polygon[1][1] + this.options.y - this.mpx(1)
            };
            e = this.game.make.tileSprite(h.x, h.y, this.mpx(m), 30, "MechAssets", "roman_bar0000");
            this.game.physics.box2d.enable(e);
            i = this.game.make.sprite(this.mpx(m / 2), 0, "MechAssets", "roman_end0000");
            i.anchor.set(0.05, 0.5);
            e.addChild(i);
            i = this.game.make.sprite(-this.mpx(m / 2), 0, "MechAssets", "roman_end0000");
            i.scale.x = -1;
            i.anchor.set(0.05, 0.5);
            e.addChild(i);
            o = this.game.make.sprite(h.x, h.y, "MechAssets", "roman_center0000");
            o.anchor.set(0.5, 0.5);
            e.body.clearFixtures();
            s = [];
            s.push(new box2d.b2Vec2(-m / 2, -f / 2));
            s.push(new box2d.b2Vec2(m / 2, -f / 2));
            s.push(new box2d.b2Vec2(m / 2 - 2, f / 2));
            s.push(new box2d.b2Vec2(-m / 2 + 2, f / 2));
            r = new box2d.b2PolygonShape();
            r.Set(s);
            j = new box2d.b2FixtureDef();
            j.shape = r;
            j.friction = 0.7;
            j.restitution = 0;
            j.density = 0.1;
            j.filter.categoryBits = 1;
            j.filter.maskBits = 65535;
            e.body.data.CreateFixture(j);
            e.body.data.SetAngle(d || 0);
            g = this.game.make.sprite(h.x, h.y - this.mpx(k), "MechAssets", "roman_base0000");
            this.game.physics.box2d.enable(g);
            p = g.height / (this.mpx(k) * 2);
            g.height = this.mpx(k) * -2;
            this.game.layers.overGround.addChild(g);
            this.game.layers.overGround.addChild(e);
            this.game.layers.overChars.addChild(o);
            g.body.clearFixtures();
            g.body.data.SetAngle(Math.PI * b.rotation / 180 || 0);
            g.body.mass = 0;
            q = g.body;
            s = [];
            s.push(new box2d.b2Vec2(-1, 0));
            s.push(new box2d.b2Vec2(0, k));
            s.push(new box2d.b2Vec2(1, 0));
            r = new box2d.b2PolygonShape();
            r.Set(s);
            j = new box2d.b2FixtureDef();
            j.shape = r;
            j.friction = 0.7;
            j.restitution = 0;
            j.density = 0.1;
            j.filter.categoryBits = 1;
            j.filter.maskBits = 65535;
            g.body.data.CreateFixture(j);
            l = new box2d.b2RevoluteJointDef();
            n = e.body.data.GetWorldCenter();
            h = new box2d.b2Vec2(n.x, n.y);
            l.Initialize(e.body.data, g.body.data, h);
            this.joint = this.game.physics.box2d.world.CreateJoint(l);
            return this;
          }
          a(c, b);
          c.prototype.options = {
            atlasName: null,
            frameName: null
          };
          return c;
        }(b);
      });